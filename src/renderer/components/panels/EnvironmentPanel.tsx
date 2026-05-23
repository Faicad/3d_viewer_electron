import { useTranslation } from 'react-i18next'
import { useEngineStore } from '@/stores/engine-store'
import { getSharedTextureCache } from '@/engine/material/MaterialFactory'
import { HDR_PRESETS } from '@/engine/environment/hdrPresets'
import { ScrollArea } from '@/components/ui/scroll-area'
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
      <div className="flex justify-between text-xs">
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

function ToggleRow({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
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

function SectionHeader({ label }: { label: string }) {
  return (
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-3 first:pt-0 pb-1.5 border-b">
      {label}
    </h3>
  )
}

export default function EnvironmentPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()

  const envIntensity = useEngineStore((s) => s.envIntensity)
  const envRotation = useEngineStore((s) => s.envRotation)
  const selectedEnv = useEngineStore((s) => s.selectedEnv)
  const use4k = useEngineStore((s) => s.use4kEnvMaps)
  const smaaEnabled = useEngineStore((s) => s.smaaEnabled)
  const aoIntensity = useEngineStore((s) => s.aoIntensity)
  const shadowIntensity = useEngineStore((s) => s.shadowIntensity)
  const shadowSoftness = useEngineStore((s) => s.shadowSoftness)
  const shadowFloorEnabled = useEngineStore((s) => s.shadowFloorEnabled)
  const shadowOpacity = useEngineStore((s) => s.shadowOpacity)
  const anisotropy = useEngineStore((s) => s.anisotropy)

  const setEnvIntensity = useEngineStore((s) => s.setEnvIntensity)
  const setEnvRotation = useEngineStore((s) => s.setEnvRotation)
  const setSelectedEnv = useEngineStore((s) => s.setSelectedEnv)
  const setUse4k = useEngineStore((s) => s.setUse4kEnvMaps)
  const setSmaaEnabled = useEngineStore((s) => s.setSmaaEnabled)
  const setAoIntensity = useEngineStore((s) => s.setAoIntensity)
  const setShadowIntensity = useEngineStore((s) => s.setShadowIntensity)
  const setShadowSoftness = useEngineStore((s) => s.setShadowSoftness)
  const setShadowFloorEnabled = useEngineStore((s) => s.setShadowFloorEnabled)
  const setShadowOpacity = useEngineStore((s) => s.setShadowOpacity)
  const setAnisotropy = useEngineStore((s) => s.setAnisotropy)

  const cachedCount = getSharedTextureCache().cacheCount()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-2 text-xs font-semibold text-muted-foreground border-b flex items-center justify-between shrink-0">
        <span>{t('toolbar.environment')}</span>
        <button
          className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted"
          onClick={onClose}
          aria-label="close environment panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        {/* Environment Map */}
        <SectionHeader label="Environment Map" />
        <div className="mt-2 space-y-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Preset</span>
            <select
              value={selectedEnv}
              onChange={(e) => setSelectedEnv(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              {HDR_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <ToggleRow label="4K Resolution" checked={use4k} onChange={setUse4k} />

          <SliderRow
            label="Intensity"
            value={Math.round(envIntensity * 100)}
            min={0} max={300} step={1}
            suffix="%"
            onChange={(v) => setEnvIntensity(v / 100)}
          />

          <SliderRow
            label="Rotation"
            value={Math.round((envRotation * 180) / Math.PI)}
            min={0} max={360} step={1}
            suffix="°"
            onChange={(v) => setEnvRotation((v * Math.PI) / 180)}
          />
        </div>

        {/* Post Processing */}
        <SectionHeader label="Post Processing" />
        <div className="mt-2 space-y-3">
          <ToggleRow label="SMAA Antialiasing" checked={smaaEnabled} onChange={setSmaaEnabled} />

          <SliderRow
            label="AO Intensity"
            value={aoIntensity}
            min={0} max={30} step={1}
            onChange={(v) => setAoIntensity(v)}
          />

          <SliderRow
            label="Shadow Intensity"
            value={shadowIntensity}
            min={0} max={100} step={1}
            suffix="%"
            onChange={(v) => setShadowIntensity(v)}
          />

          <SliderRow
            label="Shadow Softness"
            value={shadowSoftness}
            min={0} max={100} step={1}
            suffix="%"
            onChange={(v) => setShadowSoftness(v)}
          />
        </div>

        {/* Shadow Floor */}
        <SectionHeader label="Shadow Floor" />
        <div className="mt-2 space-y-3">
          <ToggleRow label="Enabled" checked={shadowFloorEnabled} onChange={setShadowFloorEnabled} />

          <SliderRow
            label="Opacity"
            value={Math.round(shadowOpacity * 100)}
            min={0} max={100} step={5}
            suffix="%"
            onChange={(v) => setShadowOpacity(v / 100)}
          />
        </div>

        {/* Texture Mapping */}
        <SectionHeader label="Texture Mapping" />
        <div className="mt-2 space-y-3 pb-4">
          <SliderRow
            label="Anisotropy"
            value={anisotropy}
            min={1} max={16} step={1}
            onChange={(v) => setAnisotropy(v)}
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Cached Textures</span>
            <span className="text-xs text-foreground tabular-nums">{cachedCount}</span>
          </div>

          <button
            className="w-full rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => getSharedTextureCache().dispose()}
          >
            Clear Texture Cache
          </button>
        </div>
      </ScrollArea>
    </div>
  )
}
