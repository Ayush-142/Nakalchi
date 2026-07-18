# Resume bullets (draft)

ARCHITECTURE.md §5 Phase 7 item 6. `X`/`Y`/`N` are placeholders — filled in
only from `docs/benchmarks.md`'s real in-situ VM numbers, once
`docs/deploy-runbook.md`'s bench step actually runs. Not before.

- Implemented the MOSS winnowing algorithm from the SIGMOD paper
  (Schleimer, Wilkerson, Aiken) for source-code plagiarism detection.
- Detection robust to identifier renaming, reformatting, and function
  reordering — verified via property-based testing (fast-check) over
  10,000+ randomized trials of the winnowing (t,k)-guarantee.
- Analyzed **N** submissions in **X**s on a 2-vCPU Azure VM via
  inverted-index candidate pruning — **Y**× fewer pairwise comparisons than
  naive O(n²) matching.
- Integrated with a live judge platform (CodeArena) end-to-end: contest
  finalization → async analysis → webhook-notified plagiarism report,
  demonstrated with failure isolation (judge stays fully operational when
  the analysis service is down).
