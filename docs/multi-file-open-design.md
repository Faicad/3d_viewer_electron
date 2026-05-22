# Multi-File Open — Technical Implementation Plan

## Goal

Allow users to select and open multiple 3D model files at once from the native file dialog. Each opened file appears as a top-level node in the scene tree, with its internal hierarchy underneath.

## Core Principle

**`loadFormat()` is called exactly once per loaded file. Thumbnail is a byproduct of canvas loading, not a separate loading path.**

当前架构中，同一个文件被解析两次：

```
主画布:     buffer → loadFormat() → meshes → 处理 → R3F 渲染
缩略图:     buffer → loadFormat() → meshes → 离屏渲染 → PNG  (重复!)
```

改为解析一次、两处使用：

```
              ┌─→ meshes/objects ──→ ModelGroup 处理 → R3F 渲染
buffer → loadFormat()
              └─→ meshes/objects ──→ 离屏渲染 → PNG → thumbnail cache
```

## Scope of Changes

| Layer | File | Change |
|-------|------|--------|
| Main process | `electron/main/index.ts` | Enable `multiSelections` in dialog |
| Store | `src/renderer/stores/model-store.ts` | Add `LoadedFileModel[]`, multi-file state, derived active-file fields |
| Loader result cache | **new** `src/renderer/engine/loaderResultCache.ts` | Module-level cache of `loadFormat()` results, keyed by file ID |
| Format loaders | `src/renderer/engine/formatLoaders.ts` | No change |
| Thumbnail generator | `src/renderer/lib/thumbnail-cache/thumbnailGenerator.ts` | New `generateThumbnailFromResult()` — renders from already-parsed objects |
| 3D Rendering | `src/renderer/engine/components/ModelGroup.tsx` | Accept per-file props + `fileId` to look up cached LoaderResult |
| Viewport | `src/renderer/components/viewport/ViewportContainer.tsx` | Render one ModelGroup per loaded file; fire thumbnail on `onParsed` |
| Scene tree UI | `src/renderer/layouts/DesktopLayout.tsx` | Combined tree with file wrapper nodes; multi-path handleOpenFile |
| File open handlers | `WorkspacePage.tsx` handleNativeOpenFile | Loop over selected paths |
| Thumbnail panel | `src/renderer/components/FileListPanel.tsx` | Multi active-marker; priority queue for loaded files |
| Thumbnail queue | `src/renderer/lib/thumbnail-cache/thumbnailQueue.ts` | Priority queue integrates with loaderResultCache |
| Drag/drop, paste | `src/renderer/hooks/useFileUpload.ts`, `WorkspacePage.tsx` | Remain single-file; fallback to existing flow |

## Design Details

### 1. Main Process — Enable Multi-Select

**File:** `electron/main/index.ts:126-144`

```typescript
ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open 3D Model',
    properties: ['openFile', 'multiSelections'],  // ← changed
    filters: [ /* unchanged */ ],
  })
  if (result.canceled) return { success: true, filePaths: [] }
  return { success: true, filePaths: result.filePaths }
})
```

No preload or type declaration changes needed — `openFileDialog()` already returns `{ success: boolean; filePaths?: string[] }`.

### 2. Store — Multi-File State

**File:** `src/renderer/stores/model-store.ts`

#### 2a. New Types

```typescript
export interface LoadedFileModel {
  id: string
  fileName: string
  filePath: string
  buffer: ArrayBuffer
  format: FormatId
  sceneTree: SceneTreeNode[]       // internal hierarchy of this file
  glbPartInfos: GlbPartInfo[]
  modelCenteringOffset: [number, number, number] | null
  sourceUnit: UnitSystem
  fileGroup: FileGroup
  loadingPhase: LoadingPhase
}
```

#### 2b. Store Additions

```typescript
interface ModelStore {
  // --- existing single-model fields (derived from activeFileId) ---
  // glbUrl, sceneTree, modelBuffer, modelFormat, modelFilePath,
  // __loadingPhase, glbPartInfos, modelCenteringOffset, sourceUnit, fileGroup

  // --- new multi-file fields ---
  loadedFiles: LoadedFileModel[]
  activeFileId: string | null

  // --- new actions ---
  addLoadedFile: (file: LoadedFileModel) => void
  removeLoadedFile: (id: string) => void
  setActiveFile: (id: string) => void
  updateFileSceneTree: (fileId: string, tree: SceneTreeNode[]) => void
  updateFilePartInfos: (fileId: string, infos: GlbPartInfo[]) => void
  updateFileCenteringOffset: (fileId: string, offset: [number, number, number] | null) => void
  updateFileLoadingPhase: (fileId: string, phase: LoadingPhase) => void
}
```

#### 2c. Active File Conventions

Existing single-model fields are derived from the active `LoadedFileModel`. `setActiveFile(id)` copies the active file's data into these convenience fields, and rebuilds `sceneTree` as the combined tree (see section 6).

- `addLoadedFile(file)` — pushes to `loadedFiles[]`. First file auto-activates.
- `removeLoadedFile(id)` — removes from `loadedFiles[]`. If active, activates next file (or clears).
- `reset()` — clears `loadedFiles[]`, `activeFileId`, and all single-model fields, plus calls `clearLoaderResultCache()`.

#### 2d. ID Generation

`crypto.randomUUID()` for file IDs. File-level tree node IDs are prefixed `file:${fileId}` to avoid collision with internal node IDs.

### 3. LoaderResultCache — Eliminate Duplicate Parsing

**New file:** `src/renderer/engine/loaderResultCache.ts`

A module-level `Map<string, LoaderResult>` that holds parsed results, keyed by file ID. This is NOT in Zustand — `LoaderResult` contains live THREE.js objects (Meshes, Geometries, Materials) that are not serializable.

```typescript
import type { LoaderResult } from '@/engine/formatLoaders'

const cache = new Map<string, { result: LoaderResult; refCount: number }>()

export function setCachedResult(fileId: string, result: LoaderResult): void {
  cache.set(fileId, { result, refCount: 1 })
}

export function getCachedResult(fileId: string): LoaderResult | undefined {
  return cache.get(fileId)?.result
}

export function removeCachedResult(fileId: string): void {
  const entry = cache.get(fileId)
  if (!entry) return
  entry.refCount--
  if (entry.refCount <= 0) {
    disposeResult(entry.result)
    cache.delete(fileId)
  }
}

export function clearLoaderResultCache(): void {
  for (const [, entry] of cache) {
    disposeResult(entry.result)
  }
  cache.clear()
}

function disposeResult(result: LoaderResult): void {
  for (const mesh of result.meshes) {
    mesh.geometry?.dispose()
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => m.dispose())
    } else {
      mesh.material?.dispose()
    }
  }
  for (const obj of result.objects) {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose()
    }
  }
}
```

### 4. Thumbnail Generator — Render From Parsed Objects

