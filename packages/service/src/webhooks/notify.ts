import { createHmac } from 'node:crypto';
import type { HydratedDocument } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { Pair } from '../models/Pair.js';
import type { AnalysisDoc } from '../models/Analysis.js';

const MAX_ATTEMPTS = 3; // §5 Phase 4 item 6: "3 retries with exponential backoff"
const BACKOFF_BASE_MS = 2_000; // Nakalchi-introduced constant, same treatment as JOB_BACKOFF_BASE_MS

function sign(body: string): string {
  return createHmac('sha256', env.WEBHOOK_SECRET).update(body).digest('hex');
}

async function computeTopSimilarity(analysisId: unknown): Promise<number> {
  const top = await Pair.findOne({ analysisId }).sort({ simAtoB: -1 }).lean();
  if (!top) return 0;
  return Math.max(top.simAtoB, top.simBtoA);
}

function buildPayload(
  analysis: Pick<AnalysisDoc, 'status' | 'error' | 'stats'> & { _id: unknown },
  topSimilarity: number,
): Record<string, unknown> {
  // §3.2 step 5 (success) / step 7 (failure): "webhook with summary
  // {analysisId, flaggedPairs, topSimilarity}" / "webhook fires with
  // failure payload".
  if (analysis.status === 'completed') {
    return {
      analysisId: String(analysis._id),
      status: 'completed',
      flaggedPairs: analysis.stats.flaggedPairs,
      topSimilarity,
    };
  }
  return { analysisId: String(analysis._id), status: 'failed', error: analysis.error ?? 'unknown error' };
}

/**
 * Signed (§5 Phase 4 item 6: `X-Nakalchi-Signature: hmac-sha256(body, WEBHOOK_SECRET)`),
 * 3 attempts with exponential backoff, outcomes written onto
 * `analysis.webhook` after every attempt.
 *
 * Delivery is at-least-once, not exactly-once - required fix from plan
 * review: queue/analysisWorker.ts's idempotency guard still attempts
 * delivery on a re-delivered job for an already-`completed` analysis
 * whose webhook hasn't been marked `delivered` yet. If a successful POST
 * happened but the `delivered: true` write was then lost (e.g. a crash
 * between the two), the next retry could deliver a second, duplicate
 * webhook. Consumers should treat delivery as idempotent on their end -
 * `analysisId` is always included for that purpose.
 */
export async function deliverWebhook(analysis: HydratedDocument<AnalysisDoc>): Promise<void> {
  if (!analysis.webhook) return;

  const topSimilarity = analysis.status === 'completed' ? await computeTopSimilarity(analysis._id) : 0;
  const body = JSON.stringify(buildPayload(analysis, topSimilarity));
  const signature = sign(body);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(analysis.webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Nakalchi-Signature': signature },
        body,
      });

      analysis.webhook.attempts = attempt;
      analysis.webhook.lastStatus = response.status;
      analysis.webhook.lastAttemptAt = new Date();

      if (response.ok) {
        analysis.webhook.delivered = true;
        await analysis.save();
        logger.info({ analysisId: String(analysis._id), attempt }, 'webhook delivered');
        return;
      }

      logger.warn({ analysisId: String(analysis._id), attempt, status: response.status }, 'webhook delivery attempt failed');
    } catch (err) {
      analysis.webhook.attempts = attempt;
      analysis.webhook.lastAttemptAt = new Date();
      logger.warn({ analysisId: String(analysis._id), attempt, err }, 'webhook delivery attempt threw');
    }

    await analysis.save();

    if (attempt < MAX_ATTEMPTS) {
      const delayMs = BACKOFF_BASE_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logger.error({ analysisId: String(analysis._id) }, 'webhook delivery exhausted all attempts');
}
