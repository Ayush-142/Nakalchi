import { Types } from 'mongoose';

// Named constants, not env vars - not secrets or per-deployment values,
// same treatment as core's own config.ts constants.
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface PairCursor {
  simAtoB: number;
  id: string;
}

export function encodeCursor(cursor: PairCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): PairCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).simAtoB !== 'number' ||
    typeof (parsed as Record<string, unknown>).id !== 'string'
  ) {
    throw new Error('invalid cursor');
  }
  return parsed as PairCursor;
}

/**
 * Seek-method predicate for (simAtoB desc, _id asc) pagination.
 *
 * Required fix from plan review: a bare `{ simAtoB: { $lt: cursor.simAtoB } }`
 * is wrong under ties - it would skip every row that shares the cursor's
 * exact simAtoB value but sorts after it by _id. The correct predicate is
 * the compound OR below.
 */
export function buildSeekQuery(cursor: PairCursor): Record<string, unknown> {
  return {
    $or: [{ simAtoB: { $lt: cursor.simAtoB } }, { simAtoB: cursor.simAtoB, _id: { $gt: new Types.ObjectId(cursor.id) } }],
  };
}

// Phase 5 sanctioned gap-fill (see routes/analyses.ts's GET /analyses):
// same cursor-pagination shape as PairCursor above, but keyed on
// (createdAt desc, _id asc) to match the dashboard's "most recent first"
// query pattern and models/Analysis.ts's { status: 1, createdAt: -1 } index.
export interface AnalysisCursor {
  createdAt: string;
  id: string;
}

export function encodeAnalysisCursor(cursor: AnalysisCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeAnalysisCursor(raw: string): AnalysisCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).createdAt !== 'string' ||
    typeof (parsed as Record<string, unknown>).id !== 'string'
  ) {
    throw new Error('invalid cursor');
  }
  return parsed as AnalysisCursor;
}

/**
 * Seek-method predicate for (createdAt desc, _id asc) pagination - same
 * tie-safety reasoning as buildSeekQuery above: a bare
 * `{ createdAt: { $lt: cursor.createdAt } }` would skip rows sharing the
 * cursor's exact createdAt that sort after it by _id.
 */
export function buildAnalysisSeekQuery(cursor: AnalysisCursor): Record<string, unknown> {
  return {
    $or: [
      { createdAt: { $lt: new Date(cursor.createdAt) } },
      { createdAt: new Date(cursor.createdAt), _id: { $gt: new Types.ObjectId(cursor.id) } },
    ],
  };
}
