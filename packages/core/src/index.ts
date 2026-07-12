export const CORE_PLACEHOLDER = true;

export type {
  Language,
  Token,
  TokenType,
  Hash64,
  Fingerprint,
  SubmissionInput,
  Posting,
  MatchRegion,
  PairScore,
  AnalysisResult,
} from './types.js';
export type { Tokenizer } from './tokenize/Tokenizer.js';
export { tokenizeCpp } from './tokenize/cpp.js';
export { tokenizePython } from './tokenize/python.js';
export {
  DEFAULT_K,
  DEFAULT_W,
  DEFAULT_BASECODE_MAX_FREQ,
  DEFAULT_MIN_SHARED_FINGERPRINTS,
  DEFAULT_FLAG_THRESHOLD,
  DEFAULT_CORPUS_CAP,
} from './config.js';
export { fingerprint, analyzeCorpus } from './pipeline.js';
export type { FingerprintParams, AnalyzeCorpusOptions } from './pipeline.js';
