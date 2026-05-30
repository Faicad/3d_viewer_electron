import { create } from 'zustand'
import type { SvgLayer } from '@/stores/model-store'

// ---- constants ----

const GRID_PADDING = 24
const GRID_GAP = 16
const MIN_CELL_SIZE = 200

// ---- types ----

export type SvgPlacement = 'grid' | 'free'

export interface SvgWorkspaceFile {
  fileId: string
  fileName: string
  svgText: string
  layers: SvgLayer[]
  x: number
  y: number
  scale: number
  zoom: number
  placement: SvgPlacement
  visible: boolean
  naturalWidth: number
  naturalHeight: number
}

interface SvgWorkspaceState {
  files: SvgWorkspaceFile[]
  selectedFileId: string | null
  canvasWidth: number
  canvasHeight: number

  addFilesBatch: (files: { fileId: string; fileName: string; svgText: string; layers: SvgLayer[]; naturalWidth: number; naturalHeight: number }[]) => void
  toggleFile: (fileId: string, fileName: string, svgText: string, layers: SvgLayer[], naturalWidth: number, naturalHeight: number) => void
  removeFile: (fileId: string) => void
  selectFile: (fileId: string | null) => void
  moveFile: (fileId: string, x: number, y: number) => void
  toggleLayer: (fileId: string, layerId: string) => void
  toggleFileVisible: (fileId: string) => void
  relayoutGrid: () => void
  setCanvasSize: (w: number, h: number) => void
  zoomFile: (fileId: string, factor: number) => void
}

// ---- helpers ----

