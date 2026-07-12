# Benchmarks

Real numbers from actual runs (dev machine, single-threaded Node),
committed per ARCHITECTURE.md §5 Phase 3 item 7. Nothing here is estimated
or fabricated — every figure below came from executing the named bench
script and copying its output.

## Matching engine: synthetic corpus (`bench/corpus.bench.ts`)

Synthetic corpus generator (n submissions, 5% plagiarism rate, 30%
template share — see the script for exact construction). This is a
**performance** benchmark only, not an accuracy claim — the synthetic
generator's small statement-shape vocabulary (6 shapes) means some
non-"plagiarized" pairs share long accidental structural runs, so the
flagged-pair counts below shouldn't be read as a detection-accuracy signal.
That claim is what `test/pipeline.test.ts` (real `corpus/two-sum-cpp`
data, now populated and green) is for — see `docs/detection-boundary.md`
for its measured accuracy/boundary results, including where token-level
winnowing currently stops catching disguised copies.

| n | wall time | RSS | candidate pairs | full pair count (n·(n-1)/2) | flagged |
|---|---|---|---|---|---|
| 100 | 0.40s | 140.0 MB | 656 | 4,950 | 558 |
| 500 | 2.03s | 317.7 MB | 14,405 | 124,750 | 12,398 |
| 1,000 | 3.84s | 548.8 MB | 9,835 | 499,500 | 9,196 |

**O(n²)-avoidance, measured directly**: at n=1,000, candidate pairs
(9,835) are **~1.9% of the full pair count** (499,500) — the inverted
index prunes the overwhelming majority of pairs before any scoring work
happens. Wall time scaling from n=100→500 (5x submissions, ~5x time) and
500→1,000 (2x submissions, ~1.9x time) is close to **linear**, not
quadratic, consistent with candidate generation being driven by hash
bucket sizes rather than full pairwise comparison.

**Acceptance gate (§5 Phase 3): 1,000-submission analysis < 60s
single-threaded — met at 3.84s**, roughly 15x margin.

(Candidate-pair count isn't strictly monotonic with n here — 500→1,000
shows a drop from 14,405 to 9,835 — because `Math.random()` drives which
earlier submission each "plagiarized" entry copies, so cluster sizes vary
run to run; this is a property of the synthetic generator's randomness,
not of the engine.)

## Inverted index key representation (`bench/index-key.bench.ts`)

500,000 postings across 50,000 distinct hash buckets, comparing a
string-concatenated key (`Map<string, Posting[]>`) against a nested
`Map<number, Map<number, Posting[]>>`:

| representation | time |
|---|---|
| String key | 319.5 ms |
| Nested Map | 199.7 ms |

**Nested Map wins — 1.60x faster than string concatenation.** This is the
opposite of the working assumption in the Phase 3 plan (that avoiding one
Map-object-per-`h1`-bucket would make string keys faster); measuring
overturned the assumption, so `match/index.ts` implements the nested Map,
per this project's "verify claims, don't assert them" discipline.

## Phase 2 hash representation (`bench/hash-representation.bench.ts`, for reference)

Carried over from Phase 2 — still the basis for `config.ts`'s double-hashing
design:

| representation | time (5,000,000 rolling-update iterations) |
|---|---|
| Number-based | 195.1 ms |
| BigInt-based | 881.4 ms |

BigInt took 4.52x as long as plain Number arithmetic.
