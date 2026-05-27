import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAnimationStore } from '@/stores/animation-store'
import { useModelStore } from '@/stores/model-store'

export default function AnimationPlayer() {
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const actionRef = useRef<THREE.AnimationAction | null>(null)

  const clips = useAnimationStore((s) => s.clips)
  const currentIndex = useAnimationStore((s) => s.currentIndex)
  const isPlaying = useAnimationStore((s) => s.isPlaying)
  const speed = useAnimationStore((s) => s.speed)
  const loopMode = useAnimationStore((s) => s.loopMode)
  const currentTime = useAnimationStore((s) => s.currentTime)
  const setCurrentTime = useAnimationStore((s) => s.setCurrentTime)

  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const sceneRoot = loadedFiles.length === 1
    ? loadedFiles[0].sceneRoot
    : null

  // Build mixer when sceneRoot or clips change
  useEffect(() => {
    if (!sceneRoot || clips.length === 0) {
      mixerRef.current = null
      actionRef.current = null
      return
    }
    const mixer = new THREE.AnimationMixer(sceneRoot)
    mixerRef.current = mixer
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(sceneRoot)
    }
  }, [sceneRoot, clips])

  // Switch animation clip
  useEffect(() => {
    const mixer = mixerRef.current
    if (!mixer || currentIndex < 0 || currentIndex >= clips.length) {
      actionRef.current = null
      return
    }
    if (actionRef.current) actionRef.current.stop()

    const action = mixer.clipAction(clips[currentIndex])
    action.setLoop(
      loopMode === 'once' ? THREE.LoopOnce :
      loopMode === 'pingpong' ? THREE.LoopPingPong :
      THREE.LoopRepeat,
      Infinity,
    )
    action.clampWhenFinished = loopMode === 'once'
    action.timeScale = speed
    action.play()
    actionRef.current = action
  }, [currentIndex, clips, loopMode, speed])

  // Sync speed
  useEffect(() => {
    if (actionRef.current) actionRef.current.timeScale = speed
  }, [speed])

  // Sync loop mode
  useEffect(() => {
    if (!actionRef.current) return
    actionRef.current.setLoop(
      loopMode === 'once' ? THREE.LoopOnce :
      loopMode === 'pingpong' ? THREE.LoopPingPong :
      THREE.LoopRepeat,
      Infinity,
    )
    actionRef.current.clampWhenFinished = loopMode === 'once'
  }, [loopMode])

  // Seek (when paused)
  useEffect(() => {
    if (!actionRef.current || isPlaying) return
    actionRef.current.time = currentTime
    mixerRef.current?.setTime(currentTime)
  }, [currentTime, isPlaying])

  // Per-frame update
  useFrame((_, delta) => {
    const mixer = mixerRef.current
    if (!mixer) return
    if (isPlaying) mixer.update(Math.min(delta, 0.1))

    if (actionRef.current) {
      const clip = actionRef.current.getClip()
      const t = actionRef.current.time
      if (loopMode === 'once' && t >= clip.duration) {
        setCurrentTime(clip.duration)
        return
      }
      setCurrentTime(
        t >= 0 ? t % clip.duration : (clip.duration + (t % clip.duration)) % clip.duration,
      )
    }
  })

  return null
}
