import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/components/settings/useThemeColors'

export type DisplayMode = 'solid' | 'mesh' | 'solidWithMesh' | 'wireframe' | 'debug'

interface DisplayModeDropdownProps {
  displayMode: DisplayMode
  onChange: (mode: DisplayMode) => void
  hasTopology: boolean
}

export default function DisplayModeDropdown({ displayMode, onChange, hasTopology }: DisplayModeDropdownProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderRadius: 8,
        background: colors.toolbarBg,
        backdropFilter: 'blur(8px)',
      }}
    >
      <select
        value={displayMode}
        onChange={(e) => onChange(e.target.value as DisplayMode)}
        style={{
          background: 'transparent',
          color: colors.textInactive,
          border: 'none',
          fontSize: 12,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="solid">{t('display.solid')}</option>
        {hasTopology && <option value="wireframe">{t('display.wireframe')}</option>}
        {hasTopology && <option value="solidWithWireframe">{t('display.solidWithWireframe')}</option>}
        <option value="mesh">{t('display.mesh')}</option>
        <option value="solidWithMesh">{t('display.solidMesh')}</option>
        {hasTopology && <option value="debug">{t('display.debug')}</option>}
      </select>
    </div>
  )
}
