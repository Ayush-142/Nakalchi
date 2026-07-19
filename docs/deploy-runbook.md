# Deploy runbook — Nakalchi on CodeArena's Azure VM

Phase 7 (ARCHITECTURE.md §5). Nakalchi deploys onto CodeArena's *existing*
VM, joining its Docker network to reach CodeArena's already-running
`mongo`/`redis` containers — not independent infrastructure (confirmed
topology, see plan review). Every command below was actually run on the VM
(`Ayush@98.70.24.7`, Azure B2s, Ubuntu 24.04) via SSH; output is real,
captured at the time, not invented ahead of execution (ARCHITECTURE.md §0
rule 3). Steps not yet run are marked "PENDING" with the command ready to
go.

**Deliberately unversioned files — this runbook is their only source of
truth, not git.** Neither Nakalchi's nor CodeArena's git history will ever
contain these; a future redeployment (new VM, disaster recovery, a second
operator) has to recreate them from the commands recorded in the relevant
step below, not from a `git pull`:
- `~/Nakalchi/packages/service/.env.production`, `~/Nakalchi/packages/web/.env.production` (step 6/7)
- `~/CodeArena/api/.env.production`, `~/CodeArena/worker/.env.production`, `~/CodeArena/.env.production` (their own pre-existing secrets, plus the Nakalchi-integration additions in step 7)
- the Nakalchi scoped Mongo user's password (step 5)
- the DuckDNS updater script and its token (step 10a)

---

## 0. Pause point — cleared

Both repos committed and pushed by the user. Verified for real before any
VM step:
```
Nakalchi:  local HEAD a6d236f847bf3c08422b76c7c43c4a52228ec703
           == origin/master HEAD (git fetch --all; git log -1 on both)
CodeArena: local HEAD 2747379d47168ae4f4bfea88ead1fecd1d1ae2d3
           == origin/main HEAD (same check)
```

---

## 1. Clone/pull both repos on the VM — DONE

**CodeArena** (`~/CodeArena`, not `~/codearena` — DEPLOY.md's own casing is
wrong; the real clone on this VM is capital-C `CodeArena`) was 11 commits
behind `origin/main`, **and** had 3 files with local uncommitted
modifications relative to its (stale) `HEAD` — an undocumented deployment
state DEPLOY.md's own "clone → build → up" narrative doesn't account for.
Diagnosed and resolved without losing anything:
```bash
$ git fetch origin
   6cbcaf7..2747379  main -> origin/main
$ git status -sb
## main...origin/main [behind 11]
 M .env.production.example
 M docker-compose.prod.yml
 M frontend/.env.production.example
$ git diff HEAD stash@{0} -- .env.production.example docker-compose.prod.yml frontend/.env.production.example
# (run AFTER stash+pull, see below) - output was pure REMOVALS only, zero
# lines unique to the stash - confirms the local edits were a strict subset
# of what pull was about to bring in (someone had manually applied an
# earlier version of incident-response fixes - the minio/caddy mem_limit
# raises - directly on the VM without committing; those exact fixes already
# existed further up origin/main's history).
$ git stash push -m 'pre-Phase7-pull stale local edits, verified subset of origin/main'
$ git pull --ff-only origin main   # 6cbcaf7..2747379, clean fast-forward, 49 files changed
$ git stash drop                   # safe - confirmed zero unique content above
$ git log -1 --format='%H %s'
2747379d47168ae4f4bfea88ead1fecd1d1ae2d3 prod wiring gaps
$ git status -sb
## main...origin/main   # clean, in sync
```
**Note for the next person deploying:** if you hit uncommitted changes on a
fresh pull here again, don't assume — `git diff origin/main -- <files>`
first to confirm they're a pure subset (only removals) before stashing.

**Nakalchi** (`~/Nakalchi`) needed the GitHub repo made public first — the
VM had no git credential configured and the repo was private (`curl -o
/dev/null -w '%{http_code}' https://github.com/Ayush-142/Nakalchi` → `404`
before, `200` after). Offered a read-only SSH deploy-key alternative first;
user chose to flip visibility instead.
```bash
$ git clone https://github.com/Ayush-142/Nakalchi.git Nakalchi
$ cd Nakalchi && git log -1 --format='%H %s'
a6d236f847bf3c08422b76c7c43c4a52228ec703 docs/corpus reframe + README/BUGLOG vs. compose/Dockerfiles/ops code
$ git status -sb
## master...origin/master   # clean
```

---

