import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModelStore } from '@/stores/model-store'
import { useHistoryStore, type HistoryEntry } from '@/stores/history-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { stepToGlbCached } from '@/lib/step-converter'
import { detectFormat, FORMAT_MAP, getDefaultUpAxis, EXT_COLORS } from '@/config/file-formats'
import { loadFormat } from '@/engine/formatLoaders'
import { setCachedResult } from '@/engine/loaderResultCache'
import { generateThumbnailFromResult } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail, cacheKey, getThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'
import { X, Clock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'

const PAGE_SIZE = 20

function getExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export default function HistoryPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const historyEntries = useHistoryStore((s) => s.entries)

  const [snapshotPaths] = useState(
    () => new Set(useModelStore.getState().loadedFiles.map((f) => f.filePath)),
  )
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const [previewMode, setPreviewMode] = useState(true)
  const loaderRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const filteredEntries = useMemo(
    () => historyEntries.filter((e) => !snapshotPaths.has(e.filePath)),
    [historyEntries, snapshotPaths],
  )

  const displayedEntries = useMemo(
    () => filteredEntries.slice(0, displayCount),
    [filteredEntries, displayCount],
  )

  const hasMore = displayCount < filteredEntries.length

  const loadMore = useCallback(() => {
    setDisplayCount((prev) => Math.min(prev + PAGE_SIZE, filteredEntries.length))
  }, [filteredEntries.length])

  useEffect(() => {
    const el = loaderRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  async function handleEntryClick(entry: HistoryEntry) {
    const store = useModelStore.getState()
    const existing = store.loadedFiles.find((f) => f.filePath === entry.filePath)
    if (existing) {
      store.removeLoadedFile(existing.id)
      return
    }
    try {
      const result = await window.electronAPI.readFile(entry.filePath)
      if (!result.success || !result.data) {
        toast.error('Load failed: ' + (result.error || 'unknown error'))
        return
      }
      let buffer = result.data
      let format = detectFormat(entry.fileName)

      if (format === 'step') {
        store.setIsConverting(true)
        try {
          const { buffer: glbBuffer } = await stepToGlbCached(buffer,
            { filePath: entry.filePath, mtimeMs: entry.mtimeMs ?? Date.now() },
            { wasmPath: '/wasm/occt-import-js.wasm' },
          )
          buffer = glbBuffer
          format = 'glb'
        } finally {
          store.setIsConverting(false)
        }
      }

      if (!format) {
        toast.error('Unsupported file format: ' + entry.fileName)
        return
      }

      const loadResult = await loadFormat(buffer, format, entry.filePath)
      const fileId = crypto.randomUUID()
      setCachedResult(fileId, loadResult)

      const upAxis = getDefaultUpAxis(format, buffer)
      generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
        .then((blob) => {
          if (blob) putThumbnail(cacheKey(entry.filePath, entry.mtimeMs ?? Date.now()), blob)
        })

      store.addLoadedFile({
        id: fileId,
        fileName: entry.fileName,
        filePath: entry.filePath,
        mtimeMs: entry.mtimeMs,
        buffer,
        format,
        sceneTree: [],
        glbPartInfos: [],
        modelCenteringOffset: null,
        sourceUnit: loadResult.sourceUnit ?? FORMAT_MAP[format].defaultUnit,
        fileGroup: FORMAT_MAP[format].group,
        loadingPhase: 'loading',
      })
    } catch (e) {
      store.setIsConverting(false)
      toast.error('Load failed: ' + String(e))
    }
  }

  function formatTime(ts: number): string {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 text-xs font-semibold text-muted-foreground border-b flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {t('history.title')}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setPreviewMode((v) => !v)}
            title={previewMode ? t('fileList.listView') : t('fileList.previewView')}
          >
            {previewMode ? <Eye className="h-3 w-3 text-primary" /> : <EyeOff className="h-3 w-3" />}
          </Button>
          <button
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted"
            onClick={onClose}
            aria-label="close history panel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {previewMode ? (
          <PreviewGrid
            entries={displayedEntries}
            gridRef={gridRef}
            onEntryClick={handleEntryClick}
          />
        ) : (
          <ListMode
            entries={displayedEntries}
            onEntryClick={handleEntryClick}
            formatTime={formatTime}
          />
        )}
        {displayedEntries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">{t('history.empty')}</p>
        )}
        {hasMore && (
          <div ref={loaderRef} className="flex justify-center py-4">
            <span className="text-xs text-muted-foreground">{t('history.loadingMore')}</span>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function PreviewGrid({
  entries,
  gridRef,
  onEntryClick,
}: {
  entries: HistoryEntry[]
  gridRef: React.RefObject<HTMLDivElement | null>
  onEntryClick: (entry: HistoryEntry) => void
}) {
  return (
    <div ref={gridRef} className="p-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
      {entries.map((entry) => (
        <HistoryCard key={entry.filePath} entry={entry} onClick={() => onEntryClick(entry)} />
      ))}
    </div>
  )
}

function HistoryCard({ entry, onClick }: { entry: HistoryEntry; onClick: () => void }) {
  const ext = getExt(entry.fileName)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const key = cacheKey(entry.filePath, entry.mtimeMs ?? 0)
    getThumbnail(key).then((blob) => {
      if (cancelled) return
      if (blob) {
        const url = URL.createObjectURL(blob)
        setThumbUrl(url)
        setLoading(false)
      } else {
        setFailed(true)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [entry.filePath, entry.mtimeMs])

  useEffect(() => {
    return () => {
      if (thumbUrl) URL.revokeObjectURL(thumbUrl)
    }
  }, [thumbUrl])

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden cursor-pointer transition-all duration-100 hover:ring-1 hover:ring-primary/40',
      )}
      onClick={onClick}
    >
      <div
        className="relative w-full bg-muted flex items-center justify-center overflow-hidden"
        style={{ aspectRatio: '4/3' }}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={entry.fileName}
            className="w-full h-full object-cover opacity-0 transition-opacity duration-300"
            onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = '1' }}
          />
        ) : (
          <PlaceholderCard ext={ext} loading={loading} failed={failed} />
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5">
          <span className="text-[10px] text-white/90 truncate block" title={entry.fileName}>
            {entry.fileName}
          </span>
        </div>
      </div>
    </div>
  )
}

function PlaceholderCard({ ext, loading, failed }: { ext: string; loading: boolean; failed: boolean }) {
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
        <Loader2 className="relative z-10 h-4 w-4 animate-spin text-muted-foreground/60" />
      )}
      {!loading && failed && (
        <AlertCircle className="relative z-10 h-4 w-4 text-muted-foreground/50" />
      )}
    </div>
  )
}

function ListMode({
  entries,
  onEntryClick,
  formatTime,
}: {
  entries: HistoryEntry[]
  onEntryClick: (entry: HistoryEntry) => void
  formatTime: (ts: number) => string
}) {
  return (
    <div className="p-2 min-w-max">
      {entries.map((entry) => (
        <div
          key={entry.filePath}
          className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer mb-0.5 hover:bg-accent/50 transition-colors whitespace-nowrap"
          onClick={() => onEntryClick(entry)}
          title={entry.filePath}
        >
          <span className="text-xs text-muted-foreground shrink-0 w-[130px]">{formatTime(entry.timestamp)}</span>
          <span className="text-foreground">{entry.fileName}</span>
        </div>
      ))}
    </div>
  )
}
