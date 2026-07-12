/**
 * Paper worked example - hand derivation (0-based indexing; the
 * illustrative hash values are the paper's own, not our production
 * hash - see docs/notes-winnowing.md for the same example, cross-checked
 * there independently).
 *
 * Input: "adorunrunrunadorunrun", k=5, w=4 -> 17 five-grams, 17 hash values:
 *
 *   idx:  0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16
 *   val: 77  74  42  17  98  50  17  98   8  88  67  39  77  74  42  17  98
 *
 * Windows of w=4, start j=0..13, min value / winning index (rightmost on tie):
 *
 *   j=0  [77,74,42,17] -> 17 @3
 *   j=1  [74,42,17,98] -> 17 @3
 *   j=2  [42,17,98,50] -> 17 @3
 *   j=3  [17,98,50,17] -> 17 @6   (tie idx3 vs idx6 -> rightmost = 6)
 *   j=4  [98,50,17,98] -> 17 @6
 *   j=5  [50,17,98,8 ] ->  8 @8
 *   j=6  [17,98,8,88 ] ->  8 @8
 *   j=7  [98,8,88,67 ] ->  8 @8
 *   j=8  [8,88,67,39 ] ->  8 @8
 *   j=9  [88,67,39,77] -> 39 @11
 *   j=10 [67,39,77,74] -> 39 @11
 *   j=11 [39,77,74,42] -> 39 @11
 *   j=12 [77,74,42,17] -> 17 @15
 *   j=13 [74,42,17,98] -> 17 @15
 *
 * Winning index per window, in order: 3,3,3,6,6,8,8,8,8,11,11,11,15,15
 * Changes (= new fingerprints, "don't re-record" collapses repeats):
 *   j=0  -> index 3  (value 17)
 *   j=3  -> index 6  (value 17)
 *   j=5  -> index 8  (value 8)
 *   j=9  -> index 11 (value 39)
 *   j=12 -> index 15 (value 17)
 *
 * Expected winnow() output (h2 held constant at 0 across all entries -
 * only h1 varies in the paper's illustrative numbers):
 *   [{position:3,h1:17}, {position:6,h1:17}, {position:8,h1:8},
 *    {position:11,h1:39}, {position:15,h1:17}]
 */
import { describe, expect, it } from 'vitest';
import { winnow } from '../src/fingerprint/winnow.js';
import { fingerprint } from '../src/pipeline.js';
import type { Hash64 } from '../src/types.js';

const PAPER_HASHES: Hash64[] = [77, 74, 42, 17, 98, 50, 17, 98, 8, 88, 67, 39, 77, 74, 42, 17, 98].map((h1) => ({
  h1,
  h2: 0,
}));

describe('winnow: paper worked example', () => {
  it('matches the hand-derived selection exactly', () => {
    const result = winnow(PAPER_HASHES, 4);
    expect(result.map((f) => ({ position: f.position, h1: f.hash.h1 }))).toEqual([
      { position: 3, h1: 17 },
      { position: 6, h1: 17 },
      { position: 8, h1: 8 },
      { position: 11, h1: 39 },
      { position: 15, h1: 17 },
    ]);
  });
});

describe('winnow: edge cases', () => {
  it('returns [] for an empty hash sequence', () => {
    expect(winnow([], 4)).toEqual([]);
  });

  it('treats fewer-than-w hashes as one undersized window', () => {
    const hashes: Hash64[] = [{ h1: 5, h2: 0 }, { h1: 2, h2: 0 }, { h1: 9, h2: 0 }];
    expect(winnow(hashes, 4)).toEqual([{ hash: { h1: 2, h2: 0 }, position: 1 }]);
  });

  it('rejects w < 1', () => {
    expect(() => winnow([{ h1: 1, h2: 1 }], 0)).toThrow();
  });
});

describe('pipeline.fingerprint()', () => {
  const snippet = `
    int total = 0;
    for (int i = 0; i < n; i++) {
        total = total + i;
    }
  `;

  it('is deterministic across repeated calls', () => {
    expect(fingerprint(snippet, 'cpp')).toEqual(fingerprint(snippet, 'cpp'));
  });

  it('is rename-invariant end to end', () => {
    const renamed = `
      int sum = 0;
      for (int j = 0; j < count; j++) {
          sum = sum + j;
      }
    `;
    const a = fingerprint(snippet, 'cpp').map((f) => f.hash);
    const b = fingerprint(renamed, 'cpp').map((f) => f.hash);
    expect(b).toEqual(a);
  });

  // Required by review: this is the exact gap a per-call (non-deterministic
  // across calls) interning table would have missed - the guarantee
  // property in properties.test.ts calls computeKGramHashes directly on
  // synthetic token-id arrays and never touches interning at all, so it
  // could never have caught this class of bug.
  it('shares a fingerprint between two different sources with an identical >=t-token block', () => {
    const sourceA = `
      #include <iostream>
      int total = 0;
      int n = 10;
      for (int i = 0; i < n; i++) {
          total = total + i;
      }
      std::cout << total;
    `;
    const sourceB = `
      int total = 0;
      int n = 10;
      int extra = 42;
      for (int i = 0; i < n; i++) {
          total = total + i;
      }
      double result = total * 1.5;
    `;

    const hashesA = new Set(fingerprint(sourceA, 'cpp').map((f) => `${f.hash.h1}:${f.hash.h2}`));
    const hashesB = fingerprint(sourceB, 'cpp').map((f) => `${f.hash.h1}:${f.hash.h2}`);

    const shared = hashesB.filter((h) => hashesA.has(h));
    expect(shared.length).toBeGreaterThan(0);
  });
});