## 2. Real headroom — DONE (before any Nakalchi container existed)

```
$ free -h
               total        used        free      shared  buff/cache   available
Mem:           3.8Gi       1.2Gi       1.5Gi       4.7Mi       1.3Gi       2.6Gi
Swap:             0B          0B          0B
$ docker stats --no-stream
NAME                   MEM USAGE / LIMIT
codearena-caddy-1      61.06MiB / 512MiB
codearena-mongo-1      148.8MiB / 512MiB
codearena-redis-1      29.2MiB / 128MiB
codearena-minio-1      330.6MiB / 512MiB
codearena-api-1        114.3MiB / 384MiB
codearena-worker-1     83.55MiB / 512MiB
codearena-frontend-1   47.32MiB / 384MiB
```
Real current usage across all 7 CodeArena services: ~815MB — well under
their combined 2944m `mem_limit` reservation, so there's more slack in
practice right now than the compose file's static "~0.9GB worst-case
headroom" comment implies. That worst-case number (total mem_limit
reservation vs. total RAM) is still the right one to size Nakalchi against,
since CodeArena's containers can legitimately grow toward their limits
under real load, not just sit at idle usage.

**Contradiction found and flagged before adapting:** `Swap: 0B` — no
swapfile existed, despite DEPLOY.md §B1 and `docker-compose.prod.yml`'s own
memory-budget comment assuming one. Resolved in step 2a below (approved by
user before proceeding).

## 2a. Swapfile + swappiness — DONE

DEPLOY.md §B1's exact commands (skipped the `apt-get update/upgrade` part
of B1 - out of scope, not requested):
```
$ sudo fallocate -l 2G /swapfile
$ sudo chmod 600 /swapfile
$ sudo mkswap /swapfile
Setting up swapspace version 1, size = 2 GiB (2147479552 bytes)
$ sudo swapon /swapfile
$ echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
$ free -h
               total        used        free      shared  buff/cache   available
Mem:           3.8Gi       1.2Gi       1.5Gi       4.7Mi       1.3Gi       2.6Gi
Swap:          2.0Gi          0B       2.0Gi
$ swapon --show
NAME      TYPE SIZE USED PRIO
/swapfile file   2G   0B   -2
```
Plus `vm.swappiness=10` (not specified in DEPLOY.md — added per plan
review: swap should be an OOM safety net on a box this small, not
something the kernel leans on routinely):
```
$ echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/60-swappiness.conf
$ sudo sysctl -p /etc/sysctl.d/60-swappiness.conf
vm.swappiness = 10
$ cat /proc/sys/vm/swappiness
10
```
Logged as an environment-drift entry in `BUGLOG.md` (2026-07-19, "VM deploy").

**Does not change §3's `nakalchi-worker` `mem_limit` decision rule** —
`ceil(measured RSS x 1.3)`, corpus-cap fallback if that exceeds ~700m,
unchanged. Restored swap just makes the "relies on swap" fallback wording
literally true if it ends up used, not license for a tighter limit.

---

## 3. Confirm the shared network name — DONE

```
$ docker network ls
NETWORK ID     NAME                  DRIVER    SCOPE
6f2de887b0c7   codearena_codearena   bridge    local
1db84f8ef2df   codearena_default     bridge    local
```
`codearena_codearena` — matches `docker-compose.prod.yml`'s drafted guess
exactly, now confirmed live rather than assumed.

**Collision risk confirmed live, not just inferred from the compose
file text:**
```
$ docker exec codearena-frontend-1 sh -c 'getent hosts api; getent hosts worker'
172.19.0.4        api  api
172.19.0.8        worker  worker
```
`api` and `worker` really do resolve as bare DNS names on this network —
the rename to `nakalchi-api`/`nakalchi-worker`/`nakalchi-web` in
`docker-compose.prod.yml` was necessary, confirmed correct.

## 4. Confirm MongoDB version — DONE

```
$ docker exec codearena-mongo-1 mongod --version | head -1
db version v7.0.37
```
7.0.37 confirms `$percentile` would have been available; not used anyway
since `routes/admin.ts`'s percentile calc is version-independent by design.

---

## 5. Create Nakalchi's scoped Mongo user — DONE

