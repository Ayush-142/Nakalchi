# Nakalchi — Architecture & Build Plan
#dont commit yourself
**A source-code plagiarism detection engine for competitive programming judges, based on the Stanford winnowing algorithm (MOSS), built as a standalone service and integrated with CodeArena.**

> Working name is `Nakalchi` — rename freely; it appears only in package names and this doc.

---

## 0. Document Purpose & Working Instructions for AI Assistants

This document is the single source of truth for the project. It follows the same workflow that built CodeArena:

1. **Phase-by-phase development.** No phase begins until the previous phase's acceptance criteria pass and the plan for the new phase has been reviewed.
2. **Plan before code.** For each phase, the implementing assistant (Claude Code) produces a short written plan (files to create/modify, key decisions) which is reviewed BEFORE implementation.
3. **No fabricated confirmations.** Never claim a test passed, a benchmark ran, or a doc says something without actually running/reading it. If a claim comes from documentation, it must be verbatim-quotable.
4. **Correctness first, polish second.** The core library (Phases 1–3) must be provably correct via tests before any service/UI work begins.
5. **Do not change algorithm parameters (k, w, hash constants) silently.** They are centralized in `packages/core/src/config.ts` and any change must be justified in the phase plan.

---

## 1. Problem Statement

Online judges face systematic cheating: contestants copy solutions from friends, Telegram groups, or AI tools, then disguise them by renaming variables, reformatting, reordering functions, or translating comments. Manual review does not scale — a single CodeArena contest can produce hundreds of submissions per problem.

Nakalchi answers one question efficiently and defensibly:

> Given all accepted submissions for a problem, which pairs are so similar that a human should review them — and exactly which regions match?

Design constraints that shape everything below:

- **Robust to trivial disguise.** Renaming identifiers, changing whitespace/comments, and changing literal values must NOT defeat detection.
- **Resistant to template noise.** Competitive programmers share boilerplate (fast IO, `#define` macros, debug templates). Shared boilerplate must not produce false positives.
- **Scales to contest size.** ~1,000 submissions per problem must be analyzable in minutes on a 2-vCPU Azure VM, not hours.
- **Explainable output.** A flagged pair must come with side-by-side highlighted matched regions. "87% similar" without evidence is useless for a human reviewer (and for an interview demo).
- **Standalone.** CodeArena is the first consumer, but the engine exposes a generic API — any judge could use it.

Non-goals (v1): cross-language detection (C++ copied to Python), semantic/AST-level matching (Phase 8 stretch), AI-generated-code detection.

---

## 2. Algorithm Overview (What We're Implementing)

Primary reference: *Schleimer, Wilkerson, Aiken — "Winnowing: Local Algorithms for Document Fingerprinting" (SIGMOD 2003)* — the algorithm behind MOSS. Read it fully in Phase 0.

Pipeline per submission:

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
   │  4. ROLLING HASH (each k-gram → 64-bit hash, O(1) per step)
   ▼
hash sequence
   │  5. WINNOW (window of w hashes → select min; guarantees detection of
   │     any match ≥ t = w + k − 1 tokens while storing far fewer hashes)
   ▼
