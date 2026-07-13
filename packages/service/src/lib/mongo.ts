import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Analysis } from '../models/Analysis.js';
import { SubmissionSnapshot } from '../models/SubmissionSnapshot.js';
import { Pair } from '../models/Pair.js';

/**
 * Index creation at connect time, not a migration script - see the phase
 * plan's justification (single small-VM instance, docker-compose's
 * one-command bring-up has no room for a separate migration step).
 * syncIndexes() is idempotent, so calling it from both the API and worker
 * entrypoints (they're separate processes/containers) is safe regardless
 * of which one starts first.
 */
export async function connectMongo(): Promise<typeof mongoose> {
  await mongoose.connect(env.MONGO_URI);
  await Promise.all([Analysis.syncIndexes(), SubmissionSnapshot.syncIndexes(), Pair.syncIndexes()]);
  return mongoose;
}
