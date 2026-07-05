import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraftAnalysisStore, type DraftColorZone } from '@/stores/draft-analysis-store'
import { X } from 'lucide-react'

const DEG = '\u00B0'

function SliderRow({ label, value, min, max, step, onChange, suffix }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground tabular-nums">
          {suffix ? `${value}${suffix}` : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted-foreground/20
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
      />
    </div>
  )
}

function NumberInput({ label, value, onChange, min, max, step }: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
}) {
  return (
    <div className="flex flex-col gap-0.5 flex-1">
      <span className="text-[10px] text-muted-foreground font-semibold">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          let v = Number(e.target.value)
          if (isNaN(v)) return
          v = Math.max(min, Math.min(max, v))
          onChange(v)
        }}
        className="w-full rounded border border-border bg-white px-1.5 py-1 text-[11px] tabular-nums
          text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary
          [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  )
}

function rgbToHex(c: [number, number, number]): string {
  const r = Math.round(c[0] * 255)
  const g = Math.round(c[1] * 255)
  const b = Math.round(c[2] * 255)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

const ZONE_LABELS: Record<DraftColorZone, string> = {
  inDraftPos: '正拔模（合格）',
  inTolerancePos: '正容差带',
  outOfDraftPos: '正超出范围',
  inDraftNeg: '负拔模（合格）',
  inToleranceNeg: '负容差带',
  outOfDraftNeg: '负超出范围',
}

const ZONE_ORDER: DraftColorZone[] = [
  'outOfDraftPos',
  'inTolerancePos',
  'inDraftPos',
  'inDraftNeg',
  'inToleranceNeg',
  'outOfDraftNeg',
]

export default function DraftAnalysisPanel() {
  const { t } = useTranslation()
  const enabled = useDraftAnalysisStore((s) => s.enabled)
  const pullDirection = useDraftAnalysisStore((s) => s.pullDirection)
  const draftAnglePos = useDraftAnalysisStore((s) => s.draftAnglePos)
  const draftAngleNeg = useDraftAnalysisStore((s) => s.draftAngleNeg)
  const draftTolPos = useDraftAnalysisStore((s) => s.draftTolPos)
  const draftTolNeg = useDraftAnalysisStore((s) => s.draftTolNeg)
  const shading = useDraftAnalysisStore((s) => s.shading)
  const colors = useDraftAnalysisStore((s) => s.colors)
  const setEnabled = useDraftAnalysisStore((s) => s.setEnabled)
  const setPullDirection = useDraftAnalysisStore((s) => s.setPullDirection)
  const setDraftAnglePos = useDraftAnalysisStore((s) => s.setDraftAnglePos)
  const setDraftAngleNeg = useDraftAnalysisStore((s) => s.setDraftAngleNeg)
  const setDraftTolPos = useDraftAnalysisStore((s) => s.setDraftTolPos)
  const setDraftTolNeg = useDraftAnalysisStore((s) => s.setDraftTolNeg)
  const setShading = useDraftAnalysisStore((s) => s.setShading)
  const setColor = useDraftAnalysisStore((s) => s.setColor)
  const resetToDefaults = useDraftAnalysisStore((s) => s.resetToDefaults)

  if (!enabled) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 8,
        background: 'var(--background)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        minWidth: 200,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{t('draftAnalysis.title', '拔模分析')}</span>
        <button
          onClick={() => setEnabled(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          aria-label="close"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {t('draftAnalysis.direction', '拔模方向')}
        </span>
        <div className="flex gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <NumberInput
              key={axis}
              label={axis}
              value={pullDirection[i]}
              min={-1}
              max={1}
              step={0.1}
              onChange={(v) => {
                const next: [number, number, number] = [...pullDirection]
                next[i] = v
                setPullDirection(next)
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {t('draftAnalysis.angles', '拔模角度')}
        </span>
        <SliderRow
          label={t('draftAnalysis.anglePos', '正拔模角')}
          value={draftAnglePos}
          min={0}
          max={90}
          step={0.1}
          suffix={DEG}
          onChange={setDraftAnglePos}
        />
        <SliderRow
          label={t('draftAnalysis.angleNeg', '负拔模角')}
          value={draftAngleNeg}
          min={0}
          max={90}
          step={0.1}
          suffix={DEG}
          onChange={setDraftAngleNeg}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {t('draftAnalysis.tolerances', '容差')}
        </span>
        <SliderRow
          label={t('draftAnalysis.tolPos', '正容差')}
          value={draftTolPos}
          min={0}
          max={10}
          step={0.01}
          suffix={DEG}
          onChange={setDraftTolPos}
        />
        <SliderRow
          label={t('draftAnalysis.tolNeg', '负容差')}
          value={draftTolNeg}
          min={0}
          max={10}
          step={0.01}
          suffix={DEG}
          onChange={setDraftTolNeg}
        />
      </div>

      <SliderRow
        label={t('draftAnalysis.shading', '着色混合')}
        value={shading}
        min={0}
        max={1}
        step={0.01}
        onChange={setShading}
      />

      <ColorPreviewBar
        colors={colors}
        draftAnglePos={draftAnglePos}
        draftAngleNeg={draftAngleNeg}
        draftTolPos={draftTolPos}
        draftTolNeg={draftTolNeg}
      />

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {t('draftAnalysis.colors', '颜色配置')}
        </span>
        <div className="grid grid-cols-2 gap-0.5">
          {ZONE_ORDER.map((zone) => (
            <ColorPickerRow
              key={zone}
              zone={zone}
              color={colors[zone]}
              label={ZONE_LABELS[zone]}
              onChange={(c) => setColor(zone, c)}
            />
          ))}
        </div>
      </div>

      <button
        onClick={resetToDefaults}
        className="mt-0.5 rounded bg-muted-foreground/10 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted-foreground/20 transition-colors"
      >
        {t('draftAnalysis.reset', '重置')}
      </button>
    </div>
  )
}

function ColorPreviewBar({ colors, draftAnglePos, draftAngleNeg, draftTolPos, draftTolNeg }: {
  colors: Record<DraftColorZone, [number, number, number]>
  draftAnglePos: number
  draftAngleNeg: number
  draftTolPos: number
  draftTolNeg: number
}) {
  const total = 180
  const bounds = [
    0,
    90 - draftAnglePos - draftTolPos,
    90 - draftAnglePos,
    90,
    90 + draftAngleNeg,
    90 + draftAngleNeg + draftTolNeg,
    180,
  ]
  const pct = bounds.map((b) => Math.max(0, Math.min(100, (b / total) * 100)))

  const zoneColors = [
    colors.outOfDraftPos,
    colors.inTolerancePos,
    colors.inDraftPos,
    colors.inDraftNeg,
    colors.inToleranceNeg,
    colors.outOfDraftNeg,
  ]

  const parts: string[] = []
  for (let i = 0; i < 6; i++) {
    if (pct[i + 1] <= pct[i]) continue
    parts.push(`${rgbToHex(zoneColors[i])} ${pct[i]}% ${pct[i + 1]}%`)
  }

  return (
    <div
      className="h-2 w-full rounded"
      style={{
        background: parts.length > 0
          ? `linear-gradient(to right, ${parts.join(', ')})`
          : '#ccc',
        borderRadius: 4,
      }}
    />
  )
}

function ColorPickerRow({ zone, color, label, onChange }: {
  zone: DraftColorZone
  color: [number, number, number]
  label: string
  onChange: (c: [number, number, number]) => void
}) {
  const hex = rgbToHex(color)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(hexToRgb(e.target.value))
  }, [onChange])

  return (
    <div
      className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-muted cursor-pointer relative"
      onClick={() => {
        const input = document.getElementById(`draft-color-${zone}`) as HTMLInputElement
        input?.click()
      }}
    >
      <span
        className="w-3.5 h-3.5 rounded border border-border flex-shrink-0"
        style={{ background: hex }}
      />
      <span className="text-[10px] text-muted-foreground truncate leading-none">{label}</span>
      <input
        id={`draft-color-${zone}`}
        type="color"
        value={hex}
        onChange={handleChange}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
      />
    </div>
  )
}
