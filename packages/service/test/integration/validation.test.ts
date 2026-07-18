import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startTestHarness, clearDatabase, type TestHarness } from './testHarness.js';
import { Analysis } from '../../src/models/Analysis.js';
import { SubmissionSnapshot } from '../../src/models/SubmissionSnapshot.js';

// testHarness starts a real BullMQ worker, which will pick up the pull-mode
// job enqueued below in the background regardless of what this test file
// asserts. Mocked to resolve empty rather than hit the real (invalid)
// CODEARENA_BASE_URL placeholder - an empty result is a fast, deterministic
// UnrecoverableError (see analysisWorker.ts), not a slow/flaky DNS failure.
vi.mock('../../src/integrations/codearena.js', () => ({
  fetchContestSubmissions: vi.fn().mockResolvedValue([]),
}));

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

  it('rejects a pull-mode body missing contestId/problemIds', async () => {
    const res = await request(harness.app)
      .post('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .send({ source: 'codearena' })
      .expect(422);
    expect(res.body.error.code).toBe('validation_error');
  });

  // Phase 6: pull mode validates shape and enqueues immediately - it must
  // NOT fetch from CodeArena or create SubmissionSnapshot docs in the route
  // handler (that's worker-side work, see queue/analysisWorker.ts). This is
  // what makes POST /analyses's 202 semantics hold regardless of contest
  // size - proven here by asserting zero snapshots exist right after the
  // response comes back, not by mocking the fetch (there's nothing to mock
  // at this layer since it's never called).
  it('pull mode returns 202 immediately with contestRef set and no snapshots created yet', async () => {
    const res = await request(harness.app)
      .post('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .send({ source: 'codearena', contestId: 'c1', problemIds: ['p1', 'p2'] })
      .expect(202);
    expect(res.body.analysisId).toBeTruthy();

    const analysis = await Analysis.findById(res.body.analysisId);
    expect(analysis!.source).toBe('codearena');
    expect(analysis!.contestRef?.contestId).toBe('c1');
    expect(analysis!.contestRef?.problemIds).toEqual(['p1', 'p2']);
    expect(analysis!.status).toBe('queued');
    expect(analysis!.snapshotsComplete).toBe(false);

    const snapshotCount = await SubmissionSnapshot.countDocuments({ analysisId: analysis!._id });
    expect(snapshotCount).toBe(0);
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
