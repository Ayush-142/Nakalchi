import { Schema, model, type InferSchemaType } from 'mongoose';

const paramsSchema = new Schema(
  {
    k: { type: Number, required: true },
    w: { type: Number, required: true },
    basecodeMaxFreq: { type: Number, required: true },
    flagThreshold: { type: Number, required: true },
  },
  { _id: false },
);

const contestRefSchema = new Schema(
  {
    contestId: { type: String, required: true },
    problemIds: { type: [String], required: true },
  },
  { _id: false },
);

const statsSchema = new Schema(
  {
    submissions: { type: Number, required: true, default: 0 },
    // Sum of RAW per-submission fingerprint() counts at frozen params,
    // computed BEFORE base-code/corpusCap filtering - a corpus-wide raw
    // total, not expected to reconcile with any pair's sharedFingerprints
    // (which is post-filtering, computed inside core's analyzeCorpus).
    fingerprints: { type: Number, required: true, default: 0 },
    candidatePairs: { type: Number, required: true, default: 0 },
    flaggedPairs: { type: Number, required: true, default: 0 },
    wallMs: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

// Implied addition beyond §4.1's literal schema text - needed because
// §5 Phase 4 item 6 requires webhook delivery outcomes to be "logged on
// the analysis doc" and there's nowhere else to put that. Delivery is
// at-least-once, not exactly-once: see queue/analysisWorker.ts's
// idempotency guard and webhooks/notify.ts.
const webhookSchema = new Schema(
  {
    url: { type: String, required: true },
    attempts: { type: Number, required: true, default: 0 },
    lastStatus: { type: Number, required: false },
    lastAttemptAt: { type: Date, required: false },
    delivered: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const analysisSchema = new Schema({
  source: { type: String, enum: ['codearena', 'api'], required: true },
  contestRef: { type: contestRefSchema, required: false },
  // Resolved (defaults filled in) and frozen at analysis-creation time -
  // §4.1: "frozen per analysis". Never re-resolved later, so a future
  // change to core's defaults can't retroactively change what an
  // already-created analysis says it ran with.
  params: { type: paramsSchema, required: true },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], required: true, default: 'queued' },
  progress: { type: Number, required: true, default: 0, min: 0, max: 100 },
  error: { type: String, required: false },
  stats: { type: statsSchema, required: true, default: () => ({}) },
  // Phase 6 pull-mode idempotency marker (plan review FIX 2): SubmissionSnapshot.insertMany
  // is not atomic, so a crash mid-insert can persist a partial prefix of docs. The worker's
  // pull-mode fetch stage (queue/analysisWorker.ts) only trusts existing snapshots as complete
  // when this is true; otherwise it wipes and re-fetches. Direct mode never sets this (its
  // snapshots always exist in full before the analysis is even enqueued), so it's irrelevant
  // to that path.
  snapshotsComplete: { type: Boolean, required: true, default: false },
  webhook: { type: webhookSchema, required: false },
  createdAt: { type: Date, required: true, default: () => new Date() },
  startedAt: { type: Date, required: false },
  completedAt: { type: Date, required: false },
});

// Exact match to §4.1: { status: 1, createdAt: -1 } - dashboard "list
// analyses by status, most recent first" query pattern.
analysisSchema.index({ status: 1, createdAt: -1 });

export type AnalysisDoc = InferSchemaType<typeof analysisSchema>;

// Explicit collection name ('analyses') rather than Mongoose's default
// pluralization guess, to match §4.1 exactly.
export const Analysis = model('Analysis', analysisSchema, 'analyses');
