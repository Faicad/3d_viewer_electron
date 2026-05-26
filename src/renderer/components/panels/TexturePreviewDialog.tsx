import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface TexturePreviewDialogProps {
  visible: boolean
  onClose: () => void
  textureSrc: string
  slotName: string
  pbrName: string
  onSwapImage: (slot: string, dataUri: string) => void
  checkerEnabled: boolean
  onCheckerToggle: (enabled: boolean) => void
  checkerDisabled: boolean
}

const MIN_WIDTH = 320
const MIN_HEIGHT = 300
const INITIAL_WIDTH = 520
const INITIAL_HEIGHT = 480

export default function TexturePreviewDialog({
  visible,
  onClose,
  textureSrc,
  slotName,
  pbrName,
  onSwapImage,
  checkerEnabled,
  onCheckerToggle,
  checkerDisabled,
}: TexturePreviewDialogProps) {
  const { t } = useTranslation()

  const [size, setSize] = useState({ width: INITIAL_WIDTH, height: INITIAL_HEIGHT })
  const [position, setPosition] = useState(() => ({
    x: Math.max(0, (window.innerWidth - INITIAL_WIDTH) / 2),
    y: Math.max(0, (window.innerHeight - INITIAL_HEIGHT) / 2),
  }))

  const dragRef = useRef({ dragging: false, offsetX: 0, offsetY: 0 })
  const resizeRef = useRef({ resizing: false, startX: 0, startY: 0, startW: 0, startH: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevSlotRef = useRef(slotName)

  // Reset checkerboard when switching slots (reusing same dialog instance)
  useEffect(() => {
    if (prevSlotRef.current !== slotName && checkerEnabled) {
      onCheckerToggle(false)
    }
    prevSlotRef.current = slotName
  }, [slotName, checkerEnabled, onCheckerToggle])

  // Escape key
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visible, onClose])

  // Title bar drag
  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { dragging: true, offsetX: e.clientX - position.x, offsetY: e.clientY - position.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.dragging) return
      setPosition({
        x: Math.max(-MIN_WIDTH + 60, Math.min(window.innerWidth - 40, ev.clientX - dragRef.current.offsetX)),
        y: Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dragRef.current.offsetY)),
      })
    }
    const onUp = () => {
      dragRef.current.dragging = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [position])

  // Resize handle
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { resizing: true, startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height }
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current.resizing) return
      const r = resizeRef.current
      setSize({
        width: Math.max(MIN_WIDTH, r.startW + ev.clientX - r.startX),
        height: Math.max(MIN_HEIGHT, r.startH + ev.clientY - r.startY),
      })
    }
    const onUp = () => {
      resizeRef.current.resizing = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [size])

  // Swap image via hidden file input
  const handleSwapClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUri = reader.result as string
      onSwapImage(slotName, dataUri)
      // Swap cancels checkerboard
      onCheckerToggle(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [onSwapImage, slotName, onCheckerToggle])

  if (!visible) return null

  const title = `${pbrName} → ${slotName}`
  const isDisabled = checkerDisabled

  return createPortal(
    <div
      className="fixed z-[100] rounded-lg border bg-background shadow-xl flex flex-col overflow-hidden"
      style={{ left: position.x, top: position.y, width: size.width, height: size.height }}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 border-b cursor-grab active:cursor-grabbing shrink-0 select-none"
        onMouseDown={onTitleMouseDown}
      >
        <span className="text-xs font-semibold flex-1 truncate">{title}</span>
        <button
          className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted shrink-0"
          onClick={onClose}
          aria-label="close texture preview"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content area — texture image */}
      <div className="flex-1 flex items-center justify-center bg-muted/20 overflow-hidden">
        {textureSrc ? (
          <img
            src={textureSrc}
            alt={slotName}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <span className="text-xs text-muted-foreground">{t('uv.noTexture')}</span>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-t shrink-0">
        <label className={`flex items-center gap-1.5 text-xs select-none ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={checkerEnabled}
            disabled={isDisabled}
            onChange={(e) => onCheckerToggle(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          {t('uv.checkerboard')}
        </label>
        <button
          className="ml-auto rounded px-2.5 py-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={isDisabled}
          onClick={handleSwapClick}
        >
          {t('uv.swapImage')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Resize handle */}
      <div
        className="absolute right-0 bottom-0 w-3 h-3 cursor-se-resize"
        onMouseDown={onResizeMouseDown}
      />
    </div>,
    document.body,
  )
}
