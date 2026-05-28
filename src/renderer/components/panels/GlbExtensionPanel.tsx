import { useCallback, useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, GripHorizontal, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { useGlbExtensionStore } from '@/stores/glb-extension-store'
import { useModelStore } from '@/stores/model-store'
import { useMaterialStore } from '@/stores/material-store'
import { getTextureForDownload } from '@/engine/formatLoaders'
import type { GlbExtensionData, GltfExtensionInfo } from '@/engine/gltfExtensions'

// ---- Collapsible section helper ----

function Section({ title, badge, defaultOpen = true, sectionId, children }: {
  title: string
  badge?: string
  defaultOpen?: boolean
  sectionId?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div data-section={sectionId} className="border-b last:border-b-0">
      <button
        className="flex items-center gap-1 w-full px-2 py-1.5 text-xs font-semibold hover:bg-muted/50 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="flex-1 text-left">{title}</span>
        {badge != null && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{badge}</span>
        )}
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  )
}

// ---- Badge helpers ----

function StatusBadge({ status }: { status: GltfExtensionInfo['status'] }) {
  const { t } = useTranslation()
  const color = status === 'supported' ? 'bg-green-100 text-green-800'
    : status === 'unsupported' ? 'bg-amber-100 text-amber-800'
    : 'bg-gray-100 text-gray-600'
  const label = status === 'supported' ? t('glbExtension.supported')
    : status === 'unsupported' ? t('glbExtension.unsupported')
    : t('glbExtension.unknown')
  return <span className={`text-[10px] px-1 py-0.5 rounded ${color}`}>{label}</span>
}

function AlphaBadge({ mode }: { mode: string }) {
  const color = mode === 'BLEND' ? 'bg-blue-100 text-blue-800'
    : mode === 'MASK' ? 'bg-amber-100 text-amber-800'
    : 'bg-gray-100 text-gray-600'
  return <span className={`text-[10px] px-1 py-0.5 rounded ${color}`}>{mode}</span>
}

