import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

/**
 * Required fix from plan review: a `Set.has()` / plain string-equality
 * lookup is NOT constant-time - JS string comparison short-circuits on
 * the first mismatched byte, which leaks timing information about the
 * secret. Using crypto.timingSafeEqual per configured key instead.
 * Buffers must be length-guarded first (timingSafeEqual throws on
 * mismatched-length input) - the length check itself doesn't leak
 * anything sensitive (key length isn't secret).
 */
function safeCompare(candidate: string, configured: string): boolean {
  const candidateBuf = Buffer.from(candidate);
  const configuredBuf = Buffer.from(configured);
  if (candidateBuf.length !== configuredBuf.length) return false;
  return timingSafeEqual(candidateBuf, configuredBuf);
}

/**
 * Loops over every configured key without early-exit on the first match,
 * so the check takes the same time regardless of which key (if any)
 * matches or where in the list it sits.
 */
function isValidApiKey(candidate: string): boolean {
  let valid = false;
  for (const key of env.API_KEYS) {
    if (safeCompare(candidate, key)) valid = true;
  }
  return valid;
}

export function apiKeyAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('X-Api-Key');
  if (typeof header !== 'string' || header.length === 0) {
    next(new ApiError(401, 'unauthorized', 'Missing X-Api-Key header.'));
    return;
  }
  if (!isValidApiKey(header)) {
    next(new ApiError(401, 'unauthorized', 'Invalid API key.'));
    return;
  }
  next();
}
