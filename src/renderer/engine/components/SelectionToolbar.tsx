import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Square, Minus, Crosshair } from 'lucide-react'
import { useToolStore, type SelectionMode } from '@/stores/tool-store'
import { useModelStore } from '@/stores/model-store'
import { useThemeColors } from '@/components/settings/useThemeColors'

interface ModeConfig {
  mode: SelectionMode
  labelKey: string
  icon: typeof Box
}

interface SelectionToolbarProps {
  hasTopology: boolean
}

export default function SelectionToolbar({ hasTopology }: SelectionToolbarProps) {
  const { t } = useTranslation()
  const selectionMode = useToolStore((s) => s.selectionMode)
  const setSelectionMode = useToolStore((s) => s.setSelectionMode)
  const partCount = useModelStore((s) => s.glbPartInfos.length)
  const colors = useThemeColors()

  const modes: ModeConfig[] = [
    { mode: 'object', labelKey: 'selection.object', icon: Box },
    { mode: 'face', labelKey: 'selection.face', icon: Square },
    { mode: 'edge', labelKey: 'selection.edge', icon: Minus },
    { mode: 'point', labelKey: 'selection.point', icon: Crosshair },
  ]

  useEffect(() => {
    if (partCount >= 2) {
      setSelectionMode('object')
    } else if (hasTopology) {
      setSelectionMode('face')
    } else {
      setSelectionMode('object')
    }
  }, [partCount, hasTopology, setSelectionMode])

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
      {modes.map(({ mode, labelKey, icon: Icon }) => {
        const isActive = selectionMode === mode
        const isDisabled = mode !== 'object' && !hasTopology

        return (
          <button
            key={mode}
            disabled={isDisabled}
            title={t(labelKey)}
            onClick={() => setSelectionMode(mode)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: 6,
              border: 'none',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              background: isActive ? '#2563eb' : 'transparent',
              color: isDisabled ? colors.textDisabled : isActive ? colors.textActive : colors.textInactive,
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
