// Classic Web Worker for CAD→mesh conversion via OCCT WASM.
// Supports STEP (ReadStepFile), IGES (ReadIgesFile), and BREP (ReadBrepFile).
// Uses fetch()+eval() to load the OCCT script because importScripts()
// doesn't route through Electron's protocol.handle for custom schemes.

let occt = null;
let initPromise = null;

async function loadOcctScript() {
  const resp = await fetch('wasm/occt-import-js.cjs');
  const code = await resp.text();
  (0, eval)(code);
}

function init() {
  if (occt) return Promise.resolve(occt);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await loadOcctScript();

    const wasmResponse = await fetch('wasm/occt-import-js.wasm');
    const wasmBinary = await wasmResponse.arrayBuffer();

    occt = await self.occtimportjs({ wasmBinary });
    console.log('[step-worker] OCCT WASM initialized');
    return occt;
  })();

  return initPromise;
}

function collectTransferables(result) {
  const list = [];
  for (const mesh of (result.meshes || [])) {
    if (mesh.attributes?.position?.array?.buffer) {
      list.push(mesh.attributes.position.array.buffer);
    }
    if (mesh.attributes?.normal?.array?.buffer) {
      list.push(mesh.attributes.normal.array.buffer);
    }
    if (mesh.index?.array?.buffer) {
      list.push(mesh.index.array.buffer);
    }
  }
  return list;
}

function readCadFile(m, data, cadFormat) {
  switch (cadFormat) {
    case 'iges': return m.ReadIgesFile(data, null);
    case 'brep': return m.ReadBrepFile(data, null);
    default:     return m.ReadStepFile(data, null);
  }
}

function formatLabel(cadFormat) {
  switch (cadFormat) {
    case 'iges': return 'IGES';
    case 'brep': return 'BREP';
    default:     return 'STEP';
  }
}

self.onmessage = async (e) => {
  const { type, id, stepData, params, cadFormat } = e.data;

  if (type === 'init') {
    init().catch(err => console.error('[step-worker] init failed:', err));
    return;
  }

  if (type === 'convert') {
    try {
      const m = await init();
      const t0 = performance.now();
      const fmt = cadFormat || 'step';
      const label = formatLabel(fmt);

      const result = readCadFile(m, new Uint8Array(stepData), fmt);
      const ms = (performance.now() - t0).toFixed(0);
      console.log('[step-worker] ' + label + ' done in ' + ms + 'ms, meshes=' + (result.meshes?.length || 0));

      if (!result.success) {
        self.postMessage({ type: 'result', id, success: false, error: label + ' import failed' });
        return;
      }

      const transferList = collectTransferables(result);
      self.postMessage(
        { type: 'result', id, success: true, root: result.root, meshes: result.meshes },
        transferList,
      );
    } catch (err) {
      self.postMessage({ type: 'result', id, success: false, error: err.message || String(err) });
    }
  }
};
