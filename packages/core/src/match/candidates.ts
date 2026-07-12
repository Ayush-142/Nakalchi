import type { InvertedIndex } from './index.js';
import { iterateBuckets } from './index.js';

export interface CandidatePair {
  a: string;
  b: string;
  /** Distinct shared hash count - IS sharedFingerprints directly, per ARCHITECTURE.md §5 Phase 3 item 3. */
  sharedFingerprints: number;
}

/**
 * Index-driven candidate generation, per ARCHITECTURE.md §5 Phase 3 item
 * 3 - never all-pairs. The index is assumed already filtered (base-code +
 * corpusCap, see basecode.ts), so the only bound left here is the trivial
 * lower one: a bucket with fewer than 2 distinct submissions has no pairs
 * to contribute at all - a different concern from frequency filtering,
 * not a re-check of corpusCap.
 *
 * Complexity: a bucket with m distinct submissions contributes O(m^2)
 * pair-tallies; total cost is sum(O(m_i^2)) over surviving buckets, not
 * O(n^2) over the whole corpus.
 */
export function generateCandidatePairs(index: InvertedIndex, minSharedFingerprints: number): CandidatePair[] {
  // Nested Map (a -> b -> count) rather than a concatenated string key -
  // caller-assigned submission ids could contain any separator character,
  // so avoid needing one.
  const tally = new Map<string, Map<string, number>>();

  for (const postings of iterateBuckets(index)) {
    const distinctIds = Array.from(new Set(postings.map((p) => p.submissionId))).sort();
    if (distinctIds.length < 2) continue;

    for (let i = 0; i < distinctIds.length; i++) {
      const a = distinctIds[i]!;
      let row = tally.get(a);
      if (!row) {
        row = new Map<string, number>();
        tally.set(a, row);
      }
      for (let j = i + 1; j < distinctIds.length; j++) {
        const b = distinctIds[j]!;
        row.set(b, (row.get(b) ?? 0) + 1);
      }
    }
  }

  const candidates: CandidatePair[] = [];
  for (const [a, row] of tally) {
    for (const [b, sharedFingerprints] of row) {
      if (sharedFingerprints >= minSharedFingerprints) {
        candidates.push({ a, b, sharedFingerprints });
      }
    }
  }

  return candidates;
}
