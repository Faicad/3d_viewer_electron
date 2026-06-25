import { spawn } from 'child_process'

// Usage: node scripts/build-edition.mjs [--cn] [--eu] [--publish]
// --cn       → EDITION=cn, artifact name gets _cn suffix
// --eu       → DATA_REGION=eu
// --publish  → pass --publish always to electron-builder

const args = process.argv.slice(2)
const env = { ...process.env }

const isCN = args.includes('--cn')
if (isCN) env.EDITION = 'cn'
if (args.includes('--eu')) env.DATA_REGION = 'eu'

function run(cmd, cmdArgs) {
  const opts = { env, stdio: 'inherit' }
  if (process.platform === 'win32') opts.shell = true
  return new Promise((resolve, reject) => {
    const cp = spawn(cmd, cmdArgs, opts)
    cp.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)))
    cp.on('error', reject)
  })
}

const suffix = isCN ? '_cn' : ''
const artifactName = `3D_Viewer_\${version}_\${arch}${suffix}_Setup.\${ext}`

const publishArgs = args.includes('--publish') ? ['--publish', 'always'] : []

console.log(`[build-edition] EDITION=${env.EDITION || '(none)'} DATA_REGION=${env.DATA_REGION || '(none)'}`)

// 1. Build
await run('pnpm', ['exec', 'electron-vite', 'build'])
console.log('[build-edition] Build done, packaging...')

// 2. Package — spawn passes args directly, no shell escaping needed
await run('pnpm', [
  'exec', 'electron-builder', '--win',
  '--config.nsis.artifactName=' + artifactName,
  ...publishArgs,
])
console.log('[build-edition] Done')
