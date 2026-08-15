import { execFile } from 'child_process'
import { readFile, unlink, access, constants, readdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

// ---- Cross-platform Blender executable detection ----

async function isAccessible(filePath: string): Promise<boolean> {
    try {
        const mode = process.platform === 'win32' ? constants.F_OK : constants.X_OK
        await access(filePath, mode)
        return true
    } catch {
        return false
    }
}

const BLENDER_FOUNDATION_DIR = 'C:\\Program Files\\Blender Foundation'
const WINDOWS_APPS_DIR = 'C:\\Program Files\\WindowsApps'
/** Executable names used by Blender on Windows (MSIX Store builds use blender-launcher.exe). */
const BLENDER_EXE_NAMES = ['blender-launcher.exe', 'blender.exe']

const BLENDER_CANDIDATES_MAC = [
    '/Applications/Blender.app/Contents/MacOS/Blender',
]

/** Parse a Blender version from a directory name ("Blender 4.5" / "Blender_5.2.0.0..."). */
function parseBlenderVersion(dirName: string): [number, number] | null {
    const m = /^Blender[ _]?(\d+)\.(\d+)/i.exec(dirName)
    if (!m) return null
    return [Number(m[1]), Number(m[2])]
}

/** Compare [major, minor] tuples; negative when a < b. */
function compareVersions(a: [number, number], b: [number, number]): number {
    if (a[0] !== b[0]) return a[0] - b[0]
    return a[1] - b[1]
}

interface BlenderCandidate {
    exe: string
    version: [number, number]
}

/** Pick the newest accessible candidate. */
function newestCandidate(candidates: BlenderCandidate[]): string | null {
    candidates.sort((a, b) => compareVersions(b.version, a.version))
    return candidates[0]?.exe ?? null
}

/** Scan C:\Program Files\Blender Foundation\Blender X.Y\blender.exe — any version. */
async function findBlenderClassicInstall(): Promise<string | null> {
    let entries: Awaited<ReturnType<typeof readdir>>
    try {
        entries = await readdir(BLENDER_FOUNDATION_DIR, { withFileTypes: true })
    } catch {
        return null // directory does not exist
    }

    const candidates: BlenderCandidate[] = []
    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const version = parseBlenderVersion(entry.name)
        if (!version) continue
        const exe = join(BLENDER_FOUNDATION_DIR, entry.name, 'blender.exe')
        if (await isAccessible(exe)) {
            candidates.push({ exe, version })
        }
    }
    return newestCandidate(candidates)
}

/** Check the MSIX App Execution Alias (%LOCALAPPDATA%\Microsoft\WindowsApps\). */
async function findBlenderMsixAlias(): Promise<string | null> {
    const aliasDir = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps')
    for (const name of BLENDER_EXE_NAMES) {
        const exe = join(aliasDir, name)
        if (await isAccessible(exe)) return exe
    }
    return null
}

/**
 * Scan the MSIX package folder (C:\Program Files\WindowsApps\BlenderFoundation.Blender_*\).
 * The folder is ACL-protected; any read failure simply means no match.
 */
async function findBlenderMsixPackage(): Promise<string | null> {
    let entries: string[]
    try {
        entries = await readdir(WINDOWS_APPS_DIR)
    } catch {
        return null // ACL denied or directory missing
    }

    const candidates: BlenderCandidate[] = []
    for (const name of entries) {
        const version = parseBlenderVersion(name)
        if (!version) continue
        // Executable lives in a Blender\ subfolder inside the package
        const roots = [join(WINDOWS_APPS_DIR, name, 'Blender'), join(WINDOWS_APPS_DIR, name)]
        outer: for (const root of roots) {
            for (const exeName of BLENDER_EXE_NAMES) {
                const exe = join(root, exeName)
                if (await isAccessible(exe)) {
                    candidates.push({ exe, version })
                    break outer
                }
            }
        }
    }
    return newestCandidate(candidates)
}

