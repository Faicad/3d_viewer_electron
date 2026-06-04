import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['src/test/**', 'src/**/__tests__/**'],
    setupFiles: ['fake-indexeddb/auto'],
    teardownTimeout: 15000,
    pool: 'threads',
    maxThreads: 1,
    singleThread: true,
    execArgv: ['--max-old-space-size=4096'],
    server: {
      deps: {
        inline: ['@linkiez/dxf-renew'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
})
