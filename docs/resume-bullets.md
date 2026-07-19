# Resume bullets

ARCHITECTURE.md §5 Phase 7 item 6. Numbers below are real, copied from
`docs/benchmarks.md`'s "In-situ (Azure VM)" section
(`bench/corpus.bench.ts`, n=1,000, real deploy VM, both stacks resident) —
not estimated or retyped from memory.

- Implemented the MOSS winnowing algorithm from the SIGMOD paper
  (Schleimer, Wilkerson, Aiken) for source-code plagiarism detection.
- Detection robust to identifier renaming, reformatting, and function
  reordering — verified via property-based testing (fast-check) over
  10,000+ randomized trials of the winnowing (t,k)-guarantee.
- Analyzed **1,000** submissions in **1.42s** on a 2-vCPU Azure VM via
  inverted-index candidate pruning — **~51×** fewer pairwise comparisons
  than naive O(n²) matching (9,785 candidate pairs vs. 499,500 full pairs).
- Integrated with a live judge platform (CodeArena) end-to-end: contest
  finalization → async analysis → webhook-notified plagiarism report,
  demonstrated with failure isolation (judge stays fully operational when
  the analysis service is down).
