import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useMaterialStore } from '@/stores/material-store'
import type { MaterialAppearance } from '@/engine/material/types'
import { MATERIAL_PRESETS, MATERIAL_PRESET_NAMES } from '@/engine/material/presets'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, GripHorizontal } from 'lucide-react'

// ---- helpers ----

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

// ---- sub-components ----

function SliderRow({ label, value, min, max, step, onChange, disabled }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground tabular-nums">{Math.round(value * 100) / 100}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted-foreground/20
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
          disabled:opacity-40 disabled:cursor-not-allowed"
      />
    </div>
  )
}

function ToggleRow({ label, checked, onChange, disabled }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-3.5 w-6 rounded-full transition-colors ${
          disabled ? 'opacity-40 cursor-not-allowed' : ''
        } ${checked ? 'bg-primary' : 'bg-muted-foreground/25'}`}
      >
        <span
          className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform ${
            checked ? 'left-[12px]' : 'left-[1px]'
          }`}
        />
      </button>
    </div>
  )
}

function ColorRow({ label, color, onChange, disabled }: {
  label: string
  color: [number, number, number]
  onChange: (rgb: [number, number, number]) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="color"
        value={rgbToHex(...color)}
        disabled={disabled}
        onChange={(e) => onChange(hexToRgb(e.target.value))}
        className="h-5 w-8 cursor-pointer rounded border-0 bg-transparent p-0
          disabled:opacity-40 disabled:cursor-not-allowed"
      />
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-2 first:pt-0 pb-0.5">
      {label}
    </h4>
  )
}

// ---- main component ----

