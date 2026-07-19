# Nakalchi

A source-code plagiarism detection engine for competitive programming
judges, based on the Stanford winnowing algorithm (the algorithm behind
MOSS), built as a standalone service and integrated with
[CodeArena](../Code%20Arena). Full design rationale, phase history, and
acceptance criteria: [ARCHITECTURE.md](Architecture.md).

## The problem

Online judges face systematic cheating: contestants copy solutions from
friends, Telegram groups, or AI tools, then disguise them by renaming
variables, reformatting, reordering functions, or changing literal values.
Manual review doesn't scale — a single contest can produce hundreds of
submissions per problem.

Nakalchi answers one question efficiently and defensibly:

> Given all accepted submissions for a problem, which pairs are so similar
> that a human should review them — and exactly which regions match?

Design constraints: robust to trivial disguise (renaming, reformatting,
literal changes must not defeat detection), resistant to template noise
(shared boilerplate must not false-positive), scales to contest size
(~1,000 submissions analyzable in minutes, not hours), and explainable
(a flagged pair comes with side-by-side highlighted matched regions, not
just a bare "87% similar").

## Algorithm

Primary reference: *Schleimer, Wilkerson, Aiken — "Winnowing: Local
Algorithms for Document Fingerprinting"* (SIGMOD 2003), the algorithm
behind MOSS.

Per submission:

```
source code
   │  1. TOKENIZE (language-aware lexer)
   ▼
token stream          e.g.  int IDENT = NUM ; for ( int IDENT = NUM ; ...
   │  2. NORMALIZE (identifiers → IDENT, literals → NUM/STR, strip comments/whitespace)
   ▼
normalized stream
   │  3. K-GRAMS (sliding window of k consecutive tokens)
   ▼
k-gram sequence
   │  4. ROLLING HASH (each k-gram → hash, O(1) per step)
   ▼
hash sequence
   │  5. WINNOW (window of w hashes → select min; guarantees detection of
   │     any match ≥ t = w + k − 1 tokens while storing far fewer hashes)
   ▼
fingerprints  =  set of (hash, position) pairs
```

Across submissions:

```
all fingerprints ──► BASE-CODE FILTER (drop hashes present in starter code
                     or in > P% of all submissions — kills template noise)
                ──► INVERTED INDEX  hash → [ (submissionId, position), ... ]
                ──► CANDIDATE PAIRS (pairs sharing ≥ minShared hashes;
                     avoids O(n²) full comparison)
                ──► PAIR SCORING
                       sim(A→B) = |FP(A) ∩ FP(B)| / |FP(A)|   (asymmetric, both directions)
                ──► REGION EXTRACTION (merge consecutive matching positions
                     into contiguous source ranges for the side-by-side UI)
```

Default parameters (`packages/core/src/config.ts`, single source of truth):
`k=17`, `w=4` (detection guarantee: any match ≥ 20 tokens), `basecodeMaxFreq=0.5`,
`minSharedFingerprints=5`, `flagThreshold=0.35`.

Similarity is asymmetric and reported both directions (`simAtoB`, `simBtoA`)
because a 30-line submission lifted wholesale into a 300-line one produces a
high score one way and a low score the other — exactly the signal a
reviewer wants ("A was lifted into B").

## Benchmarks

Dev-machine, single-threaded Node, `packages/core/bench/corpus.bench.ts`
(synthetic corpus, 5% plagiarism rate, 30% template share):

| n | wall time | RSS | candidate pairs | full pair count (n·(n-1)/2) | flagged |
|---|---|---|---|---|---|
| 100 | 0.40s | 140.0 MB | 656 | 4,950 | 558 |
| 500 | 2.03s | 317.7 MB | 14,405 | 124,750 | 12,398 |
| 1,000 | 3.84s | 548.8 MB | 9,835 | 499,500 | 9,196 |

At n=1,000, candidate pairs are ~1.9% of the full pairwise count — the
inverted index prunes the overwhelming majority of comparisons before any
scoring work happens. Full analysis (1,000 submissions) in 3.84s is well
under the project's own 60s acceptance gate. Full breakdown, including the
inverted-index representation and hash-representation micro-benchmarks:
[docs/benchmarks.md](docs/benchmarks.md).

