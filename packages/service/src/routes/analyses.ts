import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Queue } from 'bullmq';
import { DEFAULT_K, DEFAULT_W, DEFAULT_BASECODE_MAX_FREQ, DEFAULT_FLAG_THRESHOLD } from '@nakalchi/core';
import { Analysis } from '../models/Analysis.js';
import { SubmissionSnapshot } from '../models/SubmissionSnapshot.js';
import { Pair } from '../models/Pair.js';
import { encodeSource } from '../lib/gzip.js';
import { ApiError } from '../lib/errors.js';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildSeekQuery,
  decodeCursor,
  encodeCursor,
  buildAnalysisSeekQuery,
  decodeAnalysisCursor,
  encodeAnalysisCursor,
} from '../lib/pagination.js';
import { enqueueAnalysis, type AnalyzeJobData } from '../queue/queues.js';

const MAX_SUBMISSION_SIZE_BYTES = 256 * 1024; // §5 Phase 4 item 3
const MAX_CORPUS_SIZE = 5000; // §5 Phase 4 item 3

const submissionSchema = z.object({
  externalId: z.string().min(1),
  userRef: z.string().min(1),
  problemRef: z.string().min(1),
  language: z.enum(['cpp', 'python']),
  source: z.string().min(1).refine((s) => Buffer.byteLength(s, 'utf8') <= MAX_SUBMISSION_SIZE_BYTES, {
    message: `source exceeds the ${MAX_SUBMISSION_SIZE_BYTES}-byte per-submission cap`,
  }),
});

const paramsOverrideSchema = z
  .object({
    k: z.number().int().positive().optional(),
    w: z.number().int().positive().optional(),
    basecodeMaxFreq: z.number().min(0).max(1).optional(),
    flagThreshold: z.number().min(0).max(1).optional(),
  })
  .optional();

// SSRF trust assumption, documented not hidden: deliberately NOT blocking
// localhost/private-network targets - POST /analyses is authenticated
// (X-Api-Key), and Phase 6's CodeArena integration needs to be able to
// point callbackUrl at a local CodeArena instance. The webhook target is
// attacker-controlled only to the extent an already-trusted API key
// holder controls it.
const callbackUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => {
      try {
        const protocol = new URL(url).protocol;
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'callbackUrl must be an http(s) URL' },
  )
  .optional();

// Direct mode only - §5 Phase 4 item 3 ("direct mode first"); pull mode
// (source:"codearena") is Phase 6 scope (integrations/codearena.ts
// doesn't exist yet), rejected explicitly below with a clear message
// rather than a generic schema error.
const directModeBodySchema = z.object({
  params: paramsOverrideSchema,
  // Implied addition beyond §4.2's literal body shape - see phase plan.
  callbackUrl: callbackUrlSchema,
  submissions: z.array(submissionSchema).min(1).max(MAX_CORPUS_SIZE),
});

