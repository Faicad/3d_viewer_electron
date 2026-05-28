import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, GripHorizontal, ChevronDown, ChevronRight } from 'lucide-react'
import { useGlbExtensionStore } from '@/stores/glb-extension-store'
import type { GlbExtensionData, GltfExtensionInfo } from '@/engine/gltfExtensions'

// ---- Collapsible section helper ----

function Section({ title, badge, defaultOpen = true, children }: {
  title: string
  badge?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b last:border-b-0">
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
      <div className="overflow-y-auto flex-1">
        {/* Extensions */}
        <Section
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
                  <tr key={mat.index} className="border-b last:border-b-0">
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
                  <th className="text-left font-medium py-1 pr-2">{t('glbExtension.mimeType')}</th>
                  <th className="text-left font-medium py-1 pr-2">{t('glbExtension.compression')}</th>
                  <th className="text-right font-medium py-1 pr-2">{t('glbExtension.resolution')}</th>
                  <th className="text-right font-medium py-1">{t('glbExtension.size')}</th>
                </tr>
              </thead>
              <tbody>
                {data.textures.map((tex) => (
                  <tr key={tex.index} className="border-b last:border-b-0">
                    <td className="py-1 pr-1 text-muted-foreground">{tex.index}</td>
                    <td className="py-1 pr-2 font-mono text-[10px]">{tex.mimeType}</td>
                    <td className="py-1 pr-2 text-[10px]">{tex.compression || '—'}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-[10px]">
                      {tex.resolution ? `${tex.resolution.width}x${tex.resolution.height}` : '—'}
                    </td>
                    <td className="py-1 text-right tabular-nums text-[10px]">{formatSize(tex.sizeEstimate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Animations */}
        <Section
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