```bash
docker exec -it codearena-mongo-1 mongosh -u <root-user> -p '<root-pass>' --authenticationDatabase admin \
  --eval "db.getSiblingDB('Nakalchi').createUser({user:'nakalchi_svc', pwd:'<generated>', roles:[{role:'readWrite', db:'Nakalchi'}]})"
```
Root credentials (sourced from `~/CodeArena/.env.production` on the VM,
never printed) used exactly once, to create this user — Nakalchi's own
`MONGO_URI` never carries root afterward. **Verified by an actual
authenticated connection as the new user**, not just a non-error exit:
```
$ docker exec -i codearena-mongo-1 mongosh "mongodb://nakalchi_svc:<pass>@localhost:27017/Nakalchi?authSource=Nakalchi" --quiet --eval "db.runCommand({ping:1})"
{ ok: 1 }
```

## 6. Generate real secrets — DONE

```bash
openssl rand -hex 32   # -> packages/service/.env.production's API_KEYS
openssl rand -hex 32   # -> WEBHOOK_SECRET = CodeArena's NAKALCHI_WEBHOOK_SECRET
openssl rand -hex 32   # -> CODEARENA_SERVICE_TOKEN = CodeArena's INTERNAL_SERVICE_TOKEN
```
4 secrets generated total (the 3 above, plus the Mongo user's password in
step 5). No `change-me`/`dev-local-*` defaults in production. Values are
NOT reproduced in this doc (it's committed to git) — they live only in the
gitignored `.env.production` files on the VM, written directly from the
`.env.production.example` templates.

## 7. Wire CodeArena's production env — DONE

`api/.env.production` appended with (real generated values, matching step
6): `INTEGRITY_ANALYSIS_ENABLED=true`, `INTERNAL_SERVICE_TOKEN`,
`NAKALCHI_API_BASE_URL=http://nakalchi-api:3000`, `NAKALCHI_API_KEY`,
`NAKALCHI_WEBHOOK_SECRET`,
`INTERNAL_WEBHOOK_CALLBACK_URL=http://api:3001/internal/webhooks/nakalchi`.

`worker/.env.production` appended with `NAKALCHI_API_BASE_URL`,
`NAKALCHI_API_KEY`, `INTERNAL_WEBHOOK_CALLBACK_URL` (the real gap found
during Phase 7 verification — was absent from
`worker/.env.production.example`).

Root `.env.production` appended with
`NEXT_PUBLIC_NAKALCHI_WEB_URL=https://nakalchi-ayush.duckdns.org` (real
domain, registered via DuckDNS - see step 10).

Verified none of the 3 CodeArena files had any pre-existing
`NAKALCHI_*`/`INTEGRITY_*` keys before this (`grep` came back empty) —
confirmed clean slate, no risk of appending duplicates.

## 8. Deploy Nakalchi — DONE

```bash
cd ~/Nakalchi
docker compose -f docker-compose.prod.yml build      # all 3 images built clean
docker compose -f docker-compose.prod.yml up -d       # nakalchi-api/-worker/-web all started
```
Verified live, not just "container running":
```
$ docker exec codearena-frontend-1 sh -c 'getent hosts nakalchi-api; getent hosts nakalchi-worker; getent hosts nakalchi-web'
172.19.0.9   nakalchi-api  nakalchi-api
172.19.0.10  nakalchi-worker  nakalchi-worker
172.19.0.11  nakalchi-web  nakalchi-web
$ docker exec nakalchi-nakalchi-api-1 wget -qO- http://localhost:3000/healthz
{"mongo":true,"redis":true}
$ docker exec nakalchi-nakalchi-worker-1 sh -c 'wget -qO- --timeout=5 http://api:3001/ready'
{"mongo":true,"redis":true,"worker":true}
```

## 9. Restart/rebuild the affected CodeArena containers — DONE

```bash
cd ~/CodeArena
docker compose -f docker-compose.prod.yml --env-file .env.production up -d api worker
docker compose -f docker-compose.prod.yml --env-file .env.production build frontend
docker compose -f docker-compose.prod.yml --env-file .env.production up -d frontend
```
**`--env-file .env.production` is not optional** — the first attempt at
this step omitted it, which resolved every root-level interpolated var
blank and caused Compose to recreate `mongo`/`minio` with blank root
credentials (caught, verified harmless since both only apply
`INITDB`/`ROOT` vars on first init of an empty volume, then fully
re-reconciled with the correct flag — see `BUGLOG.md`, "Phase 7 (VM
deploy, caught mistake)").

Verified the `NEXT_PUBLIC_NAKALCHI_WEB_URL` build-arg actually landed in
the built client bundle, not just that the build didn't error:
```
$ docker exec codearena-frontend-1 sh -c "grep -rl 'nakalchi-ayush.duckdns.org' /app/frontend/.next/static"
/app/frontend/.next/static/chunks/0ld1d_w0c8yvk.js
```

## 10. Caddy vhost + reload — DONE

DuckDNS subdomain `nakalchi-ayush` had no existing DNS record (`dig` came
back empty) — registered by the user, confirmed propagated:
```
$ dig +short nakalchi-ayush.duckdns.org
98.70.24.7
```
Appended to CodeArena's `Caddyfile` (domain hardcoded — a new container env
var can't reach an already-running container, so `caddy reload` would not
actually be zero-downtime otherwise):
```caddyfile
nakalchi-ayush.duckdns.org {
	handle /api/* {
		reverse_proxy nakalchi-api:3000
	}
	handle {
		reverse_proxy nakalchi-web:3000
	}
}
```
```bash
docker exec codearena-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```
Verified CodeArena's own site never dropped (`curl` before/after the
reload both returned `200`), and Nakalchi's TLS + routing for real:
```
$ curl -Iv --max-time 10 https://nakalchi-ayush.duckdns.org
*  subject: CN=nakalchi-ayush.duckdns.org
*  issuer: C=US; O=Let's Encrypt; CN=YE1
*  SSL certificate verify ok.
< HTTP/2 200
$ curl -s https://nakalchi-ayush.duckdns.org | grep -o '<title>[^<]*</title>'
<title>Nakalchi — Reports</title>
$ curl -s -o /dev/null -w '%{http_code}\n' https://nakalchi-ayush.duckdns.org/api/v1/analyses
401   # correctly routed to nakalchi-api (auth-required), not a frontend 404
```

