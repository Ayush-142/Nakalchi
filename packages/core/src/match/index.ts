import type { Fingerprint, Hash64, Posting } from '../types.js';

/**
 * fingerprintKey is still used elsewhere (basecode.ts's exclusion Set,
 * score.ts's intersection Sets) - those are plain string-keyed Sets/Maps,
 * a different use case from the inverted index itself, unaffected by the
 * benchmark below.
 */
export function fingerprintKey(hash: Hash64): string {
  return `${hash.h1}:${hash.h2}`;
}

/**
 * Map<hash, Posting[]> per ARCHITECTURE.md §5 Phase 3 item 2, represented
 * as a nested Map<h1, Map<h2, Posting[]>> rather than a
 * Map<string, Posting[]> with a concatenated key.
 *
 * Measured, not assumed (bench/index-key.bench.ts, 500,000 postings across
 * 50,000 distinct hash buckets): string-key took 1.60x as long as the
 * nested Map to build (319.5ms vs 199.7ms) - the opposite of the working
 * assumption in the phase plan (that avoiding one Map-object-per-h1-bucket
 * would make string keys faster). The nested Map wins in practice, so
 * that's what's implemented, per this project's "verify claims, don't
 * assert them" discipline (same as Phase 2's BigInt-vs-Number decision).
 */
export type InvertedIndex = Map<number, Map<number, Posting[]>>;

/**
 * Built from ALREADY base-code/corpusCap-filtered fingerprint sets -
 * callers must filter before indexing, this function does no filtering
 * itself.
 */
export function buildInvertedIndex(
  filteredFingerprintsBySubmission: ReadonlyMap<string, readonly Fingerprint[]>,
): InvertedIndex {
  const index: InvertedIndex = new Map();

  for (const [submissionId, fingerprints] of filteredFingerprintsBySubmission) {
    for (const fp of fingerprints) {
      let inner = index.get(fp.hash.h1);
      if (!inner) {
        inner = new Map<number, Posting[]>();
        index.set(fp.hash.h1, inner);
      }
      let postings = inner.get(fp.hash.h2);
      if (!postings) {
        postings = [];
        inner.set(fp.hash.h2, postings);
      }
      postings.push({ submissionId, position: fp.position });
    }
  }

  return index;
}

/** Iterates every (h1,h2) bucket's posting list, regardless of the nested representation. */
export function* iterateBuckets(index: InvertedIndex): Generator<Posting[]> {
  for (const inner of index.values()) {
    for (const postings of inner.values()) {
      yield postings;
    }
  }
}
