import express, { Router, type Express } from 'express';
import { pinoHttp } from 'pino-http';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { MAX_BODY_SIZE_BYTES } from './config/env.js';
import { logger } from './lib/logger.js';
import { apiKeyAuth } from './auth/apiKey.js';
import { createAnalysesRouter } from './routes/analyses.js';
import { createPairsRouter } from './routes/pairs.js';
import { createHealthRouter } from './routes/health.js';
import { ApiError, errorHandler } from './lib/errors.js';
import type { AnalyzeJobData } from './queue/queues.js';

export interface AppDeps {
  queue: Queue<AnalyzeJobData>;
  redis: Redis;
}

/** Express app factory - no listen(), so it's directly testable with supertest. */
export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(pinoHttp({ logger }));

  // Unauthenticated, outside /api/v1 - read by load balancers/orchestrators, not API callers.
  app.use(createHealthRouter(deps.redis));

  app.use(express.json({ limit: MAX_BODY_SIZE_BYTES }));

  const apiRouter = Router();
  apiRouter.use(apiKeyAuth);
  apiRouter.use(createAnalysesRouter(deps.queue));
  apiRouter.use(createPairsRouter());
  apiRouter.use((req, _res, next) => {
    next(new ApiError(404, 'not_found', `No route for ${req.method} ${req.path}`));
  });

  app.use('/api/v1', apiRouter);

  app.use(errorHandler);

  return app;
}
