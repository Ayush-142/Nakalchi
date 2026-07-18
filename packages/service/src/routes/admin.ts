import { Router, type Request, type Response, type NextFunction } from 'express';
import { Analysis } from '../models/Analysis.js';

/**
 * Phase 7 §5 item 3: "metrics-lite" admin stats - analyses/day and p50/p95
 * analysis wall time, computed entirely from fields the `analyses`
 * collection already stores (createdAt, status, stats.wallMs). No new
 * instrumentation dependency (no Prometheus client, no metrics library) -
 * just a couple of Mongo queries against existing data.
 *
 * Percentiles are computed in application code, not via Mongo's `$percentile`
 * operator (available from MongoDB 7.0+), because this endpoint must be
 * correct regardless of which MongoDB version is actually running in a given
 * deployment - the plan-review rule for this phase was "verify mongod
 * --version live before choosing," and the honest answer to "what version
 * runs at every possible deployment site" is "not knowable in general," so
 * the version-independent implementation is the correct default rather than
 * a placeholder pending a check. If a specific deployment's MongoDB is
 * confirmed 7.0+, this could be simplified to a `$percentile` aggregation
 * stage - not done speculatively here.
 */
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const index = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[index]!;
}

export function createAdminRouter(): Router {
  const router = Router();

  router.get('/admin/stats', (_req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const perDay = await Analysis.aggregate<{ _id: string; count: number }>([
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: -1 } },
          { $limit: 30 },
        ]);

        const completedWallMs = await Analysis.find({ status: 'completed' }, { 'stats.wallMs': 1 })
          .lean()
          .then((rows) => rows.map((r) => r.stats.wallMs).sort((a, b) => a - b));

        res.json({
          analysesPerDay: perDay.map((row) => ({ date: row._id, count: row.count })),
          analysisWallMs: {
            count: completedWallMs.length,
            p50: percentile(completedWallMs, 50),
            p95: percentile(completedWallMs, 95),
          },
        });
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}