**File:** `src/renderer/lib/thumbnail-cache/thumbnailGenerator.ts`

Add a new function that accepts already-parsed `THREE.Mesh[]` and `THREE.Object3D[]` instead of raw buffer:

```typescript
/**
 * Generate thumbnail from already-parsed meshes/objects.
 * Called as a byproduct of canvas loading — no re-parse needed.
 */
export async function generateThumbnailFromResult(
  meshes: THREE.Mesh[],
  objects: THREE.Object3D[],
  upAxis: 'y' | 'z',
): Promise<Blob | null> {
  const r = getRenderer()
  const scene = new THREE.Scene()

  // Lighting (same as existing generateThumbnail)
  const ambient = new THREE.AmbientLight(0xD4E1E8, 0.5)
  scene.add(ambient)
  const dir1 = new THREE.DirectionalLight(0xFFF5EE, 1.2)
  dir1.position.set(1, 1, 1)
  scene.add(dir1)
  const dir2 = new THREE.DirectionalLight(0xC0D4E8, 0.6)
  dir2.position.set(-0.5, -0.3, -1)
  scene.add(dir2)
  const dir3 = new THREE.DirectionalLight(0x8FD6D6, 0.3)
  dir3.position.set(0, 0.5, -0.5)
  scene.add(dir3)

  const camera = new THREE.PerspectiveCamera(45, WIDTH / HEIGHT)

  try {
    const allObjects: THREE.Object3D[] = [...meshes, ...objects]
    if (allObjects.length === 0) {
      disposeScene(scene)
      return null
    }

    const group = new THREE.Group()
    allObjects.forEach((obj) => group.add(obj.clone()))
    scene.add(group)

    const allMeshes: THREE.Mesh[] = []
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) allMeshes.push(obj)
    })

    if (allMeshes.length > 0) {
      fitCameraToMeshes(allMeshes, camera, upAxis)
    } else {
      camera.position.set(0, 0, 5)
      camera.lookAt(0, 0, 0)
    }

    r.render(scene, camera)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas!.toBlob((b) => resolve(b), 'image/png')
    })

    disposeScene(scene)
    return blob
  } catch (err) {
    console.warn('[thumbnailGenerator] failed from result:', err)
    disposeScene(scene)
    return null
  }
}
```

The existing `generateThumbnail(buffer, format)` is kept as a fallback for the thumbnail queue when generating thumbnails for folder files that have NOT been loaded into canvas (thumbnail queue processes folder files independently).

### 5. ModelGroup — Accept Pre-Parsed Result

**File:** `src/renderer/engine/components/ModelGroup.tsx`

#### 5a. Updated Props

```typescript
interface ModelGroupProps {
  buffer: ArrayBuffer | null
  format: FormatId | null
  fileId?: string                       // NEW: lookup key for loaderResultCache
  filePath?: string | null              // was: read from store
  sceneTree: SceneTreeNode[]            // was: read from store
  glbPartInfos: GlbPartInfo[]           // was: read from store
  fileName?: string                     // for applySinglePartName
  onSceneTreeChange: (tree: SceneTreeNode[]) => void
  onPartInfosChange: (infos: GlbPartInfo[]) => void
  onCenteringOffsetChange: (offset: [number, number, number] | null) => void
  onLoadingPhaseChange: (phase: LoadingPhase) => void
  onSourceUnitChange?: (unit: UnitSystem) => void
  onFileGroupChange?: (group: FileGroup) => void
  onParsed?: (meshes: THREE.Mesh[], objects: THREE.Object3D[], upAxis: 'y' | 'z') => void  // NEW
  onLoaded?: (box: THREE.Box3) => void
  onError?: (message: string) => void
  selectorRuntime?: SelectorRuntime | null
  displayMode?: DisplayMode
}
```

#### 5b. Load Logic Change

In the main `useEffect`:

```typescript
useEffect(() => {
  if (!buffer || !format) {
    // clear state...
    return
  }

  let cancelled = false

  async function load() {
    try {
      // Check cache first — if handler pre-parsed, use cached result
      let result: LoaderResult
      const cached = fileId ? getCachedResult(fileId) : undefined
      if (cached) {
        result = cached
      } else {
        // Fallback: parse on demand (drag/drop, paste, FileListPanel click)
        result = await loadFormat(buffer, format, filePath ?? null)
        if (fileId) setCachedResult(fileId, result)
      }
      if (cancelled) return

      // Fire onParsed for thumbnail generation (once per file)
      if (fileId && !cached) {
        // Only fire if WE just parsed it (not pre-cached by handler)
        // The handler already fired thumbnail generation
      }
      if (!cached) {
        // We parsed here; notify parent to generate thumbnail
        const upAxis = result.sourceUnit ? getDefaultUpAxis(format, buffer) : 'z'
        onParsedRef.current?.(result.meshes, result.objects, upAxis)
      }

      // ... rest of processing (same as before)
      // setSourceUnit, setFileGroup, meshes processing, scene tree building...
    }
    // ...
  }

  load()
  return () => { cancelled = true }
}, [buffer, format, filePath, fileId, ...])
```

Wait — there's a subtlety. If ModelGroup is the one calling `loadFormat()` (cache miss), it should trigger thumbnail generation via `onParsed`. If the handler pre-parsed and cached it, the handler already triggered thumbnail generation, so ModelGroup shouldn't fire again.

Actually, it's simpler to ALWAYS fire `onParsed` from ModelGroup (regardless of cache hit/miss), and have the handler deduplicate in the thumbnail cache (check if thumbnail already exists before generating). But that means ModelGroup always fires onParsed on every render...

Better approach: the handler generates the thumbnail when it preloads. ModelGroup does NOT trigger thumbnail generation — it only uses the cached parse result. The `onParsed` callback is removed from ModelGroup.

If ModelGroup has a cache miss (no fileId, or fileId not in cache), it calls `loadFormat()` and caches the result. But it does NOT generate a thumbnail from it — that's now the responsibility of the loading flow that triggered the file open. For backward compat paths (drag/drop, paste), those also go through a handler that pre-parses and generates thumbnails.

Actually wait — drag/drop and paste go through `useFileUpload.ts`, which calls `setModelBuffer(buffer, format)`. With the new design, these paths should also pre-parse and cache. Let me think about this...

`useFileUpload.ts` currently:
```typescript
if (format === 'step') {
  const { buffer: glbBuffer } = await stepToGlbCached(...)
  setModelBuffer(glbBuffer, 'glb')
} else {
  setModelBuffer(rawBuffer, format)
}
```

After this, ModelGroup's useEffect fires and calls `loadFormat()`. We want to avoid that.

