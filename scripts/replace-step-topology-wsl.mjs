import fs from 'node:fs';
import path from 'node:path';

const fixturesDir = '/mnt/c/my/Ficad/3d_viewer_electron/src/test/fixtures';
const files = [
  'test-box.glb',
  'test-rect-box.glb',
  'box_boss.glb',
  'box_fillet.glb',
  'box_fillet_buggy.glb',
];

const OLD_STR = 'STEP_topology';
const NEW_STR = 'STEP_T';

for (const file of files) {
  const filePath = path.join(fixturesDir, file);
  const buf = fs.readFileSync(filePath);

  // GLB header: magic(4) + version(4) + length(4) = 12 bytes
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) {
    console.error(`Not a GLB file: ${file}`);
    continue;
  }

  // Read first chunk header
  let offset = 12;
  const jsonChunkLen = buf.readUInt32LE(offset);
  const jsonChunkType = buf.readUInt32LE(offset + 4);
  offset += 8;

  if (jsonChunkType !== 0x4E4F534A) {
    console.error(`First chunk is not JSON in ${file}`);
    continue;
  }

  // Extract JSON data (without padding)
  let jsonEnd = offset + jsonChunkLen;
  const jsonStr = buf.toString('utf-8', offset, jsonEnd);

  if (!jsonStr.includes(OLD_STR)) {
    console.log(`No '${OLD_STR}' found in ${file}, skipping`);
    continue;
  }

  // Replace all occurrences
  let newJsonStr = jsonStr.replaceAll(OLD_STR, NEW_STR);

  // Three.js GLTFLoader (v0.184) doesn't skip 4-byte alignment padding between chunks.
  // Work around by padding JSON content with whitespace to align to 4 bytes.
  const newJsonBuf = Buffer.from(newJsonStr, 'utf-8');
  const alignRem = newJsonBuf.length % 4;
  if (alignRem !== 0) {
    const pad = 4 - alignRem;
    newJsonStr += ' '.repeat(pad);
  }
  const finalJsonBuf = Buffer.from(newJsonStr, 'utf-8');
  const finalJsonLen = finalJsonBuf.length;

  // The rest of the file starts after the original JSON chunk data + its padding
  const origJsonPadding = (4 - (jsonChunkLen % 4)) % 4;
  const restStart = offset + jsonChunkLen + origJsonPadding;
  const restBuf = buf.subarray(restStart);

  // Rebuild file
  const newHeader = Buffer.alloc(12);
  newHeader.writeUInt32LE(0x46546C67, 0);  // magic "glTF"
  newHeader.writeUInt32LE(2, 4);            // version 2
  const newTotalLen = 12 + 8 + finalJsonLen + restBuf.length;
  newHeader.writeUInt32LE(newTotalLen, 8);

  const newChunkHeader = Buffer.alloc(8);
  newChunkHeader.writeUInt32LE(finalJsonLen, 0);
  newChunkHeader.writeUInt32LE(jsonChunkType, 4);

  fs.writeFileSync(filePath, Buffer.concat([newHeader, newChunkHeader, finalJsonBuf, restBuf]));
  console.log(`Updated: ${file} (${jsonStr.match(new RegExp(OLD_STR, 'g')).length} replacements)`);
}
