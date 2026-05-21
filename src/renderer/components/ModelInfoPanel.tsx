import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useEngineStore } from '@/stores/engine-store'
import { useModelStore } from '@/stores/model-store'
import { useUIStore } from '@/stores/ui-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { computeModelStats, formatNumber } from '@/lib/compute-model-stats'

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-border/50">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

export default function ModelInfoPanel() {
  const { t } = useTranslation()
  const modelGroup = useEngineStore((s) => s.modelGroup)
  const modelFormat = useModelStore((s) => s.modelFormat)
  const toggleModelInfo = useUIStore((s) => s.toggleModelInfo)

  const stats = useMemo(() => {
    if (!modelGroup) return null
    return computeModelStats(modelGroup)
  }, [modelGroup])

  const formatLabel = modelFormat?.toUpperCase() ?? '-'

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 text-xs font-semibold text-muted-foreground border-b flex items-center justify-between">
        <span>{t('modelInfo.title')}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={toggleModelInfo}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {!stats ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground">{t('modelInfo.empty')}</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            <StatRow label={t('modelInfo.vertices')} value={formatNumber(stats.vertices)} />
            <StatRow label={t('modelInfo.triangles')} value={formatNumber(stats.triangles)} />
            <StatRow label={t('modelInfo.surfaceArea')} value={`${formatNumber(stats.surfaceArea)} mm²`} />
            <StatRow label={t('modelInfo.volume')} value={`${formatNumber(stats.volume)} mm³`} />
            <StatRow
              label={t('modelInfo.dimensions')}
              value={
                stats.boundingBox.isEmpty()
                  ? '-'
                  : `${formatNumber(stats.boundingBox.max.x - stats.boundingBox.min.x)} × ${formatNumber(stats.boundingBox.max.y - stats.boundingBox.min.y)} × ${formatNumber(stats.boundingBox.max.z - stats.boundingBox.min.z)} mm`
              }
            />
            <StatRow label={t('modelInfo.parts')} value={formatNumber(stats.partCount)} />
            <StatRow label={t('modelInfo.format')} value={formatLabel} />
            <StatRow
              label={t('modelInfo.materialCost')}
              value={stats.volume > 0 ? `${formatNumber(stats.volume / 1000 * 1.24)} g (PLA)` : '-'}
            />
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
