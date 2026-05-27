import { useState, useCallback, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Maximize2, Minimize2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAnimationStore } from '@/stores/animation-store'
import ControlBar from '@/components/panels/ControlBar'
import AnimationPlayerInternal from '@/engine/components/AnimationPlayerInternal'

interface Props {
  open: boolean
  onClose: () => void
  sceneRoot: THREE.Object3D | undefined
  clips: THREE.AnimationClip[]
  fileName?: string
}

function computeCameraFit(root: THREE.Object3D): { position: [number, number, number]; target: [number, number, number] } {
  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const dist = maxDim * 2
  return {
    position: [center.x + dist * 0.5, center.y + dist * 0.3, center.z + dist],
    target: [center.x, center.y, center.z],
  }
}

export default function AnimationPlayerDialog({ open, onClose, sceneRoot, clips, fileName }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const reset = useAnimationStore((s) => s.reset)

  useEffect(() => {
    if (open && clips.length > 0) {
      useAnimationStore.getState().setClips(clips)
    }
  }, [open, clips])

  // Esc to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isFullscreen])

  const handleClose = useCallback(() => {
    setIsFullscreen(false)
    reset()
    onClose()
  }, [reset, onClose])

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) handleClose()
  }, [handleClose])

  const cameraFit = useMemo(() => {
    if (!sceneRoot) return null
    return computeCameraFit(sceneRoot)
  }, [sceneRoot])

  if (!sceneRoot || clips.length === 0 || !cameraFit) return null

  const canvasContent = (
    <Canvas
      camera={{
        fov: 45, near: 0.001, far: 10000,
        position: cameraFit.position, up: [0, 1, 0],
      }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ camera }) => camera.lookAt(...cameraFit.target)}
    >
      <color attach="background" args={['#D9D9D9']} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      <directionalLight position={[-3, 2, -3]} intensity={0.3} />
      <hemisphereLight args={['#b1e1ff', '#332211', 0.5]} />
      <primitive object={sceneRoot} />
      <AnimationPlayerInternal sceneRoot={sceneRoot} />
    </Canvas>
  )

  return (
    <>
      <Dialog open={open && !isFullscreen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">
            {fileName ? `Animation: ${fileName}` : 'Animation Player'}
          </DialogTitle>

          <div className="absolute right-12 top-4 z-10">
            <button
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
              onClick={() => setIsFullscreen(true)}
              title="全屏"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col">
            <div className="bg-[#D9D9D9] rounded-md overflow-hidden" style={{ height: 400 }}>
              {canvasContent}
            </div>
            <ControlBar />
          </div>
        </DialogContent>
      </Dialog>

      {/* CSS fullscreen overlay — completely independent of Dialog, no style conflicts */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-[#D9D9D9]">
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <button
              className="rounded-sm p-1 bg-black/30 text-white opacity-70 hover:opacity-100"
              onClick={() => setIsFullscreen(false)}
              title="退出全屏 (Esc)"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            <button
              className="rounded-sm p-1 bg-black/30 text-white opacity-70 hover:opacity-100"
              onClick={handleClose}
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            {canvasContent}
          </div>
          <ControlBar />
        </div>
      )}
    </>
  )
}
