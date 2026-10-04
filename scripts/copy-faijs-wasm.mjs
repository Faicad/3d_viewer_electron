/**
 * Copy the three faijs engine wasm assets into the renderer public dir so the
 * `.fai.zip` loader path (`@faicad/faijs-viewer` → `openFaiZip`) can fetch them
 * from self-hosted `/wasm/fai/` URLs in both dev and the packaged build.
 *
 * The bundles are produced by npm packages:
 *   - occt-wasm        → dist/occt-wasm.wasm      (BREP execution chain engine)
 *   - manifold-3d      → manifold.wasm            (mesh boolean / CSG engine)
 *   - brepkit-wasm     → brepkit_wasm_bg.wasm     (secondary BREP engine)
 *   - @salusoft89/planegcs → dist/planegcs_dist/planegcs.wasm (cad.sketch constraint solver)
 *
 * They are NOT bundled three.js assets, so we copy them like draco/ifc/openscad
 * wasm. In dev the sibling `faijs` repo provides them under its own
 * node_modules; once `@faicad/faijs-viewer` is installed here the same bundles
 * are also resolvable from this repo's node_modules. This script checks both.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const destDir = path.resolve(rootDir, 'src/renderer/public/wasm/fai');

/** Candidate source globs (relative to each repo's node_modules), checked in order. */
const SOURCES = {
  'occt-wasm.wasm': ['occt-wasm/dist/occt-wasm.wasm'],
  'manifold.wasm': ['manifold-3d/manifold.wasm'],
  'brepkit_wasm_bg.wasm': ['brepkit-wasm/brepkit_wasm_bg.wasm'],
  'planegcs.wasm': ['@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm'],
};

/** Repos whose `node_modules` may host these packages (electron project first). */
function candidateRoots() {
  return [path.resolve(rootDir, 'node_modules'), path.resolve(rootDir, '..', 'faijs', 'node_modules')];
}

function findSource(destName) {
  for (const root of candidateRoots()) {
    for (const rel of SOURCES[destName] ?? []) {
      const file = path.join(root, rel);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

fs.mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const destName of Object.keys(SOURCES)) {
  const src = findSource(destName);
  if (!src) {
    console.warn(
      `[copy-faijs-wasm] source for ${destName} not found (install @faicad/faijs-viewer deps), skipping`,
    );
    continue;
  }
  fs.copyFileSync(src, path.join(destDir, destName));
  console.log(`[copy-faijs-wasm] Copied ${destName}`);
  copied++;
}

if (copied < Object.keys(SOURCES).length) {
  console.warn(
    `[copy-faijs-wasm] Copied ${copied}/${Object.keys(SOURCES).length} faijs wasm assets. Opening a .fai.zip will fail until all are present.`,
  );
}