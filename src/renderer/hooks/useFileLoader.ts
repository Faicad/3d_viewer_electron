import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useModelStore } from '@/stores/model-store'
import { useEngineStore } from '@/stores/engine-store'
import { useUIStore } from '@/stores/ui-store'
import { toast } from 'sonner'
import { stepToGlbCached, startPreCache, decompressStpz } from '@/lib/step-converter'
import { detectFormat, FORMAT_MAP, getDefaultUpAxis, isStepFile, isIgesFile, isBrepFile, MAX_STEP_FILE_SIZE } from '@/config/file-formats'
import { loadFormat, ModelEmptyError, parseStepHeader } from '@/engine/formatLoaders'
import { setCachedResult } from '@/engine/loaderResultCache'
import {
  generateThumbnailFromResult,
  generateSvgThumbnail,
  processEmbeddedThumbnail,
} from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail, cacheKey } from '@/lib/thumbnail-cache/thumbnailCache'
import { useSvgWorkspaceStore, parseSvgViewBox, parseSvgLayers } from '@/stores/svg-workspace-store'
import type { FileMeta } from '@/lib/file-meta'

interface LoadFilePathOptions {
  fileName?: string
  /** When true, skip readDirectory + setFolderFiles + setSelectedFileIndex + startPreCache.
   *  Used by loadFilesFromDialog which does a single batch folder update at the end. */
  skipFolderUpdate?: boolean
}

