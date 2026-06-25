import { execSync } from 'child_process'

// Usage: node scripts/build-edition.mjs [--cn] [--eu]
// --cn  → EDITION=cn (Chinese version)
// --eu  → DATA_REGION=eu (EU data region)

const args = process.argv.slice(2)
const env = { ...process.env }

if (args.includes('--cn')) {
  env.EDITION = 'cn'
}
if (args.includes('--eu')) {
  env.DATA_REGION = 'eu'
}

execSync('pnpm exec electron-vite build', { env, stdio: 'inherit' })
