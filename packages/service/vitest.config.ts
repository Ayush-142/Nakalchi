import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Point straight at core's source (not dist/) so editing core and
      // re-running service's tests never depends on a build step in between.
      '@nakalchi/core': path.resolve(dirname, '../core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Applied before any test file's imports run, so config/env.ts's
    // fail-fast validation (which runs as a module-load side effect)
    // always sees valid values. MONGO_URI here is a placeholder never
    // actually connected to - integration tests call
    // mongoose.connect(mongoServer.getUri()) directly via
    // mongodb-memory-server instead (see test/integration/testHarness.ts).
    // REDIS_URL must point at a real Redis (docker-compose locally, a
    // GitHub Actions service in CI) - BullMQ isn't reasonably fakeable.
    env: {
      MONGO_URI: 'mongodb://localhost:27017/nakalchi-test-placeholder',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      API_KEYS: 'test-api-key',
      WEBHOOK_SECRET: 'test-webhook-secret-value',
      QUEUE_PREFIX: 'NakalchiTest:',
    },
    testTimeout: 30_000,
    // mongodb-memory-server downloads a real mongod binary (~600MB) on
    // first use per machine - one-time cost, cached afterward. Generous
    // enough to survive that cold-start download.
    hookTimeout: 180_000,
    // Integration test files each start their own BullMQ Worker/Queue
    // against the SAME real Redis instance with the SAME QUEUE_PREFIX
    // (fixed above, since env vars are set once per process). Running
    // files in parallel let one file's worker consume another file's job
    // after that file's own harness had already torn down (observed:
    // "analysis document not found" from a foreign worker). Sequential
    // file execution guarantees only one harness/worker is ever alive.
    fileParallelism: false,
  },
});
