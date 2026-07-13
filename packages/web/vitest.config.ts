import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@nakalchi/core': path.resolve(dirname, '../core/src/index.ts'),
      // Plain Node/Vitest resolution doesn't apply Next's "react-server"
      // export condition, so `server-only`'s default export (index.js)
      // always throws by design. Alias straight to its no-op empty.js -
      // the same stub Next's own bundler resolves to for server code -
      // so lib/api.ts is importable under Vitest without pulling in Next.
      'server-only': path.resolve(dirname, '../../node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
