import type { Fingerprint } from '../types.js';
import { fingerprintKey } from './index.js';

export interface DirectionalScore {
  /** |FP(A) ∩ FP(B)| / |FP(A)| - ARCHITECTURE.md §2, asymmetric containment (NOT Jaccard). */
  simAtoB: number;
  /** |FP(A) ∩ FP(B)| / |FP(B)|. */
  simBtoA: number;
  /** |FP(A) ∩ FP(B)|, distinct hash values (not position multiplicities). */
  sharedFingerprints: number;
}

/**
 * ARCHITECTURE.md §2's exact formula: sim(A→B) = |FP(A) ∩ FP(B)| / |FP(A)|,
 * both directions - deliberately asymmetric (a small submission fully
 * contained in a large one scores high A→B, low B→A), not a substituted
 * symmetric Jaccard measure.
 *
 * FP(A)/FP(B) are treated as SETS of distinct (h1,h2) values, not
 * position-tagged multisets - a hash recurring at two positions within
 * one submission counts once toward |FP(A)|, matching standard
 * MOSS/winnowing practice (position data feeds region extraction
 * separately, not the similarity ratio).
 */
export function scorePair(fingerprintsA: readonly Fingerprint[], fingerprintsB: readonly Fingerprint[]): DirectionalScore {
  const setA = new Set(fingerprintsA.map((f) => fingerprintKey(f.hash)));
  const setB = new Set(fingerprintsB.map((f) => fingerprintKey(f.hash)));

  let shared = 0;
  for (const key of setA) {
    if (setB.has(key)) shared++;
  }

  return {
    simAtoB: setA.size === 0 ? 0 : shared / setA.size,
    simBtoA: setB.size === 0 ? 0 : shared / setB.size,
    sharedFingerprints: shared,
  };
}
