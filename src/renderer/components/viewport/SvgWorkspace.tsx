import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useSvgWorkspaceStore } from '@/stores/svg-workspace-store'
import { applyLayerVisibility } from '@/stores/svg-workspace-store'
import { useUIStore } from '@/stores/ui-store'

export default function SvgWorkspace() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const files = useSvgWorkspaceStore((s) => s.files)
  const selectedFileId = useSvgWorkspaceStore((s) => s.selectedFileId)
  const selectFile = useSvgWorkspaceStore((s) => s.selectFile)
  const moveFile = useSvgWorkspaceStore((s) => s.moveFile)
  const setCanvasSize = useSvgWorkspaceStore((s) => s.setCanvasSize)
  const relayoutGrid = useSvgWorkspaceStore((s) => s.relayoutGrid)
  const zoomFile = useSvgWorkspaceStore((s) => s.zoomFile)
  const theme = useUIStore((s) => s.theme)

  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map())
  const blobUrls = useRef<Map<string, string>>(new Map())
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 })
  const [dragging, setDragging] = useState(false)

  // Theme-aware background
  const bgColor = useMemo(() => {
    const isDark = theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : theme === 'dark'
    return isDark ? '#1a1a2e' : '#eef0f3'
  }, [theme])

  const labelColor = useMemo(() => {
    const isDark = theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : theme === 'dark'
    return isDark ? '#aaa' : '#555'
  }, [theme])

  // ---- Load SVG images, rebuild when layer visibility changes ----
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    const currentImages = imagesRef.current
    const newImages = new Map<string, HTMLImageElement>()
    let pending = 0

    for (const file of files) {
      const cacheKey = `${file.fileId}:${file.layers.map((l) => (l.visible ? '1' : '0')).join('')}`

      if (currentImages.has(cacheKey)) {
        newImages.set(cacheKey, currentImages.get(cacheKey)!)
        continue
      }

      // Build visible SVG
      const visibleSvg = applyLayerVisibility(file.svgText, file.layers)
      const blob = new Blob([visibleSvg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)

      // Clean old blob URL for this file
      const oldUrl = blobUrls.current.get(file.fileId)
      if (oldUrl) URL.revokeObjectURL(oldUrl)
      blobUrls.current.set(file.fileId, url)

      const img = new Image()
      pending++
      img.onload = () => {
        pending--
        newImages.set(cacheKey, img)
        if (pending <= 0) {
          imagesRef.current = new Map(newImages)
          setImages(new Map(newImages))
        }
      }
      img.onerror = () => {
        pending--
        if (pending <= 0) {
          imagesRef.current = new Map(newImages)
          setImages(new Map(newImages))
        }
      }
      img.src = url
    }

    if (pending === 0) {
      imagesRef.current = new Map(newImages)
      setImages(newImages)
    }
  }, [files])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of blobUrls.current.values()) {
        URL.revokeObjectURL(url)
      }
      blobUrls.current.clear()
    }
  }, [])

  // ---- ResizeObserver ----
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      const w = Math.round(width)
      const h = Math.round(height)
      setContainerSize({ w, h })
      setCanvasSize(w, h)
      relayoutGrid()
    })

    obs.observe(container)
    return () => obs.disconnect()
  }, [setCanvasSize, relayoutGrid])

  // ---- Render ----
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = containerSize.w * dpr
    canvas.height = containerSize.h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Background
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, containerSize.w, containerSize.h)

    // Draw each file — selected last (on top)
    const sorted = [...files].sort((a, b) => {
      if (a.fileId === selectedFileId) return 1
      if (b.fileId === selectedFileId) return -1
      return 0
    })
    for (const file of sorted) {
      if (!file.visible) continue
      let img: HTMLImageElement | null = null
      // Find cached image by cache key
      const cacheKey = `${file.fileId}:${file.layers.map((l) => (l.visible ? '1' : '0')).join('')}`
      const found = images.get(cacheKey)
      // Also try with different keys (the key format may differ from the loading effect)
      if (found) {
        img = found
      } else {
        // Fallback: try to find any image for this fileId
        for (const [key, value] of images) {
          if (key.startsWith(file.fileId + ':')) {
            img = value
            break
          }
        }
      }

      if (!img || img.width === 0) continue

      const imgW = img.width * file.scale * file.zoom
      const imgH = img.height * file.scale * file.zoom
      const px = file.x
      const py = file.y
      const isSelected = file.fileId === selectedFileId

      ctx.save()
      ctx.translate(px, py)

      // White background mat (SVGs may have transparency)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(-imgW / 2 - 2, -imgH / 2 - 2, imgW + 4, imgH + 4)

      // Selection shadow
      if (isSelected) {
        ctx.shadowColor = 'rgba(37, 99, 235, 0.35)'
        ctx.shadowBlur = 16
      }

      // Draw SVG
      ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH)

      // Selection border
      if (isSelected) {
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 1
        ctx.setLineDash([])
        ctx.strokeRect(-imgW / 2 - 4, -imgH / 2 - 4, imgW + 8, imgH + 8)
      }
      ctx.restore()

      // File name label
      const labelY = py + imgH / 2 + 8
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const textW = ctx.measureText(file.fileName).width

      if (isSelected) {
        const lx = px - textW / 2 - 6
        const ly = labelY - 1
        ctx.fillStyle = '#2563eb'
        ctx.beginPath()
        ctx.roundRect(lx, ly, textW + 12, 18, 4)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
      } else {
        ctx.fillStyle = labelColor
      }
      ctx.fillText(file.fileName, px, labelY)
    }
  }, [files, selectedFileId, images, containerSize, bgColor, labelColor])

  useEffect(() => {
    render()
  }, [render])

  // ---- Interaction: hit test ----
  const hitTest = useCallback(
    (mx: number, my: number) => {
      // Reverse traversal for z-order (last = top)
      for (let i = files.length - 1; i >= 0; i--) {
        const file = files[i]
        if (!file.visible) continue
        let img: HTMLImageElement | null = null
        for (const [key, value] of images) {
          if (key.startsWith(file.fileId + ':')) {
            img = value
            break
          }
        }
        if (!img || img.width === 0) continue

        const imgW = img.width * file.scale * file.zoom
        const imgH = img.height * file.scale * file.zoom
        const left = file.x - imgW / 2
        const top = file.y - imgH / 2
        const totalH = imgH + 18

        if (mx >= left && mx <= left + imgW && my >= top && my <= top + totalH) {
          return file
        }
      }
      return null
    },
    [files, images],
  )

  // ---- Drag state ----
  const dragRef = useRef<{
    fileId: string
    startX: number
    startY: number
    origFileX: number
    origFileY: number
  } | null>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const target = hitTest(mx, my)
      if (target) {
        selectFile(target.fileId)
        setDragging(true)
        dragRef.current = {
          fileId: target.fileId,
          startX: e.clientX,
          startY: e.clientY,
          origFileX: target.x,
          origFileY: target.y,
        }
      } else {
        selectFile(null)
      }
    },
    [hitTest, selectFile],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      moveFile(dragRef.current.fileId, dragRef.current.origFileX + dx, dragRef.current.origFileY + dy)
    },
    [moveFile],
  )

  const handleMouseUp = useCallback(() => {
    dragRef.current = null
    setDragging(false)
  }, [])

  // ---- Wheel zoom (selected file only) ----
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!selectedFileId) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.08 : 0.92
      zoomFile(selectedFileId, factor)
    },
    [selectedFileId, zoomFile],
  )

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: dragging ? 'grabbing' : 'default',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
    </div>
  )
}