// ---- Size formatter ----

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(2)} MB`
}

// ---- Inner component ----

function GlbExtensionPanelInner({ data, position, onClose, onPositionChange }: {
  data: GlbExtensionData
  position: { x: number; y: number }
  onClose: () => void
  onPositionChange: (pos: { x: number; y: number }) => void
}) {
  const { t } = useTranslation()
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollToSection = useGlbExtensionStore((s) => s.scrollToSection)
  const clearScrollTarget = useGlbExtensionStore((s) => s.clearScrollTarget)

  // Auto-scroll to target section
  useEffect(() => {
    if (!scrollToSection || !scrollRef.current) return
    const el = scrollRef.current.querySelector(`[data-section="${scrollToSection}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    clearScrollTarget()
  }, [scrollToSection, clearScrollTarget])

  // Esc key closes preview
  useEffect(() => {
    if (!previewSrc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewSrc(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewSrc])

  const handleMaterialClick = useCallback((matIndex: number, matName: string) => {
    const fileId = useGlbExtensionStore.getState().activeFileId
    if (!fileId) return
    const modelStore = useModelStore.getState()
    const partIds = modelStore.getPartIdsByMaterial(fileId, matIndex)
    if (partIds.length === 0) return
    const file = modelStore.loadedFiles.find((f) => f.id === fileId)
    const fileName = file?.fileName?.replace(/\.[^.]+$/, '') || fileId
    const keys = partIds.map((pid) => `${fileId}:${pid}`)
    const title = `${matName} / ${fileName}`
    useMaterialStore.getState().openMaterialEditor(keys, title)
  }, [])

  const downloadTexture = useCallback((texIndex: number, name: string, mimeType: string, previewUrl: string) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_')
    const fileId = useGlbExtensionStore.getState().activeFileId
    const tex = fileId ? getTextureForDownload(fileId, texIndex) : undefined

    function doDownload(dataUrl: string, ext: string) {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = safeName + ext
      a.click()
    }

    if (tex?.image) {
      try {
        const img = tex.image as { width: number; height: number }
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')
        if (ctx) {
          ctx.drawImage(img as CanvasImageSource, 0, 0)
          const isLossy = mimeType === 'image/webp' || mimeType === 'image/jpeg'
          if (isLossy) {
            c.toBlob((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob)
                doDownload(url, mimeType === 'image/webp' ? '.webp' : '.jpg')
                setTimeout(() => URL.revokeObjectURL(url), 1000)
              } else {
                doDownload(previewUrl, '.png')
              }
            }, mimeType, 0.92)
            return
          }
          c.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob)
              doDownload(url, '.png')
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            } else {
              doDownload(previewUrl, '.png')
            }
          }, 'image/png')
          return
        }
      } catch {
        // drawImage may fail on tainted canvas — fall through
      }
    }
    // Fallback: download preview data URL
    doDownload(previewUrl, mimeType === 'image/webp' ? '.webp' : mimeType === 'image/jpeg' ? '.jpg' : '.png')
  }, [])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      onPositionChange({ x: ev.clientX - dragOffset.current.x, y: ev.clientY - dragOffset.current.y })
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [position, onPositionChange])

  return (
    <div
      className="fixed z-50 w-96 rounded-lg border bg-background shadow-xl flex flex-col overflow-hidden"
      style={{ left: position.x, top: position.y, maxHeight: '80vh' }}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 border-b cursor-grab active:cursor-grabbing min-w-0 shrink-0"
        onMouseDown={onDragStart}
      >
        <GripHorizontal className="h-3 w-3 text-muted-foreground/50 shrink-0" />
        <span className="text-xs font-semibold flex-1 truncate">{t('glbExtension.title')}</span>
        <button
          className="p-0.5 hover:bg-muted rounded"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Body — scrollable */}
      <div ref={scrollRef} className="overflow-y-auto flex-1">
        {/* Extensions */}
        <Section
          sectionId="extensions"
          title={t('glbExtension.extensions')}
          badge={data.extensions.length > 0 ? `${data.extensions.length}` : undefined}
        >
          {data.extensions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">{t('glbExtension.noExtensions')}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left font-medium py-1 pr-2">{t('glbExtension.name')}</th>
                  <th className="text-left font-medium py-1 pr-2">{t('glbExtension.index')}</th>
                  <th className="text-left font-medium py-1">{t('glbExtension.required')}</th>
                </tr>
              </thead>
              <tbody>
                {data.extensions.map((ext) => (
                  <tr key={ext.name} className="border-b last:border-b-0">
                    <td className="py-1 pr-2">
                      <div className="font-mono text-[10px]">{ext.name}</div>
                      <div className="text-[10px] text-muted-foreground">{ext.description}</div>
                    </td>
                    <td className="py-1 pr-2"><StatusBadge status={ext.status} /></td>
                    <td className="py-1">{ext.required ? t('glbExtension.yes') : t('glbExtension.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Materials */}
        <Section
          sectionId="materials"
          title={t('glbExtension.materials')}
          badge={data.materials.length > 0 ? `${data.materials.length}` : undefined}
        >
          {data.materials.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">{t('glbExtension.noMaterials')}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left font-medium py-1 pr-1 w-6">{t('glbExtension.index')}</th>
                  <th className="text-left font-medium py-1 pr-2">{t('glbExtension.name')}</th>
                  <th className="text-right font-medium py-1 pr-2">{t('glbExtension.instances')}</th>
                  <th className="text-right font-medium py-1 pr-2">{t('glbExtension.textureCount')}</th>
                  <th className="text-left font-medium py-1 pr-2">{t('glbExtension.alphaMode')}</th>
                  <th className="text-center font-medium py-1">{t('glbExtension.doubleSided')}</th>
                </tr>
              </thead>
              <tbody>
                {data.materials.map((mat) => (
                  <tr
                    key={mat.index}
                    className="border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleMaterialClick(mat.index, mat.name)}
                  >
                    <td className="py-1 pr-1 text-muted-foreground">{mat.index}</td>
                    <td className="py-1 pr-2 max-w-[100px] truncate" title={mat.name}>{mat.name}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{mat.instanceCount}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{mat.textureSlotCount}</td>
                    <td className="py-1 pr-2"><AlphaBadge mode={mat.alphaMode} /></td>
                    <td className="py-1 text-center">{mat.doubleSided ? t('glbExtension.yes') : t('glbExtension.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Textures */}
        <Section
          sectionId="textures"
          title={t('glbExtension.textures')}
          badge={data.textures.length > 0 ? `${data.textures.length}` : undefined}
        >
          {data.textures.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">{t('glbExtension.noTextures')}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left font-medium py-1 pr-1 w-6">{t('glbExtension.index')}</th>
                  <th className="text-center font-medium py-1 pr-2">Thumb</th>
                  <th className="text-left font-medium py-1 pr-2">{t('glbExtension.slots')}</th>
                  <th className="text-right font-medium py-1 pr-2">{t('glbExtension.resolution')}</th>
                  <th className="text-right font-medium py-1">{t('glbExtension.size')}</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {data.textures.map((tex) => (
                  <tr key={tex.index} className="border-b last:border-b-0">
                    <td className="py-1 pr-1 text-muted-foreground">{tex.index}</td>
                    <td className="py-1 pr-2">
                      {tex.thumbnail ? (
                        <img
                          src={tex.thumbnail}
                          alt={tex.name}
                          className="w-8 h-8 object-contain rounded border cursor-zoom-in hover:scale-150 transition-transform"
                          onClick={() => setPreviewSrc(tex.preview || tex.thumbnail)}
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      <div className="flex flex-wrap gap-0.5">
                        {[...new Set(tex.slots.map((s) => {
                          const name = s.replace(/^material\[\d+\]\./, '')
                          const last = name.split('.').pop() || name
                          return last.replace(/Texture$/, '')
                        }))].map((slot) => (
                          <span key={slot} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{slot}</span>
                        ))}
                      </div>
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-[10px]">
                      {tex.resolution ? `${tex.resolution.width}x${tex.resolution.height}` : '—'}
                    </td>
                    <td className="py-1 text-right tabular-nums text-[10px]">{formatSize(tex.sizeEstimate)}</td>
                    <td className="py-1 pl-1">
                      {tex.preview ? (
                        <button
                          className="p-0.5 hover:bg-muted rounded"
                          onClick={() => downloadTexture(tex.index, tex.name, tex.mimeType, tex.preview || tex.thumbnail || '')}
                          title="Download"
                        >
                          <Download className="h-3 w-3" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Animations */}
        <Section
          sectionId="animations"
          title={t('glbExtension.animations')}
          badge={data.animations.length > 0 ? `${data.animations.length}` : undefined}
        >
          {data.animations.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">{t('glbExtension.noAnimations')}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left font-medium py-1 pr-1 w-6">{t('glbExtension.index')}</th>
                  <th className="text-left font-medium py-1 pr-2">{t('glbExtension.name')}</th>
                  <th className="text-right font-medium py-1 pr-2">{t('glbExtension.channels')}</th>
                  <th className="text-right font-medium py-1">{t('glbExtension.duration')}</th>
                </tr>
              </thead>
              <tbody>
                {data.animations.map((anim) => (
                  <tr key={anim.index} className="border-b last:border-b-0">
                    <td className="py-1 pr-1 text-muted-foreground">{anim.index}</td>
                    <td className="py-1 pr-2 max-w-[120px] truncate" title={anim.name}>{anim.name}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{anim.channels}</td>
                    <td className="py-1 text-right tabular-nums">{anim.duration.toFixed(1)}{t('glbExtension.seconds')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      {/* Full-size texture preview overlay */}
      {previewSrc && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center cursor-zoom-out"
          onClick={() => setPreviewSrc(null)}
        >
          <img
            src={previewSrc}
            className="max-w-[80vw] max-h-[80vh] object-contain rounded shadow-2xl border-2 border-white/20"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

// ---- Outer component ----

export default function GlbExtensionPanel() {
  const visible = useGlbExtensionStore((s) => s.panelVisible)
  const position = useGlbExtensionStore((s) => s.panelPosition)
  const activeFileId = useGlbExtensionStore((s) => s.activeFileId)
  const dataByFileId = useGlbExtensionStore((s) => s.dataByFileId)
  const data = activeFileId ? dataByFileId[activeFileId] : null
  const closePanel = useGlbExtensionStore((s) => s.closePanel)
  const setPosition = useGlbExtensionStore((s) => s.setPanelPosition)

  if (!visible || !data) return null

  return (
    <GlbExtensionPanelInner
      data={data}
      position={position}
      onClose={closePanel}
      onPositionChange={setPosition}
    />
  )
}
