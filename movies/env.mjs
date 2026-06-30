import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

export function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return {}
  const vars = {}
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    let value = trimmed.slice(eq + 1).trim()
    const hash = value.indexOf('#')
    if (hash !== -1) value = value.slice(0, hash).trim()
    const key = trimmed.slice(0, eq).trim()
    vars[key] = value
    process.env[key] = value
  }
  return vars
}

// Load shared movies/.env eagerly
loadDotEnv(join(__dir, '.env'))

// Convenience: load a per-project .env from a script path
export function loadProjectEnv(scriptPath) {
  loadDotEnv(join(dirname(scriptPath), '.env'))
}
