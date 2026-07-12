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
