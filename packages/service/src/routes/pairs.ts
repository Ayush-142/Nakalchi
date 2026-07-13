import { Router, type NextFunction, type Request, type Response } from 'express';
import { Pair } from '../models/Pair.js';
import { SubmissionSnapshot } from '../models/SubmissionSnapshot.js';
import { decodeSource } from '../lib/gzip.js';
import { ApiError } from '../lib/errors.js';

export function createPairsRouter(): Router {
  const router = Router();

  // Full detail, including regions[] (capped at 200 by core) and both
  // full sources - a single bounded resource fetch, unlike the
  // GET /analyses/:id/pairs list (which projects regions out - see
  // routes/analyses.ts).
  router.get('/pairs/:id', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const pair = await Pair.findById(req.params.id).lean();
        if (!pair) {
          throw new ApiError(404, 'not_found', 'Pair not found.');
        }

        const [snapA, snapB] = await Promise.all([
          SubmissionSnapshot.findById(pair.a.snapshotId).lean(),
          SubmissionSnapshot.findById(pair.b.snapshotId).lean(),
        ]);
        if (!snapA || !snapB) {
          throw new ApiError(404, 'not_found', 'A referenced submission snapshot is missing.');
        }

        res.json({
          id: String(pair._id),
          analysisId: String(pair.analysisId),
          problemRef: pair.problemRef,
          simAtoB: pair.simAtoB,
          simBtoA: pair.simBtoA,
          sharedFingerprints: pair.sharedFingerprints,
          longestRegionTokens: pair.longestRegionTokens,
          flagged: pair.flagged,
          regions: pair.regions,
          // InferSchemaType infers Buffer-typed fields as the BSON driver's
          // `Binary` type, but Mongoose's .lean() actually returns a real
          // Buffer at runtime - a known type-vs-runtime mismatch, hence the
          // double cast (TS's own suggested workaround for this case).
          a: {
            userRef: pair.a.userRef,
            language: snapA.language,
            source: decodeSource(snapA.source as unknown as Buffer, snapA.sourceEncoding as 'utf8' | 'gzip'),
          },
          b: {
            userRef: pair.b.userRef,
            language: snapB.language,
            source: decodeSource(snapB.source as unknown as Buffer, snapB.sourceEncoding as 'utf8' | 'gzip'),
          },
        });
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}
