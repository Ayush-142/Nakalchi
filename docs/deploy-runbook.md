# Deploy runbook — Nakalchi on CodeArena's Azure VM

Phase 7 (ARCHITECTURE.md §5). Nakalchi deploys onto CodeArena's *existing*
VM, joining its Docker network to reach CodeArena's already-running
`mongo`/`redis` containers — not independent infrastructure (confirmed
topology, see plan review). This doc is the exact command sequence; results
get filled in as each step is actually run (never invented ahead of time —
ARCHITECTURE.md §0 rule 3).

**Status of this doc as written:** commands are drafted and ready. Actual
execution is gated on the pause point below — nothing runs on the VM until
both repos are pushed and the pushes are confirmed to have landed.

---

## 0. Pause point — before any VM step

Neither repo has anything committed as of Phase 7's local work (the
standing no-commit rule has held since Phase 0). "git pull" on the VM
cannot materialize history that was never pushed. So:

1. Local Phase 7 changes (Nakalchi repo, steps 1–7 below in this doc's
   companion list) get reviewed and committed/pushed **by the user**.
2. CodeArena's two-file prod-wiring fix (§2 of the plan) gets reviewed and
   committed/pushed **by the user**, in the CodeArena repo.
3. Pushes are confirmed landed (`git log` against each remote) before step 1
   below runs.

---

## 1. Clone/pull both repos on the VM

```bash
# Nakalchi
cd ~ && git clone <nakalchi-remote-url> nakalchi   # or: cd ~/nakalchi && git pull
# CodeArena (repo name on disk is `codearena`, per its own DEPLOY.md)
cd ~/codearena && git pull
```

## 2. Real headroom, before touching anything

```bash
free -h
docker stats --no-stream
```
Compare against CodeArena's own compose-file comment ("~0.9GB headroom on
the 4GB box"). Record the real numbers here before proceeding.

## 3. Confirm the shared network name

```bash
docker network ls | grep codearena
docker network inspect <name-from-above> --format '{{range .Containers}}{{.Name}} {{end}}'
```
Confirms (a) the exact external network name to put in
`docker-compose.prod.yml`'s `networks.codearena.name` (currently drafted as
`codearena_codearena` — a guess based on Compose's project-name-prefixing
convention, to be corrected here if wrong), and (b) the real `api`/`worker`
collision risk, live, not just from reading the compose file.

## 4. Confirm MongoDB version

```bash
docker exec <mongo-container-name> mongod --version | head -1
```
Gates whether `packages/service/src/routes/admin.ts`'s percentile
calculation could be simplified to Mongo's native `$percentile` (7.0+) —
not required either way, since the shipped implementation is
version-independent by design, but recorded here for the record.

## 5. Create Nakalchi's scoped Mongo user

Root credentials are used exactly once, to create this user — Nakalchi's
own `MONGO_URI` never carries root afterward.

```bash
docker exec -it <mongo-container-name> mongosh -u <root-user> -p '<root-pass>' --authenticationDatabase admin \
  --eval "db.getSiblingDB('Nakalchi').createUser({user:'nakalchi_svc', pwd:'<generated>', roles:[{role:'readWrite', db:'Nakalchi'}]})"
```
Generate `<generated>` with `openssl rand -hex 32`.

## 6. Generate real secrets

```bash
openssl rand -hex 32   # -> packages/service/.env.production's API_KEYS
openssl rand -hex 32   # -> packages/service/.env.production's WEBHOOK_SECRET
                        #    = CodeArena's api/.env.production's NAKALCHI_WEBHOOK_SECRET
openssl rand -hex 32   # -> packages/service/.env.production's CODEARENA_SERVICE_TOKEN
                        #    = CodeArena's api/.env.production's INTERNAL_SERVICE_TOKEN
```
No `change-me`/`dev-local-*` defaults in production — fill
`packages/service/.env.production` and `packages/web/.env.production` on
the VM from the `.env.production.example` templates using these values
(files are gitignored; created directly on the VM, not committed).

## 7. Wire CodeArena's production env (the §2 gaps)

