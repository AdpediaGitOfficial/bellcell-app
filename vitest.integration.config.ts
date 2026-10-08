import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Integration tests run against a real PostgreSQL database and are therefore
 * kept out of the default `npm test` run.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    setupFiles: ['./vitest.setup.int.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Server modules guard themselves with `server-only`; stub it so the
      // integration tests can import them directly.
      'server-only': path.resolve(__dirname, './test/server-only-stub.ts'),
    },
  },
})
