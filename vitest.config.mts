import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts', 'components/**/*.test.ts'],
    // Formatting depends on ICU data and the local timezone; pin both.
    env: { TZ: 'Asia/Dushanbe' },
  },
})