**DuckDNS updater check:** no cron job, systemd timer, or script anywhere
on the VM keeps either domain's DNS record fresh — confirmed via
`crontab -l`, `/etc/cron.d`, and `systemctl list-timers`, all empty of any
`duckdns` reference. Matches DEPLOY.md's own B4 step (a one-time manual
`curl`, not a recurring updater) but means **both domains are one VM
reboot away from breaking** if the underlying Azure public IP is
Dynamic-allocation rather than Static. Could not determine the allocation
type from inside the VM — Azure's instance metadata service reports
`publicIpAddress` as empty for this NIC config (inconclusive either way),
and no `az` CLI is installed to query the actual Public IP resource.
**Flagged, not resolved** — needs checking in the Azure Portal (Public IP
resource → Configuration → Assignment: Static vs Dynamic) or a DuckDNS
cron updater added regardless as a belt-and-braces fix.

## 10a. DuckDNS auto-updater — DONE

Installed regardless of the Static/Dynamic question above (closes the
reachability risk either way, per plan review). Standard `duck.sh`
pattern, both domains in one update URL:
```bash
mkdir -p ~/duckdns
cat > ~/duckdns/duck.sh <<'EOF'
echo url="https://www.duckdns.org/update?domains=codearena-ayush,nakalchi-ayush&token=<token>&ip=" | curl -k -o ~/duckdns/duck.log -K -
EOF
chmod 700 ~/duckdns/duck.sh   # embeds the token - owner-only
```
Token itself is **not** in this file or in git — lives only in
`~/duckdns/duck.sh` on the VM (see this doc's header, "deliberately
unversioned files"). Cron, absolute path (not `~`, which cron doesn't
reliably expand):
```bash
( crontab -l 2>/dev/null; echo "*/5 * * * * /home/Ayush/duckdns/duck.sh >/dev/null 2>&1" ) | crontab -
```
Verified with a real manual run before relying on the cron:
```
$ ~/duckdns/duck.sh && cat ~/duckdns/duck.log
OK
$ crontab -l
*/5 * * * * /home/Ayush/duckdns/duck.sh >/dev/null 2>&1
$ ls -la ~/duckdns/duck.sh
-rwx------ 1 Ayush Ayush 165 ...  duck.sh
```

## 11. In-situ bench — DONE

```
$ node --version
v24.18.0   # nvm-installed, matches .nvmrc=24
$ npm ci    # 16s, in ~/Nakalchi
$ /usr/bin/time -v npx tsx packages/core/bench/corpus.bench.ts
```
Run with all 10 containers (7 CodeArena + 3 Nakalchi) resident and idle —
real output, full numbers and the `mem_limit`/`worker_threads` decisions
derived from it: `docs/benchmarks.md`'s "In-situ (Azure VM)" section.
Headline: n=1,000 in 1.42s (~42x under the 60s gate, `worker_threads` not
triggered); peak RSS 443.82MB cross-checked via `/usr/bin/time -v` against
the script's own 443.6MB self-report.