fingerprints  =  set of (hash, position) pairs
```

Then across submissions:

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

Default parameters (centralized, configurable per analysis):

| Param | Default | Meaning |
|---|---|---|
| `k` | 17 | k-gram size in tokens. Below this, matches are coincidence. |
| `w` | 4 | winnowing window. Guarantee threshold t = w + k − 1 = 20 tokens. |
| `hashBits` | 64 | rolling polynomial hash, random odd base chosen at build time |
| `basecodeMaxFreq` | 0.5 | hash appearing in >50% of submissions is treated as template |
| `minSharedFingerprints` | 5 | below this, a pair is never a candidate |
| `flagThreshold` | 0.35 | default similarity above which a pair is surfaced in reports |

Why asymmetric similarity: if A is 30 lines and B is 300 lines containing all of A, sim(A→B) is high while sim(B→A) is low — exactly the signal a reviewer wants ("A was lifted into B"). Reports always show both directions plus the longest matched region length.

---

## 3. System Architecture

```
                                  ┌────────────────────────────────────────┐
                                  │              CodeArena                 │
                                  │  (existing MERN platform, Azure VM)    │
                                  │                                        │
                                  │  contest ends ─► enqueue BullMQ job    │
                                  │  "integrity:analyze" {contestId,…}     │
                                  └──────────────┬─────────────────────────┘
                                                 │ Redis (shared instance)
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Nakalchi  (this project)                    │
│                                                                         │
│  ┌───────────────┐   ┌──────────────────────────────────────────────┐   │
│  │  API Service  │   │              Analysis Worker                 │   │
│  │  (Express +   │   │  (BullMQ consumer, concurrency=1 per CPU)    │   │
│  │   TypeScript) │   │                                              │   │
│  │               │   │   fetch submissions ─► core pipeline ─►      │   │
│  │  REST v1      │   │   store pairs & regions ─► emit webhook      │   │
│  │  API-key auth │   │                                              │   │
│  └──────┬────────┘   └──────────────┬───────────────────────────────┘   │
│         │                           │                                   │
│         │        both depend on     │                                   │
│         ▼                           ▼                                   │
│  ┌──────────────────────────────────────────────┐                       │
│  │           @Nakalchi/core                 │                       │
│  │  pure TypeScript library, zero I/O           │                       │
│  │  tokenizers · winnowing · index · matching   │                       │
│  └──────────────────────────────────────────────┘                       │
│                                                                         │
│  MongoDB (analyses, pairs, regions)      Redis (BullMQ queues)          │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │   Report UI (Next.js)     │
              │  analysis dashboard,       │
              │  pair list, side-by-side   │
              │  matched-region viewer     │
              └───────────────────────────┘
