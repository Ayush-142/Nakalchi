import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Worker, UnrecoverableError, type Job } from 'bullmq';
import mongoose, { type HydratedDocument } from 'mongoose';
import type { Logger } from 'pino';
import type { AnalysisResult, Language, SubmissionInput } from '@nakalchi/core';
import { analyzeCorpus, fingerprint, tokenizeCpp, tokenizePython } from '@nakalchi/core';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { decodeSource, encodeSource } from '../lib/gzip.js';
import { connectMongo } from '../lib/mongo.js';
import { MAX_SUBMISSION_SIZE_BYTES, MAX_CORPUS_SIZE } from '../lib/limits.js';
import { fetchContestSubmissions } from '../integrations/codearena.js';
import { Analysis, type AnalysisDoc } from '../models/Analysis.js';
import { SubmissionSnapshot } from '../models/SubmissionSnapshot.js';
import { Pair } from '../models/Pair.js';
import { deliverWebhook } from '../webhooks/notify.js';
import { ANALYZE_QUEUE_NAME, createRedisConnection, type AnalyzeJobData } from './queues.js';

/** Nakalchi-introduced constant: progress-reporting granularity during the per-submission metadata pass (§5 item 4). */
const PROGRESS_UPDATE_EVERY_N_SUBMISSIONS = 25;

/**
 * Phase 6 pull mode: fetches submissions from CodeArena and stores them as
 * SubmissionSnapshot docs. Called only when `snapshotsComplete` is false -
 * which covers both "never fetched yet" and "a prior attempt's insertMany
 * was interrupted, leaving an untrustworthy partial prefix" (plan review
 * FIX 2: insertMany is not atomic, so trusting `snapshots.length > 0` alone
 * would risk silently analyzing a partial corpus after a crash). Always
 * wipes any existing docs for this analysisId first so a partial prefix is
 * never mixed with a fresh insert; only flips `snapshotsComplete` to true
 * once the fresh insertMany has actually succeeded.
 */
async function fetchAndStorePullModeSnapshots(analysis: HydratedDocument<AnalysisDoc>, log: Logger): Promise<void> {
  const { contestId, problemIds } = analysis.contestRef!;

  await SubmissionSnapshot.deleteMany({ analysisId: analysis._id });

  const fetched = await fetchContestSubmissions(contestId, problemIds, (done, total) => {
    // Fire-and-forget atomic update (plan review FIX 1): analysis.save()
    // here would race the sequential *awaited* saves in stages 1/2 below -
    // mongoose forbids concurrent .save() calls on one loaded document
    // (throws ParallelSaveError). updateOne bypasses the loaded document
    // entirely, so it can safely run concurrently with anything else.
    void Analysis.updateOne({ _id: analysis._id }, { $set: { progress: Math.min(9, Math.round((done / total) * 10)) } });
  });

  const usable = fetched.filter((s) => Buffer.byteLength(s.source, 'utf8') <= MAX_SUBMISSION_SIZE_BYTES);
  if (usable.length !== fetched.length) {
    log.warn({ skipped: fetched.length - usable.length }, 'skipped oversized submissions from CodeArena pull');
  }
  // Deterministic, not transient - retrying won't fix either of these, so
  // skip BullMQ's retry/backoff entirely rather than burning 3 attempts on
  // a condition that can't change between attempts (plan review FIX 3).
  if (usable.length === 0) {
    throw new UnrecoverableError('no analyzable submissions after filtering');
  }
  if (usable.length > MAX_CORPUS_SIZE) {
    throw new UnrecoverableError(`corpus too large: ${usable.length} exceeds cap of ${MAX_CORPUS_SIZE}`);
  }

  const snapshotDocs = usable.map((s) => {
    const { buffer, encoding } = encodeSource(s.source);
    return {
      analysisId: analysis._id,
      externalId: s.externalId,
      userRef: s.userRef,
      problemRef: s.problemRef,
      language: s.language,
      source: buffer,
      sourceEncoding: encoding,
    };
  });
  await SubmissionSnapshot.insertMany(snapshotDocs);

  analysis.snapshotsComplete = true;
  await analysis.save();
}

/**
 * Job handler - idempotency guard, per-submission metadata pass, grouped
 * analyzeCorpus calls, restart-safe finalize. See the phase plan's
 * "Queue design" section for the full reasoning.
 */
