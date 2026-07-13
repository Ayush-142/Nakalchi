import 'server-only';
import type {
  AnalysisDetail,
  ListAnalysesParams,
  ListPairsParams,
  PaginatedAnalyses,
  PaginatedPairs,
  PairDetail,
} from './types';

/**
 * `import 'server-only'` above is the actual enforcement mechanism behind
 * the hard constraint that NAKALCHI_API_KEY never reaches the browser: if
 * any "use client" component ever imports this module (directly or
 * transitively), `next build` fails at build time. This is the only
 * module in packages/web allowed to read NAKALCHI_API_KEY or call the
 * Nakalchi service - every page fetches through the functions below,
 * never `fetch` directly.
 */
export class ApiClientError extends Error {
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

function getConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.NAKALCHI_API_BASE_URL;
  const apiKey = process.env.NAKALCHI_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('NAKALCHI_API_BASE_URL and NAKALCHI_API_KEY must both be set as server-side env vars.');
  }
  return { baseUrl, apiKey };
}

// Deliberately `object`, not an indexed Record type: the concrete params
// interfaces (ListAnalysesParams, etc.) have no index signature, and
// TypeScript doesn't consider a type without one assignable to one that
// requires it even when structurally compatible - `object` sidesteps that
// without needing a cast at every call site.
async function request<T>(path: string, params?: object): Promise<T> {
  const { baseUrl, apiKey } = getConfig();
  const url = new URL(path, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, {
    headers: { 'X-Api-Key': apiKey },
    cache: 'no-store',
  });

  const body: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const envelope = body as { error?: { code?: string; message?: string; details?: unknown } } | undefined;
    throw new ApiClientError(
      res.status,
      envelope?.error?.code ?? 'unknown_error',
      envelope?.error?.message ?? `Request to ${path} failed with status ${res.status}`,
      envelope?.error?.details,
    );
  }

  return body as T;
}

export function listAnalyses(params: ListAnalysesParams = {}): Promise<PaginatedAnalyses> {
  return request<PaginatedAnalyses>('/api/v1/analyses', params);
}

export function getAnalysis(id: string): Promise<AnalysisDetail> {
  return request<AnalysisDetail>(`/api/v1/analyses/${encodeURIComponent(id)}`);
}

export function listPairs(analysisId: string, params: ListPairsParams = {}): Promise<PaginatedPairs> {
  return request<PaginatedPairs>(`/api/v1/analyses/${encodeURIComponent(analysisId)}/pairs`, params);
}

export function getPair(id: string): Promise<PairDetail> {
  return request<PairDetail>(`/api/v1/pairs/${encodeURIComponent(id)}`);
}