/** Parse viewBox="minX minY width height" to extract natural dimensions. */
export function parseSvgViewBox(svgText: string): { naturalWidth: number; naturalHeight: number } {
  const m = svgText.match(/viewBox\s*=\s*["']([^"']+)["']/)
  if (m) {
    const parts = m[1].split(/\s+/)
    const w = parseFloat(parts[2])
    const h = parseFloat(parts[3])
    if (w > 0 && h > 0) return { naturalWidth: w, naturalHeight: h }
  }
  // Fallback: try width/height attributes
  const wm = svgText.match(/width\s*=\s*["'](\d+)["']/)
  const hm = svgText.match(/height\s*=\s*["'](\d+)["']/)
  return {
    naturalWidth: wm ? parseFloat(wm[1]) : 800,
    naturalHeight: hm ? parseFloat(hm[1]) : 600,
  }
}

/** Extract top-level <g> elements as layers. */
export function parseSvgLayers(svgText: string): SvgLayer[] {
  // Regex-based extraction (works in Node.js without DOMParser)
  // Find top-level <g> elements by tracking nesting depth
  const layers: SvgLayer[] = []
  let depth = 0
  let gIndex = 0

  // Simple state-machine parser for top-level <g>
  const tagRegex = /<\/?(\w+)[^>]*\/?>|<!--.*?-->|<!\[CDATA\[[\s\S]*?\]\]>/gi
  let match: RegExpExecArray | null
  let currentG: { id: string; name: string; style: string } | null = null

  while ((match = tagRegex.exec(svgText)) !== null) {
    const full = match[0]
    if (full.startsWith('<!--') || full.startsWith('<![')) continue

    const isClosing = full.startsWith('</')
    const isSelfClosing = full.endsWith('/>') && !isClosing
    const tagName = isClosing
      ? match[1].toLowerCase()
      : full.slice(1).split(/\s|>/)[0].toLowerCase()

    if (isSelfClosing) continue

    if (tagName === 'g' && !isClosing) {
      depth++
      if (depth === 1) {
        // Top-level <g> — extract attributes
        const id = (full.match(/id\s*=\s*["']([^"']*)["']/) || [])[1] || `layer-${gIndex}`
        const inkscapeLabel = (full.match(/inkscape:label\s*=\s*["']([^"']*)["']/) || [])[1]
        const dataName = (full.match(/data-name\s*=\s*["']([^"']*)["']/) || [])[1]
        const style = (full.match(/style\s*=\s*["']([^"']*)["']/) || [])[1] || ''
        currentG = {
          id,
          name: inkscapeLabel || dataName || id || `Layer ${gIndex + 1}`,
          style,
        }
      }
    } else if (tagName === 'g' && isClosing) {
      depth--
      if (depth === 0 && currentG) {
        const hidden = /display\s*:\s*none/.test(currentG.style)
        layers.push({
          id: currentG.id,
          name: currentG.name,
          visible: !hidden,
          elementIndex: gIndex,
        })
        gIndex++
        currentG = null
      }
    }
  }

  if (layers.length === 0) {
    return [{ id: 'layer-0', name: 'Layer 1', visible: true, elementIndex: 0 }]
  }

  return layers
}

/** Apply layer visibility by adding/removing display:none on <g> elements. */
export function applyLayerVisibility(svgText: string, layers: SvgLayer[]): string {
  // If all layers visible, return unchanged
  if (layers.every((l) => l.visible)) return svgText

  const hiddenIds = new Set(layers.filter((l) => !l.visible).map((l) => l.id))

  // Regex-based approach: add display:none to hidden <g> elements
  // Matches <g ... > that contain an id matching a hidden layer
  return svgText.replace(
    /(<g\b[^>]*?\bid\s*=\s*["']([^"']*)["'][^>]*)(>)/gi,
    (full, beforeId, id, close) => {
      if (hiddenIds.has(id)) {
        // Add display:none if not already present
        if (!/display\s*:\s*none/.test(beforeId)) {
          return beforeId + ' style="display:none"' + close
        }
      }
      return full
    },
  )
}

// ---- grid layout ----

function calcFitScale(natW: number, natH: number, maxW: number, maxH: number): number {
  if (natW === 0 || natH === 0) return 1
  return Math.min(maxW / natW, maxH / natH, 1)
}

function layoutAsGrid(files: SvgWorkspaceFile[], canvasW: number, canvasH: number): void {
  const n = files.length
  if (n === 0) return

  if (canvasW <= 0 || canvasH <= 0) return

  const aspect = canvasW / canvasH
  let cols = Math.max(1, Math.round(Math.sqrt(n * aspect)))

  const cellW = (canvasW - GRID_GAP * (cols + 1)) / cols
  if (cellW < MIN_CELL_SIZE) {
    cols = Math.max(1, Math.floor((canvasW - GRID_GAP) / (MIN_CELL_SIZE + GRID_GAP)))
  }

  const finalCellW = (canvasW - GRID_GAP * (cols + 1)) / cols
  const rows = Math.ceil(n / cols)
  const finalCellH = (canvasH - GRID_GAP * (rows + 1)) / Math.max(rows, 1)

  for (let i = 0; i < files.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    files[i].x = GRID_GAP + col * (finalCellW + GRID_GAP) + finalCellW / 2
    files[i].y = GRID_GAP + row * (finalCellH + GRID_GAP) + finalCellH / 2
    files[i].scale = calcFitScale(
      files[i].naturalWidth, files[i].naturalHeight,
      finalCellW - GRID_PADDING * 2,
      finalCellH - GRID_PADDING * 2 - 20,
    )
    files[i].placement = 'grid'
  }
}

// ---- store ----

export const useSvgWorkspaceStore = create<SvgWorkspaceState>()((set, get) => ({
  files: [],
  selectedFileId: null,
  canvasWidth: 800,
  canvasHeight: 600,

  addFilesBatch: (incoming) => {
    const files: SvgWorkspaceFile[] = incoming.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      svgText: f.svgText,
      layers: f.layers,
      x: 0,
      y: 0,
      scale: 1,
      zoom: 1,
      placement: 'grid' as SvgPlacement,
      visible: true,
      naturalWidth: f.naturalWidth,
      naturalHeight: f.naturalHeight,
    }))

    const { canvasWidth, canvasHeight } = get()
    layoutAsGrid(files, canvasWidth, canvasHeight)

    set({ files, selectedFileId: files.length > 0 ? files[0].fileId : null })
  },

  toggleFile: (fileId, fileName, svgText, layers, naturalWidth, naturalHeight) => {
    const { files, canvasWidth, canvasHeight, selectedFileId } = get()
    const existing = files.find((f) => f.fileId === fileId)

    if (existing) {
      // Remove
      const next = files.filter((f) => f.fileId !== fileId)
      set({
        files: next,
        selectedFileId: selectedFileId === fileId
          ? (next.length > 0 ? next[next.length - 1].fileId : null)
          : selectedFileId,
      })
      return
    }

    // Add centered
    const scale = calcFitScale(naturalWidth, naturalHeight, canvasWidth * 0.8, canvasHeight * 0.8)
    const newFile: SvgWorkspaceFile = {
      fileId,
      fileName,
      svgText,
      layers: layers.map((l) => ({ ...l })),
      x: canvasWidth / 2,
      y: canvasHeight / 2,
      scale,
      zoom: 1,
      placement: 'free',
      visible: true,
      naturalWidth,
      naturalHeight,
    }

    set({ files: [...files, newFile], selectedFileId: fileId })
  },

  removeFile: (fileId) => {
    const { files, selectedFileId } = get()
    const next = files.filter((f) => f.fileId !== fileId)
    set({
      files: next,
      selectedFileId: selectedFileId === fileId
        ? (next.length > 0 ? next[next.length - 1].fileId : null)
        : selectedFileId,
    })
  },

  selectFile: (fileId) => set({ selectedFileId: fileId }),

  moveFile: (fileId, x, y) => {
    set((state) => ({
      files: state.files.map((f) =>
        f.fileId === fileId
          ? { ...f, x, y, placement: 'free' as SvgPlacement }
          : f,
      ),
    }))
  },

  toggleLayer: (fileId, layerId) => {
    set((state) => ({
      files: state.files.map((f) => {
        if (f.fileId !== fileId) return f
        return {
          ...f,
          layers: f.layers.map((l) =>
            l.id === layerId ? { ...l, visible: !l.visible } : l,
          ),
        }
      }),
    }))
  },

  toggleFileVisible: (fileId) => {
    set((state) => ({
      files: state.files.map((f) =>
        f.fileId === fileId ? { ...f, visible: !f.visible } : f,
      ),
    }))
  },

  relayoutGrid: () => {
    const { files, canvasWidth, canvasHeight } = get()
    const gridFiles = files.filter((f) => f.placement === 'grid')
    layoutAsGrid(gridFiles, canvasWidth, canvasHeight)
    // Merge back
    const freeFiles = files.filter((f) => f.placement !== 'grid')
    set({ files: [...gridFiles, ...freeFiles] })
  },

  setCanvasSize: (w, h) => {
    set({ canvasWidth: w, canvasHeight: h })
  },

  zoomFile: (fileId, factor) => {
    set((state) => ({
      files: state.files.map((f) => {
        if (f.fileId !== fileId) return f
        const next = f.zoom * factor
        const minZ = Math.max(16 / (f.naturalWidth * f.scale), 16 / (f.naturalHeight * f.scale), 0.1)
        return { ...f, zoom: Math.min(Math.max(next, minZ), 20) }
      }),
    }))
  },
}))
