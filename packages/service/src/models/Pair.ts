import { Schema, model, type InferSchemaType } from 'mongoose';

const sideRefSchema = new Schema(
  {
    snapshotId: { type: Schema.Types.ObjectId, required: true },
    userRef: { type: String, required: true },
  },
  { _id: false },
);

// Exact 1:1 with @nakalchi/core's MatchRegion type - no field mapping needed.
const regionSchema = new Schema(
  {
    aStart: { type: Number, required: true },
    aEnd: { type: Number, required: true },
    bStart: { type: Number, required: true },
    bEnd: { type: Number, required: true },
    aLineStart: { type: Number, required: true },
    aLineEnd: { type: Number, required: true },
    bLineStart: { type: Number, required: true },
    bLineEnd: { type: Number, required: true },
    tokens: { type: Number, required: true },
  },
  { _id: false },
);

const pairSchema = new Schema({
  analysisId: { type: Schema.Types.ObjectId, required: true },
  problemRef: { type: String, required: true },
  a: { type: sideRefSchema, required: true },
  b: { type: sideRefSchema, required: true },
  simAtoB: { type: Number, required: true },
  simBtoA: { type: Number, required: true },
  sharedFingerprints: { type: Number, required: true },
  longestRegionTokens: { type: Number, required: true },
  flagged: { type: Boolean, required: true },
  // Capped at 200 by core's regions.ts - stored denormalized so reads are
  // pure (§4.1: "the UI is a pure read - no recomputation at view time").
  regions: { type: [regionSchema], required: true, default: [] },
});

// Exact match to §4.1: { analysisId: 1, flagged: 1, simAtoB: -1 }. Query
// pattern: GET /analyses/:id/pairs?flaggedOnly=&sort= is a direct prefix
// match on this compound index.
pairSchema.index({ analysisId: 1, flagged: 1, simAtoB: -1 });

export type PairDoc = InferSchemaType<typeof pairSchema>;

export const Pair = model('Pair', pairSchema, 'pairs');