`api/.env.production` (add, matching values from step 6):
```
INTEGRITY_ANALYSIS_ENABLED=true
INTERNAL_SERVICE_TOKEN=<same as Nakalchi's CODEARENA_SERVICE_TOKEN>
NAKALCHI_API_BASE_URL=http://nakalchi-api:3000
NAKALCHI_API_KEY=<same as one of Nakalchi's API_KEYS>
NAKALCHI_WEBHOOK_SECRET=<same as Nakalchi's WEBHOOK_SECRET>
INTERNAL_WEBHOOK_CALLBACK_URL=http://api:3001/internal/webhooks/nakalchi
```
`worker/.env.production` (add — the real gap found during Phase 7
verification, absent from `worker/.env.production.example`):
```
NAKALCHI_API_BASE_URL=http://nakalchi-api:3000
NAKALCHI_API_KEY=<same as one of Nakalchi's API_KEYS>
INTERNAL_WEBHOOK_CALLBACK_URL=http://api:3001/internal/webhooks/nakalchi
```
Root `.env.production` (add — needed for `frontend`'s build-arg, the other
§2 gap, once the CodeArena-repo fix from the pause point is pulled in):
```
NEXT_PUBLIC_NAKALCHI_WEB_URL=https://<nakalchi-domain>
```

## 8. Deploy Nakalchi

```bash
cd ~/nakalchi
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

## 9. Restart/rebuild the affected CodeArena containers

```bash
cd ~/codearena
docker compose -f docker-compose.prod.yml up -d api worker   # env file change only
docker compose -f docker-compose.prod.yml build frontend     # build-arg change - needs a real rebuild
docker compose -f docker-compose.prod.yml up -d frontend
```

## 10. Caddy vhost + reload

Append to CodeArena's `Caddyfile` (domain hardcoded — see plan's Correction
3 for why, not a new `{$VAR}`):
```caddyfile
nakalchi-<name>.duckdns.org {
	handle /api/* {
		reverse_proxy nakalchi-api:3000
	}
	handle {
		reverse_proxy nakalchi-web:3000
	}
}
```
```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
curl -I https://nakalchi-<name>.duckdns.org
```

## 11. In-situ bench

Run on the VM **host**, unconstrained (not inside a container — see
`docs/benchmarks.md`'s memory-headroom section for why):
```bash
node --version   # confirm matches .nvmrc; install via nvm if absent
npx tsx packages/core/bench/corpus.bench.ts
```
Real output → `docs/benchmarks.md`'s "In-situ (Azure VM)" section.
`nakalchi-worker`'s `mem_limit` in `docker-compose.prod.yml` gets updated
from `ceil(measured RSS x 1.3)` afterward (or a documented corpus-size cap
if that exceeds ~700m — see the decision rule already in the compose file's
header comment).

## 12. Backup cron

```bash
crontab -e
```
```cron
0 3 * * * docker exec <mongo-container-name> mongodump -u nakalchi_svc -p '<pass>' --authenticationDatabase Nakalchi --db=Nakalchi --archive --gzip > /home/<user>/backups/nakalchi-$(date +\%Y\%m\%d).gz 2>>/home/<user>/backups/backup.log
0 4 * * * find /home/<user>/backups/ -name 'nakalchi-*.gz' -mtime +14 -delete
```
Streamed directly to the host via stdout redirect — nothing written inside
the `mongo` container.

**Restore** (verified once for real as part of this deploy, not left
untested):
```bash
cat /home/<user>/backups/nakalchi-YYYYMMDD.gz | \
  docker exec -i <mongo-container-name> mongorestore -u nakalchi_svc -p '<pass>' \
  --authenticationDatabase Nakalchi --archive --gzip \
  --nsInclude='Nakalchi.*' --drop
```
The raw `.gz` is piped straight in; `--gzip` does the single decompression
itself (piping through `gunzip` first would double-decompress and fail).
`--nsInclude` is used instead of the deprecated-with-`--archive` `--db`
flag. Exact flag behavior confirmed against the real `mongorestore` binary
in this step, not assumed from documentation.

## 13. Prod smoke

One tiny CodeArena contest, submitted through the real judge on the live
deployment, finalized, confirmed end to end:
- `integrityAnalysis.status === 'completed'` on the contest doc (admin API
  or DB check).
- "View full report in Nakalchi" link on the live admin page resolves to a
  rendered Nakalchi pair report.
- Not localhost — against the deployed URLs.

## 14. Fill in real numbers

`docs/benchmarks.md`'s VM section, README.md's benchmark table, and the
resume bullets' `X`/`Y`/`N` placeholders all get filled from what's real by
this point — never before.
