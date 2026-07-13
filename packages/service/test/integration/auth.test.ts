import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestHarness, clearDatabase, type TestHarness } from './testHarness.js';

describe('API key auth', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await startTestHarness();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('rejects a request with no X-Api-Key header', async () => {
    const res = await request(harness.app).get('/api/v1/analyses/000000000000000000000000').expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('rejects a request with an invalid X-Api-Key', async () => {
    const res = await request(harness.app)
      .get('/api/v1/analyses/000000000000000000000000')
      .set('X-Api-Key', 'not-the-right-key')
      .expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('accepts a request with the configured X-Api-Key (matches error envelope on the not-found path, not 401)', async () => {
    const res = await request(harness.app).get('/api/v1/analyses/000000000000000000000000').set('X-Api-Key', 'test-api-key');
    expect(res.status).not.toBe(401);
  });

  it('health endpoints are unauthenticated', async () => {
    await request(harness.app).get('/healthz').expect((res) => {
      expect([200, 503]).toContain(res.status);
    });
  });
});
