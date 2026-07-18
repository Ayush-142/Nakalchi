# Phase 6 E2E: running Nakalchi + CodeArena together locally

This documents how to bring up both stacks on one machine to exercise the full
contest-finalize → integrity-analyze → webhook → Integrity-tab chain, and the
failure-isolation behavior when Nakalchi is down. See ARCHITECTURE.md §5 Phase 6
for the design; this is the operational how-to.

## Topology

Nakalchi's `api`/`worker`/`web` run in Docker (unchanged from Phase 4/5). CodeArena's
`api`/`worker`/`frontend` run on the host via `npm run dev` — that's already its own
established local-dev convention (its `docker-compose.yml` is infra-only: mongo/redis/minio,
no app-service containers). Both stacks share Nakalchi's Mongo container (different
logical database — `Nakalchi` vs `codearena`) and Redis container (different BullMQ
`prefix`: `Nakalchi:` vs `queue`), which is the ARCHITECTURE.md §3.1 "shared Redis"
decision made real, not a workaround.

## Port table

Nakalchi's containers already occupy 3000/3001; CodeArena's own dev defaults (api
3001, frontend 3000) collide with those, so this run uses explicit overrides:

| Service | Port | How |
|---|---|---|
| Nakalchi mongo | 27017 | `docker compose up -d mongo redis api worker web` (Nakalchi repo) |
| Nakalchi redis | 6379 | shared with CodeArena |
| Nakalchi api | 3000 | Docker |
| Nakalchi web | 3001 | Docker |
| CodeArena api | **4000** | `PORT=4000 npm run dev` (override) |
| CodeArena frontend | **4001** | `next dev -p 4001` (override) |
| CodeArena worker | — | no port |

CodeArena's `api/.env` and `worker/.env` already point `MONGO_URI`/`REDIS_URL` at
`127.0.0.1:27017`/`127.0.0.1:6379` by default — no edit needed, they already target
Nakalchi's containers once those are the only Mongo/Redis running. CodeArena's own
`minio` (test-case storage) still needs to run: `docker compose up -d minio` from the
CodeArena repo.

## Linux note

`host.docker.internal` (used below for Nakalchi's `api`/`worker` containers to reach
host-run CodeArena) only resolves by default on Docker Desktop (Mac/Windows). On plain
Linux Docker Engine, add to `docker-compose.yml`'s `api` and `worker` services:
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

## Bring-up sequence

1. Nakalchi repo: `docker compose up -d` (mongo, redis, api, worker, web).
2. CodeArena repo: `docker compose up -d minio`.
3. CodeArena `api`, on the host, with overrides beyond its existing `.env`:
   ```
   PORT=4000 CORS_ORIGIN=http://localhost:4001 \
   INTEGRITY_ANALYSIS_ENABLED=true \
   INTERNAL_SERVICE_TOKEN=dev-local-service-token \
   NAKALCHI_API_BASE_URL=http://localhost:3000 \
   NAKALCHI_API_KEY=dev-local-api-key \
   NAKALCHI_WEBHOOK_SECRET=dev-local-webhook-secret-change-me \
   INTERNAL_WEBHOOK_CALLBACK_URL=http://host.docker.internal:4000/internal/webhooks/nakalchi \
   npm run dev
   ```
   (`dev-local-api-key` / `dev-local-webhook-secret-change-me` are Nakalchi's own
   `docker-compose.yml` defaults for `API_KEYS`/`WEBHOOK_SECRET` — override both sides
   together if you change one. **`INTERNAL_WEBHOOK_CALLBACK_URL` must use
   `host.docker.internal`, not `localhost`** — this value is sent to Nakalchi and dialed
   back by Nakalchi's `worker` *container*, where `localhost` resolves to the container
   itself, not the host running CodeArena's api. Confirmed for real during this phase's
   E2E run: using `localhost` here produced three `ECONNREFUSED 127.0.0.1:4000` webhook
   delivery attempts, logged on Nakalchi's worker, before Nakalchi gave up — see
   `Nakalchi/BUGLOG.md`.)
