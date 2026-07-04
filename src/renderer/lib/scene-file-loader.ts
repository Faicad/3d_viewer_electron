import { toast } from 'sonner'
import { useModelStore } from '@/stores/model-store'
import { useSvgWorkspaceStore, parseSvgViewBox, parseSvgLayers } from '@/stores/svg-workspace-store'
import { stepToGlbCached, decompressStpz } from '@/lib/step-converter'
import { detectFormat, FORMAT_MAP, getDefaultUpAxis, isStepFile, isIgesFile, isBrepFile, MAX_STEP_FILE_SIZE } from '@/config/file-formats'
import { loadFormat, parseStepHeader } from '@/engine/formatLoaders'
import type { FileMeta } from '@/lib/file-meta'
import { setCachedResult } from '@/engine/loaderResultCache'
import { generateThumbnailFromResult, generateSvgThumbnail, processEmbeddedThumbnail } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'

/** Double-click (toggle): add this file to scene, or remove it if already loaded. */
export async function toggleFileInScene(file: { name: string; path: string; mtimeMs: number }, index: number) {
  const store = useModelStore.getState()
  store.setSelectedFileIndex(index)

  let format = detectFormat(file.name)

  // SVG/DXF toggle: add/remove from workspace without touching 3D pipeline
  if (format === 'svg' || format === 'dxf') {
    const existing = store.loadedFiles.find(f => f.filePath === file.path)
    if (existing && existing.svgText) {
      // Toggle workspace visibility (toggleFile syncs with model store)
      useSvgWorkspaceStore.getState().toggleFile(
        existing.id,
        existing.fileName,
        existing.filePath,
        existing.svgText,
        existing.svgLayers || [],
        parseSvgViewBox(existing.svgText).naturalWidth,
        parseSvgViewBox(existing.svgText).naturalHeight,
      )
      return
    }

    // First load: switch to SVG mode — clear 3D state
    if (useSvgWorkspaceStore.getState().files.length === 0) {
      store.reset()
    }

    // Load file first, then toggle
    try {
      const result = await window.electronAPI.readFile(file.path)
      if (!result.success || !result.data) {
        toast.error('Load failed: ' + (result.error || 'unknown error'))
        return
      }

      let svgText: string
      let layers: ReturnType<typeof parseSvgLayers>
      let naturalWidth: number
      let naturalHeight: number

      if (format === 'dxf') {
        const text = new TextDecoder().decode(result.data)
        const { convertDxfToSvg } = await import('@/lib/dxf-to-svg')
        const converted = await convertDxfToSvg(text)
        svgText = converted.svgText
        layers = converted.layers
        naturalWidth = converted.naturalWidth
        naturalHeight = converted.naturalHeight
      } else {
        const text = new TextDecoder().decode(result.data)
        svgText = text
        layers = parseSvgLayers(text)
        const vb = parseSvgViewBox(text)
        naturalWidth = vb.naturalWidth
        naturalHeight = vb.naturalHeight
      }

      const fileId = crypto.randomUUID()

      store.addLoadedFile({
        id: fileId,
        fileName: file.name,
        filePath: file.path,
        mtimeMs: file.mtimeMs,
        buffer: result.data,
        format,
        sceneTree: [],
        glbPartInfos: [],
        modelCenteringOffset: null,
        sourceUnit: 'millimeter',
        fileGroup: 'vector',
        loadingPhase: 'done',
        svgLayers: layers,
        svgText: svgText,
      })

      // Thumbnail
      generateSvgThumbnail(svgText).then(blob => {
        if (blob) putThumbnail(`${file.path}|${file.mtimeMs}`, blob)
      })

      // Toggle on
      useSvgWorkspaceStore.getState().toggleFile(fileId, file.name, file.path, svgText, layers, naturalWidth, naturalHeight)
    } catch (e) {
      console.error('[toggleFileInScene] load exception:', e)
      toast.error('Load failed: ' + String(e))
    }
    return
  }

  // 3D file: existing behavior
  const existing = store.loadedFiles.find(f => f.filePath === file.path)
  if (existing) {
    store.removeLoadedFile(existing.id)
    return
  }

  // Switch to 3D mode: clear SVG workspace
  useSvgWorkspaceStore.setState({ files: [], selectedFileId: null })

  try {
    const result = await window.electronAPI.readFile(file.path)
    if (!result.success || !result.data) {
      console.error('[toggleFileInScene] readFile failed:', result.error || 'unknown error')
      toast.error('Load failed: ' + (result.error || 'unknown error'))
      return
    }
    let buffer = result.data

    // Decompress STPZ before parsing header and converting
    const isStep = isStepFile(file.name)
    const isCadConvert = isStep || isIgesFile(file.name) || isBrepFile(file.name)
    if (isStep && file.name.toLowerCase().endsWith('.stpz')) {
      const decompressed = decompressStpz(buffer)
      if (decompressed.byteLength > MAX_STEP_FILE_SIZE) {
        toast.error('STPZ decompressed size exceeds 100MB limit')
        return
      }
      buffer = decompressed
    }

    let fileMeta: FileMeta | undefined
    if (isStep) {
      const stepHeader = parseStepHeader(buffer)
      if (stepHeader) fileMeta = { step: stepHeader }
    }

    if (isCadConvert) {
      const cadFormat = isIgesFile(file.name) ? 'iges' : isBrepFile(file.name) ? 'brep' : 'step'
      store.showProgress(`Converting ${file.name}...`)
      try {
        const { buffer: glbBuffer } = await stepToGlbCached(buffer,
          { filePath: file.path, mtimeMs: file.mtimeMs },
          { wasmPath: '/wasm/occt-import-js.wasm', cadFormat },
        )
        buffer = glbBuffer
        format = 'glb'
      } catch (e) {
        store.hideProgress()
        throw e
      }
    }

    if (!format) {
      console.error('[toggleFileInScene] unsupported format:', file.name)
      toast.error('Unsupported file format: ' + file.name)
      return
    }

    // Show progress for formats that weren't CAD-converted (CAD already has progress from above)
    if (!isCadConvert) store.showProgress(`Loading ${file.name}...`)

    // Parse once
    const loadResult = await loadFormat(buffer, format, file.path)
    const fileId = crypto.randomUUID()
    setCachedResult(fileId, loadResult)

    // Merge fileMeta from loadResult (GLB/3MF) with pre-parsed (STEP)
    if (!fileMeta) fileMeta = loadResult.fileMeta

    // Thumbnail: prefer Bambu 3MF embedded thumbnail, else render-based
    if (format === '3mf' && loadResult.bambuMetadata?.thumbnailBlob) {
      processEmbeddedThumbnail(loadResult.bambuMetadata.thumbnailBlob).then(blob => {
        if (blob) putThumbnail(`${file.path}|${file.mtimeMs}`, blob)
      })
    } else {
      const upAxis = getDefaultUpAxis(format, buffer, file.name)
      generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
        .then(blob => {
          if (blob) putThumbnail(`${file.path}|${file.mtimeMs}`, blob)
        })
    }

    store.addLoadedFile({
      id: fileId,
      fileName: file.name,
      filePath: file.path,
      mtimeMs: file.mtimeMs,
      buffer,
      format,
      sceneTree: [],
      glbPartInfos: [],
      modelCenteringOffset: null,
      sourceUnit: loadResult.sourceUnit ?? FORMAT_MAP[format].defaultUnit,
      fileGroup: FORMAT_MAP[format].group,
      loadingPhase: 'loading',
      bambuMetadata: loadResult.bambuMetadata,
      fileMeta,
    })
    store.hideProgress()
  } catch (e) {
    store.hideProgress()
    console.error('[toggleFileInScene] exception:', e)
    useModelStore.getState().hideProgress()
    toast.error('Load failed: ' + String(e))
  }
}

/** Single-click (replace): clear all loaded files and load this file as the sole model. */
export async function replaceSceneWithFile(file: { name: string; path: string; mtimeMs: number }, index: number) {
  const store = useModelStore.getState()
  store.setSelectedFileIndex(index)

  // Clear all existing 3D state and SVG workspace
  store.reset()
  useSvgWorkspaceStore.setState({ files: [], selectedFileId: null })

  // Now load and add the file — toggleFileInScene will find no existing file and add it fresh
  await toggleFileInScene(file, index)
}
