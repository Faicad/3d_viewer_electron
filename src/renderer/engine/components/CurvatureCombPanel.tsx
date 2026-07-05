import { useTranslation } from 'react-i18next'
import { useCurvatureCombStore } from '@/stores/curvature-comb-store'
import { X } from 'lucide-react'

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground tabular-nums">{value.toFixed(2)}</span>
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

export default function CurvatureCombPanel() {
  const { t } = useTranslation()
  const enabled = useCurvatureCombStore((s) => s.enabled)
  const scale = useCurvatureCombStore((s) => s.scale)
  const color = useCurvatureCombStore((s) => s.color)
  const autoScale = useCurvatureCombStore((s) => s.autoScale)
  const setEnabled = useCurvatureCombStore((s) => s.setEnabled)
  const setScale = useCurvatureCombStore((s) => s.setScale)
  const setColor = useCurvatureCombStore((s) => s.setColor)
  const setAutoScale = useCurvatureCombStore((s) => s.setAutoScale)
  const resetToDefaults = useCurvatureCombStore((s) => s.resetToDefaults)

  if (!enabled) return null

  const hex = rgbToHex(color)

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
        <span style={{ fontSize: 12, fontWeight: 600 }}>{t('curvatureComb.title', '曲率梳')}</span>
        <button
          onClick={() => setEnabled(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          aria-label="close"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{t('curvatureComb.autoScale', '自动缩放')}</span>
        <button
          onClick={() => setAutoScale(!autoScale)}
          className={`w-8 h-4 rounded-full transition-colors ${
            autoScale ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            className={`block w-3 h-3 rounded-full bg-white transition-transform ${
              autoScale ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <SliderRow
        label={t('curvatureComb.scale', '缩放')}
        value={scale}
        min={0.01}
        max={10}
        step={0.01}
        onChange={setScale}
      />

      <div
        className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-muted cursor-pointer relative"
        onClick={() => {
          const input = document.getElementById('cc-color') as HTMLInputElement
          input?.click()
        }}
      >
        <span
          className="w-3.5 h-3.5 rounded border border-border flex-shrink-0"
          style={{ background: hex }}
        />
        <span className="text-[10px] text-muted-foreground truncate leading-none">
          {t('curvatureComb.color', '梳齿颜色')}
        </span>
        <input
          id="cc-color"
          type="color"
          value={hex}
          onChange={(e) => setColor(hexToRgb(e.target.value))}
          className="absolute opacity-0 w-0 h-0 pointer-events-none"
        />
      </div>

      <button
        onClick={resetToDefaults}
        className="mt-0.5 rounded bg-muted-foreground/10 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted-foreground/20 transition-colors"
      >
        {t('curvatureComb.reset', '重置')}
      </button>
    </div>
  )
}
