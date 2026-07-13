/**
 * §5 Phase 4 item 9: idempotent re-enqueue. Calls the worker's job
 * handler directly, twice, against the same analysisId (simulating
 * BullMQ re-delivery) - this tests OUR OWN idempotency guard logic in
 * queue/analysisWorker.ts, not BullMQ's own (separately well-tested)
 * retry mechanics.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Job } from 'bullmq';
import { DEFAULT_FLAG_THRESHOLD, DEFAULT_K, DEFAULT_W } from '@nakalchi/core';
import { startTestHarness, clearDatabase, type TestHarness } from './testHarness.js';
import { Analysis } from '../../src/models/Analysis.js';
import { SubmissionSnapshot } from '../../src/models/SubmissionSnapshot.js';
import { Pair } from '../../src/models/Pair.js';
import { processAnalyzeJob } from '../../src/queue/analysisWorker.js';
import type { AnalyzeJobData } from '../../src/queue/queues.js';

function fakeJob(analysisId: string): Job<AnalyzeJobData> {
  return { data: { analysisId }, opts: { attempts: 3 }, attemptsMade: 0 } as unknown as Job<AnalyzeJobData>;
}

// Identical content on both sides, well over t = w+k-1 = 20 tokens at
// production defaults - Phase 2's own guarantee property means this is
// GUARANTEED to produce at least one shared fingerprint, so the test
// reliably has real pairs to check for duplication, not a marginal case.
const sharedBody = `
  int total = 0;
  for (int i = 0; i < n; i++) {
      total = total + i;
  }
  return total;
`;

describe('worker idempotency: re-delivered job does not duplicate pairs', () => {
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

  it('processing the same analysisId twice leaves the pair count and content unchanged', async () => {
    // basecodeMaxFreq disabled (>1, impossible to exceed): with only 2
    // submissions, any content genuinely shared between them has
    // docFreq/N = 2/2 = 1.0, which the default filter would (correctly)
    // treat as "template" and exclude entirely - that's base-code
    // filtering working as intended (already covered by core's own
    // basecode.test.ts), not what THIS test checks. Same pitfall hit and
    // fixed the same way in Phase 3's pipeline.test.ts smoke test.
    const analysis = await Analysis.create({
      source: 'api',
      params: { k: DEFAULT_K, w: DEFAULT_W, basecodeMaxFreq: 1.1, flagThreshold: DEFAULT_FLAG_THRESHOLD },
      status: 'queued',
    });

    await SubmissionSnapshot.insertMany([
      {
        analysisId: analysis._id,
        externalId: 'e1',
        userRef: 'u1',
        problemRef: 'p1',
        language: 'cpp',
        source: Buffer.from(sharedBody, 'utf8'),
        sourceEncoding: 'utf8',
      },
      {
        analysisId: analysis._id,
        externalId: 'e2',
        userRef: 'u2',
        problemRef: 'p1',
        language: 'cpp',
        source: Buffer.from(sharedBody, 'utf8'),
        sourceEncoding: 'utf8',
      },
    ]);

    await processAnalyzeJob(fakeJob(analysis._id.toString()));

    const firstAnalysis = await Analysis.findById(analysis._id);
    expect(firstAnalysis!.status).toBe('completed');
    const firstPairs = await Pair.find({ analysisId: analysis._id }).lean();
    expect(firstPairs.length).toBeGreaterThan(0);

    // Simulate BullMQ re-delivery of the same (already-completed) job.
    await processAnalyzeJob(fakeJob(analysis._id.toString()));

    const secondPairs = await Pair.find({ analysisId: analysis._id }).lean();
    expect(secondPairs.length).toBe(firstPairs.length);
    expect(secondPairs.map((p) => p.sharedFingerprints).sort()).toEqual(firstPairs.map((p) => p.sharedFingerprints).sort());
  });
});
