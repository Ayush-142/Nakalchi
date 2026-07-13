import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const ANALYZE_QUEUE_NAME = 'analyze';

/**
 * Nakalchi-introduced constant, not one of §4.1's 5 named env vars - same
 * treatment as core's Phase 3 corpusCap: clearly commented, not an
 * unexplained magic number. Base delay for BullMQ's exponential backoff
 * (§3.2 item 7: "BullMQ retry with backoff (max 3)").
 */
export const JOB_BACKOFF_BASE_MS = 5_000;

export interface AnalyzeJobData {
  analysisId: string;
}

/** BullMQ requires maxRetriesPerRequest: null on connections it manages. */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export function createAnalyzeQueue(connection: Redis): Queue<AnalyzeJobData> {
  return new Queue<AnalyzeJobData>(ANALYZE_QUEUE_NAME, {
    connection,
    prefix: env.QUEUE_PREFIX,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: JOB_BACKOFF_BASE_MS },
      removeOnComplete: { count: 1000 },
      removeOnFail: false, // BullMQ's own failed-job set IS the dead-letter store
    },
  });
}

/** jobId = analysisId gives BullMQ-level dedup against accidental double-enqueue. */
export async function enqueueAnalysis(queue: Queue<AnalyzeJobData>, analysisId: string): Promise<void> {
  await queue.add(ANALYZE_QUEUE_NAME, { analysisId }, { jobId: analysisId });
}
