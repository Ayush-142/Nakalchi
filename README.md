# Nakalchi

> Full README (problem statement, algorithm summary, setup, benchmarks) is a
> Phase 7 deliverable per `ARCHITECTURE.md` §5 — not written yet. This file
> currently holds only what Phase 6 explicitly requires documented here.

## CodeArena integration — failure isolation

Nakalchi integrates with [CodeArena](../Code%20Arena) so that finalizing a
contest automatically triggers a plagiarism analysis (see `ARCHITECTURE.md`
§5 Phase 6 and `docs/e2e-codearena.md` for the full design and local-run
instructions).

**Contest finalization never depends on Nakalchi being reachable.** The
`integrity:analyze` enqueue (CodeArena's `api/src/contests/rebuild.ts`) is
fire-and-forget: it runs only after the contest has already been atomically
marked finalized, wrapped in a `try/catch` that only logs on failure, and
never throws upward into the request that triggered finalization.

Verified for real during Phase 6's E2E pass, with Nakalchi's containers
stopped entirely (`docker compose down` in this repo) and only CodeArena's
own dependencies (Mongo/Redis) left running:

- `GET /api/contests/:id/leaderboard` (the request that lazily triggers
  finalization) returned `200` with `isFinalized: true` and correct
  standings — identical to the normal path.
- CodeArena's own `integrity` worker independently logged three failed
  retry attempts against unreachable Nakalchi, at the configured 5s/10s/20s
  exponential backoff (`attempts: 3`), before giving up:
  ```
  [20:49:24] ERROR integrity analyze job failed  contestId=... err="fetch failed"
  [20:49:29] ERROR integrity analyze job failed  contestId=... err="fetch failed"   (+5s)
  [20:49:39] ERROR integrity analyze job failed  contestId=... err="fetch failed"   (+10s)
  ```
- None of this was visible to, or blocked, the finalization response.

**Known limitation — no automatic re-trigger.** Contest finalization is a
one-time atomic event (`Contest.findOneAndUpdate({ isFinalized: false }, ...)`
in CodeArena). If the *enqueue itself* fails (e.g. Redis unreachable at that
exact moment, rather than just Nakalchi's app being down), nothing
re-attempts it later — there is no admin "re-run integrity analysis" action
in Phase 6. This is accepted as a known, narrow, documented edge case rather
than a bug to fix in this phase.
