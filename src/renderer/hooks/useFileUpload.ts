import { useState, useCallback } from 'react'
import { useModelStore } from '@/stores/model-store'
import { toast } from 'sonner'
import { stepToGlbCached, startPreCache } from '@/lib/step-converter'
import { detectFormat, ALL_EXTENSIONS_NO_DOT, FORMAT_MAP, getDefaultUpAxis } from '@/config/file-formats'
import { loadFormat } from '@/engine/formatLoaders'
import { setCachedResult } from '@/engine/loaderResultCache'
import { generateThumbnailFromResult } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'

interface UseFileUploadOptions {
  projectId?: string
}

export function useFileUpload({ projectId }: UseFileUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false)

  const uploadFile = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!ext || !ALL_EXTENSIONS_NO_DOT.includes(ext)) {
        toast.error(`Unsupported file format: .${ext ?? 'unknown'}`)
        return
      }
      let format = detectFormat(file.name)

      setIsUploading(true)

      try {
        const rawBuffer = await file.arrayBuffer()
        let buffer = rawBuffer

        if (format === 'step') {
          useModelStore.getState().setIsConverting(true)
          const filePath = window.electronAPI?.getFilePath(file) ?? file.name
          const { buffer: glbBuffer } = await stepToGlbCached(rawBuffer,
            { filePath, mtimeMs: file.lastModified },
            { wasmPath: '/wasm/occt-import-js.wasm' },
          )
          useModelStore.getState().setIsConverting(false)
          buffer = glbBuffer
          format = 'glb'
        } else if (!format) {
          toast.error(`Unsupported file format: ${file.name}`)
          setIsUploading(false)
          return
        }

        const filePath = window.electronAPI?.getFilePath(file) ?? file.name

        // Parse once — feeds both canvas and thumbnail
        const loadResult = await loadFormat(buffer, format, filePath)
        const fileId = crypto.randomUUID()
        setCachedResult(fileId, loadResult)

        // Thumbnail as byproduct (fire-and-forget)
        const upAxis = getDefaultUpAxis(format, buffer)
        generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
          .then(blob => {
            if (blob) {
              const key = `${filePath}|${file.lastModified}`
              putThumbnail(key, blob)
            }
          })

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
        })

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
        useModelStore.getState().setIsConverting(false)
        console.error('[useFileUpload] upload failed:', err)
        const message = err instanceof Error ? err.message : String(err)
        toast.error(message || 'Load failed')
      } finally {
        setIsUploading(false)
      }
    },
    [projectId],
  )

  return { uploadFile, isUploading }
}
