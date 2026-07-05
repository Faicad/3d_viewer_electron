import { useTranslation } from 'react-i18next'
import { useZebraStore, type ZebraColorScheme, type ZebraMappingMode } from '@/stores/zebra-store'
import { X } from 'lucide-react'

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

const SCHEME_OPTIONS: { value: ZebraColorScheme; label: string }[] = [
  { value: 'blackwhite', label: '黑白' },
  { value: 'grayscale', label: '灰度' },
  { value: 'colorful', label: '彩色' },
]

const MODE_OPTIONS: { value: ZebraMappingMode; label: string }[] = [
  { value: 'reflection', label: '反射' },
  { value: 'normal', label: '法线' },
]

function RadioGroupRow<T extends string>({ label, options, value, onChange }: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
              value === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ZebraPanel() {
  const { t } = useTranslation()
  const enabled = useZebraStore((s) => s.enabled)
  const stripeCount = useZebraStore((s) => s.stripeCount)
  const stripeOpacity = useZebraStore((s) => s.stripeOpacity)
  const stripeDirection = useZebraStore((s) => s.stripeDirection)
  const colorScheme = useZebraStore((s) => s.colorScheme)
  const mappingMode = useZebraStore((s) => s.mappingMode)
  const setEnabled = useZebraStore((s) => s.setEnabled)
  const setStripeCount = useZebraStore((s) => s.setStripeCount)
  const setStripeOpacity = useZebraStore((s) => s.setStripeOpacity)
  const setStripeDirection = useZebraStore((s) => s.setStripeDirection)
  const setColorScheme = useZebraStore((s) => s.setColorScheme)
  const setMappingMode = useZebraStore((s) => s.setMappingMode)
  const resetToDefaults = useZebraStore((s) => s.resetToDefaults)

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
        minWidth: 180,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>斑马纹</span>
        <button
          onClick={() => setEnabled(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          aria-label="close"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      <SliderRow
        label={t('zebra.stripeCount', '条纹数量')}
        value={stripeCount}
        min={2}
        max={50}
        step={1}
        onChange={setStripeCount}
      />

      <SliderRow
        label={t('zebra.stripeOpacity', '不透明度')}
        value={stripeOpacity}
        min={0}
        max={1}
        step={0.01}
        onChange={setStripeOpacity}
      />

      <SliderRow
        label={t('zebra.stripeDirection', '方向')}
        value={stripeDirection}
        min={0}
        max={90}
        step={1}
        suffix="°"
        onChange={setStripeDirection}
      />

      <RadioGroupRow
        label={t('zebra.colorScheme', '颜色方案')}
        options={SCHEME_OPTIONS}
        value={colorScheme}
        onChange={setColorScheme}
      />

      <RadioGroupRow
        label={t('zebra.mappingMode', '映射模式')}
        options={MODE_OPTIONS}
        value={mappingMode}
        onChange={setMappingMode}
      />

      <button
        onClick={resetToDefaults}
        className="mt-1 rounded bg-muted-foreground/10 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted-foreground/20 transition-colors"
      >
        {t('zebra.reset', '重置')}
      </button>
    </div>
  )
}
