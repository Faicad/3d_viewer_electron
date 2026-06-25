import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getGitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/main/index.ts')
        }
      }
    },
    define: {
      'process.env.VITE_GIT_COMMIT': JSON.stringify(getGitHash()),
      'process.env.VITE_DATA_REGION': JSON.stringify(
        process.env.EDITION === 'cn' ? 'cn' : (process.env.DATA_REGION || 'us')
      ),
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: 'electron/preload/index.ts',
        formats: ['cjs']
      },
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/preload/index.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    root: path.resolve(__dirname, 'src/renderer'),
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'clean-hdr-output',
        closeBundle() {
          const envDir = path.resolve(__dirname, 'out/renderer/env')
          if (!fs.existsSync(envDir)) return
          for (const file of fs.readdirSync(envDir)) {
            if (file.endsWith('.hdr')) {
              fs.unlinkSync(path.join(envDir, file))
            }
          }
        },
      },
    ],
    build: {
      outDir: path.resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer')
      }
    }
  }
})