export async function processAnalyzeJob(job: Job<AnalyzeJobData>): Promise<void> {
  const { analysisId } = job.data;
  const log = logger.child({ analysisId });

  const analysis = await Analysis.findById(analysisId);
  if (!analysis) {
    log.error('analysis document not found - not retrying');
    return;
  }

  if (analysis.status === 'completed') {
    log.info('stale re-delivery of an already-completed analysis - skipping recomputation');
    // Required fix from plan review: a blanket no-op here would create a
    // crash hole (finalize succeeded, webhook never sent) - still attempt
    // delivery if it hasn't succeeded yet. See webhooks/notify.ts for the
    // at-least-once semantics this implies.
    if (analysis.webhook && !analysis.webhook.delivered) {
      await deliverWebhook(analysis);
    }
    return;
  }

  analysis.status = 'running';
  analysis.progress = 0;
  analysis.startedAt = analysis.startedAt ?? new Date();
  await analysis.save();

  const startedAt = performance.now();

  try {
    if (analysis.source === 'codearena' && !analysis.snapshotsComplete) {
      await fetchAndStorePullModeSnapshots(analysis, log);
    }

    const snapshots = await SubmissionSnapshot.find({ analysisId: analysis._id });
    if (snapshots.length === 0) {
      throw new Error('no submission snapshots found for this analysis');
    }

    // --- Stage 1: per-submission metadata pass (tokenCount/fingerprintCount) ---
    // Redundant with what analyzeCorpus does internally (approved
    // tradeoff, see phase plan's "Core boundary check" - core stays
    // unchanged and unextended). Progress reported every N submissions.
    const decodedSources = new Map<string, string>();
    let fingerprintsTotal = 0;
    for (let i = 0; i < snapshots.length; i++) {
      const snap = snapshots[i]!;
      const source = decodeSource(snap.source as Buffer, snap.sourceEncoding as 'utf8' | 'gzip');
      decodedSources.set(snap._id.toString(), source);

      const language = snap.language as Language;
      const tokens = language === 'cpp' ? tokenizeCpp(source) : tokenizePython(source);
      const fingerprints = fingerprint(source, language, { k: analysis.params.k, w: analysis.params.w });

      snap.tokenCount = tokens.length;
      snap.fingerprintCount = fingerprints.length;
      fingerprintsTotal += fingerprints.length;
      await snap.save();

      if ((i + 1) % PROGRESS_UPDATE_EVERY_N_SUBMISSIONS === 0 || i === snapshots.length - 1) {
        // Stage 1 occupies the first half of the progress bar; stage 2 (matching) the second.
        analysis.progress = Math.min(49, Math.round(((i + 1) / snapshots.length) * 50));
        await analysis.save();
      }
    }

    // --- Stage 2: matching, partitioned by problemRef ---
    // Fingerprints are never meaningfully compared across different
    // problems, so analyzeCorpus is called once PER problemRef group,
    // not once across the whole multi-problem batch.
    const byProblem = new Map<string, typeof snapshots>();
    for (const snap of snapshots) {
      const list = byProblem.get(snap.problemRef);
      if (list) list.push(snap);
      else byProblem.set(snap.problemRef, [snap]);
    }

    const snapshotMeta = new Map(snapshots.map((s) => [s._id.toString(), { userRef: s.userRef }]));

    const allPairDocs: unknown[] = [];
    let candidatePairsTotal = 0;
    let flaggedTotal = 0;
    let groupsDone = 0;

    for (const [problemRef, group] of byProblem) {
      const submissionInputs: SubmissionInput[] = group.map((s) => ({
        id: s._id.toString(),
        language: s.language as Language,
        source: decodedSources.get(s._id.toString())!,
      }));

      const result: AnalysisResult = analyzeCorpus(submissionInputs, {
        k: analysis.params.k,
        w: analysis.params.w,
        basecodeMaxFreq: analysis.params.basecodeMaxFreq,
        flagThreshold: analysis.params.flagThreshold,
        // minSharedFingerprints/corpusCap deliberately omitted - core's own exported defaults apply.
      });

      for (const p of result.pairs) {
        allPairDocs.push({
          analysisId: analysis._id,
          problemRef,
          a: { snapshotId: new mongoose.Types.ObjectId(p.a), userRef: snapshotMeta.get(p.a)!.userRef },
          b: { snapshotId: new mongoose.Types.ObjectId(p.b), userRef: snapshotMeta.get(p.b)!.userRef },
          simAtoB: p.simAtoB,
          simBtoA: p.simBtoA,
          sharedFingerprints: p.sharedFingerprints,
          longestRegionTokens: p.longestRegionTokens,
          flagged: p.flagged,
          regions: p.regions,
        });
      }
      candidatePairsTotal += result.stats.candidatePairs;
      flaggedTotal += result.pairs.filter((p) => p.flagged).length;

      // Progress granularity within stage 2 is per-problemRef-group, not
      // per-N-submissions: core's analyzeCorpus() is a synchronous,
      // zero-I/O black box with no progress callback hook, and core stays
      // unchanged this phase - this is the finest granularity available
      // without touching core.
      groupsDone += 1;
      analysis.progress = 50 + Math.min(49, Math.round((groupsDone / byProblem.size) * 50));
      await analysis.save();
    }

    // --- Stage 3: finalize ---
    // Delete-then-insert (full replace, not incremental), then flip
    // status LAST - restart-safe without needing a Mongo transaction (the
    // single-node mongo:7.0 container isn't a replica set anyway).
    await Pair.deleteMany({ analysisId: analysis._id });
    if (allPairDocs.length > 0) {
      await Pair.insertMany(allPairDocs);
    }

    const wallMs = Math.round(performance.now() - startedAt);

    analysis.status = 'completed';
    analysis.progress = 100;
    analysis.stats = {
      submissions: snapshots.length,
      fingerprints: fingerprintsTotal,
      candidatePairs: candidatePairsTotal,
      flaggedPairs: flaggedTotal,
      wallMs,
    };
    analysis.completedAt = new Date();
    await analysis.save();

    log.info({ wallMs, candidatePairs: candidatePairsTotal, flaggedPairs: flaggedTotal }, 'analysis completed');

    if (analysis.webhook) {
      await deliverWebhook(analysis);
    }
  } catch (err) {
    log.error({ err }, 'analysis attempt failed');
    throw err; // BullMQ retries; the 'failed' handler below takes over once attempts are exhausted
  }
}

