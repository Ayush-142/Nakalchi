/**
 * §5 Phase 4 item 8's own acceptance test, run manually per §6
 * ("Chaos | manual + scripted kill/restart") - NOT part of the CI-gated
 * vitest suite (matches §6's CI order, which has no chaos/e2e step, and
 * the same "too slow for every push" treatment benchmarks get).
 *
 * Requires real Mongo + Redis already running (e.g. `docker compose up -d
 * mongo redis`). Does NOT require the API container - creates the
 * analysis directly via Mongoose + the queue module, then spawns the
 * WORKER as a real child process, SIGKILLs it mid-run, respawns it, and
 * asserts the analysis reaches `completed` with exactly the pair count an
 * uninterrupted reference run of the same corpus would produce (computed
 * in-process via core's own analyzeCorpus, independent of the service).
 *
 * Usage: npx tsx packages/service/test/e2e/kill-restart.ts
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';
import { analyzeCorpus, DEFAULT_BASECODE_MAX_FREQ, DEFAULT_FLAG_THRESHOLD, DEFAULT_K, DEFAULT_W } from '@nakalchi/core';
import type { SubmissionInput } from '@nakalchi/core';
import { Analysis } from '../../src/models/Analysis.js';
import { SubmissionSnapshot } from '../../src/models/SubmissionSnapshot.js';
import { Pair } from '../../src/models/Pair.js';
import { createAnalyzeQueue, createRedisConnection, enqueueAnalysis } from '../../src/queue/queues.js';
import { encodeSource } from '../../src/lib/gzip.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..', '..', '..', '..');
const workerEntry = join(repoRoot, 'packages', 'service', 'src', 'queue', 'analysisWorker.ts');

const RESOLVED_PARAMS = { k: DEFAULT_K, w: DEFAULT_W, basecodeMaxFreq: DEFAULT_BASECODE_MAX_FREQ, flagThreshold: DEFAULT_FLAG_THRESHOLD };

// Statement SHAPES, not just numeric literals - repeating the exact bug
// already hit once in Phase 3's bench/corpus.bench.ts: numeric literals
// normalize to NUM regardless of value, so varying only numbers makes
// every submission collapse to the identical repetitive normalized
// pattern, which base-code filtering then (correctly) treats as ~100%
// template and strips entirely, leaving nothing to match on.
const STATEMENT_SHAPES: ((line: number, a: number, b: number) => string)[] = [
  (line, a, b) => `    int x${line} = ${a} + ${b};`,
  (line, a, b) => `    int x${line} = ${a} - ${b};`,
  (line, a) => `    if (x${line} > ${a}) { x${line} = ${a}; }`,
  (line, a) => `    for (int j = 0; j < ${a}; j++) { x${line} += j; }`,
  (line, a, b) => `    x${line} = (${a} * ${b}) % 7;`,
];

// Larger synthetic corpus - large enough that processing takes a
// meaningfully non-instant amount of time, giving the kill a real window
// to land mid-run, without being so large the whole script becomes slow.
// Every submission shares one fixed "seed body" (guaranteeing real
// matches to find, and therefore real pairs to check for duplication
// after kill+restart), each wrapped in a distinct, varied-shape prefix so
// they aren't byte-identical.
function generateCorpus(n: number): SubmissionInput[] {
  const sharedLines = Array.from({ length: 80 }, (_, line) => STATEMENT_SHAPES[line % STATEMENT_SHAPES.length]!(line, line % 97, (line * 7) % 53));
  const sharedBody = sharedLines.join('\n');

  return Array.from({ length: n }, (_, i) => {
    const prefixLines = Array.from(
      { length: 10 },
      (_, line) => STATEMENT_SHAPES[(i + line) % STATEMENT_SHAPES.length]!(1000 + line, (i + line) % 97, (i * 3 + line * 7) % 53),
    );
    const source = `int main() {\n${prefixLines.join('\n')}\n${sharedBody}\n    return 0;\n}`;
    return { id: `sub-${i}`, language: 'cpp' as const, source };
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(check: () => Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await wait(200);
  }
  throw new Error(`timed out waiting for: ${label}`);
}

function spawnWorker(): ReturnType<typeof spawn> {
  // Windows: `npx` resolves to `npx.cmd`, and spawning a .cmd file
  // directly (even by naming it explicitly) fails with EINVAL without
  // shell involvement - .cmd/.bat aren't real executables, they require
  // the command interpreter. shell:true is required here; passing the WHOLE
  // invocation as one string (not a separate args array) is the
  // recommended safe pattern - it sidesteps shell:true's argument-escaping
  // pitfall entirely (there's nothing to mis-escape), and there's no
  // external/attacker-controlled input in this command regardless.
  const child = spawn(`npx tsx "${workerEntry}"`, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    shell: true,
  });
  return child;
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/Nakalchi';
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.MONGO_URI = mongoUri;
  process.env.REDIS_URL = redisUrl;
  process.env.API_KEYS ??= 'chaos-script-key';
  process.env.WEBHOOK_SECRET ??= 'chaos-script-webhook-secret';
  process.env.QUEUE_PREFIX ??= 'Nakalchi:';

  console.log(`Connecting to Mongo (${mongoUri}) and Redis (${redisUrl})...`);
  await mongoose.connect(mongoUri);
  await Promise.all([Analysis.syncIndexes(), SubmissionSnapshot.syncIndexes(), Pair.syncIndexes()]);
  const redis = createRedisConnection();
  const queue = createAnalyzeQueue(redis);

  const submissions = generateCorpus(300);
  console.log(`Generated ${submissions.length} synthetic submissions.`);

  console.log('Computing reference pair count via core.analyzeCorpus() directly (independent of the service)...');
  const reference = analyzeCorpus(submissions, RESOLVED_PARAMS);
  console.log(`Reference: ${reference.pairs.length} pairs, ${reference.stats.candidatePairs} candidatePairs.`);

  console.log('Creating analysis + snapshots in Mongo...');
  const analysis = await Analysis.create({ source: 'api', params: RESOLVED_PARAMS, status: 'queued' });
  await SubmissionSnapshot.insertMany(
    submissions.map((s) => {
      const { buffer, encoding } = encodeSource(s.source);
      return {
        analysisId: analysis._id,
        externalId: s.id,
        userRef: s.id,
        problemRef: 'chaos-test',
        language: s.language,
        source: buffer,
        sourceEncoding: encoding,
      };
    }),
  );
  await enqueueAnalysis(queue, analysis._id.toString());
  console.log(`Analysis ${analysis._id.toString()} enqueued.`);

  console.log('Spawning worker (attempt 1)...');
  let worker = spawnWorker();

  console.log('Waiting for the analysis to start running...');
  await waitForCondition(
    async () => {
      const doc = await Analysis.findById(analysis._id);
      return doc?.status === 'running' && doc.progress > 0;
    },
    20_000,
    'analysis to reach status=running with progress>0',
  );

  console.log('Analysis is running - SIGKILLing the worker mid-run...');
  worker.kill('SIGKILL');
  await wait(500);

  console.log('Respawning worker (attempt 2, simulating restart)...');
  worker = spawnWorker();

  console.log('Waiting for the analysis to reach a terminal status...');
  await waitForCondition(
    async () => {
      const doc = await Analysis.findById(analysis._id);
      return doc?.status === 'completed' || doc?.status === 'failed';
    },
    60_000,
    'analysis to reach completed/failed after restart',
  );

  const final = await Analysis.findById(analysis._id);
  const finalPairs = await Pair.find({ analysisId: analysis._id }).lean();

  console.log(`Final status: ${final?.status}`);
  console.log(`Final pair count: ${finalPairs.length} (reference: ${reference.pairs.length})`);

  worker.kill('SIGTERM');

  if (final?.status !== 'completed') {
    throw new Error(`Expected status=completed, got ${final?.status} (error: ${final?.error})`);
  }
  if (finalPairs.length !== reference.pairs.length) {
    throw new Error(`Pair count mismatch after kill+restart: got ${finalPairs.length}, expected ${reference.pairs.length}`);
  }

  console.log('PASS: kill-and-restart produced exactly-once results (pair count matches the uninterrupted reference run).');

  await queue.close();
  redis.disconnect();
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('FAIL:', err);
  process.exit(1);
});
