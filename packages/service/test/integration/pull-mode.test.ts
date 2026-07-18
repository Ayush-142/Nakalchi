/**
 * Phase 6 pull mode: worker-side fetch stage (queue/analysisWorker.ts's
 * fetchAndStorePullModeSnapshots, called from processAnalyzeJob). Covers
 * the three plan-review fixes directly:
 *  - FIX 1: progress callback doesn't throw ParallelSaveError (exercised
 *    implicitly by every test below actually reaching 'completed'/'failed'
 *    rather than crashing on a concurrent .save()).
 *  - FIX 2: a stray partial-insert snapshot left by a crashed prior attempt
 *    is wiped, not silently mixed into the final corpus.
 *  - FIX 3: deterministic failures (empty corpus) throw UnrecoverableError
 *    and reach 'failed' status without waiting out BullMQ's retry backoff.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { startTestHarness, clearDatabase, waitForAnalysisStatus, type TestHarness } from './testHarness.js';
import { Analysis } from '../../src/models/Analysis.js';
import { SubmissionSnapshot } from '../../src/models/SubmissionSnapshot.js';
import { processAnalyzeJob } from '../../src/queue/analysisWorker.js';
import { enqueueAnalysis, type AnalyzeJobData } from '../../src/queue/queues.js';
import { CodeArenaFetchError, type CodeArenaSubmission } from '../../src/integrations/codearena.js';

const { fetchContestSubmissions } = vi.hoisted(() => ({ fetchContestSubmissions: vi.fn() }));
vi.mock('../../src/integrations/codearena.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/integrations/codearena.js')>();
  return { ...actual, fetchContestSubmissions };
});

function fakeJob(analysisId: string): Job<AnalyzeJobData> {
  return { data: { analysisId }, opts: { attempts: 3 }, attemptsMade: 0 } as unknown as Job<AnalyzeJobData>;
}

// Well over t = w+k-1 = 20 tokens at production defaults (see
// idempotency.test.ts's identical rationale) so a real pair is guaranteed.
const sharedBody = `
  int total = 0;
  for (int i = 0; i < n; i++) {
      total = total + i;
  }
  return total;
`;

const codeArenaSubmissions: CodeArenaSubmission[] = [
  { externalId: 'e1', userRef: 'u1', problemRef: 'p1', language: 'cpp', source: sharedBody },
  { externalId: 'e2', userRef: 'u2', problemRef: 'p1', language: 'cpp', source: sharedBody },
];

describe('Phase 6 pull-mode worker fetch stage', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await startTestHarness();
  });

  afterEach(async () => {
    await clearDatabase();
    fetchContestSubmissions.mockReset();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('fetches, snapshots, and completes normally on success', async () => {
    fetchContestSubmissions.mockResolvedValue(codeArenaSubmissions);

    const analysis = await Analysis.create({
      source: 'codearena',
      contestRef: { contestId: 'c1', problemIds: ['p1'] },
      params: { k: 17, w: 4, basecodeMaxFreq: 1.1, flagThreshold: 0.35 },
      status: 'queued',
    });

    await processAnalyzeJob(fakeJob(analysis._id.toString()));

    const completed = await Analysis.findById(analysis._id);
    expect(completed!.status).toBe('completed');
    expect(completed!.snapshotsComplete).toBe(true);
    expect(completed!.stats.submissions).toBe(2);

    const snapshots = await SubmissionSnapshot.find({ analysisId: analysis._id }).lean();
    expect(snapshots).toHaveLength(2);
    expect(new Set(snapshots.map((s) => s.externalId))).toEqual(new Set(['e1', 'e2']));
  });

  it('propagates CodeArenaFetchError instead of swallowing it, leaving the analysis non-terminal', async () => {
    fetchContestSubmissions.mockRejectedValue(new CodeArenaFetchError('all page attempts exhausted'));

    const analysis = await Analysis.create({
      source: 'codearena',
      contestRef: { contestId: 'c1', problemIds: ['p1'] },
      params: { k: 17, w: 4, basecodeMaxFreq: 1.1, flagThreshold: 0.35 },
      status: 'queued',
    });

    await expect(processAnalyzeJob(fakeJob(analysis._id.toString()))).rejects.toThrow(CodeArenaFetchError);

    // processAnalyzeJob rethrows for BullMQ to retry - it does not itself
    // flip status to 'failed' (that's the worker.on('failed') handler's
    // job, exercised for real in the UnrecoverableError test below via the
    // harness's actual BullMQ worker).
    const stillRunning = await Analysis.findById(analysis._id);
    expect(stillRunning!.status).toBe('running');
  });

  it('an empty fetched corpus is an UnrecoverableError, reaching failed without retry backoff', async () => {
    fetchContestSubmissions.mockResolvedValue([]);

    const analysis = await Analysis.create({
      source: 'codearena',
      contestRef: { contestId: 'c1', problemIds: ['p1'] },
      params: { k: 17, w: 4, basecodeMaxFreq: 1.1, flagThreshold: 0.35 },
      status: 'queued',
    });
    const postAnalysisId = analysis._id.toString();

    await enqueueAnalysis(harness.queue, postAnalysisId);

    // If UnrecoverableError is not honored by the worker.on('failed') fix,
    // this would burn the full 5s/10s backoff before landing on 'failed'
    // (or never terminate at all - see analysisWorker.ts's comment on the
    // isTerminal check) - a tight timeout here is itself part of the
    // regression coverage for that fix.
    const failed = await waitForAnalysisStatus(postAnalysisId, ['failed'], 4_000);
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('no analyzable submissions');
  });

  it('wipes a stray partial-insert snapshot before re-fetching (restart-safety, FIX 2)', async () => {
    fetchContestSubmissions.mockResolvedValue(codeArenaSubmissions);

    const analysis = await Analysis.create({
      source: 'codearena',
      contestRef: { contestId: 'c1', problemIds: ['p1'] },
      params: { k: 17, w: 4, basecodeMaxFreq: 1.1, flagThreshold: 0.35 },
      status: 'queued',
      snapshotsComplete: false, // simulates a crash mid-insertMany on a prior attempt
    });

    // A leftover doc from the simulated crashed attempt - NOT part of
    // codeArenaSubmissions, so its survival into the final corpus would be
    // directly observable.
    await SubmissionSnapshot.create({
      analysisId: analysis._id,
      externalId: 'stray-partial-insert',
      userRef: 'u-stray',
      problemRef: 'p1',
      language: 'cpp',
      source: Buffer.from(sharedBody, 'utf8'),
      sourceEncoding: 'utf8',
    });

    await processAnalyzeJob(fakeJob(analysis._id.toString()));

    const snapshots = await SubmissionSnapshot.find({ analysisId: analysis._id }).lean();
    expect(snapshots.map((s) => s.externalId).sort()).toEqual(['e1', 'e2']);
  });
});
