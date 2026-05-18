export interface OcctModule {
  ReadStepFile(buffer: Uint8Array, params: Record<string, unknown>): {
    success: boolean;
    root: OcctNode;
    meshes: OcctMesh[];
  };
}

export interface OcctNode {
  name: string;
  meshes: number[];
  children: OcctNode[];
}

export interface OcctMesh {
  name: string;
  attributes: {
    position: { array: Float32Array };
    normal?: { array: Float32Array };
  };
  index: { array: Uint32Array };
  color?: [number, number, number];
  brep_faces?: Array<{
    first: number;
    last: number;
  }>;
}

interface OcctInitFn {
  (config: { locateFile: (path: string) => string }): Promise<OcctModule>;
}

declare global {
  var occtimportjs: OcctInitFn | undefined;
}

let occtModule: OcctModule | null = null;
let loadPromise: Promise<OcctModule> | null = null;
let scriptLoadPromise: Promise<void> | null = null;

function loadOcctScript(): Promise<void> {
  if (typeof globalThis.occtimportjs === 'function') return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/wasm/occt-import-js.cjs';
    script.onload = () => {
      if (typeof globalThis.occtimportjs === 'function') {
        resolve();
      } else {
        reject(new Error('occt-import-js loaded but globalThis.occtimportjs is not a function'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load /wasm/occt-import-js.cjs'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

function fetchWasmBinary(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 0) {
        resolve(xhr.response as ArrayBuffer);
      } else {
        reject(new Error(`Failed to load WASM: ${xhr.status} ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error(`XHR failed for ${url}`));
    xhr.send();
  });
}

export async function loadOcct(
  { wasmPath = '/wasm/occt-import-js.wasm' }: { wasmPath?: string } = {},
): Promise<OcctModule> {
  if (occtModule) return occtModule;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await loadOcctScript();
    const initFn = globalThis.occtimportjs!;

    // Pre-load the WASM binary ourselves because Emscripten's internal
    // fetch() call doesn't support Electron custom protocols like faicad-viewer://.
    // XMLHttpRequest goes through the same request pipeline as <script> tags
    // and is handled by protocol.registerFileProtocol correctly.
    const wasmBinary = await fetchWasmBinary(wasmPath);

    occtModule = await initFn({
      wasmBinary,
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) return wasmPath;
        return path;
      },
    });

    return occtModule;
  })();

  return loadPromise;
}

export function isOcctLoaded(): boolean {
  return occtModule !== null;
}

export function resetOcctLoader(): void {
  occtModule = null;
  loadPromise = null;
}
