import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface HistoryEntry {
  filePath: string
  fileName: string
  mtimeMs?: number
  timestamp: number
}

const MAX_HISTORY = 500
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key) } catch { return null }
  },
  setItem: (key: string, value: string): void => {
    try { localStorage.setItem(key, value) } catch { console.error('localStorage setItem error') }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key) } catch { console.error('localStorage removeItem error') }
  },
}

interface HistoryStore {
  entries: HistoryEntry[]
  addEntry: (filePath: string, fileName: string, mtimeMs?: number) => void
  clearHistory: () => void
}

export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (filePath, fileName, mtimeMs) =>
        set((state) => {
          const existing = state.entries.find((e) => e.filePath === filePath)
          if (existing) return state
          const entry: HistoryEntry = { filePath, fileName, mtimeMs, timestamp: Date.now() }
          return { entries: [entry, ...state.entries].slice(0, MAX_HISTORY) }
        }),
      clearHistory: () => set({ entries: [] }),
    }),
    {
      name: 'faicad-history',
      storage: {
        getItem: safeLocalStorage.getItem,
        setItem: safeLocalStorage.setItem,
        removeItem: safeLocalStorage.removeItem,
      },
    },
  ),
)
