import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { createAnalyzeQueue, type AnalyzeJobData } from '../../src/queue/queues.js';
import { startAnalysisWorker } from '../../src/queue/analysisWorker.js';
import { Analysis } from '../../src/models/Analysis.js';
import { SubmissionSnapshot } from '../../src/models/SubmissionSnapshot.js';
import { Pair } from '../../src/models/Pair.js';
import type { Queue, Worker } from 'bullmq';

export interface TestHarness {
  app: Express;
  mongoServer: MongoMemoryServer;
  redis: Redis;
  queue: Queue<AnalyzeJobData>;
  worker: Worker<AnalyzeJobData>;
  teardown: () => Promise<void>;
}

/**
 * Mongo: mongodb-memory-server, connected DIRECTLY via
 * mongoose.connect(mongoServer.getUri()) - env.MONGO_URI (set to a
 * placeholder in vitest.config.ts) only needs to satisfy config/env.ts's
 * startup validation, it's never actually connected to.
 *
 * Redis: real, from env.REDIS_URL (docker-compose locally, a GitHub
 * Actions service in CI) - BullMQ's semantics aren't reasonably fakeable.
 */
export async function startTestHarness(): Promise<TestHarness> {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Promise.all([Analysis.syncIndexes(), SubmissionSnapshot.syncIndexes(), Pair.syncIndexes()]);

  const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  const queue = createAnalyzeQueue(redis);
  const worker = startAnalysisWorker();

  const app = createApp({ queue, redis });

  const teardown = async (): Promise<void> => {
    await worker.close();
    await queue.close();
    redis.disconnect();
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  };

  return { app, mongoServer, redis, queue, worker, teardown };
}

export async function clearDatabase(): Promise<void> {
  await Promise.all([Analysis.deleteMany({}), SubmissionSnapshot.deleteMany({}), Pair.deleteMany({})]);
}

export async function waitForAnalysisStatus(
  analysisId: string,
  targetStatuses: readonly ('completed' | 'failed')[],
  timeoutMs = 20_000,
): Promise<InstanceType<typeof Analysis>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const analysis = await Analysis.findById(analysisId);
    if (analysis && targetStatuses.includes(analysis.status as 'completed' | 'failed')) {
      return analysis;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`analysis ${analysisId} did not reach [${targetStatuses.join(',')}] within ${timeoutMs}ms`);
}
