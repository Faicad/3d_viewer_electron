import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModelStore } from '@/stores/model-store'
import { useEngineStore } from '@/stores/engine-store'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useFileLoader } from '@/hooks/useFileLoader'
import { Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import ViewportContainer from '@/components/viewport/ViewportContainer'
import SvgWorkspace from '@/components/viewport/SvgWorkspace'
import OpenFileDialog from '@/components/OpenFileDialog'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { stepToGlbCached, decompressStpz } from '@/lib/step-converter'
import { fcstdToGlbCached } from '@/lib/fcstd-converter'
import { ALL_ACCEPT, detectFormat, FORMAT_MAP, getDefaultUpAxis, isStepFile, isIgesFile, isBrepFile, isFcstdFile, MAX_STEP_FILE_SIZE } from '@/config/file-formats'
import { generateSvgThumbnail, generateThumbnailFromResult } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { cacheKey, putThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'
import { loadFormat } from '@/engine/formatLoaders'
import { useSvgWorkspaceStore, parseSvgViewBox, parseSvgLayers } from '@/stores/svg-workspace-store'

interface WorkspacePageProps {
  projectId?: string
}

export default function WorkspacePage({ projectId }: WorkspacePageProps) {
  const { t } = useTranslation()
  const glbUrl = useModelStore((s) => s.glbUrl)
  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const loadingVisible = useModelStore((s) => s.loadingState.isVisible)
  const hasAnyModel = glbUrl !== null || loadedFiles.length > 0
  const { uploadFile } = useFileUpload({ projectId })
  const [searchParams] = useSearchParams()
  const skipUpload = searchParams.get('skip_upload') === '1' && import.meta.env.DEV
  const [dialogOpen, setDialogOpen] = useState(false)
  const [showDropOverlay, setShowDropOverlay] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // SVG mode: true if any loaded file is SVG
  const svgFileCount = useSvgWorkspaceStore((s) => s.files.length)
  const isSvgMode = svgFileCount > 0

  const { loadFilePath, loadFilesFromDialog } = useFileLoader()

  const handleNativeOpenFile = useCallback(async () => {
    if (!window.electronAPI) {
      fileInputRef.current?.click()
      return
    }
    await loadFilesFromDialog()
  }, [loadFilesFromDialog])

  // Listen for files opened via OS file association (double-click in Explorer, etc.)
  useEffect(() => {
    if (!window.electronAPI) return

    // Check for pending file path from command-line launch (Windows)
    window.electronAPI.getPendingFilePath().then((filePath) => {
      if (filePath) {
        loadFilePath(filePath)
      }
    })

    // Listen for files opened while app is already running
    const unsubscribe = window.electronAPI.onOpenExternalFile((filePath) => {
      loadFilePath(filePath)
    })

    return unsubscribe
  }, [loadFilePath])

  const processFileLocally = useCallback(async (file: File, opts?: { skipReset?: boolean }) => {
    const { skipReset = false } = opts ?? {}
    const format = detectFormat(file.name)
    if (!format) {
      console.error('[WorkspacePage] unsupported format:', file.name)
      return
    }

    // Clear existing scene on first file load (skipReset=false for subsequent batch files)
    if (!skipReset) {
      useModelStore.getState().reset()
      useSvgWorkspaceStore.setState({ files: [], selectedFileId: null })
    }

    if ((isStepFile(file.name) || isIgesFile(file.name) || isBrepFile(file.name) || isFcstdFile(file.name)) && file.size > MAX_STEP_FILE_SIZE) {
      toast.error('不支持超过100MB的STEP/IGES/BREP/FCStd文件')
      return
    }

    // HDR / EXR: load as environment map via native file path
    if (format === 'hdr' || format === 'exr') {
      const filePath = window.electronAPI?.getFilePath(file) ?? null
      if (filePath) {
        useEngineStore.getState().addCustomEnv(filePath, file.name)
      }
      return
    }

    // Show progress immediately, before file read
    if (format !== 'svg' && format !== 'dxf') {
      useModelStore.getState().showProgress(`Loading ${file.name}...`)
    }

    const rawBuffer = await file.arrayBuffer()

    if (isStepFile(file.name) || isIgesFile(file.name) || isBrepFile(file.name)) {
      try {
        // Decompress STPZ before conversion (STEP only)
        let stepBuffer = rawBuffer
        if (isStepFile(file.name) && file.name.toLowerCase().endsWith('.stpz')) {
          stepBuffer = decompressStpz(rawBuffer)
          if (stepBuffer.byteLength > MAX_STEP_FILE_SIZE) {
            toast.error('STPZ decompressed size exceeds 100MB limit')
            return
          }
        }
        const cadFormat = isIgesFile(file.name) ? 'iges' : isBrepFile(file.name) ? 'brep' : 'step'
        useModelStore.getState().showProgress(`Converting ${file.name}...`)
        const filePath = window.electronAPI?.getFilePath(file) ?? file.name
        const { buffer: glbBuffer } = await stepToGlbCached(stepBuffer,
          { filePath, mtimeMs: file.lastModified },
          { wasmPath: '/wasm/occt-import-js.wasm', cadFormat },
        )
        const fileId = crypto.randomUUID()
        useModelStore.getState().addLoadedFile({
          id: fileId,
          fileName: file.name,
          filePath,
          mtimeMs: file.lastModified,
          buffer: glbBuffer,
          format: 'glb',
          sceneTree: [],
          glbPartInfos: [],
          modelCenteringOffset: null,
          sourceUnit: 'meter',
          fileGroup: FORMAT_MAP.glb.group,
          loadingPhase: 'loading',
        })
      } catch (e) {
        console.error('[WorkspacePage] CAD conversion failed:', e)
        toast.error('CAD conversion failed: ' + (e instanceof Error ? e.message : String(e)))
        return
      } finally {
        useModelStore.getState().hideProgress()
      }
    } else if (isFcstdFile(file.name)) {
      try {
        useModelStore.getState().showProgress(`Converting ${file.name}...`)
        const filePath = window.electronAPI?.getFilePath(file) ?? file.name
        const { buffer: glbBuffer } = await fcstdToGlbCached(rawBuffer,
          { filePath, mtimeMs: file.lastModified },
        )

        // Parse GLB and generate thumbnail
        const loadResult = await loadFormat(glbBuffer, 'glb', filePath)
        const fileId = crypto.randomUUID()

        const upAxis = getDefaultUpAxis('glb', glbBuffer, file.name)
        generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
          .then(blob => {
            if (blob) putThumbnail(cacheKey(filePath, file.lastModified), blob)
          })

        useModelStore.getState().addLoadedFile({
          id: fileId,
          fileName: file.name,
          filePath,
          mtimeMs: file.lastModified,
          buffer: glbBuffer,
          format: 'glb',
          sceneTree: [],
          glbPartInfos: [],
          modelCenteringOffset: null,
          sourceUnit: loadResult.sourceUnit ?? 'meter',
          fileGroup: FORMAT_MAP.glb.group,
          loadingPhase: 'loading',
        })
      } catch (e) {
        console.error('[WorkspacePage] FCStd conversion failed:', e)
        toast.error('FCStd conversion failed: ' + (e instanceof Error ? e.message : String(e)))
        return
      } finally {
        useModelStore.getState().hideProgress()
      }
    } else if (format === 'svg' || format === 'dxf') {
      // SVG/DXF: decode text, convert DXF to SVG if needed, add to workspace
      const text = new TextDecoder().decode(rawBuffer)

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
        fileId, fileName: file.name, filePath, svgText,
        layers, naturalWidth, naturalHeight,
      }])

      generateSvgThumbnail(svgText).then((blob) => {
        if (blob) putThumbnail(`${filePath}|${file.lastModified}`, blob)
      })
      return
    } else {
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
        sourceUnit: FORMAT_MAP[format].defaultUnit,
        fileGroup: FORMAT_MAP[format].group,
        loadingPhase: 'loading',
      })
      useModelStore.getState().hideProgress()
    }
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (skipUpload) {
      processFileLocally(file)
    } else {
      uploadFile(file, { isDragDrop: true })
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (skipUpload) {
      processFileLocally(file)
    } else {
      uploadFile(file)
    }
  }

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      const file = e.clipboardData?.files?.[0]
      if (!file) return
      e.preventDefault()
      if (skipUpload) {
        processFileLocally(file)
      } else {
        uploadFile(file)
      }
    },
    [skipUpload, processFileLocally, uploadFile],
  )

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  return (
    <div className="relative flex-1" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      {isSvgMode ? (
        <SvgWorkspace />
      ) : (
        <ViewportContainer />
      )}

      {!hasAnyModel && !isSvgMode && showDropOverlay && !loadingVisible && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="relative flex flex-col items-center gap-4 p-12 border-2 border-dashed border-muted-foreground/30 rounded-xl cursor-pointer hover:border-primary/50 transition-colors text-muted-foreground pointer-events-auto bg-background/70 backdrop-blur-sm"
            onClick={handleNativeOpenFile}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNativeOpenFile() }}
          >
            <button
              className="absolute top-2 right-2 p-1 rounded hover:bg-muted transition-colors"
              onClick={(e) => { e.stopPropagation(); setShowDropOverlay(false) }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <Upload className="h-12 w-12" />
            <p className="text-lg font-medium">{t('chat.uploadFormats')}</p>
            <p className="text-sm">{t('chat.uploadHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALL_ACCEPT}
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      )}

      <OpenFileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onFileSelected={(file) => {
          if (skipUpload) {
            processFileLocally(file)
          } else {
            uploadFile(file)
          }
          setDialogOpen(false)
        }}
      />

      {/* Loading progress card — controlled by store.loadingState */}
      <LoadingOverlay />
    </div>
  )
}
