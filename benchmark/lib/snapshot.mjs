/**
 * Snapshot utilities — save/load benchmark results as JSON.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const SNAPSHOTS_DIR = join(__dirname, '..', 'snapshots')

export function ensureSnapshotsDir() {
  if (!existsSync(SNAPSHOTS_DIR)) {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true })
  }
}

export function saveSnapshot(name, data) {
  ensureSnapshotsDir()
  const filePath = join(SNAPSHOTS_DIR, `${name}.json`)
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`[snapshot] Saved: ${filePath}`)
  return filePath
}

export function loadSnapshot(name) {
  const filePath = join(SNAPSHOTS_DIR, `${name}.json`)
  if (!existsSync(filePath)) {
    console.error(`[snapshot] Not found: ${filePath}`)
    return null
  }
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

export function listSnapshots() {
  ensureSnapshotsDir()
  return readdirSync(SNAPSHOTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''))
}
