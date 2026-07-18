import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Field names already renamed at the CodeArena boundary (see CodeArena's
 * GET /internal/contests/:id/submissions) to match Nakalchi's own
 * submissionSchema shape - externalId/userRef/problemRef/language/source.
 */
export interface CodeArenaSubmission {
  externalId: string;
  userRef: string;
  problemRef: string;
  language: 'cpp' | 'python';
  source: string;
}

interface SubmissionsPage {
  submissions: CodeArenaSubmission[];
  nextCursor: string | null;
}

/**
 * Thrown only after a single page has exhausted all its retries. Callers
 * (queue/analysisWorker.ts) treat this like any other pipeline error - it
 * propagates through the existing try/catch, BullMQ retry, and eventual
 * `failed` status + webhook, with no special-casing needed.
 */
export class CodeArenaFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CodeArenaFetchError';
  }
}

const PAGE_LIMIT = 200;
const MAX_PAGE_ATTEMPTS = 3;
const PAGE_RETRY_BASE_MS = 500; // same exponential-backoff shape as webhooks/notify.ts

async function fetchPageWithRetry(contestId: string, problemId: string, cursor: string | null): Promise<SubmissionsPage> {
  const url = new URL(`/internal/contests/${encodeURIComponent(contestId)}/submissions`, env.CODEARENA_BASE_URL);
  url.searchParams.set('problemId', problemId);
  url.searchParams.set('limit', String(PAGE_LIMIT));
  if (cursor !== null) url.searchParams.set('cursor', cursor);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_PAGE_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'X-Internal-Token': env.CODEARENA_SERVICE_TOKEN } });
      if (!res.ok) {
        throw new Error(`GET ${url.pathname} responded ${res.status}`);
      }
      return (await res.json()) as SubmissionsPage;
    } catch (err) {
      lastErr = err;
      logger.warn({ contestId, problemId, attempt, err }, 'codearena submissions page fetch failed');
      if (attempt < MAX_PAGE_ATTEMPTS) {
        const delayMs = PAGE_RETRY_BASE_MS * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw new CodeArenaFetchError(
    `failed to fetch submissions for contest=${contestId} problem=${problemId} after ${MAX_PAGE_ATTEMPTS} attempts`,
    { cause: lastErr },
  );
}

/**
 * All-or-nothing: accumulates purely in memory across every page of every
 * problemId. If any page exhausts its retries, this throws immediately and
 * nothing fetched so far is returned - the caller never persists a partial
 * corpus. onProgress fires once per completed problemId (not per page),
 * giving the worker a coarse-but-honest progress signal without needing to
 * know the total submission count up front.
 */
export async function fetchContestSubmissions(
  contestId: string,
  problemIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<CodeArenaSubmission[]> {
  const all: CodeArenaSubmission[] = [];
  for (let i = 0; i < problemIds.length; i++) {
    const problemId = problemIds[i]!;
    let cursor: string | null = null;
    do {
      const page = await fetchPageWithRetry(contestId, problemId, cursor);
      all.push(...page.submissions);
      cursor = page.nextCursor;
    } while (cursor !== null);
    onProgress?.(i + 1, problemIds.length);
  }
  return all;
}
