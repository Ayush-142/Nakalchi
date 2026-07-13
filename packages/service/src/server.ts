import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { connectMongo } from './lib/mongo.js';
import { createAnalyzeQueue, createRedisConnection } from './queue/queues.js';

async function main(): Promise<void> {
  await connectMongo();

  const redisConnection = createRedisConnection();
  const queue = createAnalyzeQueue(redisConnection);

  const app = createApp({ queue, redis: redisConnection });

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'API server listening');
  });

  // Graceful shutdown (§5 Phase 4 item 8): stop HTTP intake -> close queue/redis -> close mongo.
  const shutdown = async (): Promise<void> => {
    logger.info('API server received shutdown signal, closing');
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await queue.close();
    redisConnection.disconnect();
    await mongoose.connection.close();
    logger.info('API server shutdown complete');
  };

  process.on('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void shutdown().then(() => process.exit(0));
  });
}

void main();
