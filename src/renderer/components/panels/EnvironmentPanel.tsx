import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useEngineStore } from '@/stores/engine-store'
import { useUIStore } from '@/stores/ui-store'
import { getSharedTextureCache } from '@/engine/material/MaterialFactory'
import { HDR_PRESETS } from '@/engine/environment/hdrPresets'
import { GripHorizontal, X } from 'lucide-react'

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

export default function EnvironmentPanel() {
  const { t } = useTranslation()

  const visible = useUIStore((s) => s.environmentPanelOpen)
  const position = useUIStore((s) => s.envPanelPosition)
  const togglePanel = useUIStore((s) => s.toggleEnvironmentPanel)
  const setPosition = useUIStore((s) => s.setEnvPanelPosition)

  const envIntensity = useEngineStore((s) => s.envIntensity)
  const envRotation = useEngineStore((s) => s.envRotation)
  const selectedEnv = useEngineStore((s) => s.selectedEnv)
  const customEnvs = useEngineStore((s) => s.customEnvs)
  const smaaEnabled = useEngineStore((s) => s.smaaEnabled)
  const shadowIntensity = useEngineStore((s) => s.shadowIntensity)
  const shadowSoftness = useEngineStore((s) => s.shadowSoftness)
  const shadowFloorEnabled = useEngineStore((s) => s.shadowFloorEnabled)
  const shadowOpacity = useEngineStore((s) => s.shadowOpacity)
  const anisotropy = useEngineStore((s) => s.anisotropy)

  const setEnvIntensity = useEngineStore((s) => s.setEnvIntensity)
  const setEnvRotation = useEngineStore((s) => s.setEnvRotation)
  const setSelectedEnv = useEngineStore((s) => s.setSelectedEnv)
  const addCustomEnv = useEngineStore((s) => s.addCustomEnv)
  const removeCustomEnv = useEngineStore((s) => s.removeCustomEnv)
  const setSmaaEnabled = useEngineStore((s) => s.setSmaaEnabled)
  const setShadowIntensity = useEngineStore((s) => s.setShadowIntensity)
  const setShadowSoftness = useEngineStore((s) => s.setShadowSoftness)
  const setShadowFloorEnabled = useEngineStore((s) => s.setShadowFloorEnabled)
  const setShadowOpacity = useEngineStore((s) => s.setShadowOpacity)
  const setAnisotropy = useEngineStore((s) => s.setAnisotropy)

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

  if (!visible) return null

  const handleLoadCustom = async () => {
    const result = await window.electronAPI.openEnvironmentMapDialog()
    if (!result.success || !result.filePath) return
    const fileName = result.filePath.split(/[\\/]/).pop() || result.filePath
    addCustomEnv(result.filePath, fileName)
  }

  const cachedCount = getSharedTextureCache().cacheCount()

  return (
    <div
      className="fixed z-50 w-64 rounded-lg border bg-background shadow-xl grid overflow-hidden"
      style={{ left: position.x, top: position.y, gridTemplateColumns: '100%', gridTemplateRows: 'auto 1fr', height: '80vh' }}
    >
      {/* Title bar with drag handle */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 border-b cursor-grab active:cursor-grabbing min-w-0"
        onMouseDown={onDragStart}
      >
        <GripHorizontal className="h-3 w-3 text-muted-foreground/50" />
        <span className="text-xs font-semibold flex-1 truncate">{t('toolbar.environment')}</span>
        <button
          className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted"
          onClick={togglePanel}
          aria-label="close environment panel"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-2.5 py-2.5">
        {/* {t('environment.preset')} */}
        <div className="bg-secondary-1 rounded-lg p-2.5 ring-1 ring-border space-y-2 mb-2.5">
          <span className="text-[11px] text-muted-foreground">{t('environment.preset')}</span>

          <div className="flex flex-col gap-0.5">
            {HDR_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedEnv(p.id)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
                  selectedEnv === p.id
                    ? 'bg-primary/15 text-primary'
                    : 'hover:bg-muted-foreground/10 text-foreground'
                }`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selectedEnv === p.id ? 'border-primary' : 'border-muted-foreground/35'
                  }`}
                >
                  {selectedEnv === p.id && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </span>
                {t(p.labelKey)}
              </button>
            ))}

            {customEnvs.map((env) => (
              <div
                key={env.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                  selectedEnv === env.id
                    ? 'bg-primary/15 text-primary'
                    : 'text-foreground'
                }`}
              >
                <button
                  onClick={() => setSelectedEnv(env.id)}
                  className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selectedEnv === env.id ? 'border-primary' : 'border-muted-foreground/35'
                  }`}
                >
                  {selectedEnv === env.id && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
                <button
                  onClick={() => setSelectedEnv(env.id)}
                  className="flex-1 truncate text-left"
                >
                  {env.name}
                </button>
                <button
                  onClick={() => removeCustomEnv(env.id)}
                  className="h-4 w-4 flex items-center justify-center rounded hover:bg-destructive/15 hover:text-destructive text-muted-foreground shrink-0"
                  aria-label="Remove custom environment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleLoadCustom}
            className="w-full rounded-md border border-dashed border-muted-foreground/30 px-2 py-1.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
          >
            {t('environment.loadHdr')}
          </button>

          <SliderRow
            label={t('environment.intensity')}
            value={Math.round(envIntensity * 100)}
            min={0} max={300} step={1}
            suffix="%"
            onChange={(v) => setEnvIntensity(v / 100)}
          />

          <SliderRow
            label={t('environment.rotation')}
            value={Math.round((envRotation * 180) / Math.PI)}
            min={0} max={360} step={1}
            suffix="°"
            onChange={(v) => setEnvRotation((v * Math.PI) / 180)}
          />
        </div>

        {/* Post Processing */}
        <div className="bg-secondary-2 rounded-lg p-2.5 ring-1 ring-border space-y-2 mb-2.5">
          <ToggleRow label={t('environment.smaa')} checked={smaaEnabled} onChange={setSmaaEnabled} />

          <SliderRow
            label={t('environment.shadowIntensity')}
            value={shadowIntensity}
            min={0} max={100} step={1}
            suffix="%"
            onChange={(v) => setShadowIntensity(v)}
          />

          <SliderRow
            label={t('environment.shadowSoftness')}
            value={shadowSoftness}
            min={0} max={100} step={1}
            suffix="%"
            onChange={(v) => setShadowSoftness(v)}
          />
        </div>

        {/* Shadow Floor */}
        <div className="bg-secondary-1 rounded-lg p-2.5 ring-1 ring-border space-y-2 mb-2.5">
          <ToggleRow label={t('environment.shadowFloor')} checked={shadowFloorEnabled} onChange={setShadowFloorEnabled} />

          <SliderRow
            label={t('environment.opacity')}
            value={Math.round(shadowOpacity * 100)}
            min={0} max={100} step={5}
            suffix="%"
            onChange={(v) => setShadowOpacity(v / 100)}
          />
        </div>

        {/* Texture Filtering */}
        <div className="bg-secondary-2 rounded-lg p-2.5 ring-1 ring-border space-y-2 mb-2.5">
          <SliderRow
            label={t('environment.anisotropy')}
            value={anisotropy}
            min={1} max={16} step={1}
            onChange={(v) => setAnisotropy(v)}
          />
        </div>

        {/* Texture Cache */}
        <div className="bg-secondary-1 rounded-lg p-2.5 ring-1 ring-border space-y-2 mb-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{t('environment.cachedTextures')}</span>
            <span className="text-[11px] text-foreground tabular-nums">{cachedCount}</span>
          </div>

          <button
            className="w-full rounded-md border border-destructive/40 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => getSharedTextureCache().dispose()}
          >
            {t('environment.clearTextureCache')}
          </button>
        </div>
      </div>
    </div>
  )
}
