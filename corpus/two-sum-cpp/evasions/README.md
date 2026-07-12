# evasions/ — known limitations of token-level winnowing (measured)

These two fixtures are ADVERSARIAL variants of sol02 that deliberately
exceed the disguise levels in ARCHITECTURE.md §5's variant list. At
default params (k=17, w=4, flagThreshold=0.35) they do NOT flag, and
the corpus test asserts exactly that, as documentation of the engine's
current boundary — this is expected behavior, not a bug.

evasion_1_function_split  sol02's loop body split into a helper with
                          changed return plumbing (control-flow
                          restructuring). Measured: max sim 0.33,
                          shared=14, longest region 42 tokens.
evasion_2_rewritten_lift  partial copy whose interior was also edited
                          (cin -> indexed array access), breaking
                          k-grams inside the lifted block. Measured:
                          max sim 0.24, shared=10 — though region
                          extraction still located the copied block.

Why: with k=17, one changed token destroys every k-gram within 16
tokens of it. Defeating control-flow restructuring is what §8's
AST-normalization stretch phase exists for. The evasion_2 case also
motivates surfacing longestRegionTokens in the report UI, since
regions are found even when aggregate ratios stay under threshold.

Provenance: AI-generated (Claude, July 2026), same as the rest of the
corpus; originally authored as var_d/var_f, reclassified after the
Phase 3 corpus run measured them below threshold.
