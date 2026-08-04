import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'packages/**/tests/**/*.test.ts'],
    environment: 'node',
    coverage: { provider: 'v8', include: ['packages/engine/src/**'] },
  },
})
