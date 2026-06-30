import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { get } from 'node:https';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

if (process.platform !== 'win32') {
  console.log(`[ensure-electron] skipping on ${process.platform}, only needed on win32`);
  process.exit(0);
}

function findElectronDir() {
  const pnpmDir = join(rootDir, 'node_modules', '.pnpm');
  if (existsSync(pnpmDir)) {
    const entries = readdirSync(pnpmDir);
    const match = entries.find(e => /^electron@\d+\.\d+\.\d+$/.test(e));
    if (match) {
      const dir = join(pnpmDir, match, 'node_modules', 'electron');
      const pkgPath = join(dir, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'electron' && pkg.version) return { dir, version: pkg.version };
      }
    }
  }
  const fallback = join(rootDir, 'node_modules', 'electron');
  if (existsSync(join(fallback, 'package.json'))) {
    const pkg = JSON.parse(readFileSync(join(fallback, 'package.json'), 'utf-8'));
    if (pkg.name === 'electron' && pkg.version) return { dir: fallback, version: pkg.version };
  }
  return null;
}

function getPlatform() {
  return process.platform;
}

function getArch() {
  return process.arch;
}

function getPlatformPath() {
  const p = getPlatform();
  if (p === 'win32') return 'electron.exe';
  if (p === 'darwin') return 'Electron.app/Contents/MacOS/Electron';
  return 'electron';
}

function getCacheDir() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(process.env.USERPROFILE, 'AppData', 'Local');
    return join(localAppData, 'electron', 'Cache');
  }
  if (process.platform === 'darwin') {
    return join(process.env.HOME, 'Library', 'Caches', 'electron');
  }
  return join(process.env.XDG_CACHE_HOME || join(process.env.HOME, '.cache'), 'electron');
}

function getCacheZipPath(version) {
  const platform = getPlatform();
  const arch = getArch();
  return join(getCacheDir(), `electron-v${version}-${platform}-${arch}.zip`);
}

function getMirrorUrl(version) {
  const platform = getPlatform();
  const arch = getArch();
  const mirror = 'https://npmmirror.com/mirrors/electron/';
  return `${mirror}v${version}/electron-v${version}-${platform}-${arch}.zip`;
}

function isInstalled(electronDir, version) {
  const distVersionPath = join(electronDir, 'dist', 'version');
  const distExePath = join(electronDir, 'dist', getPlatformPath());
  const pathTxtPath = join(electronDir, 'path.txt');

  try {
    const distVer = readFileSync(distVersionPath, 'utf-8').replace(/^v/, '').trim();
    if (distVer !== version) return false;
  } catch { return false; }

  try {
    const pathTxt = readFileSync(pathTxtPath, 'utf-8').trim();
    if (pathTxt !== getPlatformPath()) return false;
  } catch { return false; }

  return existsSync(distExePath);
}

function extractZip(zipPath, destDir) {
  const result = spawnSync('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
  ], { stdio: 'pipe', timeout: 60000 });
  return result.status === 0;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

async function ensureElectronBinary() {
  const info = findElectronDir();
  if (!info) {
    console.error('[ensure-electron] electron package not found');
    process.exit(1);
  }

  const { dir: electronDir, version } = info;
  console.log(`[ensure-electron] electron ${version} at ${electronDir}`);

  if (isInstalled(electronDir, version)) {
    console.log('[ensure-electron] binary already installed');
    return;
  }

  console.log('[ensure-electron] binary missing, installing...');
  const distDir = join(electronDir, 'dist');
  mkdirSync(distDir, { recursive: true });

  const cacheZip = getCacheZipPath(version);
  if (existsSync(cacheZip)) {
    console.log(`[ensure-electron] extracting from cache: ${cacheZip}`);
    if (!extractZip(cacheZip, distDir)) {
      console.error('[ensure-electron] cache extraction failed');
      process.exit(1);
    }
  } else {
    const url = getMirrorUrl(version);
    console.log(`[ensure-electron] downloading from ${url}`);
    const tmpZip = join(tmpdir(), `electron-v${version}.zip`);
    try {
      await downloadFile(url, tmpZip);
      console.log('[ensure-electron] download complete, extracting...');
      if (!extractZip(tmpZip, distDir)) {
        console.error('[ensure-electron] extraction failed');
        process.exit(1);
      }
    } catch (err) {
      console.error(`[ensure-electron] download failed: ${err.message}`);
      process.exit(1);
    }
  }

  writeFileSync(join(electronDir, 'path.txt'), getPlatformPath());
  console.log('[ensure-electron] path.txt written');

  if (isInstalled(electronDir, version)) {
    console.log('[ensure-electron] installation verified');
  } else {
    console.error('[ensure-electron] installation verification failed');
    process.exit(1);
  }
}

ensureElectronBinary();
