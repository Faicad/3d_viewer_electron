import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

// Usage:
//   node scripts/publish-gitee.mjs [--token <token>] [--dist <dir>] [--dry-run]
//
// Options:
//   --token    Gitee personal access token (default: GITEE_TOKEN env)
//   --dist     Directory with built artifacts (default: dist/)
//   --dry-run  Preview without uploading
//   --help     Print this help
//
// Owner/repo auto-detected from `git remote get-url gitee`.
// Override with cli args --owner/--repo or env GITEE_OWNER/GITEE_REPO.

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log(`
publish-gitee.mjs — Upload build artifacts to Gitee release

Usage:
  node scripts/publish-gitee.mjs [options]

Options:
  --token <token>   Gitee PAT.         Env: GITEE_TOKEN
  --owner <owner>   Override repo owner (default: from git remote)
  --repo <repo>     Override repo name (default: from git remote)
  --dist <dir>      Artifacts directory (default: dist/)
  --dry-run         Preview without uploading
  --help            Show this message

Owner/repo are auto-detected from the 'gitee' git remote.
Requires Gitee Personal Access Token with releases scope.
`.trim())
  process.exit(0)
}

function arg(name) {
  const idx = args.indexOf(name)
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]
  return undefined
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function detectOwnerRepo() {
  const cliOwner = arg('--owner')
  const cliRepo  = arg('--repo')
  if (cliOwner && cliRepo) return { owner: cliOwner, repo: cliRepo }

  const envOwner = process.env.GITEE_OWNER
  const envRepo  = process.env.GITEE_REPO
  if (envOwner && envRepo) return { owner: envOwner, repo: envRepo }

  // Parse from 'gitee' git remote
  try {
    const stdout = execSync('git remote get-url gitee', { encoding: 'utf-8' }).trim()
    // Supports both https: https://gitee.com/owner/repo.git
    // and ssh: git@gitee.com:owner/repo.git
    const m = stdout.match(/gitee\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/)
    if (m) return { owner: m[1], repo: m[2] }
  } catch {
    // fall through
  }

  console.error('ERROR: could not detect owner/repo. Set via --owner/--repo or GITEE_OWNER/GITEE_REPO env.')
  process.exit(1)
}

const token = arg('--token') || process.env.GITEE_TOKEN
const { owner, repo } = detectOwnerRepo()
const distDir = arg('--dist') || 'dist'
const dryRun = args.includes('--dry-run')

if (!token) { console.error('ERROR: --token or GITEE_TOKEN is required'); process.exit(1) }

// ---- helpers ----

const API = 'https://gitee.com/api/v5'

async function api(url, opts = {}) {
  const qs = url.includes('?') ? '&' : '?'
  const fullUrl = `${API}${url}${qs}access_token=${token}`
  const res = await fetch(fullUrl, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) {
    const msg = data?.message || data?.error || text
    throw new Error(`Gitee API ${res.status}: ${msg}`)
  }
  return data
}

// ---- main ----

const version = JSON.parse(readFileSync('package.json', 'utf-8')).version
const tag = `v${version}`

console.log(`[publish-gitee] Version: ${version}`)
console.log(`[publish-gitee] Tag:     ${tag}`)
console.log(`[publish-gitee] Repo:    ${owner}/${repo}`)
console.log(`[publish-gitee] Dist:    ${distDir}`)
if (dryRun) console.log('[publish-gitee] *** DRY RUN — no changes will be made ***')

// Discover artifacts — installer exe + blockmap
const artifactFiles = []
const entries = await readdir(distDir)
for (const name of entries) {
  const fullPath = join(distDir, name)
  const entryStat = await stat(fullPath)
  if (!entryStat.isFile()) continue
  // Only match installer files for the current version
  if (new RegExp(`^3D_Viewer_${escapeRegex(version)}.+_Setup\\.exe(\\.blockmap)?$`).test(name)) {
    artifactFiles.push({ name, path: fullPath, size: entryStat.size })
  }
}

if (artifactFiles.length === 0) {
  console.log('[publish-gitee] No installer artifacts found in dist/. Run `npm run build:win` first.')
  process.exit(0)
}

console.log(`[publish-gitee] Found ${artifactFiles.length} artifact(s):`)
for (const f of artifactFiles) {
  console.log(`              ${(f.size / 1024 / 1024).toFixed(1)} MB  ${f.name}`)
}

if (dryRun) {
  console.log('[publish-gitee] Dry run complete.')
  process.exit(0)
}

// Check if release already exists
let releaseId
try {
  const existing = await api(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`)
  releaseId = existing.id
  console.log(`[publish-gitee] Release ${tag} already exists (id=${releaseId}), skipping creation.`)
} catch {
  // Release does not exist, create it
  const body = `${tag} release`
  const targetCommitish = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()

  console.log(`[publish-gitee] Creating release ${tag}...`)
  const created = await api(`/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: targetCommitish,
      name: tag,
      body,
      prerelease: false,
    }),
  })
  releaseId = created.id
  console.log(`[publish-gitee] Release created (id=${releaseId}).`)
}

// Upload each artifact
for (const f of artifactFiles) {
  console.log(`[publish-gitee] Uploading ${f.name}...`)
  const url = `/repos/${owner}/${repo}/releases/${releaseId}/attach_files`
  const fullUrl = `${API}${url}?access_token=${token}`

  const form = new FormData()
  const blob = new Blob([readFileSync(f.path)])
  form.append('file', blob, f.name)

  const res = await fetch(fullUrl, { method: 'POST', body: form })
  const text = await res.text()
  if (!res.ok) {
    let msg
    try { msg = JSON.parse(text).message || JSON.parse(text).error } catch { msg = text }
    console.error(`[publish-gitee] Failed to upload ${f.name}: ${res.status} ${msg}`)
    if (msg.includes('文件大小已超出限制') && f.size > 100 * 1024 * 1024) {
      console.error()
      console.error('  Gitee free tier limits release attachments to 100 MB.')
      console.error('  Your installer is >100 MB. Options:')
      console.error('    1. Compress: add to package.json build.win.nsis: { compression: "maximum" }')
      console.error('    2. Split: use a file splitter and upload parts as separate attachments')
      console.error('    3. Upload elsewhere and link from the release body')
      console.error('    4. Upgrade Gitee to a paid plan')
    }
    continue
  }
  console.log(`[publish-gitee] ${f.name} uploaded successfully.`)
}

console.log('[publish-gitee] Done.')