**`nakalchi-worker`'s `mem_limit` updated to `577m`** (`ceil(443.82 ×
1.3)`) in `docker-compose.prod.yml`. Edited locally (not yet
committed/pushed at the time this ran), copied onto the VM's checkout via
`scp` to keep the deploy moving without waiting on a full commit→push→pull
round trip — this creates the same kind of local-vs-git drift on the VM
that step 1 already hit once; next person pulling should expect `git
status` to show this file already matching once the commit lands (no
conflict, content-identical). Container recreated under the new limit and
confirmed for real, not just "container started":
```
$ docker compose -f docker-compose.prod.yml up -d nakalchi-worker
$ docker inspect nakalchi-nakalchi-worker-1 --format '{{.HostConfig.Memory}}'
605028352   # = 577.0 MiB exactly
$ docker stats --no-stream nakalchi-nakalchi-worker-1
52.93MiB / 577MiB
$ docker exec nakalchi-nakalchi-worker-1 sh -c 'wget -qO- --timeout=5 http://api:3001/ready'
{"mongo":true,"redis":true,"worker":true}
```

## 12. Backup cron — DONE

```cron
0 3 * * * docker exec codearena-mongo-1 mongodump -u nakalchi_svc -p '<pass>' --authenticationDatabase Nakalchi --db=Nakalchi --archive --gzip > /home/Ayush/backups/nakalchi-$(date +\%Y\%m\%d).gz 2>>/home/Ayush/backups/backup.log
0 4 * * * find /home/Ayush/backups/ -name 'nakalchi-*.gz' -mtime +14 -delete
```
Installed via `crontab` (not `crontab -e`, non-interactive over SSH).
Streamed directly to the host via stdout redirect — nothing written inside
the `mongo` container.

**Restore, verified for real against the actual binary, not left
untested:**
```bash
cat /home/Ayush/backups/nakalchi-YYYYMMDD.gz | \
  docker exec -i codearena-mongo-1 mongorestore -u nakalchi_svc -p '<pass>' \
  --authenticationDatabase Nakalchi --archive --gzip \
  --nsInclude='Nakalchi.*' --drop
```
Raw `.gz` piped straight in; `--gzip` does the single decompression itself
(piping through `gunzip` first would double-decompress and fail).
`--nsInclude` used instead of the deprecated-with-`--archive` `--db` flag.

Ran a real dump + restore cycle immediately (not waiting for the 3am cron):
```
$ docker exec codearena-mongo-1 mongodump ... > nakalchi-20260719-1109.gz
writing `Nakalchi.submission_snapshots`/`analyses`/`pairs` to archive on stdout
done dumping (0 documents each)
$ cat nakalchi-20260719-1109.gz | docker exec -i codearena-mongo-1 mongorestore ...
dropping collection `Nakalchi.submission_snapshots` before restoring
finished restoring `Nakalchi.submission_snapshots` (0 documents, 0 failures)
[... same for analyses, pairs ...]
restoring indexes for collection `Nakalchi.pairs`/`analyses`/`submission_snapshots` from metadata
0 document(s) restored successfully. 0 document(s) failed to restore.
exit=0
```
**Honest caveat:** the `Nakalchi` database is currently empty (no
production analyses have run yet — only local dev ones) — 550-byte archive,
0 documents. This fully verifies the mechanism (auth, gzip round-trip,
`--nsInclude` namespace targeting, `--drop`, index metadata restore all
completed cleanly, exit 0) but not data-volume preservation with real
documents. The prod smoke (step 13) populates the first real
production analysis; re-running this same cycle afterward would be a
stronger, data-bearing test if ever needed, but the mechanism itself is
already proven correct here.

## 13. Prod smoke — DONE

**Real deployment bug found and fixed mid-smoke (see BUGLOG.md, "real
deployment bug caught during smoke"):** `api`/`worker` had only ever been
*restarted* (step 9), never *rebuilt*, so they were running a 2026-07-11
image predating the entire Nakalchi integration. First test contest
(`test-integrity-smoke-20260719`, `6a5cba2589787c351635c283`) finalized on
the stale image — real AC verdicts, real standings, but the integrity
enqueue never ran (the code didn't exist yet in that image) and, being a
one-time atomic event, could never be retried for that contest. Fixed:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build api worker
docker compose -f docker-compose.prod.yml --env-file .env.production up -d api worker
```
Verified the fix landed before continuing: `integrity.js` present in the
worker image, `adminContestsRouter.get` present in the api image,
`"Integrity worker ready"` on worker boot.

