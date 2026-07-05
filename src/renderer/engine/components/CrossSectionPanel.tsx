import { useTranslation } from 'react-i18next'
import { useCrossSectionStore } from '@/stores/cross-section-store'
import { X } from 'lucide-react'

const AXIS_COLORS = ['#ff3333', '#33ff55', '#3388ff']
const AXIS_LABELS = ['X', 'Y', 'Z']

function SliderRow({ label, value, min, max, step, onChange, suffix, color }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  suffix?: string
  color?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground" style={color ? { color } : undefined}>{label}</span>
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

function ToggleRow({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-4 w-7 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted-foreground/25'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            checked ? 'left-[14px]' : 'left-[2px]'
          }`}
        />
      </button>
    </div>
  )
}

export default function CrossSectionPanel() {
  const { t } = useTranslation()
  const panelOpen = useCrossSectionStore((s) => s.panelOpen)
  const planeX = useCrossSectionStore((s) => s.planeX)
  const planeY = useCrossSectionStore((s) => s.planeY)
  const planeZ = useCrossSectionStore((s) => s.planeZ)
  const showClipPlane = useCrossSectionStore((s) => s.showClipPlane)
  const useObjectColor = useCrossSectionStore((s) => s.useObjectColor)
  const setPanelOpen = useCrossSectionStore((s) => s.setPanelOpen)
  const setPlanePosition = useCrossSectionStore((s) => s.setPlanePosition)
  const setShowClipPlane = useCrossSectionStore((s) => s.setShowClipPlane)
  const setUseObjectColor = useCrossSectionStore((s) => s.setUseObjectColor)

  const positions = [planeX.position, planeY.position, planeZ.position]

  if (!panelOpen) return null

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
        minWidth: 180,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{t('crossSection.title', '剖面控制')}</span>
        <button
          onClick={() => setPanelOpen(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          aria-label="close"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      {AXIS_LABELS.map((label, i) => (
        <SliderRow
          key={label}
          label={`${label} ${t('crossSection.axis', '轴')}`}
          value={positions[i]}
          min={0}
          max={100}
          step={1}
          color={AXIS_COLORS[i]}
          suffix="%"
          onChange={(v) => setPlanePosition(label.toLowerCase() as 'x' | 'y' | 'z', v)}
        />
      ))}

      <ToggleRow
        label={t('crossSection.showClipPlane', '显示裁剪面')}
        checked={showClipPlane}
        onChange={setShowClipPlane}
      />
      <ToggleRow
        label={t('crossSection.useObjectColor', '使用模型颜色')}
        checked={useObjectColor}
        onChange={setUseObjectColor}
      />
    </div>
  )
}
