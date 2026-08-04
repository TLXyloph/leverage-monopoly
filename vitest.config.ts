import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'packages/**/tests/**/*.test.ts'],
    environment: 'node',
    coverage: { provider: 'v8', include: ['packages/engine/src/**'] },
    // Task 20's property suite pins fast-check's run budget and seed reporting here.
    // Loaded for every test file (setupFiles has no glob scoping in vitest), but the
    // file does nothing but call fc.configureGlobal, which is a no-op for every test
    // that never imports fast-check.
    setupFiles: ['./packages/engine/tests/property/setup.ts'],
    testTimeout: 180_000,
  },
})
