import type { Fingerprint } from '../types.js';
import { fingerprintKey } from './index.js';

export interface FilterOptions {
  basecodeMaxFreq: number;
  corpusCap: number;
  starterCodeFingerprints?: readonly (readonly Fingerprint[])[];
}

/**
 * Builds the exclusion set of hash keys to drop before indexing, per
 * ARCHITECTURE.md §5 Phase 3 item 1 - PLUS corpusCap folded into the same
 * mechanism (see config.ts's DEFAULT_CORPUS_CAP comment for why: skipping
 * over-cap buckets only at candidate-generation time would desync
 * sharedFingerprints from each submission's |FP|, since the denominator
 * would still count hashes the numerator had excluded).
 *
 * A hash is excluded if EITHER:
 *   - docFreq / totalSubmissions > basecodeMaxFreq (template/boilerplate), OR
 *   - docFreq > corpusCap (absolute worst-case bound, independent of N)
 * or if it appears in any starterCode fingerprint set (subtracted outright).
 *
 * "docFreq" here is DISTINCT-SUBMISSION count, not raw occurrence count -
 * a hash appearing twice within one submission still counts once.
 */
export function buildExclusionSet(
  fingerprintsBySubmission: ReadonlyMap<string, readonly Fingerprint[]>,
  options: FilterOptions,
): Set<string> {
  const docFreq = new Map<string, number>();

  for (const fingerprints of fingerprintsBySubmission.values()) {
    const distinctKeys = new Set(fingerprints.map((f) => fingerprintKey(f.hash)));
    for (const key of distinctKeys) {
      docFreq.set(key, (docFreq.get(key) ?? 0) + 1);
    }
  }

  const totalSubmissions = fingerprintsBySubmission.size;
  const exclusion = new Set<string>();

  for (const [key, count] of docFreq) {
    if (count / totalSubmissions > options.basecodeMaxFreq || count > options.corpusCap) {
      exclusion.add(key);
    }
  }

  if (options.starterCodeFingerprints) {
    for (const fingerprints of options.starterCodeFingerprints) {
      for (const f of fingerprints) {
        exclusion.add(fingerprintKey(f.hash));
      }
    }
  }

  return exclusion;
}

export function filterFingerprints(
  fingerprints: readonly Fingerprint[],
  exclusion: ReadonlySet<string>,
): Fingerprint[] {
  return fingerprints.filter((f) => !exclusion.has(fingerprintKey(f.hash)));
}
