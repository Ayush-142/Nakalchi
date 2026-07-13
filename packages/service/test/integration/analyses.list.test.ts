/**
 * GET /api/v1/analyses - Phase 5 sanctioned gap-fill (see routes/analyses.ts).
 * Creates Analysis docs directly rather than through POST + the worker,
 * since this route only reads the analyses collection.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestHarness, clearDatabase, type TestHarness } from './testHarness.js';
import { Analysis } from '../../src/models/Analysis.js';

const baseParams = { k: 17, w: 4, basecodeMaxFreq: 0.5, flagThreshold: 0.35 };

async function seedAnalysis(overrides: {
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: Date;
}): Promise<string> {
  const doc = await Analysis.create({
    source: 'api',
    params: baseParams,
    status: overrides.status,
    progress: overrides.status === 'completed' ? 100 : 0,
    createdAt: overrides.createdAt,
  });
  return doc._id.toString();
}

describe('GET /api/v1/analyses', () => {
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

  it('lists analyses most-recent-first, projecting summary fields only', async () => {
    const older = await seedAnalysis({ status: 'completed', createdAt: new Date('2026-07-01T00:00:00Z') });
    const newer = await seedAnalysis({ status: 'running', createdAt: new Date('2026-07-02T00:00:00Z') });

    const res = await request(harness.app).get('/api/v1/analyses').set('X-Api-Key', 'test-api-key').expect(200);

    const ids = (res.body.analyses as { analysisId: string }[]).map((a) => a.analysisId);
    expect(ids).toEqual([newer, older]);

    const first = res.body.analyses[0];
    expect(first).toMatchObject({ analysisId: newer, source: 'api', status: 'running', progress: 0 });
    expect(first.params).toBeUndefined();
    expect(first.webhook).toBeUndefined();
    expect(res.body.nextCursor).toBeNull();
  });

  it('filters by status', async () => {
    await seedAnalysis({ status: 'completed', createdAt: new Date('2026-07-01T00:00:00Z') });
    const failedId = await seedAnalysis({ status: 'failed', createdAt: new Date('2026-07-02T00:00:00Z') });

    const res = await request(harness.app)
      .get('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .query({ status: 'failed' })
      .expect(200);

    expect(res.body.analyses).toHaveLength(1);
    expect(res.body.analyses[0].analysisId).toBe(failedId);
  });

  it('rejects an invalid status value', async () => {
    const res = await request(harness.app)
      .get('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .query({ status: 'bogus' })
      .expect(422);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('paginates with a cursor, correctly breaking createdAt ties by _id', async () => {
    const tiedCreatedAt = new Date('2026-07-03T00:00:00Z');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(await seedAnalysis({ status: 'completed', createdAt: tiedCreatedAt }));
    }
    // ids are already in ascending _id order (insertion order) - that's
    // also the expected page order for tied createdAt values (_id asc tiebreak).

    const page1 = await request(harness.app)
      .get('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .query({ limit: 2 })
      .expect(200);
    expect(page1.body.analyses.map((a: { analysisId: string }) => a.analysisId)).toEqual([ids[0], ids[1]]);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(harness.app)
      .get('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .query({ limit: 2, cursor: page1.body.nextCursor })
      .expect(200);
    expect(page2.body.analyses.map((a: { analysisId: string }) => a.analysisId)).toEqual([ids[2]]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('rejects an invalid cursor', async () => {
    const res = await request(harness.app)
      .get('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .query({ cursor: 'not-valid-base64url-json' })
      .expect(422);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('requires auth', async () => {
    const res = await request(harness.app).get('/api/v1/analyses').expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });
});