4. CodeArena `worker`, on the host:
   ```
   NAKALCHI_API_BASE_URL=http://localhost:3000 \
   NAKALCHI_API_KEY=dev-local-api-key \
   INTERNAL_WEBHOOK_CALLBACK_URL=http://host.docker.internal:4000/internal/webhooks/nakalchi \
   npm run dev
   ```
5. CodeArena `frontend`, on the host:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:4000 \
   NEXT_PUBLIC_NAKALCHI_WEB_URL=http://localhost:3001 \
   npx next dev -p 4001
   ```
6. Confirm health: `curl localhost:3000/healthz` (Nakalchi api), `curl localhost:4000/ready`
   (CodeArena api — reports mongo/redis/worker booleans).

## E2E procedure

1. `npm run seed --workspace=api` (CodeArena) — problems (including `two-sum`, which
   shares its I/O contract closely enough with Nakalchi's own `corpus/two-sum-cpp`
   fixture to reuse it) + an `admin` user (`DemoPass123`, see CodeArena's `DEMO.md`).
2. Create a small contest via `POST /api/admin/contests` (admin session) using just the
   `two-sum` problem, a short window.
3. Register N accounts and submit Nakalchi's `corpus/two-sum-cpp` fixture (10 solutions +
   6 disguised variants) through CodeArena's real judge (`POST /api/submissions`), one
   file per account, and wait for real `AC` verdicts. Note: the fixture's own output
   format (`i j`) is a corpus-local spec (`corpus/two-sum-cpp/PROBLEM.md`), not
   identical to CodeArena's actual `two-sum` judge contract (`YES i j` / `NO` — see
   `problems/two-sum/statement.md`). Submitted copies get a `"YES "` prefix inserted
   into their existing output statement to satisfy CodeArena's real judge; no other
   token changes. The original files under `corpus/` are never modified.
4. Let the contest's `endAt` pass, then `GET /api/contests/:id/leaderboard` to trigger
   lazy finalization (`tryFinalizeContest`), which enqueues `integrity:analyze` (fire-
   and-forget, gated on `INTEGRITY_ANALYSIS_ENABLED`).
5. Follow the chain: CodeArena's `integrity` worker → `POST localhost:3000/api/v1/analyses`
   (pull mode, `202` immediately) → Nakalchi's worker fetches from
   `GET localhost:4000/internal/contests/:id/submissions` → analysis `queued → running →
   completed` → webhook to `localhost:4000/internal/webhooks/nakalchi` → CodeArena's
   `Contest.integrityAnalysis` populated.
6. `GET /api/admin/contests/:id` (admin session) to confirm `integrityAnalysis.status ===
   'completed'` and `flaggedPairs > 0`; the same data renders on
   `http://localhost:4001/admin/contests/:id`'s Integrity section, which deep-links to
   `http://localhost:3001/analyses/:analysisId`.

## Failure isolation

With Nakalchi's containers stopped (`docker compose down` in the Nakalchi repo),
finalizing a contest still completes normally — `isFinalized` flips to `true`, standings
compute correctly, `Problem.isPublished` flips as usual. The only observable symptom is
a logged `failed to enqueue integrity:analyze` (if Redis for the `integrity` queue was
also part of what went down) or, if only Nakalchi's `api`/`worker` are down but Redis
stays up, the `integrity` job enqueues fine but then exhausts its 3 retries (`attempts: 3`,
5s/10s/20s backoff) trying to reach Nakalchi's unreachable `api`, logged as
`integrity analyze job failed` — a contest never fails to finalize because of this.

**Known limitation:** there is no automatic re-trigger. Contest finalization is a
one-time atomic event (`Contest.findOneAndUpdate({isFinalized:false}, ...)`); if the
enqueue itself fails (e.g. Redis down at that exact moment), nothing re-attempts it
later. Re-running the integrity analysis for an already-finalized contest is out of
scope for Phase 6 (no admin "re-run" action exists) — see the Nakalchi README's
failure-isolation section for the same note.
