import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAnimationStore } from '@/stores/animation-store'

interface Props {
  sceneRoot: THREE.Object3D
}

export default function AnimationPlayerInternal({ sceneRoot }: Props) {
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const actionRef = useRef<THREE.AnimationAction | null>(null)

  const clips = useAnimationStore((s) => s.clips)
  const currentIndex = useAnimationStore((s) => s.currentIndex)
  const isPlaying = useAnimationStore((s) => s.isPlaying)
  const speed = useAnimationStore((s) => s.speed)
  const repeat = useAnimationStore((s) => s.repeat)
  const pingpong = useAnimationStore((s) => s.pingpong)
  const currentTime = useAnimationStore((s) => s.currentTime)

  // Build mixer
  useEffect(() => {
    const mixer = new THREE.AnimationMixer(sceneRoot)
    mixerRef.current = mixer
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(sceneRoot)
    }
  }, [sceneRoot])

  // Switch clip — filter out tracks that can't bind to the scene
  useEffect(() => {
    const mixer = mixerRef.current
    if (!mixer || currentIndex < 0 || currentIndex >= clips.length) {
      actionRef.current = null
      return
    }
    if (actionRef.current) actionRef.current.stop()

    const clip = clips[currentIndex]

    // Pre-filter tracks: skip those that can't bind to the scene.
    // Some KHR_animation_pointer tracks target textures that failed to load,
    // which causes PropertyBinding.bind() to throw on action.play().
    const validTracks = clip.tracks.filter((track) => {
      try {
        const binding = new THREE.PropertyBinding(sceneRoot, track.name)
        binding.bind()
        binding.unbind()
        return true
      } catch {
        console.warn('[AnimationPlayer] Skipping unbindable track:', track.name)
        return false
      }
    })

    let playClip = clip
    if (validTracks.length === 0) {
      console.warn('[AnimationPlayer] No bindable tracks in clip:', clip.name)
      actionRef.current = null
      return
    }
    if (validTracks.length < clip.tracks.length) {
      playClip = new THREE.AnimationClip(clip.name, clip.duration, validTracks)
    }

    const action = mixer.clipAction(playClip)
    action.setLoop(
      pingpong ? THREE.LoopPingPong : repeat ? THREE.LoopRepeat : THREE.LoopOnce,
      repeat ? Infinity : pingpong ? 2 : 1,
    )
    action.clampWhenFinished = !repeat
    action.timeScale = speed
    action.play()
    actionRef.current = action
  }, [currentIndex, clips, repeat, pingpong, speed, sceneRoot])

  // Sync speed
  useEffect(() => {
    if (actionRef.current) actionRef.current.timeScale = speed
  }, [speed])

  // Sync loop mode
  useEffect(() => {
    if (!actionRef.current) return
    actionRef.current.setLoop(
      pingpong ? THREE.LoopPingPong : repeat ? THREE.LoopRepeat : THREE.LoopOnce,
      repeat ? Infinity : pingpong ? 2 : 1,
    )
    actionRef.current.clampWhenFinished = !repeat
  }, [repeat, pingpong])

  // Seek (pause state)
  useEffect(() => {
    if (!actionRef.current || isPlaying) return
    actionRef.current.time = currentTime
    mixerRef.current?.setTime(currentTime)
  }, [currentTime, isPlaying])

  // Per-frame update — handles restart inline to avoid React effect timing issues
  const wasPlayingRef = useRef(false)
  useFrame((_, delta) => {
    const mixer = mixerRef.current
    if (!mixer) return
    const s = useAnimationStore.getState()
    const nowPlaying = s.isPlaying

    // Detect play→pause→play transition for restarting finished clips
    if (nowPlaying && !wasPlayingRef.current && actionRef.current) {
      const dur = actionRef.current.getClip().duration
      if (!s.repeat && actionRef.current.time >= dur) {
        // Restart: recreate action from scratch (reset() alone doesn't work)
        const clip = s.clips[s.currentIndex]
        if (clip) {
          const validTracks = clip.tracks.filter((t) => {
            try { const b = new THREE.PropertyBinding(sceneRoot, t.name); b.bind(); b.unbind(); return true } catch { return false }
          })
          if (validTracks.length > 0) {
            actionRef.current.stop()
            const playClip = validTracks.length < clip.tracks.length
              ? new THREE.AnimationClip(clip.name, clip.duration, validTracks) : clip
            const action = mixer.clipAction(playClip)
            action.setLoop(
              s.pingpong ? THREE.LoopPingPong : s.repeat ? THREE.LoopRepeat : THREE.LoopOnce,
              s.repeat ? Infinity : s.pingpong ? 2 : 1,
            )
            action.clampWhenFinished = !s.repeat
            action.timeScale = s.speed
            action.play()
            actionRef.current = action
            useAnimationStore.getState().setCurrentTime(0)
          }
        }
      }
    }
    wasPlayingRef.current = nowPlaying

    if (nowPlaying) mixer.update(Math.min(delta, 0.1))

    if (actionRef.current) {
      const clip = actionRef.current.getClip()
      const t = actionRef.current.time
      if (!s.repeat && t >= clip.duration) {
        useAnimationStore.getState().setCurrentTime(clip.duration)
        useAnimationStore.getState().setPlaying(false)
        return
      }
      useAnimationStore.getState().setCurrentTime(
        t >= 0 ? t % clip.duration : (clip.duration + (t % clip.duration)) % clip.duration,
      )
    }
  })

  return null
}
