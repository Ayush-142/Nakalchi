export type Language = 'cpp' | 'python';

export type TokenType =
  | 'Keyword'
  | 'Identifier'
  | 'Number'
  | 'String'
  | 'Char'
  | 'Punct'
  | 'Preproc'
  | 'Raw';

export interface Token {
  type: TokenType;
  /** The value Phase 2 hashes: 'IDENT' | 'NUM' | 'STR' | 'RAW', or the literal text for Keyword/Punct/Preproc. */
  norm: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column, counted per Unicode code point. */
  col: number;
  /** UTF-8 byte offset, inclusive. */
  startByte: number;
  /** UTF-8 byte offset, exclusive. */
  endByte: number;
}

/** A pair of independent polynomial-hash values ("double hashing" - see config.ts). */
export interface Hash64 {
  h1: number;
  h2: number;
}

export interface Fingerprint {
  hash: Hash64;
  /**
   * 0-based index into the Token[] stream the k-gram starts at. For byte
   * offsets, look up tokens[position].startByte / tokens[position + k -
   * 1].endByte - not duplicated here.
   */
  position: number;
}

/** Input to analyzeCorpus() - core has zero I/O, so the caller assigns ids. */
export interface SubmissionInput {
  id: string;
  language: Language;
  source: string;
}

/** One occurrence of a fingerprint hash within one submission. */
export interface Posting {
  submissionId: string;
  position: number;
}

export interface MatchRegion {
  /** Byte offsets, side A. */
  aStart: number;
  aEnd: number;
  /** Byte offsets, side B. */
  bStart: number;
  bEnd: number;
  aLineStart: number;
  aLineEnd: number;
  bLineStart: number;
  bLineEnd: number;
  /** Token span (A-side count - see regions.ts). */
  tokens: number;
}

export interface PairScore {
  a: string;
  b: string;
  /** |FP(A) ∩ FP(B)| / |FP(A)| - asymmetric containment, ARCHITECTURE.md §2. */
  simAtoB: number;
  /** |FP(A) ∩ FP(B)| / |FP(B)|. */
  simBtoA: number;
  /** |FP(A) ∩ FP(B)|, distinct hash values. */
  sharedFingerprints: number;
  longestRegionTokens: number;
  /** max(simAtoB, simBtoA) >= flagThreshold, per ARCHITECTURE.md §4.1. */
  flagged: boolean;
  /** Capped at 200 per ARCHITECTURE.md §4.1. */
  regions: MatchRegion[];
}

export interface AnalysisResult {
  pairs: PairScore[];
  stats: {
    submissions: number;
    candidatePairs: number;
    fullPairCount: number;
  };
}
