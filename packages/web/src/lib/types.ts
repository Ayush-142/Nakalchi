import type { Language, MatchRegion } from '@nakalchi/core';

// Hand-written to mirror packages/service's actual route responses field
// for field (confirmed by reading routes/analyses.ts and routes/pairs.ts
// directly) - the service doesn't publish these as a reusable contract.

export type AnalysisStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AnalysisStats {
  submissions: number;
  fingerprints: number;
  candidatePairs: number;
  flaggedPairs: number;
  wallMs: number;
}

/** GET /analyses (list) row shape - includes `source`, GET /analyses/:id does not. */
export interface AnalysisSummary {
  analysisId: string;
  source: 'codearena' | 'api';
  status: AnalysisStatus;
  progress: number;
  stats: AnalysisStats;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/** GET /analyses/:id shape. */
export interface AnalysisDetail {
  analysisId: string;
  status: AnalysisStatus;
  progress: number;
  stats: AnalysisStats;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PaginatedAnalyses {
  analyses: AnalysisSummary[];
  nextCursor: string | null;
}

export interface PairSideRef {
  snapshotId: string;
  userRef: string;
}

/** GET /analyses/:id/pairs row shape - `regions` is deliberately projected out server-side. */
export interface PairListItem {
  id: string;
  a: PairSideRef;
  b: PairSideRef;
  simAtoB: number;
  simBtoA: number;
  sharedFingerprints: number;
  longestRegionTokens: number;
  flagged: boolean;
}

export interface PaginatedPairs {
  pairs: PairListItem[];
  nextCursor: string | null;
}

export interface PairDetailSide {
  userRef: string;
  language: Language;
  source: string;
}

/** GET /pairs/:id shape - full regions + both full sources. */
export interface PairDetail {
  id: string;
  analysisId: string;
  problemRef: string;
  simAtoB: number;
  simBtoA: number;
  sharedFingerprints: number;
  longestRegionTokens: number;
  flagged: boolean;
  regions: MatchRegion[];
  a: PairDetailSide;
  b: PairDetailSide;
}

/** GET /admin/stats shape (Phase 7 §5 item 3). */
export interface AdminStats {
  analysesPerDay: { date: string; count: number }[];
  analysisWallMs: { count: number; p50: number | null; p95: number | null };
}

export interface ListAnalysesParams {
  cursor?: string;
  limit?: number;
  status?: AnalysisStatus;
}

export interface ListPairsParams {
  cursor?: string;
  limit?: number;
  minSim?: number;
  flaggedOnly?: boolean;
  problemRef?: string;
}
