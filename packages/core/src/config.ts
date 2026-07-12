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

// Phase 3 (matching engine) parameters - defaults per ARCHITECTURE.md §2's
// params table.
export const DEFAULT_BASECODE_MAX_FREQ = 0.5; // hash in >50% of submissions -> template
export const DEFAULT_MIN_SHARED_FINGERPRINTS = 5; // below this, a pair is never a candidate
export const DEFAULT_FLAG_THRESHOLD = 0.35; // max(simAtoB, simBtoA) >= this -> flagged

/**
 * Nakalchi-introduced parameter - NOT specified anywhere in
 * ARCHITECTURE.md (only named in prose, in §5 Phase 3 item 3: "posting
 * list length in [2, corpusCap]", with no default value given there).
 *
 * An absolute (not fractional) bound on how many distinct submissions may
 * share a single fingerprint before candidate generation, independent of
 * corpus size - basecodeMaxFreq alone doesn't bound this for large
 * corpora: at N=10,000, basecodeMaxFreq=0.5 alone still allows 5,000
 * distinct submissions to share one hash, contributing up to
 * ~1.25e7 pair-tallies from that single hash (m*(m-1)/2 with m=5,000).
 * corpusCap bounds that worst case regardless of N.
 *
 * Enforced via the exact same exclusion-set mechanism as base-code
 * filtering (match/basecode.ts) - a hash exceeding corpusCap is removed
 * from every submission's fingerprint set before indexing, not skipped
 * only at candidate-generation time. This keeps sharedFingerprints (the
 * numerator of simAtoB/simBtoA) and each submission's |FP| (the
 * denominator) always computed over the same filtered sets - skipping the
 * bucket only during candidate tallying would desync the two.
 */
export const DEFAULT_CORPUS_CAP = 100;
