import type { Fingerprint, Language } from './types.js';
import { DEFAULT_K, DEFAULT_W } from './config.js';
import { tokenizeCpp } from './tokenize/cpp.js';
import { tokenizePython } from './tokenize/python.js';
import { internNorm } from './tokenize/normalize.js';
import { computeKGramHashes } from './fingerprint/rollingHash.js';
import { winnow } from './fingerprint/winnow.js';

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
