/**
 * Environment-based detection for software GPU scenarios.
 *
 * No WebGL probing at all — purely checks the test runner's environment.
 * In WSL, Linux CI, and Windows Server CI there is no hardware GPU
 * available, so these environments always use software rendering.
 */

/**
 * Returns true when running in an environment that lacks a hardware GPU:
 *   - WSL (no GPU passthrough)
 *   - CI runners (GitHub Actions, GitLab CI, Jenkins, etc.)
 */
export function isSoftwareGpu(): boolean {
  if (process.env.WSL_DISTRO_NAME) return true
  // macOS CI runners (e.g. GitHub Actions macos-latest) have hardware GPU.
  if (process.env.CI && process.platform !== 'darwin') return true
  return false
}
