# Demo script — ~90 seconds, one take

Every command/URL below was actually run against a live local stack during
Phase 7 and produced the output quoted (not idealized) — see
`docs/e2e-codearena.md` and this session's own commands. On the deployed
domain, substitute `https://nakalchi-<name>.duckdns.org` for
`http://localhost:3001` and drop `-H "X-Api-Key: ..."` where the browser is
doing the request instead of curl.

## Shot 1 — 0:00–0:30 — Problem statement

Talking-head or slide, no terminal. Framing (ARCHITECTURE.md §1, condensed):

> "Online judges face systematic cheating — contestants copy solutions and
> disguise them by renaming variables, reformatting, reordering functions.
> A single contest can produce hundreds of submissions per problem; manual
> review doesn't scale. Nakalchi answers one question: given all accepted
> submissions for a problem, which pairs are so similar a human should
> review them — and exactly which regions match? Built on the winnowing
> algorithm from the paper behind MOSS."

## Shot 2 — 0:30–0:55 — Live analysis run

Terminal:
```
npm run seed-demo --workspace=@nakalchi/service
```
Real output to let land on screen (captured live during Phase 7):
```
Loaded 16 submissions from .../corpus/two-sum-cpp
Analysis created: 6a5bd61a6ce19fbad47c36eb
  status=queued progress=0%
  status=running progress=0%
  status=completed progress=100%
Analysis completed: {
  submissions: 16,
  fingerprints: 953,
  candidatePairs: 23,
  flaggedPairs: 17,
  wallMs: 534
}
```
Say while it prints: "16 submissions — 10 genuine, independent solutions
plus 6 disguised copies of one of them. 17 flagged pairs — that's the whole
disguise clique pairing up with each other, not just against the original;
`docs/detection-boundary.md` has the full breakdown if anyone asks why 17
and not 6."

## Shot 3 — 0:55–1:15 — Side-by-side viewer on `sol02~var_e`

Browser: `http://localhost:3001` → dashboard shows the completed analysis
→ click into it (`/analyses/6a5bd61a6ce19fbad47c36eb` in this run, real ID
will differ on a fresh seed) → pair table sorted by similarity → click the
`sol02 ~ var_e` row (real pair from this run:
`simAtoB=0.476, simBtoA=0.370, sharedFingerprints=20, longestRegionTokens=49,
flagged=true`) → `DiffViewer` renders both sources with matched regions
highlighted → click a highlighted region to show the synced-scroll jump
between both panes.

Say: "var_e is a combined disguise — renamed identifiers, reformatted,
statement-equivalent rewrites, all three at once — and the engine still
finds and highlights exactly the matching logic, not just a similarity
number."

## Shot 4 — 1:15–1:30 — Template-noise / near-miss check

Same pair table, find `sol01 ~ sol10` (two genuinely independent
solutions): real numbers from this run —
`simAtoB=0.30, simBtoA=0.174, sharedFingerprints=12, flagged=false`.

Say: "These two are independently written — different algorithms even —
and they still share some boilerplate. 0.30 similarity, `flagThreshold` is
0.35: it's flagged false, but it's a near-miss, not a wide margin. That's
the threshold actually doing work, not an obviously-safe gap."

---

Confirmed live during Phase 7 (not assumed): `packages/core/src/config.ts`'s
`DEFAULT_FLAG_THRESHOLD = 0.35` matches ARCHITECTURE.md §2 exactly, so the
0.35 cited above is the real, current, unmodified threshold.