```

### 3.1 Key architectural decisions (and why — interview ammunition)

**Monorepo with a pure core library.** `@Nakalchi/core` contains ALL algorithmic logic and performs zero I/O — it takes strings in and returns data structures out. This makes it (a) exhaustively unit-testable, (b) benchmarkable in isolation, (c) publishable to npm as a standalone open-source library, which is a resume line of its own.

**Standalone service, not a CodeArena module.** Separate repo, separate deployment, communicates via queue + REST. Justification: independent scaling (analysis is CPU-bound, the judge is I/O-bound), independent failure domains (a crashed analysis never affects live contests), and it forces a clean API — proof you can design service boundaries.

**Queue-based ingestion, synchronous reads.** Analyses are long-running (seconds to minutes) → async via BullMQ with progress reporting. Reading results is fast → plain REST. Same split CodeArena already uses for judging, so the operational story is consistent.

**Shared Redis, separate Mongo database.** Reuse the VM's Redis (namespaced queue prefix `sentinel:`) to stay within Azure-for-Students resources; use a separate Mongo database `Nakalchi` for clean data ownership. Document this as a cost-driven tradeoff you'd revisit with real budget.

**Idempotency everywhere.** Analysis jobs carry an `analysisId`; re-delivery of the same job (BullMQ retry, worker crash) must not duplicate results. Worker checks analysis status before starting and writes results in a single transactional finalize step (delete-then-insert pairs under the analysisId, then flip status). Webhooks to CodeArena carry the same id and CodeArena treats them idempotently.

**TypeScript, not C++/Go.** Deliberate: consistency with your stack means faster delivery before placements, and the algorithmic depth lives in the algorithm, not the language. Performance is handled by design (winnowing reduces data ~1/w, inverted index avoids O(n²) full comparisons, worker uses `worker_threads` for tokenization fan-out in Phase 7 if benchmarks demand it). Be ready to defend this choice; also be ready to say what you'd change at 100× scale (core in Rust/C++ via N-API).

### 3.2 Data flow for one analysis (end to end)

1. Contest ends in CodeArena → CodeArena enqueues `integrity:analyze` with `{contestId, problems: [...], callbackUrl}` OR an operator calls `POST /api/v1/analyses` directly with raw submissions.
2. API service validates, creates `analyses` doc with status `queued`, enqueues internal job keyed by `analysisId`.
3. Worker picks up job → status `running`, progress 0.
4. Per problem: fetch submissions → tokenize+fingerprint each (progress updates) → base-code filter → build inverted index → candidate pairs → score → extract regions.
5. Worker writes `pairs` docs (bulk), flips analysis to `completed`, fires webhook with summary `{analysisId, flaggedPairs, topSimilarity}`.
6. Reviewer opens Report UI → dashboard → drills into a pair → side-by-side viewer renders both sources with matched regions highlighted (region data already stored; UI does no computation).
7. Failure path: any throw → BullMQ retry with backoff (max 3) → terminal failure flips status to `failed` with error captured; webhook fires with failure payload.

---

## 4. Repository & Folder Structure

Monorepo via npm workspaces (or pnpm — pick one in Phase 0 and stick to it).

```
Nakalchi/
├── ARCHITECTURE.md                  # this file
├── package.json                     # workspaces root, shared scripts
├── tsconfig.base.json
├── docker-compose.yml               # local dev: mongo, redis
├── docker-compose.prod.yml          # prod: api, worker, web (mongo/redis external)
├── .github/
│   └── workflows/
│       └── ci.yml                   # lint → typecheck → unit → integration → bench (smoke)
│
├── packages/
│   ├── core/                        # @Nakalchi/core — PURE library, zero I/O
│   │   ├── src/
│   │   │   ├── config.ts            # k, w, hash base, thresholds — single source of truth
│   │   │   ├── types.ts             # Token, Fingerprint, PairScore, MatchRegion, …
│   │   │   ├── tokenize/
│   │   │   │   ├── Tokenizer.ts     # interface: (source) => Token[] (token has type,
│   │   │   │   │                    #   normalized form, line, col, byte offsets)
│   │   │   │   ├── cpp.ts           # C++ lexer: comments, strings, char literals,
│   │   │   │   │                    #   preprocessor lines, raw strings R"(…)"
│   │   │   │   ├── python.ts        # Python lexer: strings (incl. f/triple), comments;
│   │   │   │   │                    #   indentation intentionally ignored (see §5 P1)
│   │   │   │   └── normalize.ts     # IDENT/NUM/STR mapping, keyword whitelist per lang
│   │   │   ├── fingerprint/
│   │   │   │   ├── rollingHash.ts   # 64-bit polynomial rolling hash over token stream
│   │   │   │   └── winnow.ts        # windowed-min selection, rightmost-min tie rule
│   │   │   ├── match/
│   │   │   │   ├── basecode.ts      # frequency + starter-code fingerprint subtraction
│   │   │   │   ├── index.ts         # inverted index: hash → postings
│   │   │   │   ├── candidates.ts    # candidate pair generation with minShared cutoff
│   │   │   │   ├── score.ts         # asymmetric similarity, longest region, token overlap
│   │   │   │   └── regions.ts       # position-run merging → source byte/line ranges
│   │   │   └── pipeline.ts          # analyzeCorpus(submissions, opts) → AnalysisResult
│   │   ├── test/
│   │   │   ├── fixtures/            # golden files: source → expected token stream;
│   │   │   │   │                    #   plagiarism corpus: original + 6 disguise variants
│   │   │   │   ├── cpp/
│   │   │   │   └── python/
│   │   │   ├── tokenize.cpp.test.ts
│   │   │   ├── tokenize.python.test.ts
│   │   │   ├── winnow.test.ts       # includes the paper's worked example verbatim
│   │   │   ├── properties.test.ts   # fast-check: rename-invariance, whitespace-invariance,
│   │   │   │                        #   winnowing guarantee (any match ≥ t is detected)
│   │   │   └── pipeline.test.ts     # corpus-level: knownPairs flagged, decoys not
│   │   ├── bench/
│   │   │   └── corpus.bench.ts      # synthetic corpus generator + timing harness
│   │   └── package.json
│   │
│   ├── service/                     # @Nakalchi/service — API + worker
│   │   ├── src/
│   │   │   ├── app.ts               # Express app factory (no listen — testable)
│   │   │   ├── server.ts            # entrypoint: listen, graceful shutdown (SIGTERM:
│   │   │   │                        #   stop intake, drain worker, close mongo/redis)
│   │   │   ├── config/env.ts        # zod-validated environment (fail fast on boot)
│   │   │   ├── auth/apiKey.ts       # X-Api-Key header, constant-time compare,
│   │   │   │                        #   per-key rate limit (reuse pattern, small scale)
│   │   │   ├── routes/
│   │   │   │   ├── analyses.ts      # POST /analyses, GET /analyses/:id,
│   │   │   │   │                    #   GET /analyses/:id/pairs (paginated, ?minSim=)
│   │   │   │   ├── pairs.ts         # GET /pairs/:id  (full regions + both sources)
│   │   │   │   └── health.ts        # GET /healthz (mongo+redis ping), GET /readyz
│   │   │   ├── models/
│   │   │   │   ├── Analysis.ts      # see §4.1 schemas
│   │   │   │   ├── SubmissionSnapshot.ts
│   │   │   │   └── Pair.ts
│   │   │   ├── queue/
│   │   │   │   ├── queues.ts        # BullMQ queue defs, prefix "sentinel:"
│   │   │   │   └── analysisWorker.ts# consumes jobs, drives core pipeline, progress,
│   │   │   │                        #   idempotent finalize, webhook emit w/ HMAC sig
│   │   │   ├── integrations/
│   │   │   │   └── codearena.ts     # submission fetcher (REST pull w/ service token)
│   │   │   └── webhooks/notify.ts   # signed callback POST, retry ×3 w/ backoff
│   │   ├── test/
│   │   │   ├── integration/         # supertest + mongodb-memory-server + real Redis
│   │   │   └── e2e/                 # docker-compose up → submit corpus → assert report
│   │   └── package.json
│   │
│   └── web/                         # @Nakalchi/web — Next.js report UI
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx                 # analyses dashboard
│       │   │   ├── analyses/[id]/page.tsx   # pair list: sortable by sim, filterable
│       │   │   └── pairs/[id]/page.tsx      # side-by-side matched-region viewer
│       │   ├── components/
│       │   │   ├── PairTable.tsx
│       │   │   ├── SimilarityBadge.tsx
│       │   │   └── DiffViewer.tsx           # two panes, synced scroll, region highlight,
│       │   │                                #   click region ⇄ jump both panes
│       │   └── lib/api.ts                   # typed client for service API
│       └── package.json
│
├── corpus/                          # real-world test corpus (git-tracked, anonymized)
│   ├── README.md                    # provenance + how variants were constructed
│   └── two-sum-cpp/                 # e.g. 1 original + variants + 10 genuine solutions
│
└── scripts/
    ├── seed-demo.ts                 # loads corpus, runs an analysis, opens report
    └── gen-corpus.ts                # synthetic corpus generator for benchmarks
