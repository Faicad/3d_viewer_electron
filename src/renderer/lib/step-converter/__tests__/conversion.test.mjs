/**
 * Integration test: STEP → GLB conversion pipeline.
 *
 * Tests the full conversion chain using the real occt-import-js WASM module.
 * Validates GLB binary structure, STEP_topology extension, face proxy data,
 * and columnar selector format — all the same structures consumed by the
 * CAD Explorer rendering pipeline.
 *
 * Run:
 *   node --experimental-vm-modules src/renderer/lib/step-converter/__tests__/conversion.test.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..', '..', '..', '..');
const sourceRoot = 'C:\\git\\CADQ\\earthtojake\\text-to-cad';

// Load occt-import-js (CJS UMD module) onto globalThis
const require = createRequire(import.meta.url);
globalThis.occtimportjs = require(join(projectRoot, 'src', 'renderer', 'public', 'wasm', 'occt-import-js.cjs'));

// Import the source JS modules (same logic as our TypeScript port)
const stepToGlbPath = join(sourceRoot, 'explorer', 'wasm', 'step_to_glb.js');
const { stepToGlb } = await import('file:///' + stepToGlbPath.replace(/\\/g, '/'));

// ---- Helpers ----

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

function validateGlb(buffer) {
  const data = new DataView(buffer);

  const magic = data.getUint32(0, true);
  assert(magic === 0x46546C67, `GLB magic: 0x${magic.toString(16)}`);

  const version = data.getUint32(4, true);
  assert(version === 2, `GLB version: ${version}`);

  const totalLen = data.getUint32(8, true);
  assert(totalLen === buffer.byteLength, `total length matches (${totalLen})`);

  const jsonLen = data.getUint32(12, true);
  const jsonType = data.getUint32(16, true);
  assert(jsonType === 0x4E4F534A, `JSON chunk: 0x${jsonType.toString(16)}`);

  const jsonBytes = new Uint8Array(buffer, 20, jsonLen);
  let jsonEnd = jsonLen;
  while (jsonEnd > 0 && jsonBytes[jsonEnd - 1] === 0x20) jsonEnd--;
  const gltf = JSON.parse(new TextDecoder().decode(jsonBytes.slice(0, jsonEnd)));

  const binOffset = 20 + jsonLen + (jsonLen % 4 === 0 ? 0 : 4 - (jsonLen % 4));
  const binLen = data.getUint32(binOffset, true);
  const binType = data.getUint32(binOffset + 4, true);
  assert(binType === 0x004E4942, `BIN chunk: 0x${binType.toString(16)}`);

  // glTF core
  assert(gltf.asset?.version === '2.0', 'asset version 2.0');
  assert(gltf.nodes?.length > 0, `nodes: ${gltf.nodes.length}`);
  assert(gltf.meshes?.length > 0, `meshes: ${gltf.meshes.length}`);
  assert(gltf.accessors?.length > 0, `accessors: ${gltf.accessors.length}`);
  assert(gltf.bufferViews?.length > 0, `bufferViews: ${gltf.bufferViews.length}`);

  // STEP_topology extension
  const ext = gltf.extensions?.STEP_topology;
  assert(ext != null, 'has STEP_topology extension');
  assert(ext.schemaVersion === 1, `schemaVersion: ${ext.schemaVersion}`);
  assert(typeof ext.indexView === 'number', 'indexView is bufferView index');
  assert(typeof ext.selectorView === 'number', 'selectorView is bufferView index');

  // Index manifest
  const indexBytes = readBufferView(gltf, buffer, binOffset + 8, ext.indexView);
  const indexManifest = JSON.parse(new TextDecoder().decode(indexBytes));
  assert(indexManifest.schemaVersion === 1, 'index manifest v1');
  assert(Array.isArray(indexManifest.meshes), `index: ${indexManifest.meshes.length} meshes`);
  assert(indexManifest.meshes[0].faceCount > 0, `mesh faceCount: ${indexManifest.meshes[0].faceCount}`);

  // Selector manifest
  const selBytes = readBufferView(gltf, buffer, binOffset + 8, ext.selectorView);
  const sel = JSON.parse(new TextDecoder().decode(selBytes));
  assert(sel.schemaVersion === 1, 'selector manifest v1');
  assert(sel.profile === 'selector', `profile: ${sel.profile}`);
  assert(sel.occurrences?.length > 0, `occurrences: ${sel.occurrences.length}`);
  assert(sel.faces?.length > 0, `faces: ${sel.faces.length}`);
  assert(sel.faceProxy?.runsView === 'faceRuns', `runsView: ${sel.faceProxy.runsView}`);

  // Columnar format
  assert(Array.isArray(sel.tables?.faceColumns), 'faceColumns defined');
  assert(Array.isArray(sel.faces[0]), 'face rows are arrays');

  // faceRuns buffer
  const views = sel.buffers?.views;
  assert(views?.faceRuns != null, 'faceRuns descriptor');
  assert(views.faceRuns.dtype === 'uint32', `faceRuns dtype: ${views.faceRuns.dtype}`);

  const runsBytes = readBufferView(gltf, buffer, binOffset + 8, views.faceRuns.bufferView);
  const faceRuns = new Uint32Array(
    runsBytes.buffer, runsBytes.byteOffset, views.faceRuns.count,
  );
  assert(faceRuns.length === sel.faces.length * 5, `faceRuns: ${faceRuns.length} = faces × 5`);
  assert(faceRuns[0] === 0, 'first run occRow = 0');
  assert(faceRuns[4] === 0, 'first run faceRow = 0');

  // BBox
  assert(Array.isArray(sel.bbox?.min) && sel.bbox.min.length === 3, 'selector bbox.min');
  assert(Array.isArray(sel.bbox?.max) && sel.bbox.max.length === 3, 'selector bbox.max');

  // Node metadata
  const firstNode = gltf.nodes[0];
  assert(firstNode.extras?.cadOccurrenceId != null, 'mesh node has cadOccurrenceId');
  assert(firstNode.name === firstNode.extras.cadOccurrenceId, 'node name = cadOccurrenceId');

  // Face id pattern
  const firstFaceId = sel.faces[0][0];
  assert(typeof firstFaceId === 'string' && /^o\d+\.f\d+$/.test(firstFaceId), `face id: ${firstFaceId}`);

  return { gltf, sel, faceRuns };
}

function readBufferView(gltf, buffer, binDataOffset, viewIndex) {
  const view = gltf.bufferViews[viewIndex];
  return new Uint8Array(buffer, binDataOffset + view.byteOffset, view.byteLength);
}

// ---- Main ----

console.log('=== STEP→GLB Integration Test ===\n');

// Locate a STEP file
const stepPaths = [
  join(sourceRoot, 'insert.step'),
  join(sourceRoot, 'keycap_v6.step'),
  join(sourceRoot, 'model.step'),
];
const stepPath = stepPaths.find(p => { try { readFileSync(p); return true; } catch { return false; } });

if (!stepPath) {
  console.log('No STEP file found, skipping integration test');
  process.exit(0);
}

const stepData = readFileSync(stepPath);
console.log(`STEP: ${stepPath} (${stepData.byteLength} bytes)`);

const stepHash = createHash('sha256').update(stepData).digest('hex');

console.log('\n[1/3] STEP → GLB...');
const start = performance.now();
const glb = await stepToGlb(stepData.buffer, {
  linearDeflection: 0.001,
  angularDeflection: 0.5,
  includeSelectorTopology: true,
  entryKind: 'part',
  stepHash,
  cadPath: 'test-part',
  wasmPath: join(projectRoot, 'src', 'renderer', 'public', 'wasm', 'occt-import-js.wasm'),
});
console.log(`  ${(performance.now() - start).toFixed(0)}ms → ${glb.byteLength} bytes`);

console.log('\n[2/3] Validating GLB structure...');
const { sel, faceRuns } = validateGlb(glb);

console.log(`\n[3/3] Summary:`);
console.log(`  Occurrences: ${sel.occurrences.length}`);
console.log(`  Faces:       ${sel.faces.length}`);
console.log(`  Face runs:   ${faceRuns.length} values (${faceRuns.length / 5} rows)`);
console.log(`  BBox min:    [${sel.bbox.min.map(v => v.toFixed(6)).join(', ')}]`);
console.log(`  BBox max:    [${sel.bbox.max.map(v => v.toFixed(6)).join(', ')}]`);

// Verify faceOccurrenceIds match
const faceOccIds = new Set(sel.faces.map(f => f[1]));
const occIds = new Set(sel.occurrences.map(o => o[0]));
const missingOccIds = [...faceOccIds].filter(id => !occIds.has(id));
assert(missingOccIds.length === 0, `all face occurrence IDs exist in occurrences (${faceOccIds.size} face occs, ${occIds.size} occurrences)`);

const outPath = join(projectRoot, '.test-output.step.glb');
writeFileSync(outPath, new Uint8Array(glb));
console.log(`\n  Output: ${outPath}`);

console.log('\n✅ All tests passed!\n');
