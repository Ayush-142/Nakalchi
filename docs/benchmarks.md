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

## In-situ (Azure VM)

Same `bench/corpus.bench.ts`, same params, run on the actual deployment VM
(Azure B2s, 2 vCPU, `Ayush@98.70.24.7`) — Node 24.18.0 via nvm, on the host,
**unconstrained** (not inside any container `mem_limit` — the whole point
is to measure the pipeline's true footprint before setting one). Run with
**both CodeArena's 7 containers and Nakalchi's 3 containers already
resident and idle** — the honest in-situ condition this VM will actually
run under, not a clean-machine best case.

| n | wall time | RSS (script) | candidate pairs | full pair count | flagged |
|---|---|---|---|---|---|
| 100 | 0.27s | 150.0 MB | 576 | 4,950 | 489 |
| 500 | 0.96s | 330.8 MB | 14,026 | 124,750 | 12,042 |
| 1,000 | 1.42s | 443.6 MB | 9,785 | 499,500 | 9,199 |

**Acceptance gate: met at 1.42s**, ~42x margin under the 60s threshold —
comfortably faster than the dev-machine run above (3.84s), most likely
Azure B2s burst-credit CPU headroom vs. a busier dev machine at the time,
not a claim about the VM being intrinsically faster hardware.

**`worker_threads` decision (plan's pre-approved gate): NOT triggered.**
1.42s ≪ 60s — the fan-out design stays unbuilt, per the frozen decision
rule.

**Peak RSS cross-check** (plan review requirement — don't trust the
script's own post-run snapshot alone): wrapped the whole 3-run process in
`/usr/bin/time -v`:
```
Maximum resident set size (kbytes): 454468
```
= 443.82 MB, vs. the script's own n=1000 self-report of 443.6 MB — the two
agree to within 0.2 MB. Higher of the two (443.82 MB) is what the
`nakalchi-worker` `mem_limit` decision below is computed from.

**Memory decision rule, applied:** `mem_limit = ceil(443.82 × 1.3) =
577m`. Well under the plan's ~700m fallback threshold, so no practical
corpus-size cap is needed for this deployment — `docker-compose.prod.yml`'s
`nakalchi-worker.mem_limit` is set to `577m`, and the container was
recreated and confirmed healthy under it (see `docs/deploy-runbook.md`).

**Why candidate-pair count drops from n=500 to n=1,000 (both tables above,
same direction on both dev machine and VM — verified, not assumed):**
initially suspected "`Math.random()` drives cluster sizes, so it varies run
to run" — checked directly and that's **wrong**: a diagnostic run
instrumenting the generator's actual plagiarism-cluster sizes found max
cluster size only 3 members at n=500 and 4 at n=1,000 (5% plagiarism rate
× small n never produces large clusters), so cluster-size variance can't
explain a ~5,000-pair swing.

The real, verified cause: `DEFAULT_CORPUS_CAP` (`config.ts`, 100) is a
**fixed absolute** document-frequency bound — a hash is excluded once it
appears in more than 100 distinct submissions, *regardless of corpus
size*. `basecodeMaxFreq` (0.5, i.e. 50%) is a genuine template filter, but
100 absolute submissions is only 20% of a 500-submission corpus and just
10% of a 1,000-submission one — so as n grows, the fixed cap becomes a
*strictly more aggressive* effective threshold. The synthetic generator's
small 6-shape statement vocabulary means many hashes are accidentally
common across unrelated submissions (already documented above as a
performance-benchmark caveat); more of those accidentally-common hashes
cross the 100-submission absolute cap at n=1,000 than at n=500, getting
excluded as "template" and removing more real candidate-pair-supporting
fingerprints than the 2x growth in corpus size adds back.

Confirmed by ablation (isolating `corpusCap` specifically, `basecodeMaxFreq`
held at its default in both arms): re-running the same generator's output
through `analyzeCorpus` with `corpusCap: 100` (default) vs. `corpusCap:
1_000_000` (effectively disabled) —

| n | candidatePairs, corpusCap=100 | candidatePairs, corpusCap≈off | pairs suppressed by corpusCap |
|---|---|---|---|
| 500 | 14,954 | 17,211 | 2,257 |
| 1,000 | 11,008 | 68,648 | 57,640 |

With `corpusCap` disabled the trend is properly monotonic (68,648 >
17,211) — confirming `corpusCap`'s fixed-absolute design, not generator
randomness, is what produces the dip in the committed (capped) numbers
above. (Table numbers here differ slightly from the committed bench
tables because this diagnostic used fresh `Math.random()` draws, not the
exact same corpus instance — the *mechanism*, not the exact counts, is the
verified finding.) Not a bug: `corpusCap` exists precisely to bound
worst-case pair blow-up independent of N (`config.ts`'s own comment: "an
absolute (not fractional) bound... basecodeMaxFreq alone doesn't bound
this for large corpora"), and it's doing exactly that job here — the
non-monotonic *count* is a byproduct of a fixed bound meeting a growing,
vocabulary-limited synthetic corpus, not evidence of an engine defect, and
it doesn't touch the real accuracy claim (`test/pipeline.test.ts`'s 18-doc
real corpus never approaches 100 submissions, so `corpusCap` is inert
there).

**Known tradeoff, not changed here:** because `corpusCap` is fixed and
absolute rather than fractional, its effective filter strictness increases
as corpus size grows (100 submissions is 20% of a 500-corpus but only 10%
of a 5,000-submission contest's worth) — a size-relative (fractional) cap
is a reasonable future improvement, but `corpusCap` stays at its current
value here: algorithm parameters are frozen per ARCHITECTURE.md §0 rule 5,
and this section documents the tradeoff for the record, not a bug to fix
in this phase.

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
