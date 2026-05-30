import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Square, Minus, Crosshair } from 'lucide-react'
import { useToolStore, type SelectionMode } from '@/stores/tool-store'
import { useThemeColors } from '@/components/settings/useThemeColors'

interface ModeConfig {
  mode: SelectionMode
  labelKey: string
  icon: typeof Box
}

interface SelectionToolbarProps {
  hasTopology: boolean
  hasEdges: boolean
}

export default function SelectionToolbar({ hasTopology, hasEdges }: SelectionToolbarProps) {
  const { t } = useTranslation()
  const selectionMode = useToolStore((s) => s.selectionMode)
  const setSelectionMode = useToolStore((s) => s.setSelectionMode)
  const colors = useThemeColors()

  const allModes: ModeConfig[] = useMemo(() => [
    { mode: 'object', labelKey: 'selection.object', icon: Box },
    ...(hasTopology ? [
      { mode: 'face', labelKey: 'selection.face', icon: Square } as const,
    ] : []),
    ...(hasEdges ? [
      { mode: 'edge', labelKey: 'selection.edge', icon: Minus } as const,
      { mode: 'point', labelKey: 'selection.point', icon: Crosshair } as const,
    ] : []),
  ], [hasTopology, hasEdges])

  // Degradation protection: if the current mode becomes unavailable (data
  // disappeared), fall back to 'object' — never auto-switch forward.
  useEffect(() => {
    const currentMode = useToolStore.getState().selectionMode
    if (!hasEdges && (currentMode === 'edge' || currentMode === 'point')) {
      setSelectionMode('object')
    }
    if (!hasTopology && currentMode === 'face') {
      setSelectionMode('object')
    }
  }, [hasTopology, hasEdges, setSelectionMode])

  // Hide toolbar when only object mode is available (nothing to switch)
  if (allModes.length <= 1) return null

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: '4px',
        borderRadius: 8,
        background: colors.toolbarBg,
        backdropFilter: 'blur(8px)',
      }}
    >
      {allModes.map(({ mode, labelKey, icon: Icon }) => {
        const isActive = selectionMode === mode

        return (
          <button
            key={mode}
            title={t(labelKey)}
            onClick={() => setSelectionMode(mode)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: isActive ? '#2563eb' : 'transparent',
              color: isActive ? colors.textActive : colors.textInactive,
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <Icon size={14} />
            <span>{t(labelKey)}</span>
          </button>
        )
      })}
    </div>
  )
}
