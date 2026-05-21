import { useMemo } from 'react'
import { useUIStore } from '@/stores/ui-store'

interface ThemeColors {
  cubeColor: string
  cubeEdgeColor: string
  labelColor: string
  labelHoverColor: string
  resetBtnBg: string
  resetBtnBorder: string
  axisXColor: string
  axisYColor: string
  axisZColor: string
  originColor: string
  labelTextColor: string
  toolbarBg: string
  textActive: string
  textInactive: string
  textDisabled: string
}

function getSystemDark(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return false
}

export function useThemeColors(): ThemeColors {
  const theme = useUIStore((s) => s.theme)

  return useMemo(() => {
    const isDark = theme === 'system' ? getSystemDark() : theme === 'dark'

    return {
      cubeColor: isDark ? '#3d5566' : '#a8c8d8',
      cubeEdgeColor: isDark ? '#5a6a7a' : '#7a9aaa',
      labelColor: isDark ? '#ccd8e0' : '#2a3a4a',
      labelHoverColor: isDark ? '#2dd4bf' : '#0a8a8a',
      resetBtnBg: isDark ? 'rgba(45,55,65,0.9)' : 'rgba(240,244,246,0.95)',
      resetBtnBorder: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',

      axisXColor: isDark ? '#ff6666' : '#dd4444',
      axisYColor: isDark ? '#66ff66' : '#44aa44',
      axisZColor: isDark ? '#6688ff' : '#4466dd',
      originColor: isDark ? '#ccd8e0' : '#556677',
      labelTextColor: isDark ? '#ccd8e0' : '#334455',

      toolbarBg: isDark ? 'rgba(35,45,55,0.85)' : 'rgba(235,240,244,0.9)',
      textActive: '#ffffff',
      textInactive: isDark ? '#7a8a9a' : '#6a7a8a',
      textDisabled: isDark ? '#445566' : '#aab8c4',
    }
  }, [theme])
}