export default function MaterialEditor() {
  const { t } = useTranslation()

  const visible = useMaterialStore((s) => s.materialEditorVisible)
  const position = useMaterialStore((s) => s.materialEditorPosition)
  const editingKeys = useMaterialStore((s) => s.editingOverrideKeys)
  const overrides = useMaterialStore((s) => s.materialOverrides)
  const overrideMaterial = useMaterialStore((s) => s.overrideMaterial)
  const presetRefs = useMaterialStore((s) => s.overridePresetRefs)

  const setOverride = useMaterialStore((s) => s.setMaterialOverride)
  const setOverrideBatch = useMaterialStore((s) => s.setMaterialOverrideBatch)
  const removeOverride = useMaterialStore((s) => s.removeMaterialOverride)
  const setOverrideMaterial = useMaterialStore((s) => s.setOverrideMaterial)
  const closeEditor = useMaterialStore((s) => s.closeMaterialEditor)
  const setPosition = useMaterialStore((s) => s.setMaterialEditorPosition)

  // Resolve effective appearance from the first editing key
  const primaryKey = editingKeys[0] ?? ''
  const appearance: MaterialAppearance | undefined = primaryKey ? overrides[primaryKey] : undefined
  const activePresetId = primaryKey ? (presetRefs[primaryKey] ?? null) : null

  // Build a working copy for the form (only re-init when primaryKey or override changes)
  const [draft, setDraft] = useState<MaterialAppearance>({ name: 'Custom' })
  // Track preset dropdown value separately from activePresetId
  const [presetValue, setPresetValue] = useState<string>(activePresetId ?? 'custom')

  // Sync draft when editing key changes
  const initRef = useRef<string>('')
  useEffect(() => {
    if (primaryKey !== initRef.current) {
      initRef.current = primaryKey
      const a = primaryKey ? overrides[primaryKey] : undefined
      setDraft(a ?? { name: 'Custom' })
      setPresetValue(primaryKey ? (presetRefs[primaryKey] ?? 'custom') : 'custom')
    }
  }, [primaryKey, overrides, presetRefs])

  // Apply changes to the store
  const apply = useCallback((updates: Partial<MaterialAppearance>) => {
    const next = { ...draft, ...updates }
    setDraft(next)

    // Clear preset reference when manually editing
    if (primaryKey) {
      useMaterialStore.setState((s) => ({
        overridePresetRefs: { ...s.overridePresetRefs, [primaryKey]: null },
      }))
      setPresetValue('custom')
    }

    // Apply to all editing keys
    if (editingKeys.length > 0) {
      // Parse fileId:partId from each key for the per-key setter
      for (const key of editingKeys) {
        const idx = key.indexOf(':')
        const fileId = key.slice(0, idx)
        const partId = key.slice(idx + 1)
        setOverride(fileId, partId, next)
      }
    }
  }, [draft, primaryKey, editingKeys, setOverride])

  // Preset selection
  const handlePresetChange = useCallback((presetId: string) => {
    setPresetValue(presetId)
    if (presetId === 'custom') return

    const preset = MATERIAL_PRESETS[presetId]
    if (!preset) return

    setDraft(preset)

    // Apply to all editing keys and record preset ref
    if (editingKeys.length > 0) {
      setOverrideBatch(editingKeys, preset)
      useMaterialStore.setState((s) => {
        const nextRefs = { ...s.overridePresetRefs }
        for (const key of editingKeys) {
          nextRefs[key] = presetId
        }
        return { overridePresetRefs: nextRefs }
      })
    }
  }, [editingKeys, setOverrideBatch])

  // Reset to original
  const handleReset = useCallback(() => {
    for (const key of editingKeys) {
      const idx = key.indexOf(':')
      const fileId = key.slice(0, idx)
      const partId = key.slice(idx + 1)
      removeOverride(fileId, partId)
    }
    setDraft({ name: 'Custom' })
    setPresetValue('custom')
  }, [editingKeys, removeOverride])

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

  const disabled = !overrideMaterial
  const multiEdit = editingKeys.length > 1
  const partLabel = editingKeys.length === 0
    ? ''
    : editingKeys.length === 1
      ? primaryKey.slice(primaryKey.indexOf(':') + 1)
      : `${editingKeys.length} parts`

  if (!visible) return null

  return (
    <div
      className="fixed z-50 w-64 rounded-lg border bg-background shadow-xl flex flex-col max-h-[80vh]"
      style={{ left: position.x, top: position.y }}
    >
      {/* Title bar with drag handle */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 border-b cursor-grab active:cursor-grabbing shrink-0"
        onMouseDown={onDragStart}
      >
        <GripHorizontal className="h-3 w-3 text-muted-foreground/50" />
        <span className="text-xs font-semibold flex-1 truncate">
          {multiEdit ? `${editingKeys.length} parts` : partLabel || 'Material Editor'}
        </span>
        <button
          className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted"
          onClick={closeEditor}
          aria-label="close material editor"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1 px-2.5 py-2">
        {/* Global toggle */}
        <div className="mb-2">
          <ToggleRow
            label="Override Material"
            checked={overrideMaterial}
            onChange={setOverrideMaterial}
          />
        </div>

        {/* Preset selector */}
        <div className="flex flex-col gap-0.5 mb-2">
          <span className="text-[11px] text-muted-foreground">Preset</span>
          <select
            value={presetValue}
            disabled={disabled}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="h-7 rounded-md border bg-background px-1.5 text-[11px] disabled:opacity-40"
          >
            <option value="custom">Custom</option>
            {MATERIAL_PRESET_NAMES.map((id) => {
              const p = MATERIAL_PRESETS[id]
              return (
                <option key={id} value={id}>{p.name}</option>
              )
            })}
          </select>
        </div>

        {/* Base */}
        <SectionLabel label="Base" />
        <div className="space-y-1.5 mt-1">
          <ColorRow
            label="Color"
            color={(appearance?.color ?? draft.color ?? [0.6, 0.65, 0.7]).slice(0, 3) as [number, number, number]}
            onChange={(rgb) => {
              const alpha = draft.color?.[3] ?? 1.0
              apply({ color: [rgb[0], rgb[1], rgb[2], alpha] })
            }}
            disabled={disabled}
          />
          <SliderRow
            label="Opacity"
            value={draft.color?.[3] ?? 1.0}
            min={0} max={1} step={0.01}
            onChange={(v) => {
              const c = draft.color ?? [0.6, 0.65, 0.7, 1.0]
              apply({ color: [c[0], c[1], c[2], v] })
            }}
            disabled={disabled}
          />
          <SliderRow
            label="Roughness"
            value={draft.roughness ?? 0.5}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ roughness: v })}
            disabled={disabled}
          />
          <SliderRow
            label="Metalness"
            value={draft.metalness ?? 0.0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ metalness: v })}
            disabled={disabled}
          />
        </div>

        {/* Clearcoat */}
        <SectionLabel label="Clearcoat" />
        <div className="space-y-1.5 mt-1">
          <SliderRow
            label="Clearcoat"
            value={draft.clearcoat ?? 0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ clearcoat: v })}
            disabled={disabled}
          />
          <SliderRow
            label="Clearcoat Roughness"
            value={draft.clearcoatRoughness ?? 0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ clearcoatRoughness: v })}
            disabled={disabled}
          />
        </div>

        {/* Sheen */}
        <SectionLabel label="Sheen" />
        <div className="space-y-1.5 mt-1">
          <SliderRow
            label="Sheen"
            value={draft.sheen ?? 0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ sheen: v })}
            disabled={disabled}
          />
          <ColorRow
            label="Sheen Color"
            color={draft.sheenColor ?? [1, 1, 1]}
            onChange={(rgb) => apply({ sheenColor: rgb })}
            disabled={disabled}
          />
          <SliderRow
            label="Sheen Roughness"
            value={draft.sheenRoughness ?? 0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ sheenRoughness: v })}
            disabled={disabled}
          />
        </div>

        {/* Transmission */}
        <SectionLabel label="Transmission" />
        <div className="space-y-1.5 mt-1">
          <SliderRow
            label="Transmission"
            value={draft.transmission ?? 0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ transmission: v })}
            disabled={disabled}
          />
          <SliderRow
            label="Thickness"
            value={draft.thickness ?? 0}
            min={0} max={5} step={0.1}
            onChange={(v) => apply({ thickness: v })}
            disabled={disabled}
          />
          <SliderRow
            label="IOR"
            value={draft.ior ?? 1.5}
            min={1.0} max={3.0} step={0.01}
            onChange={(v) => apply({ ior: v })}
            disabled={disabled}
          />
        </div>

        {/* Emissive */}
        <SectionLabel label="Emissive" />
        <div className="space-y-1.5 mt-1">
          <ColorRow
            label="Emissive Color"
            color={draft.emissive ?? [0, 0, 0]}
            onChange={(rgb) => apply({ emissive: rgb })}
            disabled={disabled}
          />
          <SliderRow
            label="Emissive Intensity"
            value={draft.emissiveIntensity ?? 0}
            min={0} max={5} step={0.1}
            onChange={(v) => apply({ emissiveIntensity: v })}
            disabled={disabled}
          />
        </div>

        {/* Misc */}
        <SectionLabel label="Misc" />
        <div className="space-y-1.5 mt-1 pb-1">
          <ToggleRow
            label="Double Sided"
            checked={draft.doubleSided ?? false}
            onChange={(v) => apply({ doubleSided: v })}
            disabled={disabled}
          />
          <ToggleRow
            label="Unlit"
            checked={draft.unlit ?? false}
            onChange={(v) => apply({ unlit: v })}
            disabled={disabled}
          />

          {/* Alpha mode */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Alpha Mode</span>
            <select
              value={draft.alphaMode ?? 'OPAQUE'}
              disabled={disabled}
              onChange={(e) => apply({ alphaMode: e.target.value as 'OPAQUE' | 'MASK' | 'BLEND' })}
              className="h-6 rounded border bg-background px-1 text-[11px] disabled:opacity-40"
            >
              <option value="OPAQUE">OPAQUE</option>
              <option value="MASK">MASK</option>
              <option value="BLEND">BLEND</option>
            </select>
          </div>

          {(draft.alphaMode === 'MASK') && (
            <SliderRow
              label="Alpha Cutoff"
              value={draft.alphaCutoff ?? 0.5}
              min={0} max={1} step={0.01}
              onChange={(v) => apply({ alphaCutoff: v })}
              disabled={disabled}
            />
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-2.5 py-1.5 border-t flex items-center justify-between shrink-0">
        <button
          className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors"
          onClick={handleReset}
        >
          Reset to Original
        </button>
        {multiEdit && (
          <span className="text-[11px] text-muted-foreground">{editingKeys.length} parts selected</span>
        )}
      </div>
    </div>
  )
}
