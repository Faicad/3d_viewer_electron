import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

// Usage:
//   node scripts/publish-release.mjs [--remote gitcode|gitee] [--token <token>] [--dist <dir>] [--dry-run] [--debug]
//
// Options:
//   --remote   Git remote name (default: gitcode). Controls which platform to publish to.
//   --token    Personal access token. Env: GITCODE_TOKEN (gitcode) or GITEE_TOKEN (gitee)
//   --owner    Override repo owner (default: from git remote)
//   --repo     Override repo name (default: from git remote)
//   --dist     Directory with built artifacts (default: dist/)
//   --dry-run  Preview without uploading
//   --debug    Print API request/response details
//   --help     Print this help

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log(`
publish-release.mjs — Upload build artifacts to GitCode/Gitee release

Usage:
  node scripts/publish-release.mjs [options]

Options:
  --remote <name>   Git remote name: 'gitcode' or 'gitee' (default: gitcode)
  --token <token>   PAT. Env: GITCODE_TOKEN (gitcode) or GITEE_TOKEN (gitee)
  --owner <owner>   Override repo owner (default: from git remote)
  --repo <repo>     Override repo name (default: from git remote)
  --dist <dir>      Artifacts directory (default: dist/)
  --dry-run         Preview without uploading
  --debug           Print API request/response details
  --help            Show this message

Owner/repo are auto-detected from the specified git remote.
Requires Personal Access Token with releases scope.
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

// ---- platform config ----

const remoteName = arg('--remote') || 'gitcode'
const isGitCode = remoteName === 'gitcode'

const platformName = isGitCode ? 'GitCode' : 'Gitee'
const domain = isGitCode ? 'gitcode.com' : 'gitee.com'
const API = isGitCode ? 'https://api.gitcode.com/api/v5' : 'https://gitee.com/api/v5'
const tokenEnvVar = isGitCode ? 'GITCODE_TOKEN' : 'GITEE_TOKEN'
const debug = args.includes('--debug')

// ---- token resolution ----
let token = arg('--token')
if (!token) {
  token = process.env[tokenEnvVar]
  // Fallback: if using gitcode and GITCODE_TOKEN not set, try GITEE_TOKEN
  if (!token && isGitCode) token = process.env.GITEE_TOKEN
}
if (!token) {
  console.error(`ERROR: --token or ${tokenEnvVar} env is required`)
  if (isGitCode) console.error('  (also falls back to GITEE_TOKEN if GITCODE_TOKEN is not set)')
  process.exit(1)
}

// ---- detect owner/repo ----

function detectOwnerRepo() {
  const cliOwner = arg('--owner')
  const cliRepo  = arg('--repo')
  if (cliOwner && cliRepo) return { owner: cliOwner, repo: cliRepo }

  const envOwner = process.env[`${isGitCode ? 'GITCODE' : 'GITEE'}_OWNER`]
  const envRepo  = process.env[`${isGitCode ? 'GITCODE' : 'GITEE'}_REPO`]
  if (envOwner && envRepo) return { owner: envOwner, repo: envRepo }

  try {
    const stdout = execSync(`git remote get-url ${remoteName}`, { encoding: 'utf-8' }).trim()
    const m = stdout.match(new RegExp(`${domain.replace('.', '\\.')}[/:]([^/]+)/([^/]+?)(?:\\.git)?$`))
    if (m) return { owner: m[1], repo: m[2] }
  } catch {
    // fall through
  }

  console.error(`ERROR: could not detect owner/repo from git remote '${remoteName}'.`)
  console.error('  Set via --owner/--repo or env vars.')
  process.exit(1)
}

const { owner, repo } = detectOwnerRepo()
const distDir = arg('--dist') || 'dist'
const dryRun = args.includes('--dry-run')

// ---- helpers ----

async function api(method, urlPath, body) {
  const qs = urlPath.includes('?') ? '&' : '?'
  const fullUrl = `${API}${urlPath}${qs}access_token=${token}`

  const opts = { method, headers: {} }
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }

  if (debug) {
    console.log(`[debug] --> ${method} ${fullUrl}`)
    if (body) console.log(`[debug] --> body: ${JSON.stringify(body)}`)
  }

  const res = await fetch(fullUrl, opts)
  const text = await res.text()

  if (debug) console.log(`[debug] <-- ${res.status} ${text.slice(0, 500)}`)

  let data
  try { data = JSON.parse(text) } catch { data = text }

  if (!res.ok) {
    const msg = data?.message || data?.error || text
    throw new Error(`${platformName} API ${res.status}: ${msg}`)
  }
  return data
}

async function uploadToUrl(targetUrl, extraHeaders, filePath, fileName) {
  if (debug) console.log(`[debug] --> PUT ${targetUrl} (${fileName})`)

  const content = readFileSync(filePath)
  const headers = { 'Content-Type': 'application/octet-stream', ...extraHeaders }
  const res = await fetch(targetUrl, { method: 'PUT', body: content, headers })
  const text = await res.text()
  if (debug) console.log(`[debug] <-- ${res.status} ${text.slice(0, 500)}`)

  if (!res.ok) {
    let msg
    try { msg = JSON.parse(text).message || JSON.parse(text).error } catch { msg = text || '(empty response)' }
    return { ok: false, status: res.status, msg }
  }
  return { ok: true }
}

async function uploadFile(url, filePath, fileName) {
  const fullUrl = `${API}${url}?access_token=${token}`

  if (debug) console.log(`[debug] --> POST ${fullUrl} (multipart: ${fileName})`)

  const form = new FormData()
  const blob = new Blob([readFileSync(filePath)])
  form.append('file', blob, fileName)

  const res = await fetch(fullUrl, { method: 'POST', body: form })
  const text = await res.text()

  if (debug) console.log(`[debug] <-- ${res.status} ${text.slice(0, 500)}`)

  if (!res.ok) {
    let msg
    try { msg = JSON.parse(text).message || JSON.parse(text).error } catch { msg = text || '(empty response)' }
    return { ok: false, status: res.status, msg }
  }
  return { ok: true }
}

// ---- main ----

const version = JSON.parse(readFileSync('package.json', 'utf-8')).version
const tag = `v${version}`

console.log(`[publish-release] Platform: ${platformName} (remote: ${remoteName})`)
console.log(`[publish-release] Version: ${version}`)
console.log(`[publish-release] Tag:     ${tag}`)
console.log(`[publish-release] Repo:    ${owner}/${repo}`)
console.log(`[publish-release] Dist:    ${distDir}`)
if (dryRun) console.log('[publish-release] *** DRY RUN — no changes will be made ***')
if (debug) console.log('[publish-release] *** DEBUG mode ***')

// Discover artifacts — installer exe + blockmap
const artifactFiles = []
const entries = await readdir(distDir)
for (const name of entries) {
  const fullPath = join(distDir, name)
  const entryStat = await stat(fullPath)
  if (!entryStat.isFile()) continue
  if (new RegExp(`^3D_Viewer_${escapeRegex(version)}.+_cn_Setup\\.exe(\\.blockmap)?$`).test(name)) {
    artifactFiles.push({ name, path: fullPath, size: entryStat.size })
  }
}

if (artifactFiles.length === 0) {
  console.log('[publish-release] No Chinese-edition installer found in dist/. Run `npm run build:win:cn` first.')
  process.exit(0)
}

console.log(`[publish-release] Found ${artifactFiles.length} artifact(s):`)
for (const f of artifactFiles) {
  console.log(`              ${(f.size / 1024 / 1024).toFixed(1)} MB  ${f.name}`)
}

if (dryRun) {
  console.log('[publish-release] Dry run complete.')
  process.exit(0)
}

// GitCode uses tag_name as release identifier; Gitee uses numeric id.
// We store the value to use in URL paths as `releaseRef`.
function getReleaseRef(release) {
  if (isGitCode) {
    // GitCode may not return id; use tag_name as ref
    const ref = release.tag_name || release.id
    if (!ref) throw new Error(`response missing 'tag_name': ${JSON.stringify(release)}`)
    return ref
  }
  // Gitee: use numeric id
  const ref = release.id
  if (!ref) throw new Error(`response missing 'id': ${JSON.stringify(release)}`)
  return ref
}

// Check if release already exists
let releaseRef
try {
  const existing = await api('GET', `/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`)
  releaseRef = getReleaseRef(existing)
  console.log(`[publish-release] Release ${tag} already exists (ref=${releaseRef}), skipping creation.`)
} catch (err) {
  // release doesn't exist — create it
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()

  console.log(`[publish-release] Creating release ${tag} (branch: ${branch})...`)
  const created = await api('POST', `/repos/${owner}/${repo}/releases`, {
    tag_name: tag,
    target_commitish: branch,
    name: tag,
    body: `${tag} release`,
    prerelease: false,
  })
  releaseRef = getReleaseRef(created)
  console.log(`[publish-release] Release created (ref=${releaseRef}).`)
}

// Upload each artifact
let anyFailed = false
for (const f of artifactFiles) {
  console.log(`[publish-release] Uploading ${f.name}...`)

  let result
  if (isGitCode) {
    // GitCode: get upload URL first, then PUT file
    const uploadUrlData = await api('GET', `/repos/${owner}/${repo}/releases/${encodeURIComponent(releaseRef)}/upload_url?file_name=${encodeURIComponent(f.name)}`)
    const targetUrl = uploadUrlData?.upload_url || uploadUrlData?.url
    if (!targetUrl) {
      console.error(`[publish-release] No upload URL in response: ${JSON.stringify(uploadUrlData)}`)
      anyFailed = true
      continue
    }
    result = await uploadToUrl(targetUrl, uploadUrlData?.headers || {}, f.path, f.name)
  } else {
    // Gitee: POST directly to attach_files
    result = await uploadFile(`/repos/${owner}/${repo}/releases/${releaseRef}/attach_files`, f.path, f.name)
  }
  if (!result.ok) {
    anyFailed = true
    console.error(`[publish-release] Failed to upload ${f.name}: ${result.status} ${result.msg}`)
    if (result.msg.includes('文件大小已超出限制') && f.size > 100 * 1024 * 1024) {
      console.error()
      console.error('  The platform limits release attachments to 100 MB (free tier).')
      console.error('  Your installer is >100 MB. Options:')
      console.error('    1. Build again with compression: add to package.json')
      console.error('       build.win.nsis: { compression: "maximum" }')
      console.error('    2. Switch to GitCode (--remote gitcode) which allows larger files')
    }
    continue
  }
  console.log(`[publish-release] ${f.name} uploaded successfully.`)
}

if (anyFailed) {
  console.log('[publish-release] Done with errors.')
  process.exit(1)
}
console.log('[publish-release] Done.')
