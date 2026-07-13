import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  API_KEYS: z
    .string()
    .min(1, 'API_KEYS is required')
    .transform((raw) =>
      raw
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0),
    )
    .refine((keys) => keys.length > 0, 'API_KEYS must contain at least one non-empty key'),
  WEBHOOK_SECRET: z.string().min(16, 'WEBHOOK_SECRET must be at least 16 characters'),
  // Architecture §3.1 already names this exact default value.
  QUEUE_PREFIX: z.string().min(1).default('Nakalchi:'),
  // Not in §5's literal 5-var list, but an Express server obviously needs one.
  PORT: z.coerce.number().int().positive().default(3000),
  // Makes §3.1's "concurrency=1 per CPU" config-driven instead of hardcoded.
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Fail-fast: report which KEYS are invalid/missing, never the
    // attempted values - this runs before the pino logger exists, and
    // must never leak secret material even accidentally.
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    console.error(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();

/**
 * Named, commented constant rather than an inline literal or an env var -
 * not a secret or a per-deployment value. Bounds Express's raw body
 * parser (see app.ts): a generously-large round number, not derived from
 * a hard requirement, well under the pathological theoretical max for the
 * documented per-submission (256KB) / corpus (5,000) caps enforced at the
 * application level in routes/analyses.ts (5,000 * 256KB ~= 1.28GB) - a
 * request this large is rejected here, before JSON parsing even starts.
 */
export const MAX_BODY_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
