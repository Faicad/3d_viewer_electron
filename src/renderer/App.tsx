import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useThemeSync, useLanguageSync } from '@/components/settings/hooks'
import { useEngineStore } from '@/stores/engine-store'
import DesktopLayout from '@/layouts/DesktopLayout'

export default function App() {
  useThemeSync()
  useLanguageSync()

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(window.location.hash.indexOf('?') + 1))
    const autoRotate = params.get('autoRotate')
    if (autoRotate === '0' || autoRotate === 'false') {
      useEngineStore.getState().setAutoRotate(false)
    } else if (autoRotate === '1' || autoRotate === 'true') {
      useEngineStore.getState().setAutoRotate(true)
    }
    const shadowFloorEnabled = params.get('shadowFloorEnabled')
    if (shadowFloorEnabled === '0' || shadowFloorEnabled === 'false') {
      useEngineStore.getState().setShadowFloorEnabled(false)
    } else if (shadowFloorEnabled === '1' || shadowFloorEnabled === 'true') {
      useEngineStore.getState().setShadowFloorEnabled(true)
    }
    const movieMode = params.get('movie_mode')
    if (movieMode === '1') {
      useEngineStore.getState().setMovieMode(true)
      useEngineStore.getState().setControlsEnabled(false)
    }
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/workspace" replace />} />
      <Route path="/workspace" element={<DesktopLayout />} />
      <Route path="/workspace/:projectId" element={<DesktopLayout />} />
    </Routes>
  )
}
