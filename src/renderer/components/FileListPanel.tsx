import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useModelStore, type FileSortMode } from '@/stores/model-store'
import { useUIStore } from '@/stores/ui-store'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { stepToGlbCached, startPreCache } from '@/lib/step-converter'
import { EXT_COLORS, detectFormat, FORMAT_MAP, getDefaultUpAxis, isStepFile } from '@/config/file-formats'
import { loadFormat, parseStepHeader } from '@/engine/formatLoaders'
import type { FileMeta } from '@/lib/file-meta'
import { setCachedResult } from '@/engine/loaderResultCache'
import { generateThumbnailFromResult, generateSvgThumbnail, processEmbeddedThumbnail } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'
import { useSvgWorkspaceStore, parseSvgViewBox, parseSvgLayers } from '@/stores/svg-workspace-store'
import { Button } from '@/components/ui/button'
import { List, ArrowUpAZ, ArrowDownZA, AlertCircle, Eye, EyeOff, Loader2, Maximize2, Minimize2, Folder } from 'lucide-react'
import {
  startThumbnailQueue,
  stopThumbnailQueue,
  updateVisibleFiles,
  setPriorityPaths,
  type QueueFile,
} from '@/lib/thumbnail-cache/thumbnailQueue'

function getExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

interface ThumbState {
  urls: Map<string, string>
  failed: Set<string>
}