So `useFileUpload` should also pre-parse:
```typescript
// After STEP conversion...
const fileId = generateId()
const parseResult = await loadFormat(glbBuffer, 'glb', filePath)
setCachedResult(fileId, parseResult)
generateThumbnailFromResult(parseResult.meshes, parseResult.objects, upAxis)
  .then(blob => { if (blob) putThumbnail(cacheKey(filePath, mtimeMs), blob) })
addLoadedFile({ id: fileId, buffer: glbBuffer, format: 'glb', ... })
```

This means ALL file loading paths pre-parse. ModelGroup NEVER calls `loadFormat()` — it always gets a cached result.

Hmm, but that's a significant refactor. Let me keep it simpler: ModelGroup falls back to `loadFormat()` on cache miss, and triggers `onParsed` so the caller can generate thumbnail. This handles edge cases gracefully.

Actually, the clearest design:

**ModelGroup always checks cache. On miss, it calls `loadFormat()`, caches the result, and fires `onParsed`. On hit, it uses the cached result directly and does NOT fire `onParsed`.**

The caller (ViewportContainer's onParsed handler) generates the thumbnail:

```typescript
const handleParsed = useCallback((fileId: string, meshes, objects, upAxis) => {
  const file = loadedFiles.find(f => f.id === fileId)
  if (!file) return
  generateThumbnailFromResult(meshes, objects, upAxis).then(blob => {
    if (blob) putThumbnail(cacheKey(file.filePath, file.mtimeMs), blob)
  })
}, [loadedFiles])
```

But wait, we don't have mtimeMs in LoadedFileModel... Let me add it, or use the filePath as cache key. The existing thumbnail cache key is `filePath|mtimeMs`. For loaded files, we can use `filePath` alone, or get mtimeMs from `folderFiles`.

Actually, for loaded files via the open dialog, we don't have mtimeMs (the Electron dialog returns file paths, not stat info). But the thumbnail cache can use just the file path as key for in-memory cache. For IndexedDB persistence, we'd need mtimeMs for cache invalidation.

Let me add `mtimeMs` to `LoadedFileModel` (optional, populated when available from folderFiles or from the file stat).

OK, this is getting complex. Let me simplify the document and just describe the key concepts clearly without over-specifying every line. Here's what I'll write:

### 6. Multi-File Open Flow (End-to-End)

Describes the complete flow when user selects N files.

### 7. STEP File Handling

STEP→GLB conversion is cached via `stepToGlbCached`. In multi-file flow, each STEP file is converted independently. The conversion result (GLB buffer) is treated as the file's buffer for `loadFormat()`.

### 8. UI Thread Strategy

How we keep the UI responsive during multi-file loading.

### 9. Implementation Order

Let me write the full document now.<｜end▁of▁thinking｜>Now let me write the complete, updated design document.

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="Write">
<｜｜DSML｜｜parameter name="content" string="true"># Multi-File Open — Technical Implementation Plan

## Goal

Allow users to select and open multiple 3D model files at once from the native file dialog. Each file appears as a top-level node (named after the file) in the scene tree, with its internal hierarchy underneath. The right panel shows multiple "currently loaded" markers on thumbnails and prioritizes thumbnail generation for loaded files.

## Core Principle: Zero Duplicate Work

**`loadFormat()` is called exactly once per file. Thumbnail is a byproduct of canvas loading, never a separate loading path.**

Each file's data flows through a single pipeline, with both the 3D viewport and the thumbnail panel consuming the same parsed result:

```
              ┌─→ meshes/objects ──→ ModelGroup processes → R3F main canvas
loadFormat()
              └─→ meshes/objects ──→ offscreen render → PNG → thumbnail cache
```

This eliminates the current waste where canvas loading and thumbnail generation each independently call `loadFormat()` (parsing the file twice, allocating duplicate geometries and materials).

## Scope of Changes

| Layer | File | Change |
|-------|------|--------|
| Main process | `electron/main/index.ts` | Enable `multiSelections` in dialog property |
| Parsed result cache | **new** `src/renderer/engine/loaderResultCache.ts` | Module-level Map holding live `LoaderResult` objects |
| Thumbnail generator | `src/renderer/lib/thumbnail-cache/thumbnailGenerator.ts` | New `generateThumbnailFromResult()` — renders from already-parsed objects |
| Store | `src/renderer/stores/model-store.ts` | Add `LoadedFileModel[]`, multi-file state, active-file derived fields |
| ModelGroup | `src/renderer/engine/components/ModelGroup.tsx` | Accept per-file props; lookup loaderResultCache via `fileId` |
| Viewport | `src/renderer/components/viewport/ViewportContainer.tsx` | Render one ModelGroup per file; handle `onParsed` → generate thumbnail |
| Scene tree UI | `src/renderer/layouts/DesktopLayout.tsx` | Combined tree + multi-path handleOpenFile |
| File open handlers | `WorkspacePage.tsx` | Loop over multi paths; pre-parse + generate thumbnail inline |
| Thumbnail panel | `src/renderer/components/FileListPanel.tsx` | Multi active-marker (loadedFilePaths Set) |
| Thumbnail queue | `src/renderer/lib/thumbnail-cache/thumbnailQueue.ts` | Priority: loaded files first; check loaderResultCache before parsing |
| Drag/drop, paste | `src/renderer/hooks/useFileUpload.ts` | Pre-parse + thumbnail inline (same principle, single-file) |

## Detailed Design

### 1. Main Process — Enable Multi-Select

**File:** `electron/main/index.ts:128-130`

```typescript
properties: ['openFile', 'multiSelections'],  // add multiSelections
```

No preload or type changes needed. The return type `filePaths: string[]` already supports multiple paths.

### 2. LoaderResultCache — The Single Source of Truth

**New file:** `src/renderer/engine/loaderResultCache.ts`

A module-level cache holding `loadFormat()` results. This is NOT in Zustand because `LoaderResult` contains live THREE.js objects (Meshes, Geometries, Materials) that don't belong in a serializable store.

```typescript
import * as THREE from 'three'
import type { LoaderResult } from '@/engine/formatLoaders'

interface CacheEntry {
  result: LoaderResult
  refCount: number
}

const cache = new Map<string, CacheEntry>()

export function setCachedResult(fileId: string, result: LoaderResult): void {
  // If replacing an existing entry, dispose the old one first
  const prev = cache.get(fileId)
  if (prev) disposeResult(prev.result)
  cache.set(fileId, { result, refCount: 1 })
}

export function getCachedResult(fileId: string): LoaderResult | undefined {
  return cache.get(fileId)?.result
}

export function retainResult(fileId: string): void {
  const entry = cache.get(fileId)
  if (entry) entry.refCount++
}

export function releaseResult(fileId: string): void {
  const entry = cache.get(fileId)
  if (!entry) return
  entry.refCount--
  if (entry.refCount <= 0) {
    disposeResult(entry.result)
    cache.delete(fileId)
  }
}

export function clearAllResults(): void {
  for (const [, entry] of cache) disposeResult(entry.result)
  cache.clear()
}

function disposeResult(result: LoaderResult): void {
  for (const mesh of result.meshes) {
    mesh.geometry?.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach(m => m.dispose())
    else mat?.dispose()
  }
  for (const obj of result.objects) {
    const m = obj as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material
    if (Array.isArray(mat)) mat.forEach(mt => mt.dispose())
    else mat?.dispose()
  }
}
```

**Lifecycle:**
- Acquired when a file finishes `loadFormat()` (via handler or ModelGroup fallback)
- Referenced by: ModelGroup (for canvas rendering) + thumbnail generation (until PNG is captured)
- Released when ModelGroup unmounts (file removed from scene) or on `reset()`

### 3. Thumbnail Generator — Render From Parsed Objects

**File:** `src/renderer/lib/thumbnail-cache/thumbnailGenerator.ts`

Extract the scene setup, lighting, camera fitting, and render logic from `generateThumbnail()` into a shared helper. Add a second entry point that accepts already-parsed objects:

```typescript
/**
 * Generate thumbnail from already-parsed meshes/objects.
 * Called as a byproduct of canvas loading — no duplicate parse.
 * Runs offscreen WebGL render, then disposes the temporary scene.
 */
export async function generateThumbnailFromResult(
  meshes: THREE.Mesh[],
  objects: THREE.Object3D[],
  upAxis: 'y' | 'z',
): Promise<Blob | null> {
  const r = getRenderer()
  const scene = new THREE.Scene()
  setupLighting(scene)  // extracted from existing generateThumbnail

  const camera = new THREE.PerspectiveCamera(45, WIDTH / HEIGHT)

  try {
    const allObjects: THREE.Object3D[] = [...meshes, ...objects]
    if (allObjects.length === 0) { disposeScene(scene); return null }

    const group = new THREE.Group()
    // Clone so the offscreen render doesn't mutate the shared LoaderResult
    for (const obj of allObjects) group.add(obj.clone())
    scene.add(group)

    const allMeshes: THREE.Mesh[] = []
    group.traverse((obj) => { if (obj instanceof THREE.Mesh) allMeshes.push(obj) })

    if (allMeshes.length > 0) {
      fitCameraToMeshes(allMeshes, camera, upAxis)
    } else {
      camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0)
    }

    r.render(scene, camera)
    const blob = await new Promise<Blob | null>(resolve => canvas!.toBlob(b => resolve(b), 'image/png'))
    disposeScene(scene)
    return blob
  } catch (err) {
    disposeScene(scene)
    return null
  }
}
```

The existing `generateThumbnail(buffer, format)` is refactored to call `loadFormat()` + `generateThumbnailFromResult()`, and is kept for the thumbnail queue's independent processing of non-loaded folder files.

### 4. ModelGroup — Accept Pre-Parsed Result

**File:** `src/renderer/engine/components/ModelGroup.tsx`

#### 4a. Updated Props

```typescript
interface ModelGroupProps {
  buffer: ArrayBuffer | null
  format: FormatId | null
  fileId?: string                       // NEW: lookup key for loaderResultCache
  filePath?: string | null              // was: read from store
  sceneTree: SceneTreeNode[]            // was: read from store
  glbPartInfos: GlbPartInfo[]           // was: read from store
  fileName?: string                     // for applySinglePartName
  onSceneTreeChange: (tree: SceneTreeNode[]) => void
  onPartInfosChange: (infos: GlbPartInfo[]) => void
  onCenteringOffsetChange: (offset: [number, number, number] | null) => void
  onLoadingPhaseChange: (phase: LoadingPhase) => void
  onSourceUnitChange?: (unit: UnitSystem) => void
  onFileGroupChange?: (group: FileGroup) => void
  // NEW: fires once per file when loadFormat() completes (cache miss only)
  onParsed?: (meshes: THREE.Mesh[], objects: THREE.Object3D[], upAxis: 'y' | 'z') => void
  onLoaded?: (box: THREE.Box3) => void
  onError?: (message: string) => void
  selectorRuntime?: SelectorRuntime | null
  displayMode?: DisplayMode
}
```

#### 4b. Load Logic

In the main `useEffect`, the data-fetching step changes from:

```
loadFormat(buffer, format)  ← always called
```

to:

```typescript
// Check cache first
let result: LoaderResult
const cached = fileId ? getCachedResult(fileId) : undefined
if (cached) {
  result = cached                        // handler pre-parsed → free
} else {
  result = await loadFormat(buffer, format, filePath ?? null)
  if (fileId) setCachedResult(fileId, result)
  // Fire onParsed so caller generates thumbnail from this fresh parse
  onParsedRef.current?.(result.meshes, result.objects, getDefaultUpAxis(format, buffer))
}
```

**Key rule: `onParsed` fires only on cache miss** (when ModelGroup itself called `loadFormat()`). When the handler pre-parsed, it already triggered thumbnail generation.

The rest of the effect (mesh processing, scene tree building, centering, loading phase) is unchanged — it operates on `result` regardless of source.

#### 4c. Store Decoupling

Replace all `useModelStore(...)` reads/writes with props (same as section 3 of original design):

| Store access | Replaced by |
|---|---|
| `useModelStore(s => s.sceneTree)` | `props.sceneTree` |
| `useModelStore(s => s.glbPartInfos)` | `props.glbPartInfos` |
| `useModelStore(s => s.modelFilePath)` | `props.filePath` |
| `setGlbPartInfos(...)` | `props.onPartInfosChange(...)` |
| `setModelCenteringOffset(...)` | `props.onCenteringOffsetChange(...)` |
| `setLoadingPhase(...)` | `props.onLoadingPhaseChange(...)` |
| `updateSceneTree(...)` | `props.onSceneTreeChange(...)` |
| `useModelStore.getState().setSourceUnit(...)` | `props.onSourceUnitChange?.(...)` |
| `useModelStore.getState().setFileGroup(...)` | `props.onFileGroupChange?.(...)` |
| `applySinglePartName` reads `glbUrl` | uses `props.fileName` |

#### 4d. Cleanup

On unmount (the effect's cleanup function), if `fileId` is provided, call `releaseResult(fileId)` to decrement the refcount and potentially dispose cached geometries/materials.

### 5. Store — Multi-File State

**File:** `src/renderer/stores/model-store.ts`

#### 5a. New Types

```typescript
export interface LoadedFileModel {
  id: string
  fileName: string
  filePath: string
  mtimeMs?: number                // for thumbnail cache key
  buffer: ArrayBuffer
  format: FormatId
  sceneTree: SceneTreeNode[]
  glbPartInfos: GlbPartInfo[]
  modelCenteringOffset: [number, number, number] | null
  sourceUnit: UnitSystem
  fileGroup: FileGroup
  loadingPhase: LoadingPhase
}
```

#### 5b. Store State

```typescript
interface ModelStore {
  // --- existing single-model fields (DERIVED from activeFileId) ---
  glbUrl: string | null
  sceneTree: SceneTreeNode[]
  modelVersion: number
  modelBuffer: ArrayBuffer | null
  modelFormat: FormatId | null
  modelFilePath: string | null
  __loadingPhase: LoadingPhase
  sourceUnit: UnitSystem
  fileGroup: FileGroup
  activeUpAxis: UpAxis
  glbPartInfos: GlbPartInfo[]
  modelCenteringOffset: [number, number, number] | null
  // ... existing folderFiles, selectedFileIndex, isConverting, etc.

  // --- new multi-file fields ---
  loadedFiles: LoadedFileModel[]
  activeFileId: string | null

  // --- new actions ---
  addLoadedFile: (file: LoadedFileModel) => void
  removeLoadedFile: (id: string) => void
  setActiveFile: (id: string) => void
  updateFileSceneTree: (fileId: string, tree: SceneTreeNode[]) => void
  updateFilePartInfos: (fileId: string, infos: GlbPartInfo[]) => void
  updateFileCenteringOffset: (fileId: string, offset: [number, number, number] | null) => void
  updateFileLoadingPhase: (fileId: string, phase: LoadingPhase) => void
}
```

#### 5c. Derived Fields

`setActiveFile(id)` copies the selected file's fields into the existing single-model convenience fields. This ensures code that reads `modelBuffer`, `glbUrl`, `sceneTree` etc. continues to work:

```typescript
setActiveFile: (id) => {
  const file = get().loadedFiles.find(f => f.id === id)
  if (!file) return
  set({
    activeFileId: id,
    glbUrl: file.fileName,
    modelBuffer: file.buffer,
    modelFormat: file.format,
    modelFilePath: file.filePath,
    __loadingPhase: file.loadingPhase,
    sourceUnit: file.sourceUnit,
    fileGroup: file.fileGroup,
    glbPartInfos: file.glbPartInfos,
    modelCenteringOffset: file.modelCenteringOffset,
    sceneTree: buildCombinedTree(get().loadedFiles),
  })
}
```

`buildCombinedTree()` wraps each file's internal tree in a file-level node:

```typescript
function buildCombinedTree(files: LoadedFileModel[]): SceneTreeNode[] {
  return files.map(file => ({
    id: `file:${file.id}`,
    name: file.fileName,
    visible: true,
    expanded: true,
    children: file.sceneTree.length > 0 ? file.sceneTree : undefined,
  }))
}
```

#### 5d. Action Logic

```typescript
addLoadedFile: (file) => set(state => {
  const newFiles = [...state.loadedFiles, file]
  const isFirst = state.loadedFiles.length === 0
  return {
    loadedFiles: newFiles,
    // First file auto-activates
    ...(isFirst ? {
      activeFileId: file.id,
      glbUrl: file.fileName,
      modelBuffer: file.buffer,
      modelFormat: file.format,
      modelFilePath: file.filePath,
      sceneTree: buildCombinedTree(newFiles),
      // ...
    } : {
      sceneTree: buildCombinedTree(newFiles),
    }),
  }
})

removeLoadedFile: (id) => {
  releaseResult(id)  // dispose cached LoaderResult
  set(state => {
    const newFiles = state.loadedFiles.filter(f => f.id !== id)
    if (newFiles.length === 0) {
      // Reset to empty
      return { loadedFiles: [], activeFileId: null, sceneTree: [], /* ...clear all single-model fields */ }
    }
    const newActive = state.activeFileId === id
      ? newFiles[newFiles.length - 1]  // activate last remaining file
      : newFiles.find(f => f.id === state.activeFileId) ?? newFiles[0]
    return {
      loadedFiles: newFiles,
      activeFileId: newActive.id,
      sceneTree: buildCombinedTree(newFiles),
      // ... copy newActive into single-model fields
    }
  })
}

reset: () => {
  clearAllResults()
  // clear all state as before
}
```

#### 5e. `updateFile*` Helpers

Each locates the file by ID, updates the field, and syncs to single-model fields if it's the active file:

```typescript
updateFileSceneTree: (fileId, tree) => set(state => {
  const newFiles = state.loadedFiles.map(f =>
    f.id === fileId ? { ...f, sceneTree: tree } : f
  )
  return {
    loadedFiles: newFiles,
    sceneTree: buildCombinedTree(newFiles),
    ...(state.activeFileId === fileId ? { sceneTree: buildCombinedTree(newFiles) } : {}),
  }
})
```

Same pattern for `updateFilePartInfos`, `updateFileCenteringOffset`, `updateFileLoadingPhase`.

### 6. End-to-End Multi-File Open Flow

When the user clicks "Open" in the toolbar and selects N files, the complete flow is:

```
User selects files
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ DesktopLayout.handleOpenFile (async, non-blocking)       │
│                                                          │
│  for each filePath in result.filePaths:                  │
│                                                          │
│    ┌─ 1. readFile(filePath) → ArrayBuffer               │
│    │     (IPC call — yields to event loop naturally)     │
│    │                                                     │
│    ├─ 2. if STEP: stepToGlbCached(buffer)              │
│    │     → GLB ArrayBuffer (CacheResult cached)          │
│    │     setConverting(true/false) around conversion     │
│    │                                                     │
│    ├─ 3. const result = await loadFormat(buffer, fmt)   │
│    │     Returns { meshes, objects, sceneRoot, ... }     │
│    │                                                     │
│    ├─ 4. fileId = crypto.randomUUID()                   │
│    │     setCachedResult(fileId, result)                │
│    │                                                     │
│    ├─ 5. FIRE-AND-FORGET thumbnail:                     │
│    │     generateThumbnailFromResult(                    │
│    │       result.meshes, result.objects, upAxis         │
│    │     ).then(blob => putThumbnail(cacheKey, blob))   │
│    │     (NOT awaited — canvas renders immediately)      │
│    │                                                     │
│    └─ 6. addLoadedFile({ id, fileName, filePath,        │
│           buffer, format, sceneTree: [], ... })          │
│                                                          │
│  After loop: populate folderFiles from first file's dir  │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ ViewportContainer re-renders (loadedFiles changed)       │
│                                                          │
│  {loadedFiles.map(file => (                              │
│    <group key={file.id} position={offset}>               │
│      <ModelGroup                                         │
│        fileId={file.id}        ← cache lookup key        │
│        buffer={file.buffer}                              │
│        format={file.format}                              │
│        filePath={file.filePath}                          │
│        sceneTree={file.sceneTree}                        │
│        fileName={file.fileName}                          │
│        onSceneTreeChange={...}                           │
│        onParsed={handleParsed}  ← fires on cache miss    │
│        onLoaded={handleLoaded}                           │
│        ...                                               │
│      />                                                  │
│    </group>                                              │
│  ))}                                                     │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ ModelGroup.useEffect fires                              │
│                                                          │
│  const cached = getCachedResult(fileId)                  │
│  if (cached) {                                           │
│    result = cached        ← HIT: handler pre-parsed     │
│                           ← no loadFormat(), no onParsed │
│  } else {                                                │
│    result = await loadFormat(...)   ← MISS (legacy path)│
│    setCachedResult(fileId, result)                       │
│    onParsed(result.meshes, ...)    ← triggers thumbnail │
│  }                                                       │
│                                                          │
│  process result.meshes (clone, center, build tree...)    │
│  update file sceneTree/partInfos in store                │
│  onLoaded(boundingBox)                                   │
└─────────────────────────────────────────────────────────┘
```

#### Why This Is Correct

1. **`loadFormat()` is called once per file** — by the handler (step 3). ModelGroup hits the cache (step "HIT").
2. **Thumbnail is a byproduct** — step 5 fires `generateThumbnailFromResult()` on the same `LoaderResult` that feeds ModelGroup. No second parse, no second file read.
3. **Fire-and-forget thumbnail** — step 5 is NOT awaited. The PNG renders offscreen in the background. The 3D model appears in the viewport without waiting for the thumbnail.
4. **ModelGroup renders immediately** — cache hit means no async `loadFormat()` inside the effect. The result is available synchronously from the module-level Map.
5. **Thumbnail queue is unaware** — the queue's `processNext()` checks the thumbnail cache first (as it does today). If the thumbnail was already stored by the handler's fire-and-forget, it's a cache hit. If the queue gets there first, it falls back to `generateThumbnail(buffer, format)` which calls `loadFormat()` independently — but this is only for non-loaded folder files.

### 7. STEP File Handling

STEP files add an extra conversion stage before `loadFormat()`. The flow is:

```
.stp file → readFile() → ArrayBuffer
         → stepToGlbCached(buffer, { filePath, mtimeMs }, { wasmPath })
         → { buffer: GLB_ArrayBuffer }  // cached: mem + IndexedDB
         → loadFormat(glbBuffer, 'glb')
         → LoaderResult (meshes from the converted GLB)
         → ModelGroup uses 'glb' format, not 'step'
```

Key points:
- `stepToGlbCached` already has a two-tier cache (in-memory + IndexedDB). No change needed.
- After conversion, the format is `'glb'`, so `loadFormat()` and `generateThumbnailFromResult()` handle it as a standard GLB.
- The `fileName` shown in the scene tree is the original `.stp` filename, not the GLB buffer name.
- The `buffer` stored in `LoadedFileModel` is the converted GLB buffer, since that's what ModelGroup and any re-export operation use.

**Per-file conversion**: When N STEP files are selected, each is converted independently. Conversions happen sequentially in the handler loop, but the `stepToGlbCached` cache means re-opening the same file later is instant.

**Future optimization** (not in v1): If the Web Worker pool could handle multiple conversions, we could parallelize. But the OCCT wasm is single-instance, so sequential is correct.

### 8. UI Thread Non-Blocking Strategy

The multi-file open handler is inherently async. Each step yields to the event loop:

```
for each file:
  await readFile(filePath)          ← IPC: yields, UI responsive
  await stepToGlbCached(buffer)     ← Web Worker: yields, UI responsive (STEP only)
  await loadFormat(buffer, format)  ← CPU-bound, blocks briefly
  generateThumbnailFromResult(...)  ← NOT awaited, runs in background
  addLoadedFile(file)               ← triggers React render
```

**Critical decisions:**

1. **`loadFormat()` is CPU-bound but unavoidable.** For a large GLB (100MB+), `GLTFLoader.parseAsync()` takes ~200-500ms of synchronous CPU time. This is the same cost the user pays today (it just happens inside ModelGroup's useEffect). The total blocking time per file is unchanged — we're just moving it from ModelGroup to the handler.

2. **Files are processed sequentially, not in parallel.** Parallel `loadFormat()` calls would compete for CPU and could cause jank. Sequential processing means the first model appears fastest, then the second, etc. Each file's `addLoadedFile()` triggers an immediate React render, so the user sees incremental progress.

3. **Between files, the async boundary (`await`) gives the browser a chance to paint.** After each file's `loadFormat()` completes:
   - `addLoadedFile()` fires → React re-render scheduled
   - `await readFile(nextFile)` → IPC → browser processes the render
   - First model appears in viewport while second is still reading from disk

4. **Thumbnail generation is background-only.** `generateThumbnailFromResult()` runs an offscreen WebGL render (separate WebGLRenderer, separate context). It is NOT awaited — the model appears in the main canvas immediately. The thumbnail PNG arrives later and populates the cache, at which point the right panel updates.

5. **For extreme cases** (e.g., 20+ files selected), the sequential processing could take noticeable time. A v2 improvement would be a concurrency limit of 2-3 `loadFormat()` calls at a time, but this adds complexity (the cache and store updates need to handle parallel completions) with minimal practical benefit — users rarely open more than 5-10 files at once.

### 9. ViewportContainer — Multiple ModelGroups

**File:** `src/renderer/components/viewport/ViewportContainer.tsx`

#### 9a. Render Per-File ModelGroups

```tsx
const loadedFiles = useModelStore(s => s.loadedFiles)
const activeFileId = useModelStore(s => s.activeFileId)
const updateFileSceneTree = useModelStore(s => s.updateFileSceneTree)
const updateFilePartInfos = useModelStore(s => s.updateFilePartInfos)
const updateFileCenteringOffset = useModelStore(s => s.updateFileCenteringOffset)
const updateFileLoadingPhase = useModelStore(s => s.updateFileLoadingPhase)

// Per-file X offset so models don't overlap in the viewport
const [fileOffsets, setFileOffsets] = useState<Map<string, number>>(new Map())

const handleParsed = useCallback((
  fileId: string, meshes: THREE.Mesh[], objects: THREE.Object3D[], upAxis: 'y' | 'z'
) => {
  const file = useModelStore.getState().loadedFiles.find(f => f.id === fileId)
  if (!file) return
  const key = `${file.filePath}|${file.mtimeMs ?? 0}`
  generateThumbnailFromResult(meshes, objects, upAxis).then(blob => {
    if (blob) putThumbnail(key, blob)
  })
}, [])

const handleFileLoaded = useCallback((fileId: string, box: THREE.Box3) => {
  // Recalculate offsets so models don't overlap
  setFileOffsets(prev => {
    const next = new Map(prev)
    let offset = 0
    for (let i = 0; i < loadedFiles.length; i++) {
      const f = loadedFiles[i]
      if (f.id === fileId) {
        next.set(f.id, offset)
        offset += box.max.x - box.min.x + (box.max.x - box.min.x) * 0.2
      } else if (next.has(f.id)) {
        // Keep existing offset
      }
    }
    return next
  })
  // Camera fit: only for first file loaded
  if (loadedFiles.length === 1) {
    // existing applyCameraFit logic
  }
}, [loadedFiles])

return (
  <Canvas>
    {/* ... existing scene setup, controls, etc. ... */}

    {loadedFiles.map(file => (
      <group key={file.id} position={[fileOffsets.get(file.id) ?? 0, 0, 0]}>
        <ModelGroup
          fileId={file.id}
          buffer={file.buffer}
          format={file.format}
          filePath={file.filePath}
          sceneTree={file.sceneTree}
          glbPartInfos={file.glbPartInfos}
          fileName={file.fileName}
          onSceneTreeChange={(tree) => updateFileSceneTree(file.id, tree)}
          onPartInfosChange={(infos) => updateFilePartInfos(file.id, infos)}
          onCenteringOffsetChange={(offset) => updateFileCenteringOffset(file.id, offset)}
          onLoadingPhaseChange={(phase) => updateFileLoadingPhase(file.id, phase)}
          onSourceUnitChange={(unit) => { /* update in loadedFiles */ }}
          onFileGroupChange={(group) => { /* update in loadedFiles */ }}
          onParsed={(meshes, objects, upAxis) => handleParsed(file.id, meshes, objects, upAxis)}
          onLoaded={(box) => handleFileLoaded(file.id, box)}
          onError={handleModelError}
          selectorRuntime={file.id === activeFileId ? selectorRuntime : null}
          displayMode={resolvedDisplayMode}
        />
      </group>
    ))}
  </Canvas>
)
```

#### 9b. Positioning Strategy

v1 uses fixed spacing: each file at `[i * spacing, 0, 0]` where `spacing = 10` (world units). After `onLoaded`, offsets can be refined based on actual bounding box widths. The user navigates with orbit controls as usual.

#### 9c. Topology Selector

`selectorRuntime` is built from the active file's buffer only. Pass it only to the active file's ModelGroup. Other files render without topology interaction.

### 10. Scene Tree UI — Combined Tree

**File:** `src/renderer/layouts/DesktopLayout.tsx`

#### 10a. Combined Tree

The `sceneTree` in the store is already the combined tree (built by `buildCombinedTree()` in `addLoadedFile` / `setActiveFile` / `updateFileSceneTree`). The DesktopLayout just renders it:

```tsx
const sceneTree = useModelStore(s => s.sceneTree)
const activeFileId = useModelStore(s => s.activeFileId)

// sceneTree rendered as-is in the left panel
{sceneTree.map(node => (
  <SceneTreeItem key={node.id} node={node} depth={0} />
))}
```

No extra `useMemo` needed — the store already computes `buildCombinedTree()` on every mutation.

#### 10b. Updated SceneTreeItem

- File-level nodes (`id.startsWith('file:')`) get bold styling
- Clicking a file-level node calls `setActiveFile(fileId)` (extracted from the id)
- Expand/collapse and visibility work normally (file node toggles cascade to children)
- File-level nodes have no `meshIndex` → not selectable for topology picking
- File-level nodes get a small close button (×) on hover → `removeLoadedFile(fileId)`

#### 10c. handleOpenFile — Multi-Path Loop

```typescript
const handleOpenFile = useCallback(async () => {
  const result = await window.electronAPI.openFileDialog()
  if (!result.success || !result.filePaths?.length) return

  const { addLoadedFile, setActiveFile, setConverting, setFolderFiles } =
    useModelStore.getState()
  let firstFileId: string | null = null

  for (const filePath of result.filePaths) {
    const fileName = filePath.split(/[/\\]/).pop() || filePath

    // 1. Read file
    const fileResult = await window.electronAPI.readFile(filePath)
    if (!fileResult.success || !fileResult.data) {
      toast.error(`Failed to read: ${fileName}`)
      continue
    }
    let buffer = fileResult.data
    let format = detectFormat(fileName)

    // 2. STEP conversion
    if (format === 'step') {
      setConverting(true)
      try {
        const { buffer: glbBuffer } = await stepToGlbCached(
          buffer, { filePath, mtimeMs: Date.now() },
          { wasmPath: '/wasm/occt-import-js.wasm' },
        )
        buffer = glbBuffer
        format = 'glb'
      } finally {
        setConverting(false)
      }
    }

    if (!format) {
      toast.error(`Unsupported format: ${fileName}`)
      continue
    }

    // 3. Parse ONCE — this result feeds both canvas and thumbnail
    const loadResult = await loadFormat(buffer, format, filePath)
    const fileId = crypto.randomUUID()
    setCachedResult(fileId, loadResult)
    firstFileId ??= fileId

    // 4. Thumbnail as byproduct (fire-and-forget)
    const upAxis = getDefaultUpAxis(format, buffer)
    generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
      .then(blob => {
        if (blob) {
          const key = `${filePath}|${Date.now()}`
          putThumbnail(key, blob)
        }
      })

    // 5. Add to store — triggers ModelGroup render (cache HIT)
    addLoadedFile({
      id: fileId,
      fileName,
      filePath,
      mtimeMs: Date.now(),
      buffer,
      format,
      sceneTree: [],
      glbPartInfos: [],
      modelCenteringOffset: null,
      sourceUnit: loadResult.sourceUnit ?? FORMAT_MAP[format].defaultUnit,
      fileGroup: FORMAT_MAP[format].group,
      loadingPhase: 'loading',
    })
  }

  // Populate folder file list from first file's directory
  if (result.filePaths.length > 0) {
    const firstPath = result.filePaths[0]
    const dirPath = firstPath.slice(0, Math.max(
      firstPath.lastIndexOf('/'), firstPath.lastIndexOf('\\')
    ))
    const dirResult = await window.electronAPI.readDirectory(dirPath)
    if (dirResult.success && dirResult.files) {
      setFolderFiles(dirPath, dirResult.files)
    }
  }
}, [])
```

### 11. WorkspacePage — Same Pattern

**File:** `src/renderer/pages/WorkspacePage.tsx`

`handleNativeOpenFile` follows the same pattern as `DesktopLayout.handleOpenFile`:

```
for each filePath in result.filePaths:
  readFile → detectFormat → (STEP convert) → loadFormat → cache → thumbnail → addLoadedFile
```

The existing single-file logic is replaced by the loop.

### 12. useFileUpload — Single File, Same Principle

**File:** `src/renderer/hooks/useFileUpload.ts`

For drag/drop and paste (single file), the same "parse once, thumbnail as byproduct" principle applies:

```typescript
const uploadFile = useCallback(async (file: File) => {
  // ... format detection ...

  const rawBuffer = await file.arrayBuffer()
  let buffer = rawBuffer, format = detectFormat(file.name)

  // STEP conversion
  if (format === 'step') {
    const { buffer: glbBuffer } = await stepToGlbCached(rawBuffer, ...)
    buffer = glbBuffer; format = 'glb'
  }

  // Parse once
  const filePath = window.electronAPI?.getFilePath(file) ?? file.name
  const loadResult = await loadFormat(buffer, format!, filePath)
  const fileId = crypto.randomUUID()
  setCachedResult(fileId, loadResult)

  // Thumbnail as byproduct (fire-and-forget)
  generateThumbnailFromResult(loadResult.meshes, loadResult.objects, getDefaultUpAxis(format!, buffer))
    .then(blob => { if (blob) putThumbnail(cacheKey, blob) })

  // Add to store (single file = replace, unless shift/ctrl held)
  addLoadedFile({ id: fileId, fileName: file.name, filePath, buffer, format: format!, ... })

  // ... folder scan ...
}, [])
```

For drag/drop and paste, the behavior is single-file replacement (unless future UX decides otherwise). But the internal data flow is the same.

### 13. Right Panel — Thumbnail & File List Updates

**File:** `src/renderer/components/FileListPanel.tsx`

#### 13a. Multiple Active Markers

The existing green dot indicator on thumbnails marks the "currently loaded" file. With multi-file, multiple files can be loaded simultaneously, so multiple thumbnails show the marker.

```typescript
// Build a Set from loadedFiles for O(1) lookup
const loadedFilePaths = useModelStore(s =>
  new Set(s.loadedFiles.map(f => f.filePath))
)

// In render:
const isLoaded = loadedFilePaths.has(file.path)
// Show green dot if isLoaded
```

#### 13b. Thumbnail Queue Priority

Loaded files should get their thumbnails generated first. The queue already has a priority mechanism (`visiblePaths`). Add a second tier `priorityPaths`:

```typescript
// thumbnailQueue.ts

let priorityPaths: Set<string> = new Set()

export function setPriorityPaths(paths: Set<string>) {
  priorityPaths = new Set(paths)
  rebuildQueue()
}

function rebuildQueue() {
  const sorted = currentFiles.slice().sort((a, b) => {
    const aPri = priorityPaths.has(a.path) ? 2 : visiblePaths.has(a.path) ? 1 : 0
    const bPri = priorityPaths.has(b.path) ? 2 : visiblePaths.has(b.path) ? 1 : 0
    return bPri - aPri
  })
  queue = sorted.filter(f => !processing.has(f.path))
}
```

In `FileListPanel`, when `loadedFilePaths` changes, call `setPriorityPaths(loadedFilePaths)`.

#### 13c. De-duplication with loaderResultCache

The queue's `processNext()` can optionally check if a `LoaderResult` is already cached for a file path. If so, it can use `generateThumbnailFromResult()` instead of `generateThumbnail(buffer, format)`, saving the parse step.

However, in practice this is rarely needed because the handler's fire-and-forget thumbnail is already stored in the thumbnail cache by the time the queue processes that file. The queue's existing cache check (`getThumbnail(key)`) catches it. So the loaderResultCache integration in the queue is optional for v1.

#### 13d. Click Behavior in FileListPanel

```typescript
const handleFileClick = useCallback(async (file) => {
  const { loadedFiles, setActiveFile, addLoadedFile } = useModelStore.getState()

  // If already loaded, just switch active file
  const existing = loadedFiles.find(f => f.filePath === file.path)
  if (existing) {
    setActiveFile(existing.id)
    return
  }

  // Otherwise: read → parse → thumbnail → addLoadedFile (same as handler flow)
  // ... (same steps as handleOpenFile loop body)
}, [])
```

### 14. File Open Entry Points — Summary

| Entry Point | File | Behavior |
|-------------|------|----------|
| Toolbar "Open" button | `DesktopLayout.tsx` | Multi-select → loop → parse each → thumbnail → addLoadedFile |
| Empty-state drop zone | `WorkspacePage.tsx` | Multi-select → same loop |
| FileListPanel click | `FileListPanel.tsx` | Single file → parse → thumbnail → addLoadedFile (or setActiveFile if cached) |
| Drag and drop | `WorkspacePage.tsx` → `useFileUpload.ts` | Single file → same flow |
| Clipboard paste | `WorkspacePage.tsx` → `useFileUpload.ts` | Single file → same flow |

All paths share the same core: `readFile → (STEP convert) → loadFormat → cache → thumbnail → addLoadedFile`.

### 15. Implementation Order

| Step | Description | Risk |
|------|-------------|------|
| 1 | `electron/main/index.ts` — enable `multiSelections` | Low |
| 2 | `loaderResultCache.ts` — new file, module-level Map | Low |
| 3 | `thumbnailGenerator.ts` — extract `generateThumbnailFromResult()` | Low |
| 4 | `model-store.ts` — `LoadedFileModel`, multi-file state, actions | High |
| 5 | `ModelGroup.tsx` — per-file props + cache lookup + `onParsed` callback | High |
| 6 | `ViewportContainer.tsx` — multiple ModelGroups + positioning + `onParsed` handler | Medium |
| 7 | `DesktopLayout.tsx` — combined tree + multi-path handleOpenFile | Medium |
| 8 | `WorkspacePage.tsx` — multi-path handleNativeOpenFile | Medium |
| 9 | `useFileUpload.ts` — pre-parse + thumbnail inline | Medium |
| 10 | `FileListPanel.tsx` — multi active-marker + priority paths | Low |
| 11 | `thumbnailQueue.ts` — `priorityPaths` integration | Low |
| 12 | E2E tests — multi-file scenarios | Medium |
| 13 | Unit tests — store, cache, thumbnail generator | Medium |

### 16. Testing Strategy

**Unit tests:**
- `loaderResultCache`: set/get/release/clear, refCount correctness, dispose on release
- `model-store`: addLoadedFile, removeLoadedFile, setActiveFile, derived fields, buildCombinedTree, reset
- `thumbnailGenerator`: `generateThumbnailFromResult()` with mock meshes
- `ModelGroup`: renders with cached result (no loadFormat call); renders with onParsed fire on cache miss

**E2E tests:**
- Open multiple files via dialog → scene tree shows all file nodes, correct file names
- All loaded models visible in viewport
- Click file node → active file switches
- Remove file (close button) → tree updates, model removed from viewport
- Green dot on multiple thumbnails in right panel
- Single file open → backward compatible (existing tests pass unmodified)
- STEP multi-file → each .stp file converted and displayed correctly

### 17. Backward Compatibility

- **Single-file open** (select one file in dialog) → identical user experience, same data flow
- **Drag/drop, paste** → unchanged external behavior, internal flow upgraded to pre-parse path
- **Existing store selectors** (`modelBuffer`, `glbUrl`, `sceneTree`, etc.) → derived from active file, work as before
- **Existing E2E tests** → should pass without changes (active file state mirrors old single-model state)
- **FileListPanel click** → unchanged: loads file (adds to loadedFiles if new, switches if existing)