export function startAnalysisWorker(): Worker<AnalyzeJobData> {
  const connection = createRedisConnection();
  const worker = new Worker<AnalyzeJobData>(ANALYZE_QUEUE_NAME, processAnalyzeJob, {
    connection,
    prefix: env.QUEUE_PREFIX,
    concurrency: env.WORKER_CONCURRENCY,
  });

  // Terminal failure (§3.2 step 7): BullMQ's own failed-job set is the
  // dead-letter store - once attempts are exhausted, flip status, record
  // the error, and fire the failure webhook.
  worker.on('failed', (job, err) => {
    void (async () => {
      if (!job) return;
      const attemptsMax = job.opts.attempts ?? 1;
      // UnrecoverableError (Phase 6 pull-mode deterministic failures - see
      // fetchAndStorePullModeSnapshots) short-circuits BullMQ's own retry
      // decision regardless of attempts remaining (shouldRetryJob checks
      // `!(err instanceof UnrecoverableError)` before ever consulting
      // attemptsMade < attempts - see node_modules/bullmq's job.js). Without
      // this check, a job that dies unrecoverably on attempt 1 of 3 would
      // hit the early return below (1 < 3) and never flip the analysis to
      // 'failed' - it'd sit in 'running' forever with no webhook fired.
      const isTerminal = job.attemptsMade >= attemptsMax || err instanceof UnrecoverableError;
      if (!isTerminal) return; // will be retried, not terminal yet

      const analysis = await Analysis.findById(job.data.analysisId);
      if (!analysis || analysis.status === 'completed') return;

      analysis.status = 'failed';
      analysis.error = err instanceof Error ? err.message : String(err);
      analysis.completedAt = new Date();
      await analysis.save();

      logger.error({ analysisId: job.data.analysisId, err }, 'analysis permanently failed');
      if (analysis.webhook) {
        await deliverWebhook(analysis);
      }
    })();
  });

  return worker;
}

/**
 * Graceful shutdown (§5 Phase 4 item 8): stop accepting new jobs, let the
 * in-flight one finish (or let BullMQ requeue it), close connections.
 */
async function shutdown(worker: Worker<AnalyzeJobData>): Promise<void> {
  logger.info('worker received shutdown signal, closing');
  await worker.close();
  await mongoose.connection.close();
  logger.info('worker shutdown complete');
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  await connectMongo();
  const worker = startAnalysisWorker();
  logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'analysis worker started');

  process.on('SIGTERM', () => {
    void shutdown(worker).then(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void shutdown(worker).then(() => process.exit(0));
  });
}
