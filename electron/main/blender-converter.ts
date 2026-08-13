import { execFile } from 'child_process'
import { readFile, unlink, access, constants } from 'fs/promises'
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

const BLENDER_CANDIDATES_WIN = [
    'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 3.6\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 3.5\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 3.4\\blender.exe',
]

const BLENDER_CANDIDATES_MAC = [
    '/Applications/Blender.app/Contents/MacOS/Blender',
]

/**
 * Detect Blender executable on the system.
 * Scans versioned paths (newest first) on Windows/macOS;
 * uses `which` on Linux. Returns null if not found.
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

    const candidates =
        platform === 'win32' ? BLENDER_CANDIDATES_WIN :
            platform === 'darwin' ? BLENDER_CANDIDATES_MAC :
                [] // Linux handled below

    for (const candidate of candidates) {
        if (await isAccessible(candidate)) {
            return candidate
        }
    }

    // Linux / other: try `which blender`
    if (platform === 'linux') {
        try {
            const { stdout } = await execAsync('which', ['blender'], 5000)
            const path = stdout.trim()
            if (path) return path
        } catch { /* not found */ }
    }

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
        throw new Error(`Blender conversion failed: ${err.message || err}`)
    }

    let glbBuffer: Buffer
    try {
        glbBuffer = await readFile(outGlb)
    } catch (err: any) {
        throw new Error(`Failed to read converted GLB: ${err.message || err}`)
    }

    // Clean up temp file
    await unlink(outGlb).catch(() => { })

    return glbBuffer
}