export function createAnalysesRouter(queue: Queue<AnalyzeJobData>): Router {
  const router = Router();

  router.post('/analyses', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const body = req.body as Record<string, unknown>;
        if (body?.source === 'codearena') {
          throw new ApiError(
            422,
            'unsupported_source',
            'Pull mode (source: "codearena") is not implemented until Phase 6 - use direct mode ({ submissions: [...] }).',
          );
        }

        const parsed = directModeBodySchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ApiError(422, 'validation_error', 'Invalid request body.', parsed.error.flatten());
        }
        const { params: paramsOverride, callbackUrl, submissions } = parsed.data;

        // Resolved and FROZEN on the analysis doc (§4.1: "frozen per
        // analysis") - immune to any future change to core's defaults.
        const resolvedParams = {
          k: paramsOverride?.k ?? DEFAULT_K,
          w: paramsOverride?.w ?? DEFAULT_W,
          basecodeMaxFreq: paramsOverride?.basecodeMaxFreq ?? DEFAULT_BASECODE_MAX_FREQ,
          flagThreshold: paramsOverride?.flagThreshold ?? DEFAULT_FLAG_THRESHOLD,
        };

        const analysis = await Analysis.create({
          source: 'api',
          params: resolvedParams,
          status: 'queued',
          webhook: callbackUrl ? { url: callbackUrl, attempts: 0, delivered: false } : undefined,
        });

        // Snapshot + gzip only - tokenCount/fingerprintCount are filled in
        // by the worker, keeping this handler fast (§3.1: queue-based
        // ingestion exists specifically so long-running work is async).
        const snapshotDocs = submissions.map((s) => {
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

        await enqueueAnalysis(queue, analysis._id.toString());

        res.status(202).json({ analysisId: analysis._id.toString() });
      } catch (err) {
        next(err);
      }
    })();
  });

  const analysesQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
    status: z.enum(['queued', 'running', 'completed', 'failed']).optional(),
  });

  // Phase 5 sanctioned gap-fill: §4.2 never lists an endpoint to list
  // analyses, but §5's dashboard needs one, and models/Analysis.ts's
  // { status: 1, createdAt: -1 } index exists for exactly this query
  // ("dashboard ... list analyses by status, most recent first"). Added
  // as a scoped exception to the otherwise-frozen service surface; same
  // auth, same pagination conventions as GET /analyses/:id/pairs below.
  router.get('/analyses', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const query = analysesQuerySchema.safeParse(req.query);
        if (!query.success) {
          throw new ApiError(422, 'validation_error', 'Invalid query parameters.', query.error.flatten());
        }
        const { cursor, limit, status } = query.data;

        const filter: Record<string, unknown> = {};
        if (status !== undefined) filter.status = status;

        if (cursor !== undefined) {
          let decoded;
          try {
            decoded = decodeAnalysisCursor(cursor);
          } catch {
            throw new ApiError(422, 'validation_error', 'Invalid cursor.');
          }
          Object.assign(filter, buildAnalysisSeekQuery(decoded));
        }

        const pageSize = limit ?? DEFAULT_PAGE_SIZE;

        // Summary projection only - never `params` (frozen algorithm
        // params, not a dashboard concern) and never `webhook` (can carry
        // a callback URL).
        const rows = await Analysis.find(filter, {
          _id: 1,
          source: 1,
          status: 1,
          progress: 1,
          createdAt: 1,
          startedAt: 1,
          completedAt: 1,
          stats: 1,
          error: 1,
        })
          .sort({ createdAt: -1, _id: 1 })
          .limit(pageSize + 1)
          .lean();

        const hasMore = rows.length > pageSize;
        const page = hasMore ? rows.slice(0, pageSize) : rows;
        const nextCursor =
          hasMore && page.length > 0
            ? encodeAnalysisCursor({
                createdAt: page[page.length - 1]!.createdAt.toISOString(),
                id: String(page[page.length - 1]!._id),
              })
            : null;

        res.json({
          analyses: page.map((a) => ({
            analysisId: String(a._id),
            source: a.source,
            status: a.status,
            progress: a.progress,
            stats: a.stats,
            error: a.error,
            createdAt: a.createdAt,
            startedAt: a.startedAt,
            completedAt: a.completedAt,
          })),
          nextCursor,
        });
      } catch (err) {
        next(err);
      }
    })();
  });

  router.get('/analyses/:id', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const analysis = await Analysis.findById(req.params.id).lean();
        if (!analysis) {
          throw new ApiError(404, 'not_found', 'Analysis not found.');
        }
        res.json({
          analysisId: String(analysis._id),
          status: analysis.status,
          progress: analysis.progress,
          stats: analysis.stats,
          error: analysis.error,
          createdAt: analysis.createdAt,
          startedAt: analysis.startedAt,
          completedAt: analysis.completedAt,
        });
      } catch (err) {
        next(err);
      }
    })();
  });

  const pairsQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
    minSim: z.coerce.number().min(0).max(1).optional(),
    flaggedOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    problemRef: z.string().optional(),
  });

  router.get('/analyses/:id/pairs', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const query = pairsQuerySchema.safeParse(req.query);
        if (!query.success) {
          throw new ApiError(422, 'validation_error', 'Invalid query parameters.', query.error.flatten());
        }
        const { cursor, limit, minSim, flaggedOnly, problemRef } = query.data;

        const filter: Record<string, unknown> = { analysisId: req.params.id };
        if (flaggedOnly) filter.flagged = true;
        if (minSim !== undefined) filter.$or = [{ simAtoB: { $gte: minSim } }, { simBtoA: { $gte: minSim } }];
        if (problemRef !== undefined) filter.problemRef = problemRef;

        if (cursor !== undefined) {
          let decoded;
          try {
            decoded = decodeCursor(cursor);
          } catch {
            throw new ApiError(422, 'validation_error', 'Invalid cursor.');
          }
          Object.assign(filter, buildSeekQuery(decoded));
        }

        const pageSize = limit ?? DEFAULT_PAGE_SIZE;

        // List rows are summary fields only - `regions` is projected out
        // (can be up to 200/pair, and pairs can number in the thousands;
        // full region detail is only ever returned by GET /pairs/:id, a
        // single bounded resource fetch). This is the actual answer to
        // "how are large report payloads paginated or truncated."
        const rows = await Pair.find(filter, { regions: 0 })
          .sort({ simAtoB: -1, _id: 1 })
          .limit(pageSize + 1)
          .lean();

        const hasMore = rows.length > pageSize;
        const page = hasMore ? rows.slice(0, pageSize) : rows;
        const nextCursor =
          hasMore && page.length > 0
            ? encodeCursor({ simAtoB: page[page.length - 1]!.simAtoB, id: String(page[page.length - 1]!._id) })
            : null;

        res.json({
          pairs: page.map((p) => ({
            id: String(p._id),
            a: p.a,
            b: p.b,
            simAtoB: p.simAtoB,
            simBtoA: p.simBtoA,
            sharedFingerprints: p.sharedFingerprints,
            longestRegionTokens: p.longestRegionTokens,
            flagged: p.flagged,
          })),
          nextCursor,
        });
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}
