import { join, extname } from 'path'
import * as fs from 'fs'
import { ALL_MODEL_EXTENSIONS } from '../../src/renderer/config/file-formats'

export interface FileEntry {
  name: string
  path: string
  mtimeMs: number
}

const SUPPORTED_EXTENSIONS = new Set(ALL_MODEL_EXTENSIONS)

export async function readDirectory(dirPath: string): Promise<{ success: boolean; files?: FileEntry[]; error?: string }> {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const files: FileEntry[] = []
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          const fullPath = join(dirPath, entry.name)
          const stat = await fs.promises.stat(fullPath)
          files.push({ name: entry.name, path: fullPath, mtimeMs: stat.mtimeMs })
        }
      }
    }
    return { success: true, files }
  } catch (e) {
    const err = e as Error
    return { success: false, error: err.message }
  }
}