```

### 4.1 Data model (MongoDB, database `Nakalchi`)

```
analyses
  _id, source: "codearena" | "api",
  contestRef?: { contestId, problemIds[] },
  params: { k, w, basecodeMaxFreq, flagThreshold },   // frozen per analysis
  status: "queued" | "running" | "completed" | "failed",
  progress: 0..100, error?: string,
  stats: { submissions, fingerprints, candidatePairs, flaggedPairs, wallMs },
  createdAt, startedAt?, completedAt?
  // index: { status: 1, createdAt: -1 }

submission_snapshots                  // immutable copy — analyses stay reproducible
  _id, analysisId, externalId,        // externalId = CodeArena submission id
  userRef, problemRef, language: "cpp" | "python",
  source: string,                     // gzip if > 64KB (utility in service)
  tokenCount, fingerprintCount
  // index: { analysisId: 1, externalId: 1 } unique

pairs
  _id, analysisId, problemRef,
  a: { snapshotId, userRef }, b: { snapshotId, userRef },
  simAtoB, simBtoA, sharedFingerprints, longestRegionTokens,
  flagged: boolean,                   // max(simAtoB, simBtoA) ≥ flagThreshold
  regions: [ { aStart, aEnd, bStart, bEnd,          // byte offsets
               aLineStart, aLineEnd, bLineStart, bLineEnd, tokens } ]
  // index: { analysisId: 1, flagged: 1, simAtoB: -1 }
