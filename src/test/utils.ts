import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

export function getElectronPath(): string {
  const platform = process.platform
  if (platform === 'win32') {
    return path.join(PROJECT_ROOT, 'dist', 'win-unpacked', '3D_Viewer.exe')
  }
  if (platform === 'darwin') {
    return path.join(PROJECT_ROOT, 'dist', 'mac', '3D_Viewer.app')
  }
  if (platform === 'linux') {
    return path.join(PROJECT_ROOT, 'dist', 'linux-unpacked', '3d_viewer_electron')
  }
  throw new Error(`Unsupported platform: ${platform}`)
}
