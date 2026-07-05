import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useSurfaceAnalysisStore,
  type CurvesAnalysisMode,
} from '@/stores/surface-analysis-store'
import { X } from 'lucide-react'

const DEG = '\u00B0'

const MODE_LABELS: Record<CurvesAnalysisMode, string> = {
  zebra: '斑马纹',
  rainbow: '彩虹',
  isophote: '等照线',
}

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

function ColorPickerRow({ color, label, onChange }: {
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
        const input = document.getElementById(`sa-color-${label}`) as HTMLInputElement
        input?.click()
      }}
    >
      <span
        className="w-3.5 h-3.5 rounded border border-border flex-shrink-0"
        style={{ background: hex }}
      />
      <span className="text-[10px] text-muted-foreground truncate leading-none">{label}</span>
      <input
        id={`sa-color-${label}`}
        type="color"
        value={hex}
        onChange={handleChange}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
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

export default function SurfaceAnalysisPanel() {
  const { t } = useTranslation()
  const enabled = useSurfaceAnalysisStore((s) => s.enabled)
  const mode = useSurfaceAnalysisStore((s) => s.mode)
  const analysisDirection = useSurfaceAnalysisStore((s) => s.analysisDirection)
  const fixedDirection = useSurfaceAnalysisStore((s) => s.fixedDirection)
  const stripesNumber = useSurfaceAnalysisStore((s) => s.stripesNumber)
  const stripesRatio = useSurfaceAnalysisStore((s) => s.stripesRatio)
  const color1 = useSurfaceAnalysisStore((s) => s.color1)
  const color2 = useSurfaceAnalysisStore((s) => s.color2)
  const shading = useSurfaceAnalysisStore((s) => s.shading)
  const rainbowAngle1 = useSurfaceAnalysisStore((s) => s.rainbowAngle1)
  const rainbowAngle2 = useSurfaceAnalysisStore((s) => s.rainbowAngle2)
  const isoAngles = useSurfaceAnalysisStore((s) => s.isoAngles)
  const isoTolerance = useSurfaceAnalysisStore((s) => s.isoTolerance)

  const setEnabled = useSurfaceAnalysisStore((s) => s.setEnabled)
  const setMode = useSurfaceAnalysisStore((s) => s.setMode)
  const setAnalysisDirection = useSurfaceAnalysisStore((s) => s.setAnalysisDirection)
  const setFixedDirection = useSurfaceAnalysisStore((s) => s.setFixedDirection)
  const setStripesNumber = useSurfaceAnalysisStore((s) => s.setStripesNumber)
  const setStripesRatio = useSurfaceAnalysisStore((s) => s.setStripesRatio)
  const setColor1 = useSurfaceAnalysisStore((s) => s.setColor1)
  const setColor2 = useSurfaceAnalysisStore((s) => s.setColor2)
  const setShading = useSurfaceAnalysisStore((s) => s.setShading)
  const setRainbowAngle1 = useSurfaceAnalysisStore((s) => s.setRainbowAngle1)
  const setRainbowAngle2 = useSurfaceAnalysisStore((s) => s.setRainbowAngle2)
  const setIsoAngles = useSurfaceAnalysisStore((s) => s.setIsoAngles)
  const setIsoTolerance = useSurfaceAnalysisStore((s) => s.setIsoTolerance)
  const resetToDefaults = useSurfaceAnalysisStore((s) => s.resetToDefaults)

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
        <span style={{ fontSize: 12, fontWeight: 600 }}>{t('surfaceAnalysis.title', 'Curves 曲面分析')}</span>
        <button
          onClick={() => setEnabled(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          aria-label="close"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      <div className="flex gap-1">
        {(Object.keys(MODE_LABELS) as CurvesAnalysisMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded px-2 py-1 text-[11px] transition-colors ${
              mode === m
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {t('surfaceAnalysis.direction', '分析方向')}
        </span>
        <div className="flex gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <NumberInput
              key={axis}
              label={axis}
              value={analysisDirection[i]}
              min={-1}
              max={1}
              step={0.1}
              onChange={(v) => {
                const next: [number, number, number] = [...analysisDirection]
                next[i] = v
                setAnalysisDirection(next)
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{t('surfaceAnalysis.fixedDirection', '固定方向')}</span>
        <button
          onClick={() => setFixedDirection(!fixedDirection)}
          className={`w-8 h-4 rounded-full transition-colors ${
            fixedDirection ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            className={`block w-3 h-3 rounded-full bg-white transition-transform ${
              fixedDirection ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {(mode === 'zebra' || mode === 'rainbow') && (
        <SliderRow
          label={t('surfaceAnalysis.stripesNumber', '重复次数')}
          value={stripesNumber}
          min={1}
          max={50}
          step={1}
          onChange={setStripesNumber}
        />
      )}

      {mode === 'zebra' && (
        <SliderRow
          label={t('surfaceAnalysis.stripesRatio', '占空比')}
          value={stripesRatio}
          min={0}
          max={1}
          step={0.01}
          onChange={setStripesRatio}
        />
      )}

      {mode === 'rainbow' && (
        <>
          <SliderRow
            label={t('surfaceAnalysis.rainbowAngle1', '起始角')}
            value={rainbowAngle1}
            min={0}
            max={180}
            step={1}
            suffix={DEG}
            onChange={setRainbowAngle1}
          />
          <SliderRow
            label={t('surfaceAnalysis.rainbowAngle2', '终止角')}
            value={rainbowAngle2}
            min={0}
            max={180}
            step={1}
            suffix={DEG}
            onChange={setRainbowAngle2}
          />
        </>
      )}

      {mode === 'isophote' && (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {t('surfaceAnalysis.isoAngles', '等照角度')}
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {isoAngles.map((angle, i) => (
                <NumberInput
                  key={i}
                  label={`${i + 1}`}
                  value={angle}
                  min={0}
                  max={180}
                  step={1}
                  onChange={(v) => {
                    const next = [...isoAngles]
                    next[i] = v
                    setIsoAngles(next)
                  }}
                />
              ))}
              {isoAngles.length < 5 && (
                <button
                  onClick={() => setIsoAngles([...isoAngles, 90])}
                  className="self-end px-1.5 py-1 text-[11px] text-muted-foreground border border-dashed border-muted-foreground/30 rounded hover:bg-muted"
                >
                  +
                </button>
              )}
            </div>
          </div>
          <SliderRow
            label={t('surfaceAnalysis.isoTolerance', '等照容差')}
            value={isoTolerance}
            min={0}
            max={10}
            step={0.1}
            suffix={DEG}
            onChange={setIsoTolerance}
          />
        </>
      )}

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {t('surfaceAnalysis.colors', '颜色配置')}
        </span>
        <div className="grid grid-cols-2 gap-0.5">
          <ColorPickerRow
            color={color1}
            label={t('surfaceAnalysis.color1', '前景色')}
            onChange={setColor1}
          />
          <ColorPickerRow
            color={color2}
            label={t('surfaceAnalysis.color2', '背景色')}
            onChange={setColor2}
          />
        </div>
      </div>

      <SliderRow
        label={t('surfaceAnalysis.shading', '着色混合')}
        value={shading}
        min={0}
        max={1}
        step={0.01}
        onChange={setShading}
      />

      <button
        onClick={resetToDefaults}
        className="mt-0.5 rounded bg-muted-foreground/10 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted-foreground/20 transition-colors"
      >
        {t('surfaceAnalysis.reset', '重置')}
      </button>
    </div>
  )
}
