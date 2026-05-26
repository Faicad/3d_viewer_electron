import { useState, useCallback, useRef } from 'react'
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

function SliderRow({ label, value, min, max, step, onChange, disabled, textureThumb }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  disabled?: boolean
  textureThumb?: string
}) {
  const hasTex = !!textureThumb
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-[5px]">
          <span className="text-foreground tabular-nums">
            {Math.round(value * 100) / 100}{hasTex ? ' x' : ''}
          </span>
          {hasTex && (
            <div className="w-5 h-5 shrink-0 rounded-sm overflow-hidden bg-muted">
              <img src={textureThumb} alt="" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
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

function ColorRow({ label, color, onChange, disabled, textureThumb }: {
  label: string
  color: [number, number, number]
  onChange: (rgb: [number, number, number]) => void
  disabled?: boolean
  textureThumb?: string
}) {
  const hasTex = !!textureThumb
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-[5px]">
        <input
          type="color"
          value={rgbToHex(...color)}
          disabled={disabled}
          onChange={(e) => onChange(hexToRgb(e.target.value))}
          className="h-5 w-7 cursor-pointer rounded border-0 bg-transparent p-0
            disabled:opacity-40 disabled:cursor-not-allowed"
        />
        {hasTex && (
          <div className="w-5 h-5 shrink-0 rounded-sm overflow-hidden bg-muted">
            <img src={textureThumb} alt="" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
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

type AlphaMode = 'OPAQUE' | 'MASK' | 'BLEND'

function AlphaModeSegmented({ mode, onChange, disabled }: {
  mode: AlphaMode
  onChange: (m: AlphaMode) => void
  disabled?: boolean
}) {
  const modes: { key: AlphaMode; label: string }[] = [
    { key: 'OPAQUE', label: '不透明' },
    { key: 'MASK', label: '遮罩' },
    { key: 'BLEND', label: '混合' },
  ]
  return (
    <div className="flex items-center gap-0.5 text-[10px]">
      {modes.map((m) => (
        <button
          key={m.key}
          disabled={disabled}
          onClick={() => onChange(m.key)}
          className={`px-1.5 py-0.5 rounded transition-colors ${
            disabled ? 'opacity-40 cursor-not-allowed' : ''
          } ${
            mode === m.key
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted-foreground/15'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

// ---- inner form (keyed so state resets when editing target changes) ----

interface MaterialEditorInnerProps {
  appearance: MaterialAppearance | undefined
  activePresetId: string | null
  primaryKey: string
  editingKeys: string[]
  isEditingDefault: boolean
  overrideMaterial: boolean
  disabled: boolean
  multiEdit: boolean
  title: string
  position: { x: number; y: number }
  onClose: () => void
  onPositionChange: (pos: { x: number; y: number }) => void
}

function MaterialEditorInner({
  appearance,
  activePresetId,
  primaryKey,
  editingKeys,
  isEditingDefault,
  overrideMaterial,
  disabled,
  multiEdit,
  title,
  position,
  onClose,
  onPositionChange,
}: MaterialEditorInnerProps) {
  const { t } = useTranslation()

  const setOverride = useMaterialStore((s) => s.setMaterialOverride)
  const setOverrideBatch = useMaterialStore((s) => s.setMaterialOverrideBatch)
  const removeOverride = useMaterialStore((s) => s.removeMaterialOverride)
  const setOverrideMaterial = useMaterialStore((s) => s.setOverrideMaterial)
  const setDefaultMaterial = useMaterialStore((s) => s.setDefaultMaterial)
  const viewingOriginal = useMaterialStore((s) => s.viewingOriginal)
  const toggleViewingOriginal = useMaterialStore((s) => s.toggleViewingOriginal)
  const textureThumbnails = useMaterialStore((s) => s.textureThumbnails)

  // Current part's texture thumbnails (keyed by slot name)
  const currentThumbs: Record<string, string> = primaryKey ? (textureThumbnails[primaryKey] ?? {}) : {}

  // Local form state, naturally reset when key prop changes (component remounts)
  const [draft, setDraft] = useState<MaterialAppearance>(appearance ?? { name: 'Custom' })
  const [presetValue, setPresetValue] = useState<string>(activePresetId ?? 'custom')

  // Apply changes to the store
  const apply = useCallback((updates: Partial<MaterialAppearance>) => {
    setDraft((prev) => {
      const next = { ...prev, ...updates }

      // Clear preset reference when manually editing
      if (primaryKey && !isEditingDefault) {
        useMaterialStore.setState((s) => ({
          overridePresetRefs: { ...s.overridePresetRefs, [primaryKey]: null },
        }))
        setPresetValue('custom')
      }

      if (isEditingDefault) {
        setDefaultMaterial(next)
      } else if (editingKeys.length > 0) {
        for (const key of editingKeys) {
          const idx = key.indexOf(':')
          const fileId = key.slice(0, idx)
          const partId = key.slice(idx + 1)
          setOverride(fileId, partId, next)
        }
      }
      return next
    })
  }, [primaryKey, editingKeys, setOverride, isEditingDefault, setDefaultMaterial])

  // Preset selection
  const handlePresetChange = useCallback((presetId: string) => {
    setPresetValue(presetId)
    if (presetId === 'custom') return

    const preset = MATERIAL_PRESETS[presetId]
    if (!preset) return

    setDraft(preset)

    if (isEditingDefault) {
      setDefaultMaterial(preset)
    } else if (editingKeys.length > 0) {
      setOverrideBatch(editingKeys, preset)
      useMaterialStore.setState((s) => {
        const nextRefs = { ...s.overridePresetRefs }
        for (const key of editingKeys) {
          nextRefs[key] = presetId
        }
        return { overridePresetRefs: nextRefs }
      })
    }
  }, [editingKeys, setOverrideBatch, isEditingDefault, setDefaultMaterial])

  // A/B toggle: switch between original and modified
  const handleReset = useCallback(() => {
    toggleViewingOriginal()
  }, [toggleViewingOriginal])

  // Drag
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      onPositionChange({ x: ev.clientX - dragOffset.current.x, y: ev.clientY - dragOffset.current.y })
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [position, onPositionChange])

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
        <span className="text-xs font-semibold flex-1 truncate">{title}</span>
        <button
          className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted"
          onClick={onClose}
          aria-label="close material editor"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1 px-2.5 py-2">
        {/* Preset selector */}
        <div className="flex flex-col gap-0.5 mb-2">
          <span className="text-[11px] text-muted-foreground">{t('materialEditor.preset')}</span>
          <select
            value={presetValue}
            disabled={disabled}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="h-7 rounded-md border bg-background px-1.5 text-[11px] disabled:opacity-40"
          >
            <option value="custom">{t('materialEditor.custom')}</option>
            {MATERIAL_PRESET_NAMES.map((id) => {
              const p = MATERIAL_PRESETS[id]
              return (
                <option key={id} value={id}>{p.name}</option>
              )
            })}
          </select>
        </div>

        {/* Base */}
        <SectionLabel label={t('materialEditor.base')} />
        <div className="space-y-1.5 mt-1">
          <ColorRow
            label={t('materialEditor.color')}
            color={(appearance?.color ?? draft.color ?? [0.6, 0.65, 0.7]).slice(0, 3) as [number, number, number]}
            onChange={(rgb) => {
              const alpha = draft.color?.[3] ?? 1.0
              apply({ color: [rgb[0], rgb[1], rgb[2], alpha] })
            }}
            disabled={disabled}
            textureThumb={currentThumbs['map']}
          />
          {/* Alpha mode + slider integrated */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{t('materialEditor.opacity')}</span>
              <AlphaModeSegmented
                mode={(draft.alphaMode as AlphaMode) ?? 'OPAQUE'}
                onChange={(m) => apply({ alphaMode: m })}
                disabled={disabled}
              />
            </div>
            {(draft.alphaMode === 'OPAQUE' || !draft.alphaMode) ? (
              <SliderRow
                label={t('materialEditor.opacity')}
                value={1}
                min={0} max={1} step={0.01}
                onChange={() => {}}
                disabled={true}
                textureThumb={currentThumbs['alphaMap']}
              />
            ) : draft.alphaMode === 'MASK' ? (
              <SliderRow
                label={t('materialEditor.alphaCutoff')}
                value={draft.alphaCutoff ?? 0.5}
                min={0} max={1} step={0.01}
                onChange={(v) => apply({ alphaCutoff: v })}
                disabled={disabled}
                textureThumb={currentThumbs['alphaMap']}
              />
            ) : (
              <SliderRow
                label={t('materialEditor.opacity')}
                value={draft.color?.[3] ?? 1.0}
                min={0} max={1} step={0.01}
                onChange={(v) => {
                  const c = draft.color ?? [0.6, 0.65, 0.7, 1.0]
                  apply({ color: [c[0], c[1], c[2], v] })
                }}
                disabled={disabled}
                textureThumb={currentThumbs['alphaMap']}
              />
            )}
          </div>
          <SliderRow
            label={t('materialEditor.roughness')}
            value={draft.roughness ?? 0.5}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ roughness: v })}
            disabled={disabled}
            textureThumb={currentThumbs['roughnessMap']}
          />
          <SliderRow
            label={t('materialEditor.metalness')}
            value={draft.metalness ?? 0.0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ metalness: v })}
            disabled={disabled}
            textureThumb={currentThumbs['metalnessMap']}
          />
        </div>

        {/* Clearcoat */}
        <SectionLabel label={t('materialEditor.clearcoat')} />
        <div className="space-y-1.5 mt-1">
          <SliderRow
            label={t('materialEditor.clearcoat')}
            value={draft.clearcoat ?? 0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ clearcoat: v })}
            disabled={disabled}
            textureThumb={currentThumbs['clearcoatMap']}
          />
          <SliderRow
            label={t('materialEditor.clearcoatRoughness')}
            value={draft.clearcoatRoughness ?? 0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ clearcoatRoughness: v })}
            disabled={disabled}
            textureThumb={currentThumbs['clearcoatNormalMap']}
          />
        </div>

        {/* Sheen */}
        <SectionLabel label={t('materialEditor.sheen')} />
        <div className="space-y-1.5 mt-1">
          <SliderRow
            label={t('materialEditor.sheen')}
            value={draft.sheen ?? 0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ sheen: v })}
            disabled={disabled}
          />
          <ColorRow
            label={t('materialEditor.sheenColor')}
            color={draft.sheenColor ?? [1, 1, 1]}
            onChange={(rgb) => apply({ sheenColor: rgb })}
            disabled={disabled}
          />
          <SliderRow
            label={t('materialEditor.sheenRoughness')}
            value={draft.sheenRoughness ?? 0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ sheenRoughness: v })}
            disabled={disabled}
          />
        </div>

        {/* Transmission */}
        <SectionLabel label={t('materialEditor.transmission')} />
        <div className="space-y-1.5 mt-1">
          <SliderRow
            label={t('materialEditor.transmission')}
            value={draft.transmission ?? 0}
            min={0} max={1} step={0.01}
            onChange={(v) => apply({ transmission: v })}
            disabled={disabled}
            textureThumb={currentThumbs['transmissionMap']}
          />
          <SliderRow
            label={t('materialEditor.thickness')}
            value={draft.thickness ?? 0}
            min={0} max={5} step={0.1}
            onChange={(v) => apply({ thickness: v })}
            disabled={disabled}
            textureThumb={currentThumbs['thicknessMap']}
          />
          <SliderRow
            label={t('materialEditor.ior')}
            value={draft.ior ?? 1.5}
            min={1.0} max={3.0} step={0.01}
            onChange={(v) => apply({ ior: v })}
            disabled={disabled}
          />
        </div>

        {/* Emissive */}
        <SectionLabel label={t('materialEditor.emissive')} />
        <div className="space-y-1.5 mt-1">
          <ColorRow
            label={t('materialEditor.emissiveColor')}
            color={draft.emissive ?? [0, 0, 0]}
            onChange={(rgb) => apply({ emissive: rgb })}
            disabled={disabled}
            textureThumb={currentThumbs['emissiveMap']}
          />
          <SliderRow
            label={t('materialEditor.emissiveIntensity')}
            value={draft.emissiveIntensity ?? 0}
            min={0} max={5} step={0.1}
            onChange={(v) => apply({ emissiveIntensity: v })}
            disabled={disabled}
            textureThumb={currentThumbs['emissiveMap']}
          />
        </div>

        {/* Misc */}
        <SectionLabel label={t('materialEditor.misc')} />
        <div className="space-y-1.5 mt-1 pb-1">
          <ToggleRow
            label={t('materialEditor.doubleSided')}
            checked={draft.doubleSided ?? false}
            onChange={(v) => apply({ doubleSided: v })}
            disabled={disabled}
          />
          <ToggleRow
            label={t('materialEditor.unlit')}
            checked={draft.unlit ?? false}
            onChange={(v) => apply({ unlit: v })}
            disabled={disabled}
          />

        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-2.5 py-1.5 border-t flex items-center justify-between shrink-0">
        <button
          className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleReset}
          disabled={disabled}
        >
          {viewingOriginal ? t('materialEditor.restoreModified') : t('materialEditor.restoreOriginal')}
        </button>
        {multiEdit && (
          <span className="text-[11px] text-muted-foreground">
            {t('materialEditor.partsSelected_other', { count: editingKeys.length })}
          </span>
        )}
      </div>
    </div>
  )
}

// ---- outer component (reads store, passes props to keyed inner form) ----

export default function MaterialEditor() {
  const { t } = useTranslation()
  const visible = useMaterialStore((s) => s.materialEditorVisible)
  const position = useMaterialStore((s) => s.materialEditorPosition)
  const editingKeys = useMaterialStore((s) => s.editingOverrideKeys)
  const overrides = useMaterialStore((s) => s.materialOverrides)
  const overrideMaterial = useMaterialStore((s) => s.overrideMaterial)
  const presetRefs = useMaterialStore((s) => s.overridePresetRefs)
  const materialOriginals = useMaterialStore((s) => s.materialOriginals)
  const editorTitle = useMaterialStore((s) => s.materialEditorTitle)
  const isEditingDefault = useMaterialStore((s) => s.isEditingDefault)
  const defaultMaterial = useMaterialStore((s) => s.defaultMaterial)

  const closeEditor = useMaterialStore((s) => s.closeMaterialEditor)
  const setPosition = useMaterialStore((s) => s.setMaterialEditorPosition)

  if (!visible) return null

  // Resolve effective appearance from the first editing key (or default material)
  const primaryKey = editingKeys[0] ?? ''
  const appearance: MaterialAppearance | undefined = isEditingDefault
    ? (defaultMaterial ?? undefined)
    : primaryKey ? (overrides[primaryKey] ?? materialOriginals[primaryKey]) : undefined
  const activePresetId = primaryKey ? (presetRefs[primaryKey] ?? null) : null

  const disabled = !overrideMaterial
  const multiEdit = editingKeys.length > 1
  const title = isEditingDefault
    ? t('materialEditor.defaultMaterial')
    : editorTitle || t('materialEditor.defaultMaterial')

  // Build a stable key for remounting the inner form when editing target changes
  const editorKey = isEditingDefault ? '__default__' : primaryKey || '__empty__'

  return (
    <MaterialEditorInner
      key={editorKey}
      appearance={appearance}
      activePresetId={activePresetId}
      primaryKey={primaryKey}
      editingKeys={editingKeys}
      isEditingDefault={isEditingDefault}
      overrideMaterial={overrideMaterial}
      disabled={disabled}
      multiEdit={multiEdit}
      title={title}
      position={position}
      onClose={closeEditor}
      onPositionChange={setPosition}
    />
  )
}