*Candidate pairs dip from n=500 to n=1,000 (both tables) — verified cause:
`corpusCap`'s fixed absolute document-frequency bound (100 submissions)
becomes a proportionally stricter filter as the corpus grows, excluding
more of the synthetic generator's accidentally-common hashes at larger n;
confirmed by ablation, not generator randomness — full mechanism and
ablation data in [docs/benchmarks.md](docs/benchmarks.md).*

**In-situ Azure VM numbers** (same script, same params, run unconstrained
on the VM host with both CodeArena's and Nakalchi's containers already
resident and idle — the honest in-situ condition):

| n | wall time | RSS | candidate pairs | full pair count | flagged |
|---|---|---|---|---|---|
| 100 | 0.27s | 150.0 MB | 576 | 4,950 | 489 |
| 500 | 0.96s | 330.8 MB | 14,026 | 124,750 | 12,042 |
| 1,000 | 1.42s | 443.6 MB | 9,785 | 499,500 | 9,199 |

1.42s at n=1,000 — ~42x margin under the 60s gate, so the pre-approved
`worker_threads` fingerprinting fan-out was **not** built (trigger
threshold: >60s). Peak RSS cross-checked against `/usr/bin/time -v`
(443.82MB, agrees with the script's own 443.6MB self-report) and used to
size `nakalchi-worker`'s production `mem_limit` at 577MB
(`docker-compose.prod.yml`). Full detail: [docs/benchmarks.md](docs/benchmarks.md).

**Detection accuracy** (a distinct claim from performance): real corpus
test (`packages/core/test/pipeline.test.ts`, `corpus/two-sum-cpp`) — all 6
disguise variants of a source solution flag against it; zero false
positives among 10 genuinely independent solutions; the two adversarial
"evasion" variants that deliberately exceed the disguise spec do *not*
flag (0.26 and 0.11 similarity vs. a 0.35 threshold) — see
[docs/detection-boundary.md](docs/detection-boundary.md) for exactly where
token-level winnowing stops working and why.

## Limitations

- **Single-language matching only.** No cross-language detection (e.g. a
  C++ solution copied into Python) — out of scope for v1.
- **Token-level matching can be evaded by real control-flow restructuring.**
  `docs/detection-boundary.md` demonstrates this directly: splitting a
  matched loop into a helper function drops similarity from a clean flag to
  0.26; a partial copy with even one edited line inside the matched region
  fragments it enough to drop to 0.11 — both below the 0.35 threshold,
  despite region-extraction still locating the actual copied block. AST-level
  structural fingerprinting (ARCHITECTURE.md §8, stretch) is the intended
  countermeasure — not built in v1; widening the winnowing window or
  lowering the threshold to catch these would also raise false-positive risk
  against genuine solutions sharing ordinary idioms (`sol01~sol10` in the
  fixture corpus already sits at 0.30, a near-miss).
- **No AI-generated-code detection.** Nakalchi detects textual/structural
  similarity between submissions; it makes no claim about whether any given
  submission was AI-generated.
- **CodeArena integration has three narrow, documented race windows** — all
  accepted as known at-least-once edges rather than bugs, none silent
  (every one logs on at least one side), verified against the actual
  handler code in both repos, not summarized from memory:
  1. **Enqueue window.** Contest finalization never depends on Nakalchi
     being reachable (verified for real during Phase 6 with Nakalchi's
     containers stopped — CodeArena's finalization completed normally, the
     enqueue retried 3× with backoff and gave up cleanly). But finalization
     is a one-time atomic event: if the *enqueue itself* fails (e.g. Redis
     unreachable at that exact moment), nothing re-attempts it later —
     there's no admin "re-run integrity analysis" action.
  2. **Adapter window.** CodeArena's `worker/src/integrity.ts` POSTs to
     Nakalchi, receives an `analysisId`, then writes
     `contest.integrityAnalysis = {analysisId, ...}` and calls
     `contest.save()` with no intervening `await` between receiving the id
     and starting the write. If that worker process crashes in the
     sub-millisecond window between the 202 response and `save()`
     completing, BullMQ's retry re-runs the same job from scratch; the
     job's own duplicate-analysis guard (`if
     (contest.integrityAnalysis?.analysisId) skip`) only protects a retry
     *after* the save landed, so a crash before it causes the retry to
     re-POST and creates one orphaned Nakalchi analysis whose id is never
     attached to any contest.
  3. **Webhook window** (the mirror image). CodeArena's webhook receiver
     (`api/src/routes/internalWebhooks.ts`) looks up the contest by
     `analysisId` and deliberately returns `404` (not `503`) on no match —
     Nakalchi's `webhooks/notify.ts` retries on any non-2xx response (3
     attempts total, 2s then 4s backoff between them, verified against its
     source), so a 404 gives window 2's race a second and third chance to
     resolve if the write is merely slow. But if window 2's write never
     lands at all, all 3 retries eventually 404 and the completed (or
     failed) analysis stays permanently unattached to any contest — logged
     (`nakalchi webhook: no contest pending this analysisId (yet)`) on
     CodeArena's side each time, never surfaced as a hard error.

  Full narrative and real log output: this file's git history (Phase 6
  section) and [docs/e2e-codearena.md](docs/e2e-codearena.md)'s "Failure
  isolation" section.
- **Very short solutions look artificially similar.** No dedicated minimum
  token-count floor is enforced yet; extremely short problems (e.g. A+B)
  will tend to score high against each other regardless of authorship. Known
  property, not a bug (ARCHITECTURE.md §7).

## API reference (`/api/v1`, auth via `X-Api-Key`)

```
POST /analyses
  body: { params?, submissions: [{ externalId, userRef, problemRef,
          language, source }] }                       # direct mode
     or { source: "codearena", contestId, problemIds } # pull mode
  → 202 { analysisId }

GET  /analyses                    → paginated list; ?status=&cursor=&limit=
GET  /analyses/:id                → status, progress, stats
GET  /analyses/:id/pairs          → paginated; ?minSim=&flaggedOnly=&problemRef=
GET  /pairs/:id                   → pair + regions + both full sources
GET  /admin/stats                 → analyses/day, p50/p95 analysis wall time
GET  /healthz | /readyz           → unauthenticated, outside /api/v1
```

Error envelope everywhere: `{ error: { code, message, details? } }`. Cursor
pagination (`?cursor=&limit=`), not offset.

## Local setup (~7 min)

Actually run end-to-end from a clean clone during Phase 7 (not assumed —
real timings below, from this machine, network-dependent so treat as an
order of magnitude, not a guarantee):

```bash
git clone <this-repo> nakalchi && cd nakalchi
docker compose up -d          # mongo, redis, api, worker, web
```
Real result: **~5m30s** from `docker compose up -d` to both `api`
(`/healthz`) and `web` (`/`) responding, on a fresh clone with no cached
Docker volumes — most of that is `npm ci` running inside each container
(including `mongodb-memory-server`'s own MongoDB-binary download for the
service package's devDependencies), not application startup itself. On a
machine with warm Docker layer/volume caches this is much faster.

`scripts/seed-demo.ts` runs on the **host**, not in a container — it needs
its own `npm ci` first (a real gap found during this verification: the
Docker stack alone isn't sufficient to run it):
```bash
npm ci                                            # ~1m40s, fresh clone
npm run seed-demo --workspace=@nakalchi/service
```
Real output:
```
Loaded 16 submissions from .../corpus/two-sum-cpp
Analysis created: 6a5bd8c18bbf5b5796e71a34
  status=queued progress=0%
  status=completed progress=100%
Analysis completed: {
  submissions: 16,
  fingerprints: 953,
  candidatePairs: 23,
  flaggedPairs: 17,
  wallMs: 333
}
```
Then open `http://localhost:3001` for the dashboard. Total, start to a
browsable report: **~7 minutes** on this machine from a genuinely cold
clone — closer to the original "5 minutes" once Docker's layer/volume
caches are warm (a `docker compose up -d` re-run reuses the named
`*_node_modules` volumes and is well under a minute).

## Repo layout

Monorepo via npm workspaces: `packages/core` (pure algorithm library, zero
I/O), `packages/service` (Express API + BullMQ worker), `packages/web`
(Next.js report UI). Full structure and data model: ARCHITECTURE.md §3–§4.

## Production deployment

`docker-compose.prod.yml` + `docs/deploy-runbook.md` (exact VM commands) +
`docs/demo-script.md` (recording shot list). See ARCHITECTURE.md §5 Phase 7
for the full plan.
