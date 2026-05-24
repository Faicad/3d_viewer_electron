import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCrossSectionStore } from '@/stores/cross-section-store'
import { X, Scissors } from 'lucide-react'

const PLANE_LABELS: Record<string, string> = { x: 'X', y: 'Y', z: 'Z' }
const PLANE_COLORS: Record<string, string> = {
  x: '#ff4444',
  y: '#44ff44',
  z: '#4488ff',
}

export default function CrossSectionPanel() {
  const { t } = useTranslation()
  const panelOpen = useCrossSectionStore((s) => s.panelOpen)
  const setPanelOpen = useCrossSectionStore((s) => s.setPanelOpen)
  const planeX = useCrossSectionStore((s) => s.planeX)
  const planeY = useCrossSectionStore((s) => s.planeY)
  const planeZ = useCrossSectionStore((s) => s.planeZ)
  const setPlanePosition = useCrossSectionStore((s) => s.setPlanePosition)
  const showClipPlane = useCrossSectionStore((s) => s.showClipPlane)
  const setShowClipPlane = useCrossSectionStore((s) => s.setShowClipPlane)
  const useObjectColor = useCrossSectionStore((s) => s.useObjectColor)
  const setUseObjectColor = useCrossSectionStore((s) => s.setUseObjectColor)

  // Initial position: top-right, 20px below toolbar (40px) + 20px gap = top:60px, right:20px
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const posStart = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    posStart.current = { ...offset }
    e.preventDefault()
  }, [offset])

  useEffect(() => {
    if (!panelOpen) return
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setOffset({
        x: posStart.current.x + (e.clientX - dragStart.current.x),
        y: posStart.current.y + (e.clientY - dragStart.current.y),
      })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [panelOpen])

  if (!panelOpen) return null

  return (
    <div
      className="absolute z-50 shadow-xl rounded-lg border bg-background/95 backdrop-blur-sm select-none"
      style={{
        right: 20 - offset.x,
        top: 60 + offset.y,
        width: 220,
      }}
    >
      {/* Header — drag handle */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5 cursor-move border-b"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-1.5">
          <Scissors className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground">
            {t('crossSection.title')}
          </span>
        </div>
        <button
          className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted"
          onClick={() => setPanelOpen(false)}
          aria-label="close"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Sliders + config */}
      <div className="px-2.5 py-2 space-y-2">
        {(['x', 'y', 'z'] as const).map((axis) => {
          const state = axis === 'x' ? planeX : axis === 'y' ? planeY : planeZ
          return (
            <div key={axis} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: PLANE_COLORS[axis] }}
              />
              <span className="text-[10px] font-medium w-3">{PLANE_LABELS[axis]}</span>
              <input
                type="range"
                min={0} max={100} step={1}
                value={state.position}
                onChange={(e) => setPlanePosition(axis, Number(e.target.value))}
                className="flex-1 h-1 cursor-pointer appearance-none rounded-full bg-muted-foreground/20
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
              />
              <span className="text-[10px] text-muted-foreground w-7 text-right tabular-nums">
                {state.position}%
              </span>
            </div>
          )
        })}

        <div className="border-t pt-1.5 space-y-1">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showClipPlane}
              onChange={(e) => setShowClipPlane(e.target.checked)}
              className="h-3 w-3 rounded cursor-pointer"
            />
            <span className="text-[10px] text-muted-foreground">{t('crossSection.showClipPlane')}</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={useObjectColor}
              onChange={(e) => setUseObjectColor(e.target.checked)}
              className="h-3 w-3 rounded cursor-pointer"
            />
            <span className="text-[10px] text-muted-foreground">{t('crossSection.useObjectColor')}</span>
          </label>
        </div>
      </div>
    </div>
  )
}
