import { Schema, model, type InferSchemaType } from 'mongoose';

const submissionSnapshotSchema = new Schema({
  analysisId: { type: Schema.Types.ObjectId, required: true },
  externalId: { type: String, required: true },
  userRef: { type: String, required: true },
  problemRef: { type: String, required: true },
  language: { type: String, enum: ['cpp', 'python'], required: true },
  // Gzip if the original source was > 64KB, raw utf8 bytes otherwise -
  // see lib/gzip.ts for the threshold and lib/gzip.ts's decode() for how
  // sourceEncoding disambiguates on read.
  source: { type: Buffer, required: true },
  // Implied addition beyond §4.1's literal text: item 2 says "gzip if
  // > 64KB" but doesn't say how a reader knows which are compressed - an
  // explicit flag is more robust than sniffing gzip magic bytes.
  sourceEncoding: { type: String, enum: ['utf8', 'gzip'], required: true },
  // tokenCount/fingerprintCount are populated by the WORKER (not the
  // POST /analyses handler) - the handler only snapshots+gzips and
  // enqueues, keeping ingestion fast and async per §3.1 ("Queue-based
  // ingestion... Analyses are long-running -> async via BullMQ"); a
  // freshly-created snapshot doesn't have these yet, hence optional.
  tokenCount: { type: Number, required: false },
  // RAW count from a standalone fingerprint() call on this submission
  // alone, at the analysis's frozen params, BEFORE base-code/corpusCap
  // filtering (that filtering is inherently cross-submission and happens
  // inside core's analyzeCorpus, which this per-submission metadata call
  // has no visibility into) - intentionally not expected to reconcile
  // with any pair's sharedFingerprints for this submission.
  fingerprintCount: { type: Number, required: false },
});

// Exact match to §4.1: { analysisId: 1, externalId: 1 } unique. Query
// patterns: (a) idempotent upsert / duplicate guard during snapshot
// creation, (b) "load all snapshots for analysisId" (the worker's main
// read before calling analyzeCorpus).
submissionSnapshotSchema.index({ analysisId: 1, externalId: 1 }, { unique: true });

export type SubmissionSnapshotDoc = InferSchemaType<typeof submissionSnapshotSchema>;

export const SubmissionSnapshot = model('SubmissionSnapshot', submissionSnapshotSchema, 'submission_snapshots');