```

Regions are stored denormalized on the pair (bounded: cap at 200 regions/pair) so the UI is a pure read — no recomputation at view time.

### 4.2 API surface (v1, all under `/api/v1`, auth via `X-Api-Key`)

```
POST /analyses
  body: { params?, submissions: [{ externalId, userRef, problemRef,
          language, source }] }                       # direct mode
     or { source: "codearena", contestId, problemIds } # pull mode
  → 202 { analysisId }

GET  /analyses/:id                → status, progress, stats
GET  /analyses/:id/pairs          → paginated; ?minSim=&flaggedOnly=&problemRef=&sort=
GET  /pairs/:id                   → pair + regions + both full sources
GET  /healthz | /readyz
```

Error envelope everywhere: `{ error: { code, message, details? } }`. Cursor pagination (`?cursor=&limit=`), not offset. Version the path from day one.

---

## 5. Phase Plan

Every phase ends with a review gate: plan reviewed before code, acceptance criteria demonstrated (actually run, output shown) before the next phase starts. Time estimates assume ~15 focused hrs/week; total ≈ 6–7 weeks with Phase 8 optional.

---

### Phase 0 — Spec & Skeleton (2–3 days)

**Do:**
1. Read the winnowing paper end-to-end. Write `docs/notes-winnowing.md` in your own words: why k-gram hashing alone over-collects, what the (t, k)-guarantee means, why windowed-min with the rightmost-tie rule gives position-independent selection. If you can't explain the guarantee proof sketch, re-read — this is interview material.
2. Hand-trace the paper's worked example (the "adorunrunrun" example) on paper; it becomes a unit test in Phase 2.
3. Decide package manager (npm workspaces vs pnpm), Node LTS version, and initialize the monorepo skeleton exactly as in §4 (empty modules, tsconfig project references, ESLint+Prettier, Vitest wired, CI running lint+typecheck on push).
4. Build the fixture corpus: pick 2 problems (one you've solved on Codeforces, one CodeArena problem). For each, write/collect ~10 genuinely independent solutions plus 1 original and 6 disguised variants: (a) rename all identifiers, (b) reformat + comment changes, (c) reorder functions, (d) change literals, (e) combined a–d, (f) partial copy — one function lifted into an otherwise original solution. Document construction in `corpus/README.md`.

**Acceptance:** monorepo installs and CI is green on an empty test; notes doc exists; corpus committed with provenance README.

---

### Phase 1 — Tokenizers & Normalization (Week 1)

**Do:**
1. Define `Token { type, norm, line, col, startByte, endByte }` and the `Tokenizer` interface. Byte offsets are mandatory — region highlighting in Phase 5 depends on them.
2. C++ lexer as a hand-written scanner (no parser generators — the point is you built it): handles `//` and `/* */` comments, string/char literals with escapes, raw strings `R"(…)"`, preprocessor lines (normalize `#include` lines away entirely; keep `#define` bodies tokenized), digit separators `1'000'000`.
3. Python lexer: `#` comments, single/triple/f-strings; deliberately ignore indentation tokens and document why: winnowing matches local token runs, and INDENT/DEDENT noise between logical lines hurts more than it helps at k=17.
4. Normalization pass: identifiers → `IDENT`, all numeric literals → `NUM`, all strings → `STR`; keywords and operators/punctuation pass through as themselves. Keyword whitelist per language lives in `normalize.ts`.
5. Golden-file tests: fixture source in, expected normalized stream out, for every tricky construct above. Property test with fast-check: for random identifier-renaming maps applied to fixture sources, normalized token streams are **identical**.

