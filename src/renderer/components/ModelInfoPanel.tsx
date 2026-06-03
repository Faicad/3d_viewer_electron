import { useMemo, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, GripHorizontal } from 'lucide-react'
import { useEngineStore } from '@/stores/engine-store'
import { useModelStore } from '@/stores/model-store'
import { useUIStore } from '@/stores/ui-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { computeModelStats, formatNumber, computeMaterialCost } from '@/lib/compute-model-stats'
import { sourceUnitToLabel } from '@/config/file-formats'

function StatRow({ label, value }: { label?: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-border/50">
      {label != null && <span className="text-muted-foreground">{label}</span>}
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

/** Crude HTML strip for 3MF description text. */
function stripHtml(html: string): string {
  let result = html
  while (result.includes('&amp;')) {
    result = result.replace(/&amp;/g, '&')
  }
  return result
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, '')
    .trim()
}

export default function ModelInfoPanel() {
  const { t } = useTranslation()
  const modelGroup = useEngineStore((s) => s.modelGroup)
  const modelFormat = useModelStore((s) => s.modelFormat)
  const sourceUnit = useModelStore((s) => s.sourceUnit)
  const fileGroup = useModelStore((s) => s.fileGroup)
  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const activeFileId = useModelStore((s) => s.activeFileId)
  const activeFile = loadedFiles.find(f => f.id === activeFileId)
  const bambuMeta = activeFile?.bambuMetadata?.modelMeta

  const visible = useUIStore((s) => s.modelInfoOpen)
  const position = useUIStore((s) => s.modelInfoPanelPosition)
  const togglePanel = useUIStore((s) => s.toggleModelInfo)
  const setPosition = useUIStore((s) => s.setModelInfoPanelPosition)

  // Drag
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      setPosition({ x: ev.clientX - dragOffset.current.x, y: ev.clientY - dragOffset.current.y })
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [position, setPosition])

  // Derived values — must be computed before any early return (Rules of Hooks)
  const unitLabel = sourceUnitToLabel(sourceUnit)
  const areaUnit = `${unitLabel}²`
  const volumeUnit = `${unitLabel}³`
  const showMaterialCost = fileGroup === 'mesh' || fileGroup === 'cad'

  const stats = useMemo(() => {
    if (!modelGroup) return null
    return computeModelStats(modelGroup)
  }, [modelGroup])

  const formatLabel = modelFormat?.toUpperCase() ?? '-'

  if (!visible) return null

  return (
    <div
      className="fixed z-50 w-64 rounded-lg border bg-background shadow-xl grid overflow-hidden"
      style={{ left: position.x, top: position.y, gridTemplateColumns: '100%', gridTemplateRows: 'auto 1fr', maxHeight: '80vh' }}
    >
      {/* Title bar with drag handle */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 border-b cursor-grab active:cursor-grabbing min-w-0"
        onMouseDown={onDragStart}
      >
        <GripHorizontal className="h-3 w-3 text-muted-foreground/50" />
        <span className="text-xs font-semibold flex-1 truncate">{t('modelInfo.title')}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={togglePanel}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Body */}
      {!stats ? (
        <div className="flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground">{t('modelInfo.empty')}</p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 min-w-0">
          <div className="flex flex-col">
            <StatRow label={t('modelInfo.vertices')} value={formatNumber(stats.vertices)} />
            <StatRow label={t('modelInfo.triangles')} value={formatNumber(stats.triangles)} />
            <StatRow label={t('modelInfo.surfaceArea')} value={`${formatNumber(stats.surfaceArea)} ${areaUnit}`} />
            <StatRow label={t('modelInfo.volume')} value={`${formatNumber(stats.volume)} ${volumeUnit}`} />
            <StatRow
              label={t('modelInfo.dimensions')}
              value={
                stats.boundingBox.isEmpty()
                  ? '-'
                  : `${formatNumber(stats.boundingBox.max.x - stats.boundingBox.min.x)} × ${formatNumber(stats.boundingBox.max.y - stats.boundingBox.min.y)} × ${formatNumber(stats.boundingBox.max.z - stats.boundingBox.min.z)} ${unitLabel}`
              }
            />
            <StatRow label={t('modelInfo.parts')} value={formatNumber(stats.partCount)} />
            <StatRow label={t('modelInfo.format')} value={formatLabel} />
            {showMaterialCost && (
              <StatRow
                label={t('modelInfo.materialCost')}
                value={computeMaterialCost(stats.volume, sourceUnit)}
              />
            )}

            {bambuMeta && (
              <>
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground border-b mt-1">
                  {t('modelInfo.modelMetadata')}
                </div>
                {bambuMeta.title && (
                  <StatRow value={bambuMeta.title} />
                )}
                {bambuMeta.designer && (
                  <StatRow label={t('modelInfo.designer')} value={bambuMeta.designer} />
                )}
                {bambuMeta.license && (
                  <StatRow label={t('modelInfo.license')} value={bambuMeta.license} />
                )}
                {bambuMeta.description && (
                  <div className="px-3 py-1.5 text-xs border-b text-muted-foreground leading-relaxed">
                    {stripHtml(bambuMeta.description)}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
