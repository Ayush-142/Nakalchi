/**
 * §5 Phase 4 item 3. Shared between routes/analyses.ts (direct-mode
 * validation, at request time) and queue/analysisWorker.ts (pull-mode
 * validation, at fetch time - see Phase 6 plan A3b) since pull mode no
 * longer validates corpus size synchronously in the route handler.
 */
export const MAX_SUBMISSION_SIZE_BYTES = 256 * 1024;
export const MAX_CORPUS_SIZE = 5000;
