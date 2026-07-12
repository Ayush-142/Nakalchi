import type { Fingerprint, Hash64 } from '../types.js';

/** Pure total order over (h1, h2) pairs - which physical hash "wins" a tie
 * doesn't affect correctness, only which position gets recorded. */
function compareHash(a: Hash64, b: Hash64): number {
  if (a.h1 !== b.h1) return a.h1 - b.h1;
  return a.h2 - b.h2;
}

/**
 * Windowed-minimum selection over a k-gram hash sequence: window of `w`
 * consecutive hashes -> select the minimum, rightmost on ties, and don't
 * re-record a position that was already selected by the previous window
 * (the paper's own optimization). Implemented as an O(n) monotonic deque:
 * popping the back on `>=` (not `>`) naturally gives "rightmost on ties",
 * since an equal-valued older entry gets evicted in favor of the newer one.
 *
 * `position` in the returned Fingerprint is exactly the index into
 * `hashes` (equivalently, the token index the winning k-gram starts at).
 */
export function winnow(hashes: readonly Hash64[], w: number): Fingerprint[] {
  if (w < 1) throw new Error('winnow: w must be >= 1');

  const n = hashes.length;
  if (n === 0) return [];

  if (n < w) {
    // Boundary: fewer k-grams than a full window - treat the whole
    // sequence as one (undersized) window and return its single minimum.
    let bestIdx = 0;
    for (let i = 1; i < n; i++) {
      if (compareHash(hashes[i]!, hashes[bestIdx]!) <= 0) bestIdx = i;
    }
    return [{ hash: hashes[bestIdx]!, position: bestIdx }];
  }

  const deque: number[] = []; // indices, hashes[deque[...]] non-decreasing front-to-back
  const result: Fingerprint[] = [];
  let lastRecorded = -1;

  for (let i = 0; i < n; i++) {
    while (deque.length > 0 && compareHash(hashes[deque[deque.length - 1]!]!, hashes[i]!) >= 0) {
      deque.pop();
    }
    deque.push(i);
    while (deque[0]! <= i - w) {
      deque.shift();
    }
    if (i >= w - 1) {
      const minIdx = deque[0]!;
      if (minIdx !== lastRecorded) {
        result.push({ hash: hashes[minIdx]!, position: minIdx });
        lastRecorded = minIdx;
      }
    }
  }

  return result;
}