/** Fallback: search PATH via `where.exe` (covers "Add to PATH" installs). */
async function findBlenderInPath(): Promise<string | null> {
    for (const name of ['blender', 'blender-launcher']) {
        try {
            const { stdout } = await execAsync('where.exe', [name], 5000)
            const first = stdout.split(/\r?\n/).map(l => l.trim()).find(Boolean)
            if (first) return first
        } catch { /* not found */ }
    }
    return null
}

/**
 * Detect Blender executable on the system.
 * Windows: classic install dirs (any version, newest first) → MSIX alias →
 * MSIX package folder → PATH. macOS: /Applications. Linux: `which`.
 * Returns null if not found.
 */
export async function findBlender(customPath?: string): Promise<string | null> {
    if (customPath) {
        if (await isAccessible(customPath)) {
            return customPath
        }
        // On Windows: also try normalizing backslashes → forward slashes
        // (shouldn't matter for fs.access, but be defensive)
        const normalized = customPath.replace(/\\/g, '/')
        if (normalized !== customPath && (await isAccessible(normalized))) {
            return normalized
        }
        // File doesn't exist at the given path — fall through to auto-detect
        console.warn(`[blender-converter] Configured path not accessible: "${customPath}"`)
    }

    const platform = process.platform

    if (platform === 'win32') {
        return (
            (await findBlenderClassicInstall()) ??
            (await findBlenderMsixAlias()) ??
            (await findBlenderMsixPackage()) ??
            (await findBlenderInPath())
        )
    }

    if (platform === 'darwin') {
        for (const candidate of BLENDER_CANDIDATES_MAC) {
            if (await isAccessible(candidate)) {
                return candidate
            }
        }
        return null
    }

    // Linux / other: try `which blender`
    try {
        const { stdout } = await execAsync('which', ['blender'], 5000)
        const path = stdout.trim()
        if (path) return path
    } catch { /* not found */ }

    return null
}

/** Promise wrapper for execFile with timeout */
function execAsync(
    cmd: string,
    args: string[],
    timeoutMs: number = 120_000,
): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = execFile(cmd, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
            if (error) reject(error)
            else resolve({ stdout, stderr })
        })
        // Ensure cleanup on timeout
        setTimeout(() => {
            if (!child.killed) child.kill()
        }, timeoutMs + 2000)
    })
}

/**
 * Convert a .blend file to GLB via Blender headless CLI.
 *
 * Flow:
 *  1. Call `blender -b <blendPath> --python-expr <export_script>`
 *  2. Blender loads the file in background, executes glTF export
 *  3. Read the generated GLB temp file, return as Buffer
 *  4. Clean up temp file
 */
export async function blendToGlb(
    blendPath: string,
    blenderExe: string,
    timeoutMs: number = 120_000,
): Promise<Buffer> {
    const outGlb = join(app.getPath('temp'), `faicad-blend-${Date.now()}.glb`)

    // Python inline script: export scene as GLB
    // Escape backslashes for Windows paths inside raw string literal
    const escapedOutGlb = outGlb.replace(/\\/g, '\\\\')
    const pyExpr = [
        'import bpy',
        `bpy.ops.export_scene.gltf(filepath=r'${escapedOutGlb}', export_format='GLB')`,
    ].join('; ')

    try {
        await execAsync(blenderExe, ['-b', blendPath, '--python-expr', pyExpr], timeoutMs)
    } catch (err: any) {
        await unlink(outGlb).catch(() => { })
        throw new Error(`Blender conversion failed: ${err.message || err}`, { cause: err })
    }

    let glbBuffer: Buffer
    try {
        glbBuffer = await readFile(outGlb)
    } catch (err: any) {
        throw new Error(`Failed to read converted GLB: ${err.message || err}`, { cause: err })
    }

    // Clean up temp file
    await unlink(outGlb).catch(() => { })

    return glbBuffer
}