**Acceptance:** golden tests pass for both languages; rename-invariance property holds over 1,000 random renamings; tokenizer throughput ≥ 1MB source/sec (rough sanity bench, not a hard gate).

---

### Phase 2 — Fingerprinting: Rolling Hash + Winnowing (Week 2)

**Do:**
1. Polynomial rolling hash over the `norm` field of the token stream (hash token strings once into ints first; then the k-gram hash is over token-ints). 64-bit via `BigInt`-free math: use two 31-bit hashes packed, or `Number`-safe mod arithmetic — decide in plan review, justify collision probability at corpus scale (10⁶ fingerprints ⇒ expected collisions under 64-bit ≈ negligible; show the birthday-bound arithmetic in a comment).
2. Winnowing: window of `w` consecutive hashes, select the minimum; on ties select the **rightmost** minimum; record `(hash, tokenPosition)`; skip re-recording the same selection as the window slides (the paper's optimization).
3. Unit test the paper's worked example verbatim — same input, same k, w, same expected fingerprint set.
4. Property tests: (a) **guarantee** — plant a shared token run of length ≥ t = w + k − 1 into two random streams; assert at least one common fingerprint always survives; (b) **density** — selected fingerprints ≈ 2/(w+1) of hashes over random input (loose statistical bound); (c) determinism — same input, same output, independent of surrounding content (position independence).
5. Wire `pipeline.fingerprint(source, language, params)` returning `Fingerprint[]` and expose from core's public API.

**Acceptance:** paper example test passes; guarantee property holds over 10,000 randomized trials; fingerprinting 1,000 synthetic 200-line submissions completes < 10s single-threaded.

---

### Phase 3 — Matching Engine (Weeks 3 → mid-4) — the heart of the project

**Do:**
1. **Base-code filter:** build fingerprint frequency map across the corpus; drop hashes with document-frequency > `basecodeMaxFreq`; additionally accept optional `starterCode` sources whose fingerprints are subtracted outright. Test: inject a shared fast-IO template into all fixture solutions; assert zero flagged pairs among genuine solutions, while planted plagiarism pairs still flag.
2. **Inverted index:** `Map<hash, Posting[]>` where posting = `(docId, position)`. Memory math in comments: 1,000 submissions × ~300 fingerprints ≈ 300k postings — trivially in RAM; state at what scale you'd shard or go external.
3. **Candidate generation:** walk the index; for every hash with posting list length in [2, corpusCap], emit doc-pair co-occurrence counts; keep pairs with ≥ `minSharedFingerprints`. This is the O(n²)-avoidance story — measure and record candidate-set size vs. full pair count on the benchmark corpus.
4. **Scoring:** for each candidate pair compute `simAtoB`, `simBtoA`, shared count.
5. **Region extraction:** shared fingerprints carry token positions in both docs; sort by position, merge runs where consecutive shared fingerprints are within a gap tolerance (default: w tokens) in BOTH docs; map merged token runs back through token byte offsets to `(startByte, endByte, lineStart, lineEnd)` per side. Cap regions per pair; compute `longestRegionTokens`.
6. Corpus-level pipeline test: run `analyzeCorpus` on the Phase 0 corpus. Assert: all 6 disguise variants pair with the original above `flagThreshold`; **zero** genuine-solution pairs flag; the partial-copy variant (f) flags with a region covering the lifted function specifically.
7. Benchmark harness (`bench/`): synthetic corpus generator (parameterized: n submissions, plagiarism rate, template share); record wall time and peak RSS for n ∈ {100, 500, 1000}; commit results table to `docs/benchmarks.md`.

**Acceptance:** corpus test green (this is the project's central claim — no hand-waving); 1,000-submission analysis < 60s end-to-end single-threaded on your dev machine; benchmark doc committed with real numbers.

---

### Phase 4 — Service Layer: API + Worker (Weeks mid-4 → 5)

**Do:**
1. Express app factory + zod-validated env config (`MONGO_URI`, `REDIS_URL`, `API_KEYS`, `WEBHOOK_SECRET`, `QUEUE_PREFIX`) — process exits with a clear message on invalid config.
2. Models per §4.1 with the listed indexes; gzip helper for large sources.
3. `POST /analyses` (direct mode first): validate payload (per-submission size cap 256KB, corpus cap 5,000 — return 413/422 with error envelope), snapshot submissions, create analysis `queued`, enqueue BullMQ job `{analysisId}` with `jobId = analysisId` (BullMQ-level dedup).
4. Worker: concurrency 1 (CPU-bound); status transitions with guards (a `completed` analysis is never re-run — idempotent re-delivery check); progress updates every N submissions fingerprint-ed and per pipeline stage; finalize = bulk-delete pairs for analysisId, bulk-insert, flip status — restart-safe.
5. Read endpoints with cursor pagination, `minSim` / `flaggedOnly` filters, and `GET /pairs/:id` assembling both sources + regions.
6. Webhook notifier: signed (`X-Sentinel-Signature: hmac-sha256(body, WEBHOOK_SECRET)`), 3 retries with exponential backoff, outcomes logged on the analysis doc.
7. API-key auth middleware (constant-time compare), pino structured logging with `analysisId` correlation on every log line, `/healthz` + `/readyz`.
8. Graceful shutdown: SIGTERM → stop HTTP intake → wait for in-flight job (or requeue) → close connections. Test it: kill the worker mid-analysis, restart, assert the analysis completes correctly exactly once.
9. Integration tests (supertest + mongodb-memory-server + Redis): full happy path (POST → poll → pairs match Phase 3 expectations on the fixture corpus), auth failures, validation failures, idempotent re-enqueue.

**Acceptance:** integration suite green in CI; kill-and-restart test demonstrably produces exactly-once results; `docker-compose.yml` brings up the full stack locally with one command and `scripts/seed-demo.ts` produces a completed analysis.

---

### Phase 5 — Report UI (Week 6, first half)

**Do:**
1. Dashboard: analyses list with status/progress (poll while running), stats summary.
2. Analysis page: pair table — both usernames, sim badges both directions, longest region, flagged marker; sort by similarity; filters bound to API params; pagination.
3. Pair page — the demo centerpiece: two read-only code panes (use CodeMirror or plain `<pre>` with span-wrapped ranges — plan-review the choice), matched regions highlighted with per-region colors, region list sidebar, click a region → both panes scroll to it, synced-scroll toggle. All data comes from `GET /pairs/:id`; the UI computes nothing.
4. Keep visual design clean and dense (reviewer tool, not a marketing page); dark mode optional but this UI is 80% of the demo video, so spend the polish here.

**Acceptance:** from `seed-demo.ts` output you can visually walk original-vs-variant-(e) and see exactly the matched regions; variant (f) shows highlighting on only the lifted function.

---

### Phase 6 — CodeArena Integration (Week 6, second half)

**Do:**
1. CodeArena side: on contest finalization, enqueue `integrity:analyze` (feature-flagged) → a thin adapter calls Sentinel `POST /analyses` in pull mode; add an internal CodeArena endpoint `GET /internal/contests/:id/submissions` (service-token protected) that Sentinel's `integrations/codearena.ts` consumes with pagination.
2. Webhook receiver in CodeArena: verify HMAC, store `{analysisId, flaggedPairs}` on the contest, render an "Integrity" tab in the contest admin UI that deep-links into Sentinel's report pages.
3. Failure isolation: if Sentinel is down, contest finalization must complete normally — the analyze enqueue is fire-and-forget with its own retry; document this explicitly.
4. E2E: run a real (small) CodeArena contest locally, submit the fixture corpus through the actual judge, finalize, and follow the whole chain to a rendered pair report.

**Acceptance:** the e2e chain works from contest finalize → flagged pair visible in the UI, with CodeArena unaffected when Sentinel is stopped.

---

### Phase 7 — Production Hardening & Launch (Week 7)

**Do:**
1. Deploy on the Azure VM: `docker-compose.prod.yml` (api, worker, web), external Mongo/Redis, Caddy vhost (e.g. `sentinel.<yourdomain>.duckdns.org`) with the same TLS setup as CodeArena; resource limits on containers (the VM is small — cap worker memory, restart: unless-stopped).
2. Load/perf pass on the VM itself: run the 1,000-submission benchmark in-situ; if wall time is unacceptable, parallelize the fingerprinting stage with `worker_threads` (tokenization is embarrassingly parallel) — this is the pre-approved optimization; record before/after in `docs/benchmarks.md`.
3. Ops basics: log rotation, a `GET /metrics`-lite endpoint or admin stats page (analyses/day, p50/p95 analysis wall time), Mongo backup cron for the `Nakalchi` db.
4. Docs for the repo README: problem, algorithm summary with the pipeline diagram, benchmark table, honest limitations section (single-language matching only, AST evasion possible → Phase 8, no AI-code detection), API reference, 5-minute local setup.
5. Record the demo video: 30s problem statement → run an analysis live → open the side-by-side viewer on variant (e) → show the template-noise test (genuine pairs stay clean).
6. Resume bullets (draft now, refine after benchmarks): implemented the MOSS winnowing algorithm from the SIGMOD paper; detection robust to identifier renaming/reformatting/reordering (property-tested); analyzed N submissions in Xs on a 2-vCPU VM via inverted-index candidate pruning (Y× fewer comparisons than naive pairwise); integrated with a live judge platform.

**Acceptance:** publicly reachable deployment; benchmark table with real VM numbers; demo video recorded; README complete.

---

### Phase 8 — Stretch: AST-Level Matching (only if time remains)

Structural fingerprinting to catch restructured-but-copied code: parse with tree-sitter (C++/Python grammars), serialize normalized AST node-type sequences via preorder traversal, fingerprint that sequence with the existing winnow machinery (reuse!), and report a second similarity score `simStructural` alongside token similarity. Ship behind a param flag; add corpus variant (g): statement-level restructuring that defeats token matching but not AST matching, and prove it in the pipeline test. **Do not start this before Phase 7 is done** — a deployed, benchmarked v1 beats a half-built v2.

---

## 6. Testing Strategy (summary)

| Layer | Tooling | What it proves |
|---|---|---|
| Golden files | Vitest fixtures | lexers handle real-world syntax exactly |
| Property tests | fast-check | rename/whitespace invariance; winnowing (t,k)-guarantee; determinism |
| Corpus tests | Vitest, real corpus | the product claim: disguised copies flag, genuine solutions don't |
| Integration | supertest, mongodb-memory-server, Redis | API contract, idempotency, auth, pagination |
| Chaos | manual + scripted kill/restart | exactly-once analysis results across worker crashes |
| Benchmarks | custom harness, committed results | scale claims are real numbers, not adjectives |

CI order: lint → typecheck → unit+property → integration → corpus. Benchmarks run manually and on release tags (too slow for every push).

## 7. Risks & Mitigations

- **Lexer rabbit holes (C++ especially).** Scope the lexer to what appears in competitive code; keep an "unsupported construct" escape hatch that tokenizes unknown bytes as `RAW` rather than crashing. Expand from real failures in your corpus, not from the C++ standard.
- **False positives on short problems.** Very short solutions (A+B) will all look similar. Mitigation: minimum token-count floor per submission (skip + report as "too short to analyze"), and lean on the base-code filter. Document as a known property, not a bug.
- **Timeline compression.** The cut line is explicit: Phases 0–5 are the project; Phase 6 makes it a story; Phases 7 is launch polish; Phase 8 is bonus. If placements arrive early, a deployed Phase-5 build with the corpus test green is fully defensible in interviews.
