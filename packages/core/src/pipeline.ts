import type { AnalysisResult, Fingerprint, Language, PairScore, SubmissionInput, Token } from './types.js';
import {
  DEFAULT_K,
  DEFAULT_W,
  DEFAULT_BASECODE_MAX_FREQ,
  DEFAULT_MIN_SHARED_FINGERPRINTS,
  DEFAULT_FLAG_THRESHOLD,
  DEFAULT_CORPUS_CAP,
} from './config.js';
import { tokenizeCpp } from './tokenize/cpp.js';
import { tokenizePython } from './tokenize/python.js';
import { internNorm } from './tokenize/normalize.js';
import { computeKGramHashes } from './fingerprint/rollingHash.js';
import { winnow } from './fingerprint/winnow.js';
import { buildExclusionSet, filterFingerprints } from './match/basecode.js';
import { buildInvertedIndex } from './match/index.js';
import { generateCandidatePairs } from './match/candidates.js';
import { scorePair } from './match/score.js';
import { extractRegions } from './match/regions.js';

export interface FingerprintParams {
  /** Overrides config.ts's DEFAULT_K for this call only. */
  k?: number;
  /** Overrides config.ts's DEFAULT_W for this call only. */
  w?: number;
}

export function fingerprint(source: string, language: Language, params: FingerprintParams = {}): Fingerprint[] {
  const k = params.k ?? DEFAULT_K;
  const w = params.w ?? DEFAULT_W;

  const tokens = language === 'cpp' ? tokenizeCpp(source) : tokenizePython(source);
  const tokenIds = tokens.map((t) => internNorm(t.norm));

  return winnow(computeKGramHashes(tokenIds, k), w);
}

export interface AnalyzeCorpusOptions {
  k?: number;
  w?: number;
  basecodeMaxFreq?: number;
  minSharedFingerprints?: number;
  flagThreshold?: number;
  /** Nakalchi-introduced parameter, not from ARCHITECTURE.md - see config.ts's DEFAULT_CORPUS_CAP comment. */
  corpusCap?: number;
  /** Fingerprints subtracted outright, per ARCHITECTURE.md §5 Phase 3 item 1. */
  starterCode?: { language: Language; source: string }[];
}

interface Preprocessed {
  id: string;
  tokens: Token[];
  fingerprints: Fingerprint[];
}

// Same tokenize -> intern -> hash -> winnow composition as fingerprint()
// above, duplicated deliberately rather than extending fingerprint()'s
// return shape - keeps Phase 1/2 behavior and API surface completely
// untouched (see phase plan: "zero Phase 1/2 changes" option). Phase 3
// needs the Token[] too (for region byte-offset mapping), which
// fingerprint() doesn't expose.
function preprocess(input: { language: Language; source: string }, k: number, w: number): { tokens: Token[]; fingerprints: Fingerprint[] } {
  const tokens = input.language === 'cpp' ? tokenizeCpp(input.source) : tokenizePython(input.source);
  const tokenIds = tokens.map((t) => internNorm(t.norm));
  const fingerprints = winnow(computeKGramHashes(tokenIds, k), w);
  return { tokens, fingerprints };
}

/**
 * ARCHITECTURE.md §5 Phase 3 / §4's pipeline.ts: analyzeCorpus(submissions, opts) -> AnalysisResult.
 * Zero I/O - submissions/starterCode are raw strings the caller already
 * has in memory; core never reads files itself.
 */
export function analyzeCorpus(submissions: SubmissionInput[], opts: AnalyzeCorpusOptions = {}): AnalysisResult {
  const k = opts.k ?? DEFAULT_K;
  const w = opts.w ?? DEFAULT_W;
  const basecodeMaxFreq = opts.basecodeMaxFreq ?? DEFAULT_BASECODE_MAX_FREQ;
  const minSharedFingerprints = opts.minSharedFingerprints ?? DEFAULT_MIN_SHARED_FINGERPRINTS;
  const flagThreshold = opts.flagThreshold ?? DEFAULT_FLAG_THRESHOLD;
  const corpusCap = opts.corpusCap ?? DEFAULT_CORPUS_CAP;

  const preprocessed: Preprocessed[] = submissions.map((s) => ({ id: s.id, ...preprocess(s, k, w) }));
  const preprocessedById = new Map(preprocessed.map((p) => [p.id, p]));

  const starterCodeFingerprints = opts.starterCode?.map((sc) => preprocess(sc, k, w).fingerprints);

  const fingerprintsBySubmission = new Map(preprocessed.map((p) => [p.id, p.fingerprints]));
  const exclusion = buildExclusionSet(fingerprintsBySubmission, {
    basecodeMaxFreq,
    corpusCap,
    starterCodeFingerprints,
  });

  const filteredById = new Map(preprocessed.map((p) => [p.id, filterFingerprints(p.fingerprints, exclusion)]));

  const index = buildInvertedIndex(filteredById);
  const candidates = generateCandidatePairs(index, minSharedFingerprints);

  const pairs: PairScore[] = candidates.map((candidate) => {
    const fpA = filteredById.get(candidate.a)!;
    const fpB = filteredById.get(candidate.b)!;
    const { simAtoB, simBtoA, sharedFingerprints } = scorePair(fpA, fpB);

    const subA = preprocessedById.get(candidate.a)!;
    const subB = preprocessedById.get(candidate.b)!;
    const { regions, longestRegionTokens } = extractRegions(fpA, fpB, subA.tokens, subB.tokens, k, w);

    return {
      a: candidate.a,
      b: candidate.b,
      simAtoB,
      simBtoA,
      sharedFingerprints,
      longestRegionTokens,
      flagged: Math.max(simAtoB, simBtoA) >= flagThreshold,
      regions,
    };
  });

  const n = submissions.length;
  return {
    pairs,
    stats: {
      submissions: n,
      candidatePairs: pairs.length,
      fullPairCount: (n * (n - 1)) / 2,
    },
  };
}
