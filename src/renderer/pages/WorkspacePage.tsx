import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModelStore } from '@/stores/model-store'
import { useEngineStore } from '@/stores/engine-store'
import { useFileUpload } from '@/hooks/useFileUpload'
import { Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import ViewportContainer from '@/components/viewport/ViewportContainer'
import SvgWorkspace from '@/components/viewport/SvgWorkspace'
import OpenFileDialog from '@/components/OpenFileDialog'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { stepToGlbCached } from '@/lib/step-converter'
import { ALL_ACCEPT, detectFormat, FORMAT_MAP, getDefaultUpAxis, isStepFile } from '@/config/file-formats'
import { loadFormat, ModelEmptyError } from '@/engine/formatLoaders'
import { setCachedResult, getCachedResult } from '@/engine/loaderResultCache'
import { generateThumbnailFromResult, generateSvgThumbnail, processEmbeddedThumbnail } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'
import { useSvgWorkspaceStore, parseSvgViewBox, parseSvgLayers } from '@/stores/svg-workspace-store'
import { convertDxfToSvg } from '@/lib/dxf-to-svg'

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

  const loadFilePath = useCallback(async (filePath: string, fileName?: string) => {
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

    // HDR / EXR: load as environment map (delegates to SceneSetup via pendingCustomLoad)
    if (format === 'hdr' || format === 'exr') {
      useEngineStore.getState().addCustomEnv(filePath, name)
      return
    }

    try {
      const fileResult = await window.electronAPI.readFile(filePath)
      if (!fileResult.success || !fileResult.data) {
        toast.error('Load failed: ' + (fileResult.error || 'unknown error'))
        return
      }
      let buffer = fileResult.data

      if (isStepFile(name)) {
        try {
          useModelStore.getState().showProgress('Converting STEP geometry...')
          const { buffer: glbBuffer } = await stepToGlbCached(buffer,
            { filePath, mtimeMs: Date.now() },
            { wasmPath: '/wasm/occt-import-js.wasm' },
          )
          buffer = glbBuffer
          format = 'glb'
        } catch (e) {
          console.error('[WorkspacePage] STEP conversion failed:', e)
          toast.error('STEP conversion failed: ' + (e instanceof Error ? e.message : String(e)))
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
          mtimeMs: Date.now(),
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
          fileId, fileName: name, svgText,
          layers, naturalWidth, naturalHeight,
        }])

        // Thumbnail
        generateSvgThumbnail(svgText).then((blob) => {
          if (blob) putThumbnail(`${filePath}|${Date.now()}`, blob)
        })

        return
      }

      // Parse once (3D formats)
      const loadResult = await loadFormat(buffer, format, filePath)
      const fileId = crypto.randomUUID()
      setCachedResult(fileId, loadResult)

      useModelStore.getState().addLoadedFile({
        id: fileId,
        fileName: name,
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
        bambuMetadata: loadResult.bambuMetadata,
        fileMeta: loadResult.fileMeta,
      })
    } catch (e) {
      useModelStore.getState().hideProgress()
      if (e instanceof ModelEmptyError) {
        toast.error(t('error.modelEmpty', { fileName: e.fileName }))
      } else {
        toast.error('Load failed: ' + String(e))
      }
    }
  }, [])

  const handleNativeOpenFile = useCallback(async () => {
    if (!window.electronAPI) {
      fileInputRef.current?.click()
      return
    }
    const result = await window.electronAPI.openFileDialog()
    if (!result.success || !result.filePaths?.length) return

    // Classify selected files
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

    // Mixed: 3D wins, SVG & env map files skipped
    if (d3Paths.length > 0) {
      if (svgPaths.length > 0 || envPaths.length > 0) {
        console.log(
          '[handleNativeOpenFile] Mixed selection. Loading only 3D files. Skipped:',
          [...svgPaths, ...envPaths].map((p) => p.split(/[/\\]/).pop()),
        )
      }
      // Clear all currently loaded content before loading new files
      useModelStore.getState().reset()
      for (const filePath of d3Paths) {
        const fileName = filePath.split(/[/\\]/).pop() || filePath
        await loadFilePath(filePath, fileName)
      }
      return
    }

    // SVG-only selection
    if (svgPaths.length > 0) {
      useModelStore.getState().reset()
      for (const filePath of svgPaths) {
        const fileName = filePath.split(/[/\\]/).pop() || filePath
        await loadFilePath(filePath, fileName)
      }
      return
    }

    // Env map only: load each as custom environment
    if (envPaths.length > 0) {
      for (const filePath of envPaths) {
        const fileName = filePath.split(/[/\\]/).pop() || filePath
        useEngineStore.getState().addCustomEnv(filePath, fileName)
      }
      return
    }
  }, [])

  // Deferred thumbnail generation + directory listing after model rendering completes.
  const postProcessedRef = useRef(new Set<string>())
  useEffect(() => {
    for (const file of loadedFiles) {
      if (file.loadingPhase === 'done' && !postProcessedRef.current.has(file.id)) {
        postProcessedRef.current.add(file.id)

        // SVG/DXF thumbnails are generated inline during load — skip here
        if (file.format !== 'svg' && file.format !== 'dxf') {
          // Bambu 3MF: use embedded standard thumbnail if available
          if (file.format === '3mf' && file.bambuMetadata?.thumbnailBlob) {
            processEmbeddedThumbnail(file.bambuMetadata.thumbnailBlob).then(blob => {
              if (blob) putThumbnail(`${file.filePath}|${file.mtimeMs}`, blob)
            })
          } else {
            const loadResult = getCachedResult(file.id)
            if (loadResult) {
              const upAxis = getDefaultUpAxis(file.format, file.buffer, file.fileName)
              generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
                .then(blob => {
                  if (blob) putThumbnail(`${file.filePath}|${Date.now()}`, blob)
                })
            }
          }
        }

        // Directory listing (deferred from loadFilePath)
        if (window.electronAPI) {
          const dirPath = file.filePath.slice(0, Math.max(file.filePath.lastIndexOf('/'), file.filePath.lastIndexOf('\\')))
          window.electronAPI.readDirectory(dirPath).then((dirResult) => {
            if (dirResult.success && dirResult.files) {
              useModelStore.getState().setFolderFiles(dirPath, dirResult.files)
            }
          })
        }
      }
    }
  }, [loadedFiles])

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

  const processFileLocally = useCallback(async (file: File) => {
    const format = detectFormat(file.name)
    if (!format) {
      console.error('[WorkspacePage] unsupported format:', file.name)
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

    const rawBuffer = await file.arrayBuffer()

    if (isStepFile(file.name)) {
      try {
        useModelStore.getState().showProgress('Converting STEP geometry...')
        const filePath = window.electronAPI?.getFilePath(file) ?? file.name
        const { buffer: glbBuffer } = await stepToGlbCached(rawBuffer,
          { filePath, mtimeMs: file.lastModified },
          { wasmPath: '/wasm/occt-import-js.wasm' },
        )
        useModelStore.getState().setModelBuffer(glbBuffer, 'glb')
      } catch (e) {
        console.error('[WorkspacePage] STEP conversion failed:', e)
        toast.error('STEP conversion failed: ' + (e instanceof Error ? e.message : String(e)))
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

      generateSvgThumbnail(svgText).then((blob) => {
        if (blob) putThumbnail(`${filePath}|${file.lastModified}`, blob)
      })
      return
    } else {
      useModelStore.getState().setModelBuffer(rawBuffer, format)
      const filePath = window.electronAPI?.getFilePath(file) ?? null
      useModelStore.getState().setModelFilePath(filePath)
    }
    useModelStore.getState().setGLBUrl(file.name)
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (skipUpload) {
      processFileLocally(file)
    } else {
      uploadFile(file)
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
