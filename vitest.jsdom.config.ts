import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup-jsdom.ts'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
})
