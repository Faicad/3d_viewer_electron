import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useModelStore } from '@/stores/model-store'
import { toast } from 'sonner'
import { stepToGlbCached, startPreCache } from '@/lib/step-converter'
import { detectFormat, FORMAT_MAP, getDefaultUpAxis, isStepFile } from '@/config/file-formats'
import { loadFormat, ModelEmptyError, parseStepHeader } from '@/engine/formatLoaders'
import { setCachedResult } from '@/engine/loaderResultCache'
import { generateThumbnailFromResult, generateSvgThumbnail, processEmbeddedThumbnail } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'
import { useSvgWorkspaceStore, parseSvgViewBox, parseSvgLayers } from '@/stores/svg-workspace-store'
import { convertDxfToSvg } from '@/lib/dxf-to-svg'
import { yieldToUI, resetYieldTimer } from '@/lib/async-utils'
import type { FileMeta } from '@/lib/file-meta'

interface UseFileUploadOptions {
  projectId?: string
}

export function useFileUpload({ projectId }: UseFileUploadOptions = {}) {
  const { t } = useTranslation()
  const [isUploading, setIsUploading] = useState(false)

  const uploadFile = useCallback(
    async (file: File) => {
      let format = detectFormat(file.name)
      if (!format) {
        toast.error(`Unsupported file format: ${file.name}`)
        return
      }

      setIsUploading(true)

      try {
        const rawBuffer = await file.arrayBuffer()
        let buffer = rawBuffer

        if (format === 'svg' || format === 'dxf') {
          useModelStore.getState().reset()

          // Decode text (both SVG and DXF are text-based)
          const text = new TextDecoder().decode(rawBuffer)

          // DXF: convert to SVG first; SVG: use text directly
          let svgText: string
          let layers: ReturnType<typeof parseSvgLayers>
          let naturalWidth: number
          let naturalHeight: number

          if (format === 'dxf') {
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

          const filePath = window.electronAPI?.getFilePath(file) ?? file.name
          const fileId = crypto.randomUUID()

          useModelStore.getState().addLoadedFile({
            id: fileId,
            fileName: file.name,
            filePath,
            mtimeMs: file.lastModified,
            buffer: rawBuffer,
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

          useSvgWorkspaceStore.getState().addFilesBatch([{
            fileId, fileName: file.name, svgText,
            layers, naturalWidth, naturalHeight,
          }])

          generateSvgThumbnail(svgText).then(blob => {
            if (blob) putThumbnail(`${filePath}|${file.lastModified}`, blob)
          })

          setIsUploading(false)
          return
        }

        // 3D file: clear SVG workspace when switching modes
        useSvgWorkspaceStore.setState({ files: [], selectedFileId: null })

        // Parse STEP header metadata from raw buffer before conversion
        let fileMeta: FileMeta | undefined
        const isStep = isStepFile(file.name)
        if (isStep) {
          const stepHeader = parseStepHeader(rawBuffer)
          if (stepHeader) fileMeta = { step: stepHeader }
        }

        if (isStep) {
          const { showProgress, updateProgress } = useModelStore.getState()
          showProgress('Reading STEP file...', 0)
          resetYieldTimer()

          const filePath = window.electronAPI?.getFilePath(file) ?? file.name

          const { buffer: glbBuffer } = await stepToGlbCached(rawBuffer,
            { filePath, mtimeMs: file.lastModified },
            { wasmPath: '/wasm/occt-import-js.wasm' },
          )
          updateProgress('Building 3D scene...', 85)
          await yieldToUI(true)

          buffer = glbBuffer
          format = 'glb'
        } else if (!format) {
          toast.error(`Unsupported file format: ${file.name}`)
          setIsUploading(false)
          return
        }

        const filePath = window.electronAPI?.getFilePath(file) ?? file.name

        // Show progress for non-STEP formats (STEP already has progress from above)
        if (format !== 'glb' || buffer === rawBuffer) {
          const formatLabel = FORMAT_MAP[format]?.label ?? format.toUpperCase()
          useModelStore.getState().showProgress(`Loading ${formatLabel}...`)
        }

        // Parse once — feeds both canvas and thumbnail
        const loadResult = await loadFormat(buffer, format, filePath)
        const fileId = crypto.randomUUID()

        setCachedResult(fileId, loadResult)

        // Merge fileMeta from loadResult (GLB/3MF) with pre-parsed (STEP)
        if (!fileMeta) fileMeta = loadResult.fileMeta

        // Add to store
        useModelStore.getState().addLoadedFile({
          id: fileId,
          fileName: file.name,
          filePath,
          mtimeMs: file.lastModified,
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

        // Done loading — hide progress overlay
        useModelStore.getState().hideProgress()

        // Thumbnail — defer to next macrotask so WebGL renderer creation (28s in
        // software GPU) doesn't block React's processing of the loadingPhase update.
        setTimeout(() => {
          if (format === '3mf' && loadResult.bambuMetadata?.thumbnailBlob) {
            processEmbeddedThumbnail(loadResult.bambuMetadata.thumbnailBlob).then(blob => {
              if (blob) putThumbnail(`${filePath}|${file.lastModified}`, blob)
            })
          } else {
            const upAxis = getDefaultUpAxis(format, buffer, file.name)
            generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
              .then(blob => {
                if (blob) putThumbnail(`${filePath}|${file.lastModified}`, blob)
              })
          }
        }, 0)

        // Scan folder for other model files if in Electron environment
        if (window.electronAPI) {
          try {
            const nativePath = window.electronAPI.getFilePath(file)
            if (nativePath) {
              const lastSep = Math.max(nativePath.lastIndexOf('/'), nativePath.lastIndexOf('\\'))
              const folderPath = lastSep > 0 ? nativePath.slice(0, lastSep) : null
              if (folderPath) {
                const result = await window.electronAPI.readDirectory(folderPath)
                if (result.success && result.files) {
                  useModelStore.getState().setFolderFiles(folderPath, result.files)
                  const idx = result.files.findIndex(f => f.name === file.name)
                  if (idx !== -1) {
                    useModelStore.getState().setSelectedFileIndex(idx)
                  }
                  // Schedule background pre-caching for uncached STEP files
                  setTimeout(() => {
                    startPreCache(result.files, '/wasm/occt-import-js.wasm')
                  }, 1000)
                }
              }
            }
          } catch (e) {
            console.warn('[useFileUpload] Failed to read directory:', e)
          }
        }
      } catch (err) {
        useModelStore.getState().hideProgress()
        console.error('[useFileUpload] upload failed:', err)
        if (err instanceof ModelEmptyError) {
          toast.error(t('error.modelEmpty', { fileName: err.fileName }))
        } else {
          const message = err instanceof Error ? err.message : String(err)
          toast.error(message || 'Load failed')
        }
      } finally {
        setIsUploading(false)
      }
    },
    [projectId],
  )

  return { uploadFile, isUploading }
}
