import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Integration tests need a database; they run via vitest.integration.config.ts
    exclude: ['**/node_modules/**', 'src/**/*.int.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Server modules guard themselves with `server-only`; stub it so their
      // pure exports (transition maps, label tables) can be unit tested.
      'server-only': path.resolve(__dirname, './test/server-only-stub.ts'),
    },
  },
})
