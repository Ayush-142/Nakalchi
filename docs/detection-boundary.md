# Detection boundary — measured, not estimated

Real numbers from `test/pipeline.test.ts` (`corpus/two-sum-cpp`, default
params: k=17, w=4, basecodeMaxFreq=0.5, minSharedFingerprints=5,
flagThreshold=0.35). This documents where token-level winnowing currently
stops working, using `corpus/two-sum-cpp/evasions/` — two adversarial
variants of `sol02` that deliberately exceed ARCHITECTURE.md §5's variant
disguise levels. See `evasions/README.md` for full provenance.

## Measured numbers

| pair | simAtoB | simBtoA | shared | flagged |
|---|---|---|---|---|
| sol02 ~ evasion_1 (function split) | 0.2642 | 0.3333 | 14 | **false** |
| sol02 ~ evasion_2 (rewritten lift) | 0.1136 | 0.2381 | 10 | **false** |

For contrast, every real §5 variant flags at the same params — from
`sol02~var_c`/`var_e` at 0.48 up to `sol02~var_a`/`var_b` at 1.00 (full
120 vs. 153-candidate score matrix in `test/pipeline.test.ts`'s output).
The evasions sit clearly below `flagThreshold=0.35`, not marginally.

**evasion_1** splits `sol02`'s single contiguous loop body into a
`step()` helper called from a separate `for` loop, plus changed return
plumbing (`return true/false` instead of inline `cout` + `return 0`).
**evasion_2** is a partial copy whose interior was also edited
(`cin >> x` → `a[idx - 1]`), breaking every k-gram touching the changed
line. With k=17, one changed token inside a run destroys every k-gram
within 16 tokens of it on either side — a single well-placed edit can
fragment what would otherwise be one long matching region into several
short ones, each below the density needed to clear threshold.

Despite that, region extraction still located the copied block in
evasion_2: `test/pipeline.test.ts` asserts (and confirms) at least one
reported region overlaps evasion_2's banner-marked lifted block, computed
from the marker comments' actual byte offsets — the ratio drops below
threshold before the region-finding does.

## Why `seed-demo.ts` reports 17 flagged pairs, not 6

`scripts/seed-demo.ts` posts the corpus through the real API and prints
`stats.flaggedPairs` from the completed analysis — running it reports
**17**, which looks alarming next to "6 variants flag against sol02"
until you count the whole clique, not just the sol02-anchored pairs.

`test/pipeline.test.ts` only *asserts* on the 6 `sol02~var_X` pairs (and
separately, zero flags among sol01-sol10) - it never asserts an exact
total flagged-pair count. But sol02 + its 6 variants (var_a..var_f) are
all mutual disguises of the same ancestor, so cross-variant pairs
(`var_a~var_b`, `var_a~var_c`, ... `var_d~var_f`) legitimately clear
threshold too, not just the sol02-anchored ones - that's 7 members, up to
C(7,2)=21 possible pairs within the clique, of which 17 clear threshold
(the other 4, e.g. `var_c~var_d`, don't - not every pairwise combination
of disguises survives at these params). `seed-demo.ts` doesn't load
`evasions/` at all, so none of those enter into it. Confirmed by counting
`true` rows in the score matrix `test/pipeline.test.ts` prints: exactly
17 rows involving only `sol02`/`var_*`, zero involving `sol01,sol03-10`.
Worth having this cold for a demo audience - "why 17?" is exactly the
kind of number someone watching will ask about.

## Two product implications

**1. §8's AST-normalization stretch phase is the intended countermeasure
for control-flow restructuring, not a bigger `w`.** Widening the winnowing
window or lowering `flagThreshold` to catch evasion_1/evasion_2 would also
inflate false-positive risk against genuine solutions sharing ordinary
idioms (e.g. `sol01~sol10` already sits at 0.30, closer to threshold than
any evasion here is to flagging) — token-level k-grams fundamentally
can't see through a real control-flow rewrite the same content is poured
into. Structural (AST-level) fingerprinting, already scoped as Phase 8,
is what's designed to catch this class of disguise instead.

**2. `longestRegionTokens` (and region data generally) deserves prominence
in the report UI, not just the aggregate similarity ratio.** evasion_2
demonstrates that region recall can survive even when the pair's ratio
stays under threshold — a reviewer looking only at "flagged: false" would
miss that a real block was located and matched. Surfacing the longest
matched region (and letting a human reviewer sort/filter borderline pairs
by it, not just by simAtoB/simBtoA) gives a path to catching evasive
partial copies that the automatic threshold alone will not flag.
