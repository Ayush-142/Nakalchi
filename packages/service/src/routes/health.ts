import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import type { Redis } from 'ioredis';

async function pingMongoAndRedis(redis: Redis): Promise<{ mongo: boolean; redis: boolean }> {
  const [mongoResult, redisResult] = await Promise.allSettled([
    mongoose.connection.db ? mongoose.connection.db.admin().ping() : Promise.reject(new Error('mongo not connected')),
    redis.ping(),
  ]);
  return { mongo: mongoResult.status === 'fulfilled', redis: redisResult.status === 'fulfilled' };
}

/**
 * Both endpoints check mongo+redis reachability - §4.2 only elaborates
 * on /healthz ("mongo+redis ping"), giving /readyz no separate
 * parenthetical, so both are implemented identically here. Mounted
 * unauthenticated and outside /api/v1: health checks are read by load
 * balancers/orchestrators, not API callers, and requiring X-Api-Key on
 * an infra probe endpoint would be unusual.
 */
export function createHealthRouter(redis: Redis): Router {
  const router = Router();

  const handler = (_req: Request, res: Response): void => {
    void pingMongoAndRedis(redis).then(({ mongo, redis: redisOk }) => {
      const healthy = mongo && redisOk;
      res.status(healthy ? 200 : 503).json({ mongo, redis: redisOk });
    });
  };

  router.get('/healthz', handler);
  router.get('/readyz', handler);

  return router;
}
