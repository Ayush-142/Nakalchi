import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestHarness, clearDatabase, type TestHarness } from './testHarness.js';

const validSubmission = { externalId: 'e1', userRef: 'u1', problemRef: 'p1', language: 'cpp', source: 'int main() { return 0; }' };

describe('POST /analyses validation', () => {
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

  it('rejects a malformed body (missing submissions)', async () => {
    const res = await request(harness.app).post('/api/v1/analyses').set('X-Api-Key', 'test-api-key').send({}).expect(422);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('rejects a per-submission source over the 256KB cap', async () => {
    const oversized = { ...validSubmission, source: 'x'.repeat(256 * 1024 + 1) };
    const res = await request(harness.app)
      .post('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .send({ submissions: [oversized] })
      .expect(422);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('rejects a corpus over the 5,000-submission cap', async () => {
    const submissions = Array.from({ length: 5001 }, (_, i) => ({ ...validSubmission, externalId: `e${i}` }));
    const res = await request(harness.app)
      .post('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .send({ submissions })
      .expect(422);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('rejects pull mode (source: "codearena") as not-yet-supported in this phase', async () => {
    const res = await request(harness.app)
      .post('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .send({ source: 'codearena', contestId: 'c1', problemIds: ['p1'] })
      .expect(422);
    expect(res.body.error.code).toBe('unsupported_source');
  });

  it('rejects an invalid callbackUrl', async () => {
    const res = await request(harness.app)
      .post('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .send({ submissions: [validSubmission], callbackUrl: 'not-a-url' })
      .expect(422);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('accepts a well-formed direct-mode request', async () => {
    const res = await request(harness.app)
      .post('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .send({ submissions: [validSubmission] })
      .expect(202);
    expect(res.body.analysisId).toBeTruthy();
  });
});