export function useFileLoader() {
  const { t } = useTranslation()

  /** Read directory + update file list + select file + pre-cache STEP files. */
  async function updateFolderForFile(filePath: string, fileName: string) {
    if (!window.electronAPI) return
    const dirPath = filePath.slice(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')))
    try {
      const dirResult = await window.electronAPI.readDirectory(dirPath)
      if (dirResult.success && dirResult.files) {
        const store = useModelStore.getState()
        store.setFolderFiles(dirPath, dirResult.files)
        const idx = dirResult.files.findIndex(f => f.name === fileName)
        if (idx !== -1) {
          store.setSelectedFileIndex(idx)
        }
        // Background pre-cache STEP files when preview is enabled
        if (useUIStore.getState().enablePreview) {
          setTimeout(() => {
            startPreCache(dirResult.files!, '/wasm/occt-import-js.wasm')
          }, 110)
        }
      }
    } catch (e) {
      console.warn('[useFileLoader] Failed to read directory:', e)
    }
  }

  const loadFilePath = useCallback(async (filePath: string, opts: LoadFilePathOptions = {}) => {
    const { fileName, skipFolderUpdate = false } = opts
    if (!window.electronAPI) return

    const name = fileName || filePath.split(/[/\\]/).pop() || filePath

    let format = detectFormat(name)
    if (!format) {
      toast.error('Unsupported file format: ' + name)
      return
    }

    // Skip if already loaded
    if (useModelStore.getState().isFileLoaded(filePath)) {
      return
    }

    // HDR / EXR: load as environment map
    if (format === 'hdr' || format === 'exr') {
      useEngineStore.getState().addCustomEnv(filePath, name)
      return
    }

    const mtimeMs = Date.now()

    try {
      if (format !== 'svg' && format !== 'dxf') {
        useModelStore.getState().showProgress(`Loading ${name}...`)
      }

      const fileResult = await window.electronAPI.readFile(filePath)
      if (!fileResult.success || !fileResult.data) {
        toast.error(`Failed to read: ${name}`)
        return
      }
      let buffer = fileResult.data

      if ((isStepFile(name) || isIgesFile(name) || isBrepFile(name)) && buffer.byteLength > MAX_STEP_FILE_SIZE) {
        toast.error('不支持超过100MB的STEP/STP/IGES/BREP文件')
        return
      }

      // Decompress STPZ before parsing header and converting
      if (isStepFile(name) && name.toLowerCase().endsWith('.stpz')) {
        const decompressed = decompressStpz(buffer)
        if (decompressed.byteLength > MAX_STEP_FILE_SIZE) {
          toast.error('STPZ decompressed size exceeds 100MB limit')
          return
        }
        buffer = decompressed
      }

      // Parse STEP header metadata before conversion
      let fileMeta: FileMeta | undefined
      if (isStepFile(name)) {
        const stepHeader = parseStepHeader(buffer)
        if (stepHeader) fileMeta = { step: stepHeader }
      }

      const isCadConvert = isStepFile(name) || isIgesFile(name) || isBrepFile(name)
      if (isCadConvert) {
        const cadFormat = isIgesFile(name) ? 'iges' : isBrepFile(name) ? 'brep' : 'step'
        try {
          useModelStore.getState().showProgress(`Converting ${name}...`)
          const { buffer: glbBuffer } = await stepToGlbCached(buffer,
            { filePath, mtimeMs },
            { wasmPath: '/wasm/occt-import-js.wasm', cadFormat },
          )
          buffer = glbBuffer
          format = 'glb'
        } catch (e) {
          console.error('[useFileLoader] CAD conversion failed:', e)
          toast.error('CAD conversion failed: ' + (e instanceof Error ? e.message : String(e)))
          return
        } finally {
          useModelStore.getState().hideProgress()
        }
      }

      if (format === 'svg' || format === 'dxf') {
        // SVG / DXF: decode text + convert to SVG, then add to workspace
        const text = new TextDecoder().decode(buffer)

        let svgText: string
        let layers: ReturnType<typeof parseSvgLayers>
        let naturalWidth: number
        let naturalHeight: number

        if (format === 'dxf') {
          const { convertDxfToSvg } = await import('@/lib/dxf-to-svg')
          const result = await convertDxfToSvg(text)
          svgText = result.svgText
          layers = result.layers
          naturalWidth = result.naturalWidth
          naturalHeight = result.naturalHeight
        } else {
          svgText = text
          layers = parseSvgLayers(text)
          const vb = parseSvgViewBox(text)
          naturalWidth = vb.naturalWidth
          naturalHeight = vb.naturalHeight
        }

        const fileId = crypto.randomUUID()

        useModelStore.getState().addLoadedFile({
          id: fileId,
          fileName: name,
          filePath,
          mtimeMs,
          buffer,
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

        // Add batch: file dialog opens multiple → grid layout
        useSvgWorkspaceStore.getState().addFilesBatch([{
          fileId, fileName: name, filePath, svgText,
          layers, naturalWidth, naturalHeight,
        }])

        // Thumbnail inline
        generateSvgThumbnail(svgText).then((blob) => {
          if (blob) putThumbnail(cacheKey(filePath, mtimeMs), blob)
        })

        if (!skipFolderUpdate) {
          updateFolderForFile(filePath, name)
        }

        return
      }

      // Parse once — feeds both canvas and thumbnail
      const loadResult = await loadFormat(buffer, format, filePath)
      const fileId = crypto.randomUUID()
      setCachedResult(fileId, loadResult)

      // Thumbnail inline (fire-and-forget)
      if (format === '3mf' && loadResult.bambuMetadata?.thumbnailBlob) {
        processEmbeddedThumbnail(loadResult.bambuMetadata.thumbnailBlob).then(blob => {
          if (blob) putThumbnail(cacheKey(filePath, mtimeMs), blob)
        })
      } else {
        const upAxis = getDefaultUpAxis(format, buffer, name)
        generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
          .then(blob => {
            if (blob) putThumbnail(cacheKey(filePath, mtimeMs), blob)
          })
      }

      // Merge fileMeta from loadResult (GLB/3MF) with pre-parsed (STEP)
      if (!fileMeta) fileMeta = loadResult.fileMeta

      useModelStore.getState().addLoadedFile({
        id: fileId,
        fileName: name,
        filePath,
        mtimeMs,
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

      // Folder update after single-file load (OS file association, etc.)
      if (!skipFolderUpdate) {
        updateFolderForFile(filePath, name)
      }
    } catch (e) {
      useModelStore.getState().hideProgress()
      if (e instanceof ModelEmptyError) {
        toast.error(t('error.modelEmpty', { fileName: e.fileName }))
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        toast.error(msg || `Load failed: ${name}`)
      }
    } finally {
      useModelStore.getState().hideProgress()
    }
  }, [t])

  const loadFilesFromDialog = useCallback(async () => {
    if (!window.electronAPI) return

    const result = await window.electronAPI.openFileDialog()
    if (!result.success || !result.filePaths?.length) return

    // Classify selected files by type
    const svgPaths: string[] = []
    const d3Paths: string[] = []
    const envPaths: string[] = []
    for (const p of result.filePaths) {
      const name = p.split(/[/\\]/).pop() || p
      const fmt = detectFormat(name)
      if (fmt === 'svg' || fmt === 'dxf') {
        svgPaths.push(p)
      } else if (fmt === 'hdr' || fmt === 'exr') {
        envPaths.push(p)
      } else {
        d3Paths.push(p)
      }
    }

    // Mixed: 3D wins, SVG & env map skipped
    if (d3Paths.length > 0) {
      if (svgPaths.length > 0 || envPaths.length > 0) {
        console.log(
          '[loadFilesFromDialog] Mixed selection. Loading only 3D files. Skipped:',
          [...svgPaths, ...envPaths].map((p) => p.split(/[/\\]/).pop()),
        )
      }
      useModelStore.getState().reset()
      useSvgWorkspaceStore.setState({ files: [], selectedFileId: null })

      let firstDirPath: string | null = null
      let firstName: string | null = null
      for (const filePath of d3Paths) {
        const fn = filePath.split(/[/\\]/).pop() || filePath
        firstDirPath ??= filePath.slice(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')))
        firstName ??= fn
        await loadFilePath(filePath, { fileName: fn, skipFolderUpdate: true })
      }
      // Batch folder update after all files loaded
      if (firstDirPath && firstName) {
        await updateFolderForFile(firstDirPath + '/' + firstName, firstName)
      }
      return
    }

    // SVG-only selection
    if (svgPaths.length > 0) {
      useModelStore.getState().reset()
      let firstDirPath: string | null = null
      let firstName: string | null = null
      for (const filePath of svgPaths) {
        const fn = filePath.split(/[/\\]/).pop() || filePath
        firstDirPath ??= filePath.slice(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')))
        firstName ??= fn
        await loadFilePath(filePath, { fileName: fn, skipFolderUpdate: true })
      }
      if (firstDirPath && firstName) {
        await updateFolderForFile(firstDirPath + '/' + firstName, firstName)
      }
      return
    }

    // Env map only: load each as custom environment
    if (envPaths.length > 0) {
      for (const filePath of envPaths) {
        const fn = filePath.split(/[/\\]/).pop() || filePath
        useEngineStore.getState().addCustomEnv(filePath, fn)
      }
      return
    }
  }, [loadFilePath])

  return { loadFilePath, loadFilesFromDialog }
}