**Second contest** (`test-integrity-smoke-20260719-v2`,
`6a5cbdf442347b6de5888214`) — full real chain, admin login
(`admin`/`DemoPass123`, pre-rotation), contest created via
`POST /api/admin/contests`, 2 bot accounts (`bot0001`/`bot0002`) registered
before `startAt`, both submitted the real known-AC `two-sum` reference
solution (`scripts/solutions/two-sum.ac.cpp`) inside the window, both
verdicts real `AC` (`execTimeMs` 554/491 — actual judge execution, not
mocked), `endAt` passed, `GET .../leaderboard` finalized on the first call
(`isFinalized: true`), `GET /api/admin/contests/:id` (now working) showed:
```json
"integrityAnalysis":{"analysisId":"6a5cbf7f9b125fbc8b1fa273","status":"completed","flaggedPairs":0,"topSimilarity":0,...}
```
Cross-checked directly against Nakalchi's own API (bypassing CodeArena
entirely): `GET /api/v1/analyses/6a5cbf7f9b125fbc8b1fa273` →
`{"status":"completed","stats":{"submissions":2,"fingerprints":92,"candidatePairs":0,"flaggedPairs":0,"wallMs":383}}`.
`flaggedPairs: 0` is expected, not a bug: 2 byte-identical submissions →
every shared hash hits `docFreq/N = 2/2 = 1.0`, correctly excluded as
"template" by `basecodeMaxFreq` (same documented edge case as the Phase 4
`idempotency.test.ts` finding).

**Deep-link:** CodeArena's admin contest page (`/admin/contests/:id`) is a
client-rendered SPA — `curl` only sees a loading skeleton, no JS executes,
so the literal rendered `<a href>` couldn't be captured this way. Verified
the underlying pieces instead, each for real: (1) `NEXT_PUBLIC_NAKALCHI_WEB_URL`
confirmed baked into the built client bundle (step 9); (2) the exact
construction logic (`${NAKALCHI_WEB_URL}/analyses/${analysisId}`) read
directly from `frontend/app/admin/contests/[id]/page.tsx`; (3) that exact
resulting URL,
`https://nakalchi-ayush.duckdns.org/analyses/6a5cbf7f9b125fbc8b1fa273`,
fetched directly — real `200`, `<title>Nakalchi — Reports</title>`, page
content shows `Completed`. All three pieces verified independently; the
literal DOM render wasn't captured (would need a headless browser), but
the link's target, construction, and content are all confirmed real.

**Full cleanup, count-verified after (both contests, since the stale-image
issue produced two):**
```
before: 2 bot users, 4 submissions (2 contests × 2 bots), 2 test contests
deleted: 2 submissions removed, 2 users removed, 2 contests removed
after:  0 bot users, 0 submissions, 0 test contests, 0 hints
        is-prime=false, two-sum=false, longest-increasing-subsequence=false
```
Nakalchi's own analysis doc + pairs (`6a5cbf7f9b125fbc8b1fa273`) were
**not** touched — kept as the acceptance evidence.

**Admin password rotated** (last item, see BUGLOG.md's security-finding
entry): new password generated and verified (old rejected `401`, new
returns `200`/`isAdmin:true`) — not recorded in this file or git.

## 14. Fill in real numbers — DONE

Completed as part of step 11 (bench numbers landed in `docs/benchmarks.md`,
`README.md`, `docs/resume-bullets.md` immediately after the in-situ run —
see those files' git history for the exact commit). Nothing in this phase
was left as a placeholder once its real number existed.

---

**Phase 7 acceptance gate: complete.** Publicly reachable deployment (both
domains, real TLS); benchmark table with real VM numbers; demo script
ready; README complete with a verified local setup; full prod smoke
(contest → real judge → finalize → integrity analysis → deep-link) against
public URLs with a real deployment bug caught and fixed along the way;
backup/restore mechanism verified; DNS auto-renewal installed; admin
credential rotated; all smoke-test residue cleaned up and count-verified.

`docs/benchmarks.md`'s VM section, README.md's benchmark table, and
`docs/resume-bullets.md`'s `X`/`Y`/`N` placeholders all get filled from
what's real by this point — never before.
