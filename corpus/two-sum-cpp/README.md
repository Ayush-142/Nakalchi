# corpus/two-sum-cpp — provenance

## What this is
Fixture corpus for Nakalchi's Phase 3 accuracy test (ARCHITECTURE.md §5
Phase 3, corpus-level pipeline test). Problem spec: PROBLEM.md.

## Provenance — read before citing accuracy numbers
These are NOT real student submissions. All 16 files were AI-generated
(Claude, July 2026) as deliberately independent implementations, at the
project author's request, outside of and independent from the sessions
that implemented the matching engine. Diversity between sol01-sol10 is
structural (different algorithms and idioms), not just cosmetic, because
Nakalchi's normalization erases naming/formatting differences by design.

Implication: test results against this corpus demonstrate the engine's
mechanics (genuine structural diversity scores low; mechanical disguises
of a common ancestor score high). They are not a field-accuracy claim
about real-world student code.

## Genuine solutions (should NOT flag against each other)
sol01  brute force, O(n^2) double loop, iostream
sol02  one-pass unordered_map (DISGUISE BASE for variants/)
sol03  two-pass unordered_map, rightmost-position table
sol04  sort pairs + two pointers, scanf/printf
sol05  sort structs + hand-written binary search, named comparator
sol06  incremental std::map, flag-variable control flow, no early return
sol07  C-style: malloc, globals, logic split across functions
sol08  index-array sort with lambda, ternary pointer stepping
sol09  STL iterators: copy_n / istream_iterator / std::find
sol10  multiset erase/count approach

## Disguise variants (ALL derived from sol02; each SHOULD flag vs sol02)
var_a  identifier renames only
var_b  comments + whitespace/brace-style changes only
var_c  statement-equivalent rewrites (for->while, i++->i=i+1,
       reversed comparisons, hoisted temporary)
var_d  independent statement/block reordering (declarations hoisted,
       setup lines shuffled; core loop token run untouched)
var_e  combined a+b+c
var_f  partial copy: sol02's core loop lifted VERBATIM into a helper
       inside an otherwise original program (marked in-file) — the
       region-extraction assertion targets this variant

Two harder variants that deliberately exceed this spec live in
evasions/ — they measure where token-level detection stops. See
evasions/README.md and docs/detection-boundary.md.

All 16 files compile (g++ 13, -std=c++17) and produce a valid pair on a
shared smoke-test input.

## Not judge-compatible with CodeArena's live `two-sum`, and that's correct

PROBLEM.md's spec (above) deliberately guarantees "exactly one valid pair
exists" — these files are correct-by-contract without ever needing a
no-solution branch. CodeArena's own `two-sum` problem is a **different,
stricter** spec that happens to share a name and the core algorithm: it
requires printing `YES i j` / `NO`, including at least one real hidden test
with no valid pair (`problems/two-sum/tests/03.in`). Submitted verbatim,
every one of these 16 files gets `WA` (or, for `var_f`, `RE` — its `solve()`
returns a nonzero status on the no-pair path, which some judges classify as
a runtime error rather than a wrong answer) on that one hidden test, despite
being entirely correct against this corpus's own spec.

Phase 6's E2E run (`docs/e2e-codearena.md`) needed real `AC` verdicts from
CodeArena's actual judge, so it submitted **adapted copies** — not these
files — with a `"YES "` prefix added to each existing output statement, plus
an explicit no-pair branch printing `"NO"` (three files — `sol06`, `sol07`,
`sol08` — had a latent bug here of their own: they unconditionally print
whatever ended up in their answer variables, which was never caught because
this corpus's guarantee means the no-pair path is simply never exercised by
Phase 0-3's own tests). None of that touched these committed files.

Empirically checked (not just assumed) whether applying that same patch
*to these committed files* would change Phase 3's golden `pipeline.test.ts`
results: every `sol02`~variant pair still flags, zero false positives among
`sol01`..`sol10`, both `evasion_*` pairs still don't flag — the test suite's
actual assertions all still hold. But the patch does measurably shift
`candidatePairs` (35→31), several `sol02`~variant similarity scores by
multiple points, and `var_f`'s matched region (90→96 tokens) — and
`pipeline.test.ts`'s own header declares "the corpus and the engine are
frozen for this session." Left these files untouched on that basis; this
section exists so a future reader isn't confused about why the corpus
doesn't `AC` on CodeArena as-is, without silently drifting a frozen,
already-accepted fixture to do so.
