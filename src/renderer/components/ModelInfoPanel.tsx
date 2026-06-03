import { useMemo, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, GripHorizontal } from 'lucide-react'
import { useEngineStore } from '@/stores/engine-store'
import { useModelStore } from '@/stores/model-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useUIStore } from '@/stores/ui-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  computeModelStats, computeMeshStats, formatNumber,
  computeMaterialCost, findMeshByPartId, isValidPartId,
  expandGroupToPartIds,
  type AggregatePartStats,
} from '@/lib/compute-model-stats'
import { sourceUnitToLabel } from '@/config/file-formats'
import type { FileMeta } from '@/lib/file-meta'

function StatRow({ label, value }: { label?: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-border/50">
      {label != null && <span className="text-muted-foreground">{label}</span>}
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-1 text-xs font-semibold text-muted-foreground border-b mt-1">
      {label}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(2)} MB`
}

/** Aggregate multi-select part stats from meshes found in the model group. */
function computeAggregateStats(
  partIds: string[],
  modelGroup: THREE.Group | null,
): AggregatePartStats | null {
  if (!modelGroup || partIds.length === 0) return null
  let vertices = 0
  let triangles = 0
  let surfaceArea = 0
  let volume = 0
  let count = 0

  for (const id of partIds) {
    const mesh = findMeshByPartId(modelGroup, id)
    if (!mesh) continue
    const s = computeMeshStats(mesh)
    vertices += s.vertices
    triangles += s.triangles
    surfaceArea += s.surfaceArea
    volume += s.volume
    count++
  }

  if (count === 0) return null
  return { count, vertices, triangles, surfaceArea, volume }
}

/** Resolve selectedReferenceIds → valid partIds, expanding group nodes. */
function resolveSelectedPartIds(
  selectedIds: string[],
  modelGroup: THREE.Group | null,
  sceneTree: ReturnType<typeof useModelStore.getState['sceneTree']>,
): string[] {
  if (!modelGroup || selectedIds.length === 0) return []
  const result: string[] = []
  for (const id of selectedIds) {
    if (isValidPartId(id, modelGroup)) {
      result.push(id)
    } else {
      const expanded = expandGroupToPartIds(id, sceneTree)
      result.push(...expanded)
    }
  }
  return result
}

/** Render format-specific metadata section. */
function MetadataSection({ fileMeta }: { fileMeta: FileMeta }) {
  const { t } = useTranslation()
  const meta3mf = fileMeta['3mf']
  const metaGlb = fileMeta['glb']
  const metaStep = fileMeta['step']

  if (meta3mf && meta3mf.entries.length > 0) {
    const important = new Set(['Title', 'Designer', 'Description', 'License'])
    const importantEntries: Array<{ name: string; value: string }> = []
    const otherEntries: Array<{ name: string; value: string }> = []
    for (const entry of meta3mf.entries) {
      if (important.has(entry.name)) {
        importantEntries.push(entry)
      } else {
        otherEntries.push(entry)
      }
    }
    const importantLabels: Record<string, string> = {
      Title: '',
      Designer: t('modelInfo.designer'),
      Description: '',
      License: t('modelInfo.license'),
    }
    return (
      <>
        <SectionHeader label={t('modelInfo.meta3mf')} />
        {importantEntries.map((entry, i) => (
          entry.name === 'Title' || entry.name === 'Description'
            ? <StatRow key={i} value={entry.value} />
            : <StatRow key={i} label={importantLabels[entry.name]} value={entry.value} />
        ))}
        {otherEntries.map((entry, i) => (
          <StatRow key={`o-${i}`} value={`${entry.name}: ${entry.value}`} />
        ))}
      </>
    )
  }

  if (metaGlb) {
    const rows: Array<{ label: string; value: string }> = []
    if (metaGlb.generator) rows.push({ label: 'generator', value: metaGlb.generator })
    if (metaGlb.version) rows.push({ label: 'version', value: metaGlb.version })
    if (metaGlb.minVersion) rows.push({ label: 'minVersion', value: metaGlb.minVersion })
    if (metaGlb.copyright) rows.push({ label: 'copyright', value: metaGlb.copyright })
    if (rows.length === 0) return null
    return (
      <>
        <SectionHeader label={t('modelInfo.metaGlb')} />
        {rows.map((r, i) => (
          <StatRow key={i} label={r.label} value={r.value} />
        ))}
      </>
    )
  }

  if (metaStep) {
    const rows: Array<{ label: string; value: string }> = []
    if (metaStep.name) rows.push({ label: 'name', value: metaStep.name })
    if (metaStep.time_stamp) rows.push({ label: 'time_stamp', value: metaStep.time_stamp })
    if (metaStep.author) rows.push({ label: 'author', value: metaStep.author })
    if (metaStep.organization) rows.push({ label: 'organization', value: metaStep.organization })
    if (metaStep.preprocessor_version) rows.push({ label: 'preprocessor_version', value: metaStep.preprocessor_version })
    if (metaStep.originating_system) rows.push({ label: 'originating_system', value: metaStep.originating_system })
    if (metaStep.authorization) rows.push({ label: 'authorization', value: metaStep.authorization })
    if (metaStep.file_description) rows.push({ label: 'FILE_DESCRIPTION', value: metaStep.file_description })
    if (metaStep.file_schema) rows.push({ label: 'FILE_SCHEMA', value: metaStep.file_schema })
    if (rows.length === 0) return null
    return (
      <>
        <SectionHeader label={t('modelInfo.metaStep')} />
        {rows.map((r, i) => (
          <StatRow key={i} label={r.label} value={r.value} />
        ))}
      </>
    )
  }

  return null
}

export default function ModelInfoPanel() {
  const { t } = useTranslation()
  const modelGroup = useEngineStore((s) => s.modelGroup)
  const modelFormat = useModelStore((s) => s.modelFormat)
  const sourceUnit = useModelStore((s) => s.sourceUnit)
  const fileGroup = useModelStore((s) => s.fileGroup)
  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const activeFileId = useModelStore((s) => s.activeFileId)
  const sceneTree = useModelStore((s) => s.sceneTree)
  const activeFile = loadedFiles.find(f => f.id === activeFileId)
  const fileMeta = activeFile?.fileMeta

  const selectedReferenceIds = useSelectionStore((s) => s.selectedReferenceIds)

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

  // Derived values
  const unitLabel = sourceUnitToLabel(sourceUnit)
  const areaUnit = `${unitLabel}²`
  const volumeUnit = `${unitLabel}³`
  const showMaterialCost = fileGroup === 'mesh' || fileGroup === 'cad'
  const formatLabel = modelFormat?.toUpperCase() ?? '-'

  const stats = useMemo(() => {
    try {
      if (!modelGroup) return null
      return computeModelStats(modelGroup)
    } catch {
      return null
    }
  }, [modelGroup])

  // Selected part resolution + stats (defensive: catch errors to avoid crashing panel)
  const selectedPartIds = useMemo(() => {
    try {
      return resolveSelectedPartIds(selectedReferenceIds, modelGroup, sceneTree)
    } catch {
      return []
    }
  }, [selectedReferenceIds, modelGroup, sceneTree])

  const partStats = useMemo(() => {
    try {
      return computeAggregateStats(selectedPartIds, modelGroup)
    } catch {
      return null
    }
  }, [selectedPartIds, modelGroup])

  function getHasMetadata(fm: FileMeta | undefined): boolean {
    if (!fm) return false
    if (fm['3mf']?.entries.length) return true
    if (fm['glb'] && (fm['glb'].generator || fm['glb'].version || fm['glb'].copyright)) return true
    if (fm['step'] && Object.keys(fm['step']).length > 0) return true
    return false
  }
  const hasMetadata = fileMeta ? getHasMetadata(fileMeta) : false

  const isSinglePart = stats ? stats.partCount <= 1 : true

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

            {/* ── Selected Part Info ── */}
            {!isSinglePart && partStats && (
              <>
                <SectionHeader
                  label={partStats.count > 1
                    ? `${t('modelInfo.selectedPart')} (${partStats.count})`
                    : t('modelInfo.selectedPart')}
                />
                <StatRow label={t('modelInfo.vertices')} value={formatNumber(partStats.vertices)} />
                <StatRow label={t('modelInfo.triangles')} value={formatNumber(partStats.triangles)} />
                <StatRow label={t('modelInfo.surfaceArea')} value={`${formatNumber(partStats.surfaceArea)} ${areaUnit}`} />
                <StatRow label={t('modelInfo.volume')} value={`${formatNumber(partStats.volume)} ${volumeUnit}`} />
              </>
            )}

            {/* ── File Info ── */}
            <SectionHeader label={t('modelInfo.fileInfo')} />
            {activeFile?.fileName && (
              <StatRow label={t('modelInfo.fileName')} value={activeFile.fileName} />
            )}
            {activeFile?.buffer && (
              <StatRow label={t('modelInfo.fileSize')} value={formatFileSize(activeFile.buffer.byteLength)} />
            )}
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

            {/* ── File Metadata ── */}
            {hasMetadata && (
              <MetadataSection fileMeta={fileMeta!} />
            )}

          </div>
        </ScrollArea>
      )}
    </div>
  )
}
