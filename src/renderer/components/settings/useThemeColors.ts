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
      cubeColor: isDark ? '#445566' : '#9ab5c5',
      cubeEdgeColor: isDark ? '#666666' : '#7a8fa0',
      labelColor: isDark ? '#cccccc' : '#2d3a4a',
      labelHoverColor: isDark ? '#ffcc33' : '#e6a700',
      resetBtnBg: isDark ? 'rgba(80,80,80,0.9)' : 'rgba(240,240,240,0.95)',
      resetBtnBorder: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',

      axisXColor: isDark ? '#ff6666' : '#dd4444',
      axisYColor: isDark ? '#66ff66' : '#44aa44',
      axisZColor: isDark ? '#6699ff' : '#4477dd',
      originColor: isDark ? '#cccccc' : '#555555',
      labelTextColor: isDark ? '#cccccc' : '#333333',

      toolbarBg: isDark ? 'rgba(40,40,40,0.85)' : 'rgba(240,240,240,0.9)',
      textActive: '#ffffff',
      textInactive: isDark ? '#888888' : '#666666',
      textDisabled: isDark ? '#444444' : '#aaaaaa',
    }
  }, [theme])
}