export default function FileListPanel() {
  const { t } = useTranslation()
  const {
    currentFolderPath,
    folderFiles,
    selectedFileIndex,
    fileSortMode,
    sortOrder,
    setSelectedFileIndex,
    setFileSortMode,
    setSortOrder,
    loadedFiles,
  } = useModelStore()
  const enablePreview = useUIStore((s) => s.enablePreview)
  const setEnablePreview = useUIStore((s) => s.setEnablePreview)

  const loadedFilePaths = useMemo(
    () => new Set(loadedFiles.map(f => f.filePath)),
    [loadedFiles],
  )

  // Sync priority paths to thumbnail queue
  useEffect(() => {
    setPriorityPaths(loadedFilePaths)
  }, [loadedFilePaths])
  const listRef = useRef<HTMLDivElement>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [thumbState, setThumbState] = useState<ThumbState>({ urls: new Map(), failed: new Set() })
  const observerRef = useRef<IntersectionObserver | null>(null)
  const visiblePathsRef = useRef<Set<string>>(new Set())
  const prevFilesKeyRef = useRef<string>('')

  // Scroll selected item into view
  useEffect(() => {
    if (selectedFileIndex < 0 || !listRef.current) return
    const item = listRef.current.querySelector(`[data-index="${selectedFileIndex}"]`) as HTMLElement
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedFileIndex])

  // Auto pre-cache uncached STEP files in background after file list populates
  useEffect(() => {
    if (!enablePreview || folderFiles.length === 0) return
    const timer = setTimeout(() => {
      startPreCache(folderFiles, '/wasm/occt-import-js.wasm')
    }, 1000)
    return () => clearTimeout(timer)
  }, [enablePreview, folderFiles])

  const [processingPath, setProcessingPath] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  // ESC / Enter to exit fullscreen thumbnail grid
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault()
        setFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  // Thumbnail queue lifecycle
  const handleThumbReady = useCallback((filePath: string, objectURL: string) => {
    setProcessingPath(null)
    // Empty URL means thumbnail generation failed — mark as failed
    if (!objectURL) {
      setThumbState((prev) => {
        const failed = new Set(prev.failed)
        failed.add(filePath)
        return { ...prev, failed }
      })
      return
    }
    setThumbState((prev) => {
      const urls = new Map(prev.urls)
      const old = urls.get(filePath)
      if (old) URL.revokeObjectURL(old)
      urls.set(filePath, objectURL)
      const failed = new Set(prev.failed)
      failed.delete(filePath)
      return { urls, failed }
    })
  }, [])

  const handleThumbProgress = useCallback((filePath: string) => {
    setProcessingPath(filePath)
  }, [setProcessingPath])

  const handleFolderClick = useCallback(async () => {
    const result = await window.electronAPI.openDirectoryDialog()
    if (!result.success || !result.filePath) return

    const dirResult = await window.electronAPI.readDirectory(result.filePath)
    if (dirResult.success && dirResult.files) {
      useModelStore.getState().setFolderFiles(result.filePath, dirResult.files)
    } else if (dirResult.error) {
      toast.error(t('fileList.folderReadError', { error: dirResult.error }))
    }
  }, [])

  useEffect(() => {
    if (!enablePreview || folderFiles.length === 0) {
      stopThumbnailQueue()
      return
    }

    // Build a stable key from file paths + mtimes so we can detect
    // whether the list has *actually* changed.  If not, skip the
    // destructive reset — this is the primary fix for the "thumbnails
    // keep flashing / refreshing" problem when setFolderFiles is
    // called with the same data (e.g. after a model finishes loading).
    const newKey = folderFiles
      .map((f) => `${f.path}|${Math.trunc(f.mtimeMs)}`)
      .sort()
      .join('\n')
    if (newKey === prevFilesKeyRef.current && newKey !== '') {
      return
    }
    prevFilesKeyRef.current = newKey

    const files: QueueFile[] = folderFiles.map((f) => ({
      name: f.name,
      path: f.path,
      mtimeMs: f.mtimeMs,
    }))

    // Only revoke blob URLs for files that are *no longer* in the
    // folder.  Existing thumbnails stay visible while the queue
    // catches up on any new additions.
    const newPaths = new Set(folderFiles.map((f) => f.path))
    setThumbState((prev) => {
      const urls = new Map(prev.urls)
      let removed = false
      for (const [path, url] of urls) {
        if (!newPaths.has(path)) {
          URL.revokeObjectURL(url)
          urls.delete(path)
          removed = true
        }
      }
      if (!removed && urls.size === prev.urls.size) {
        return prev // avoid unnecessary re-render
      }
      return { urls, failed: new Set() }
    })

    startThumbnailQueue(files, handleThumbReady, handleThumbProgress)

    return () => {
      stopThumbnailQueue()
    }
  }, [enablePreview, folderFiles, handleThumbReady])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      setThumbState((prev) => {
        prev.urls.forEach((url) => URL.revokeObjectURL(url))
        return prev
      })
    }
  }, [])

  // IntersectionObserver for thumbnail priority
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enablePreview) return

    observerRef.current?.disconnect()
    const visiblePaths = visiblePathsRef.current
    visiblePaths.clear()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const path = entry.target.getAttribute('data-path')
          if (!path) continue
          if (entry.isIntersecting) {
            visiblePaths.add(path)
          } else {
            visiblePaths.delete(path)
          }
        }
        updateVisibleFiles(visiblePaths)
      },
      { root: gridRef.current, rootMargin: '100px' },
    )

    observerRef.current = observer
    const cards = gridRef.current?.querySelectorAll('[data-path]')
    cards?.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [enablePreview, folderFiles])

  // Re-observe cards after DOM updates
  useEffect(() => {
    if (!enablePreview || !observerRef.current) return
    const cards = gridRef.current?.querySelectorAll('[data-path]')
    cards?.forEach((el) => observerRef.current!.observe(el))
  }, [thumbState, enablePreview])

  const sortedFiles = useMemo(() => {
    const files = [...folderFiles]
    const cmp = (a: { name: string }, b: { name: string }) => {
      if (fileSortMode === 'type+name') {
        const extA = getExt(a.name)
        const extB = getExt(b.name)
        if (extA !== extB) return extA.localeCompare(extB)
      }
      return a.name.localeCompare(b.name)
    }
    files.sort(cmp)
    if (sortOrder === 'desc') files.reverse()
    return files
  }, [folderFiles, fileSortMode, sortOrder])

  function cycleSortMode() {
    const next: FileSortMode = fileSortMode === 'name' ? 'type+name' : 'name'
    setFileSortMode(next)
  }

  function toggleSortOrder() {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 text-xs font-semibold text-muted-foreground border-b flex items-center justify-between gap-1">
        <span className="shrink-0">{t('fileList.title')}</span>
        {enablePreview && folderFiles.length > 0 && (
          <span className="text-[10px] text-muted-foreground/60 truncate min-w-0">
            {thumbState.urls.size + thumbState.failed.size}/{folderFiles.length}
            {processingPath && (
              <span className="text-muted-foreground/80" title={processingPath}>
                {' — ' + (processingPath.split(/[/\\]/).pop() || '')}
              </span>
            )}
          </span>
        )}
        <div className="flex items-center gap-0.5">
          {enablePreview && folderFiles.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setFullscreen(true)}
              title={t('fileList.maximize')}
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setEnablePreview(!enablePreview)}
            title={enablePreview ? t('fileList.previewView') : t('fileList.listView')}
          >
            {enablePreview ? <Eye className={cn('h-3 w-3', enablePreview && 'text-primary')} /> : <EyeOff className="h-3 w-3" />}
          </Button>
          {folderFiles.length > 0 && (
          <>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={cycleSortMode}
            title={fileSortMode === 'name' ? t('fileList.sortByName') : t('fileList.sortByType')}
          >
            <List className={cn('h-3 w-3', fileSortMode === 'type+name' && 'text-primary')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={toggleSortOrder}
            title={sortOrder === 'asc' ? t('fileList.sortAsc') : t('fileList.sortDesc')}
          >
            {sortOrder === 'asc' ? (
              <ArrowUpAZ className="h-3 w-3" />
            ) : (
              <ArrowDownZA className="h-3 w-3" />
            )}
          </Button>
          </>
          )}
        </div>
      </div>

      {currentFolderPath && (
        <ScrollArea className="border-b">
          <div
            className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap min-w-max flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors"
            onClick={handleFolderClick}
            title={t('fileList.switchFolder')}
          >
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">{currentFolderPath}</span>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {folderFiles.length === 0 ? (
        <ScrollArea className="flex-1 p-4">
          <p className="text-xs text-muted-foreground text-center py-8">
            {currentFolderPath ? t('fileList.noModels') : t('fileList.empty')}
          </p>
        </ScrollArea>
      ) : (
      <>
      {enablePreview ? (
        <ScrollArea className="flex-1">
          <div
            ref={gridRef}
            className="p-2 grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
          >
            {sortedFiles.map((file, i) => {
              const isSelected = i === selectedFileIndex
              const isCurrent = loadedFilePaths.has(file.path)
              const thumbUrl = thumbState.urls.get(file.path)
              const failed = thumbState.failed.has(file.path)

              const isProcessing = processingPath === file.path

              return (
                <div
                  key={file.path}
                  data-index={i}
                  data-path={file.path}
                  className={cn(
                    'rounded-lg overflow-hidden cursor-pointer transition-all duration-100',
                    isSelected && 'ring-2 ring-primary',
                    isCurrent && !isSelected && 'ring-2 ring-primary/60',
                    isProcessing && !isSelected && !isCurrent && 'ring-2 ring-primary/30 animate-pulse',
                    !isSelected && !isCurrent && !isProcessing && 'hover:ring-1 hover:ring-primary/40',
                  )}
                  onClick={() => {
                    if (clickTimerRef.current) {
                      clearTimeout(clickTimerRef.current)
                    }
                    clickTimerRef.current = setTimeout(() => {
                      clickTimerRef.current = null
                      replaceSceneWithFile(file, i)
                    }, 250)
                  }}
                  onDoubleClick={() => {
                    if (clickTimerRef.current) {
                      clearTimeout(clickTimerRef.current)
                      clickTimerRef.current = null
                    }
                    toggleFileInScene(file, i)
                  }}
                  onMouseEnter={() => {
                    if (selectedFileIndex === -1 && !isCurrent) setSelectedFileIndex(i)
                  }}
                >
                  <div
                    className="relative w-full bg-muted flex items-center justify-center overflow-hidden"
                    style={{ aspectRatio: '4/3' }}
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={file.name}
                        className="w-full h-full object-contain opacity-0 transition-opacity duration-300"
                        onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = '1' }}
                      />
                    ) : (
                      <PlaceholderCard file={file} failed={failed} loading={isProcessing} />
                    )}

                    {isCurrent && (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary shadow-sm" />
                    )}
                  </div>
                  <div className="px-1.5 py-0.5 bg-muted">
                    <span className="text-[10px] text-muted-foreground truncate block" title={file.name}>
                      {file.name}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="flex-1">
          <div ref={listRef} className="p-2 min-w-max">
            {sortedFiles.map((file, i) => {
              const isSelected = i === selectedFileIndex
              const isCurrent = loadedFilePaths.has(file.path)
              const ext = getExt(file.name)
              return (
                <div
                  key={file.path}
                  data-index={i}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer mb-0.5 whitespace-nowrap',
                    'transition-colors duration-100',
                    isSelected ? 'bg-accent ring-1 ring-primary' : 'hover:bg-accent/50',
                    isCurrent && !isSelected && 'bg-primary/10 border border-primary/30',
                  )}
                  onClick={() => {
                    if (clickTimerRef.current) {
                      clearTimeout(clickTimerRef.current)
                    }
                    clickTimerRef.current = setTimeout(() => {
                      clickTimerRef.current = null
                      replaceSceneWithFile(file, i)
                    }, 250)
                  }}
                  onDoubleClick={() => {
                    if (clickTimerRef.current) {
                      clearTimeout(clickTimerRef.current)
                      clickTimerRef.current = null
                    }
                    toggleFileInScene(file, i)
                  }}
                  onMouseEnter={() => {
                    if (selectedFileIndex === -1 && !isCurrent) setSelectedFileIndex(i)
                  }}
                >
                  {isCurrent && (
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                  <span className={cn('font-medium shrink-0 text-xs', EXT_COLORS[ext] || 'text-muted-foreground')}>
                    {ext ? ext.toUpperCase().slice(1) : '?'}
                  </span>
                  <span className="text-foreground">
                    {file.name}
                  </span>
                </div>
              )
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </>
    )}
      {fullscreen && createPortal(
        <FullscreenGrid
          files={sortedFiles}
          thumbState={thumbState}
          processingPath={processingPath}
          loadedFilePaths={loadedFilePaths}
          onClose={() => setFullscreen(false)}
          onReplaceScene={(file, i) => { replaceSceneWithFile(file, i); setFullscreen(false) }}
          onToggleFile={(file, i) => { toggleFileInScene(file, i); setFullscreen(false) }}
          selectedFileIndex={selectedFileIndex}
          setSelectedFileIndex={setSelectedFileIndex}
          folderPath={currentFolderPath}
          fileSortMode={fileSortMode}
          sortOrder={sortOrder}
          onCycleSortMode={cycleSortMode}
          onToggleSortOrder={toggleSortOrder}
        />,
        document.body,
      )}
    </div>
  )
}

function PlaceholderCard({ file, failed, loading }: { file: { name: string }; failed: boolean; loading?: boolean }) {
  const ext = getExt(file.name)
  const extLabel = ext ? ext.toUpperCase().slice(1) : '?'

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2">
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '16px 16px',
        }}
      />
      <span
        className={cn(
          'relative z-10 text-base font-bold px-2.5 py-1 rounded-md',
          'bg-background/60 backdrop-blur-sm',
          EXT_COLORS[ext] || 'text-muted-foreground',
        )}
      >
        {extLabel}
      </span>
      {loading && (
        <>
          <Loader2 className="relative z-10 h-5 w-5 animate-spin text-primary/70" />
          <span className="relative z-10 text-[9px] text-muted-foreground/70 truncate max-w-[90%] text-center leading-tight">
            {file.name}
          </span>
        </>
      )}
      {!loading && failed && (
        <AlertCircle className="relative z-10 h-4 w-4 text-muted-foreground/50" />
      )}
    </div>
  )
}

function FullscreenGrid({
  files,
  thumbState,
  processingPath,
  loadedFilePaths,
  onClose,
  onReplaceScene,
  onToggleFile,
  selectedFileIndex,
  setSelectedFileIndex,
  folderPath,
  fileSortMode,
  sortOrder,
  onCycleSortMode,
  onToggleSortOrder,
}: {
  files: { name: string; path: string; mtimeMs: number }[]
  thumbState: ThumbState
  processingPath: string | null
  loadedFilePaths: Set<string>
  onClose: () => void
  onReplaceScene: (file: { name: string; path: string; mtimeMs: number }, index: number) => void
  onToggleFile: (file: { name: string; path: string; mtimeMs: number }, index: number) => void
  selectedFileIndex: number
  setSelectedFileIndex: (i: number) => void
  folderPath: string | null
  fileSortMode: FileSortMode
  sortOrder: 'asc' | 'desc'
  onCycleSortMode: () => void
  onToggleSortOrder: () => void
}) {
  const { t } = useTranslation()
  const gridRef = useRef<HTMLDivElement>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const done = thumbState.urls.size + thumbState.failed.size

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
          {folderPath && (
            <span className="truncate hidden sm:inline">{folderPath}</span>
          )}
          <span className="text-xs opacity-60 whitespace-nowrap">
            {done}/{files.length}
            {processingPath && (
              <span className="opacity-80" title={processingPath}>
                {' — ' + (processingPath.split(/[/\\]/).pop() || '')}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onCycleSortMode}
            title={fileSortMode === 'name' ? t('fileList.sortByName') : t('fileList.sortByType')}
          >
            <List className={cn('h-3 w-3', fileSortMode === 'type+name' && 'text-primary')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onToggleSortOrder}
            title={sortOrder === 'asc' ? t('fileList.sortAsc') : t('fileList.sortDesc')}
          >
            {sortOrder === 'asc' ? (
              <ArrowUpAZ className="h-3 w-3" />
            ) : (
              <ArrowDownZA className="h-3 w-3" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1">
        <div
          ref={gridRef}
          className="p-4 grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
        >
          {files.map((file, i) => {
            const isSelected = i === selectedFileIndex
            const isCurrent = loadedFilePaths.has(file.path)
            const thumbUrl = thumbState.urls.get(file.path)
            const failed = thumbState.failed.has(file.path)

            return (
              <div
                key={file.path}
                data-index={i}
                className={cn(
                  'rounded-lg overflow-hidden cursor-pointer transition-all duration-100',
                  isSelected && 'ring-2 ring-primary',
                  isCurrent && !isSelected && 'ring-2 ring-primary/60',
                  !isSelected && !isCurrent && 'hover:ring-1 hover:ring-primary/40',
                )}
                onClick={() => {
                  if (clickTimerRef.current) {
                    clearTimeout(clickTimerRef.current)
                  }
                  clickTimerRef.current = setTimeout(() => {
                    clickTimerRef.current = null
                    onReplaceScene(file, i)
                  }, 250)
                }}
                onDoubleClick={() => {
                  if (clickTimerRef.current) {
                    clearTimeout(clickTimerRef.current)
                    clickTimerRef.current = null
                  }
                  onToggleFile(file, i)
                }}
                onMouseEnter={() => {
                  if (selectedFileIndex === -1 && !isCurrent) setSelectedFileIndex(i)
                }}
              >
                <div
                  className="relative w-full bg-muted flex items-center justify-center overflow-hidden"
                  style={{ aspectRatio: '4/3' }}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={file.name}
                      className="w-full h-full object-contain opacity-0 transition-opacity duration-300"
                      onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = '1' }}
                    />
                  ) : (
                    <PlaceholderCard file={file} failed={failed} loading={processingPath === file.path} />
                  )}
                  {isCurrent && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary shadow-sm" />
                  )}
                </div>
                <div className="px-1.5 py-0.5 bg-muted">
                  <span className="text-[10px] text-muted-foreground truncate block" title={file.name}>
                    {file.name}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

/** Double-click (toggle): add this file to scene, or remove it if already loaded. */
async function toggleFileInScene(file: { name: string; path: string; mtimeMs: number }, index: number) {
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

    // First SVG/DXF load: switch to SVG mode — clear 3D state
    if (useSvgWorkspaceStore.getState().files.length === 0) {
      store.reset()
    }

    // Load SVG/DXF first, then toggle
    try {
      const result = await window.electronAPI.readFile(file.path)
      if (!result.success || !result.data) {
        toast.error('Load failed: ' + (result.error || 'unknown error'))
        return
      }
      const text = new TextDecoder().decode(result.data)

      let svgText: string
      let layers: ReturnType<typeof parseSvgLayers>
      let naturalWidth: number
      let naturalHeight: number

      if (format === 'dxf') {
        const { convertDxfToSvg } = await import('@/lib/dxf-to-svg')
        const converted = await convertDxfToSvg(text)
        svgText = converted.svgText
        layers = converted.layers
        naturalWidth = converted.naturalWidth
        naturalHeight = converted.naturalHeight
      } else {
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
      console.error('[toggleFileInScene] SVG/DXF load exception:', e)
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

    // Parse STEP header from original buffer before conversion
    const isStep = isStepFile(file.name)

    let fileMeta: FileMeta | undefined
    if (isStep) {
      const stepHeader = parseStepHeader(buffer)
      if (stepHeader) fileMeta = { step: stepHeader }
    }

    if (isStep) {
      store.showProgress('Converting STEP geometry...')
      try {
        const { buffer: glbBuffer } = await stepToGlbCached(buffer,
          { filePath: file.path, mtimeMs: file.mtimeMs },
          { wasmPath: '/wasm/occt-import-js.wasm' },
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

    // Show progress for formats that weren't STEP-converted (STEP already has progress from above)
    if (!isStep) store.showProgress(`Loading ${file.name}...`)

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
async function replaceSceneWithFile(file: { name: string; path: string; mtimeMs: number }, index: number) {
  const store = useModelStore.getState()
  store.setSelectedFileIndex(index)

  // Clear all existing 3D state and SVG workspace
  store.reset()
  useSvgWorkspaceStore.setState({ files: [], selectedFileId: null })

  // Now load and add the file — toggleFileInScene will find no existing file and add it fresh
  await toggleFileInScene(file, index)
}
