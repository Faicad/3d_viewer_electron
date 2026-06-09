import { create } from 'zustand'
import * as THREE from 'three'

export interface AnimationState {
  clips: THREE.AnimationClip[]
  /** The root object for AnimationMixer (original GLTF sceneRoot, not cloned meshes) */
  sceneRoot: THREE.Object3D | null
  currentIndex: number
  currentTime: number
  isPlaying: boolean
  speed: number
  duration: number
  /** Loop repeat — when false, plays once */
  repeat: boolean
  /** Ping-pong — when true, plays forward then backward */
  pingpong: boolean
  /** Maximized overlay mode (vs dialog window) */
  isMaximized: boolean

  setClips: (clips: THREE.AnimationClip[], sceneRoot?: THREE.Object3D | null) => void
  selectAnimation: (index: number) => void
  togglePlay: () => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  seek: (time: number) => void
  setCurrentTime: (time: number) => void
  setMaximized: (maximized: boolean) => void
  toggleRepeat: () => void
  togglePingpong: () => void
  reset: () => void
}

export const useAnimationStore = create<AnimationState>((set, get) => ({
  clips: [],
  sceneRoot: null,
  currentIndex: -1,
  currentTime: 0,
  isPlaying: false,
  speed: 1,
  duration: 0,
  repeat: true,
  pingpong: false,
  isMaximized: true,

  setClips: (clips, sceneRoot = null) => {
    const idx = clips.length > 0 ? 0 : -1
    set({
      clips,
      sceneRoot,
      currentIndex: idx,
      currentTime: 0,
      duration: idx >= 0 ? clips[idx].duration : 0,
      isPlaying: clips.length > 0,
    })
  },

  selectAnimation: (index) => {
    const { clips } = get()
    if (index < 0 || index >= clips.length) return
    set({
      currentIndex: index,
      currentTime: 0,
      duration: clips[index].duration,
      isPlaying: true,
    })
  },

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setSpeed: (speed) => set({ speed }),
  seek: (time) => set({ currentTime: time, isPlaying: false }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setMaximized: (maximized) => set({ isMaximized: maximized }),
  toggleRepeat: () => set((s) => ({ repeat: !s.repeat })),
  togglePingpong: () => set((s) => ({ pingpong: !s.pingpong })),
  reset: () => set({
    clips: [], sceneRoot: null, currentIndex: -1, currentTime: 0,
    isPlaying: false, speed: 1, duration: 0,
    repeat: true, pingpong: false, isMaximized: true,
  }),
}))
