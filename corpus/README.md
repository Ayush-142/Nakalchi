# Corpus

One fixture corpus exists: `corpus/two-sum-cpp/` — 10 genuinely independent
solutions (`sol01`–`sol10`), 6 disguise variants of `sol02`
(`variants/var_a`–`var_f`), and 2 adversarial evasions (`evasions/`) that
deliberately exceed the variant spec to probe where token-level winnowing
stops working. Full construction, provenance, and per-file descriptions:
[`two-sum-cpp/README.md`](two-sum-cpp/README.md). Where token-level
detection breaks down (the two evasions) and why: `docs/detection-boundary.md`.
Full 21-pair intra-clique score matrix (which pairs among `sol02`+variants
flag and which don't): `docs/e2e-codearena.md`.

ARCHITECTURE.md §5 Phase 0 step 4 called for two problems; in practice one
(`two-sum-cpp`) turned out sufficient to exercise every case Phase 3's
corpus test needed (genuine diversity, all 6 disguise classes, adversarial
evasion) and a second was never added. Noting this here rather than
silently pretending the doc and the repo always matched.

## `corpus/two-sum-cpp` assumes a solution always exists — and diverges
## from a judge-compatible copy because of it

`two-sum-cpp/PROBLEM.md`'s spec guarantees "exactly one valid pair exists"
— every fixture file is correct-by-contract with no no-solution branch to
get right or wrong. CodeArena's own live `two-sum` problem is a **stricter,
different spec** that shares the name and core algorithm but requires
`YES i j` / `NO` output, including a real hidden test with no valid pair.
Submitted verbatim, all 16 committed files fail that hidden test (`WA`, or
`RE` for `var_f`) despite being entirely correct against this corpus's own
spec — three of them (`sol06`, `sol07`, `sol08`) even have a latent bug on
that untested path (they unconditionally print whatever their answer
variable holds), never caught because this corpus's own guarantee means the
no-pair path is never exercised by any of Phase 0–3's tests.

Phase 6's E2E run needed real `AC` verdicts from CodeArena's actual judge,
so it submitted **adapted copies** — not these files — with a `"YES "`
output prefix and an explicit `"NO"` branch added. The committed fixture
files here were never touched by that patch, and won't be by anything else
either: their exact token streams are what Phase 3's golden
`pipeline.test.ts` expectations (and the score matrix linked above) are
computed against, so editing them — even to make them judge-compatible —
would silently invalidate already-accepted results. If a judge-compatible
version of this corpus is ever needed again, adapt copies at the point of
use (as Phase 6 did), not the fixtures themselves. Full detail on exactly
what the Phase 6 patch changed and why it was verified but not applied here:
[`two-sum-cpp/README.md`](two-sum-cpp/README.md)'s last section.
