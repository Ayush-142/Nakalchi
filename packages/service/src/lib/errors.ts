import type { NextFunction, Request, Response } from 'express';
import { logger } from './logger.js';

/** ARCHITECTURE.md §4.2: `{ error: { code, message, details? } }` everywhere. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function sendError(res: Response, status: number, code: string, message: string, details?: unknown): void {
  res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express identifies error middleware by arity (4 params)
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    sendError(res, err.status, err.code, err.message, err.details);
    return;
  }
  logger.error({ err }, 'unhandled error');
  sendError(res, 500, 'internal_error', 'An unexpected error occurred.');
}
