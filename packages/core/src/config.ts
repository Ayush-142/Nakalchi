export const DEFAULT_K = 17;
export const DEFAULT_W = 4;

/**
 * Double hashing: two independent polynomial rolling hashes, combined as
 * a pair (h1, h2), computed entirely with plain JS Numbers (no BigInt).
 *
 * Why this is safe: a rolling update is `hash = (hash * base + tokenId) % M`.
 * Every value ever multiplied by `base` has already been reduced mod `M`
 * (or is a tokenId - see the bound below), so the largest product that can
 * occur is bounded by `base * M`. Keeping `base` small relative to `M`
 * keeps that product under Number.MAX_SAFE_INTEGER (2^53 - 1 ~= 9.007e15):
 *
 *   max(base) * max(M) = 524,287 * 1,000,000,007 ~= 5.24e14
 *   2^53 - 1            ~= 9.007e15
 *   -> ~17x safety margin, plain multiplication, no BigInt needed.
 *
 * tokenId bound: tokenIds come from normalize.ts's closed interning
 * registry (CLOSED_VOCABULARY - keywords + operators + the 4 norm
 * constants + known preprocessor directives + one fallback bucket),
 * comfortably under 1,000 entries. So `tokenId * basePow` is at most
 * ~1,000 * 1,000,000,007 ~= 1e12, far under 2^53 too.
 *
 * Collision analysis (birthday bound, p ~= n^2 / (2N)), treating h1/h2 as
 * independent since they use different bases *and* different moduli:
 *
 *   N = MOD1 * MOD2 ~= 1,000,000,007 * 998,244,353 ~= 9.98e17 (~2^59.8)
 *   n = 1e6 fingerprints (ARCHITECTURE.md's stated corpus-scale figure)
 *   p ~= (1e6)^2 / (2 * 9.98e17) ~= 5.0e-7
 *   -> about 1-in-2-million odds of even one accidental collision across
 *      an entire ~1e6-fingerprint corpus. Negligible.
 *
 * Performance vs a BigInt-based single 64-bit hash: measured in
 * bench/hash-representation.bench.ts, 5,000,000 rolling-update iterations,
 * one multiply+add+reduce per iteration either way:
 *   Number-based: 195.1 ms
 *   BigInt-based: 881.4 ms
 *   -> BigInt took 4.52x as long as plain Number arithmetic, on this
 *      machine, for this workload. Confirms the assumption; not asserted
 *      without having run it.
 *
 * Bases are Mersenne primes (2^17-1, 2^19-1): odd, fixed here at
 * build/config time (never regenerated per run - fingerprints must be
 * deterministic across runs/tests). Changing any of these four constants
 * is an algorithm-parameter change per ARCHITECTURE.md §0 rule 5 and must
 * be justified in a phase plan, not done silently.
 */
export const HASH1_BASE = 131_071; // 2^17 - 1
export const HASH1_MOD = 1_000_000_007;
export const HASH2_BASE = 524_287; // 2^19 - 1
export const HASH2_MOD = 998_244_353;
