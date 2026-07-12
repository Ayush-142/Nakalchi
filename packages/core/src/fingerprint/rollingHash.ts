import type { Hash64 } from '../types.js';
import { HASH1_BASE, HASH1_MOD, HASH2_BASE, HASH2_MOD } from '../config.js';

/**
 * One k-gram hash value per valid k-gram start position (index i means the
 * k-gram spans tokenIds[i .. i+k-1]) - i.e. length tokenIds.length - k + 1.
 * Incremental Rabin-Karp rolling, not recompute-per-k-gram: O(1) amortized
 * per position rather than O(k).
 *
 * Safety: every value multiplied by `base` is first reduced into [0, mod)
 * *before* the multiplication, so the largest product that ever occurs is
 * bounded by base * mod - see config.ts for why that stays comfortably
 * under Number.MAX_SAFE_INTEGER without BigInt.
 */
function rollingHashSequence(tokenIds: readonly number[], k: number, base: number, mod: number): number[] {
  const n = tokenIds.length;
  const count = n - k + 1;
  const hashes = new Array<number>(count);

  let basePow = 1; // base^(k-1) mod M, needed to subtract the outgoing term
  for (let i = 0; i < k - 1; i++) {
    basePow = (basePow * base) % mod;
  }

  let hash = 0; // Horner over tokenIds[0 .. k-1]
  for (let i = 0; i < k; i++) {
    hash = (hash * base + tokenIds[i]!) % mod;
  }
  hashes[0] = hash;

  for (let i = 1; i < count; i++) {
    const outgoing = tokenIds[i - 1]!;
    const incoming = tokenIds[i + k - 1]!;
    // Reduce the subtraction result into [0, mod) BEFORE multiplying by
    // base - multiplying an unreduced (possibly large-magnitude negative)
    // intermediate by base would overflow the safe-integer bound.
    let diff = hash - outgoing * basePow;
    diff = ((diff % mod) + mod) % mod;
    hash = (diff * base + incoming) % mod;
    hashes[i] = hash;
  }

  return hashes;
}

export function computeKGramHashes(tokenIds: readonly number[], k: number): Hash64[] {
  if (k <= 0 || tokenIds.length < k) return [];

  const h1 = rollingHashSequence(tokenIds, k, HASH1_BASE, HASH1_MOD);
  const h2 = rollingHashSequence(tokenIds, k, HASH2_BASE, HASH2_MOD);

  return h1.map((value, i) => ({ h1: value, h2: h2[i]! }));
}
