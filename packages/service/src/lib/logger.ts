import pino from 'pino';

/**
 * Structured logging (§5 Phase 4 item 7). `redact` strips API keys and
 * the webhook secret from anything accidentally passed through logged
 * objects - never logged even by mistake, not just "usually avoided".
 */
export const logger = pino({
  redact: {
    paths: ['req.headers["x-api-key"]', 'headers["x-api-key"]', 'apiKeys', 'webhookSecret', 'env.API_KEYS', 'env.WEBHOOK_SECRET'],
    remove: true,
  },
});
