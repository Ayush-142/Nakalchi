/**
 * Hand-computed tiny example, using the REAL config.ts constants
 * (HASH1_BASE=131071, HASH1_MOD=1000000007, HASH2_BASE=524287,
 * HASH2_MOD=998244353) - this directly exercises the incremental
 * subtract-oldest step (the trickiest arithmetic: the negative-modulo
 * correction), which the paper-worked-example test in winnow.test.ts
 * never touches since it bypasses rollingHash.ts entirely.
 *
 * tokenIds = [1, 2, 3], k = 2 -> two 2-grams: [1,2] and [2,3].
 *
 * HASH1 (base=131071, mod=1000000007), fresh Horner each:
 *   [1,2]: hash=0; hash=(0*131071+1)=1; hash=(1*131071+2)=131073
 *   [2,3]: hash=0; hash=(0*131071+2)=2; hash=(2*131071+3)=262145
 *
 * Cross-check via the incremental formula for the second k-gram:
 *   basePow = base^(k-1) mod M = 131071^1 mod 1000000007 = 131071
 *   outgoing = tokenIds[0] = 1, incoming = tokenIds[2] = 3
 *   diff = hash([1,2]) - outgoing*basePow = 131073 - 131071 = 2
 *   hash = diff*base + incoming = 2*131071 + 3 = 262145  (matches fresh Horner)
 *
 * HASH2 (base=524287, mod=998244353), fresh Horner each:
 *   [1,2]: hash=0; hash=(0*524287+1)=1; hash=(1*524287+2)=524289
 *   [2,3]: hash=0; hash=(0*524287+2)=2; hash=(2*524287+3)=1048577
 */
import { describe, expect, it } from 'vitest';
import { computeKGramHashes } from '../src/fingerprint/rollingHash.js';

describe('computeKGramHashes: hand-computed tiny example', () => {
  it('matches the hand-derived values for tokenIds=[1,2,3], k=2', () => {
    expect(computeKGramHashes([1, 2, 3], 2)).toEqual([
      { h1: 131073, h2: 524289 },
      { h1: 262145, h2: 1048577 },
    ]);
  });

  it('returns [] when there are fewer tokens than k', () => {
    expect(computeKGramHashes([1, 2], 5)).toEqual([]);
  });

  it('is deterministic: same input always produces the same hashes', () => {
    const tokenIds = [4, 1, 5, 9, 2, 6, 5, 3];
    expect(computeKGramHashes(tokenIds, 3)).toEqual(computeKGramHashes(tokenIds, 3));
  });
});
