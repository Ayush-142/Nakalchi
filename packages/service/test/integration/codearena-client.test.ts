/**
 * Unit-level coverage for integrations/codearena.ts, isolated from Mongo/
 * Redis (unlike pull-mode.test.ts, which exercises it through the worker).
 * Mocks global.fetch directly rather than hitting a real HTTP server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContestSubmissions, CodeArenaFetchError } from '../../src/integrations/codearena.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe('integrations/codearena.ts: fetchContestSubmissions', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('follows nextCursor until null, across multiple problemIds', async () => {
    fetchMock
      // problem p1, page 1
      .mockResolvedValueOnce(
        jsonResponse({ submissions: [{ externalId: 'e1', userRef: 'u1', problemRef: 'p1', language: 'cpp', source: 's1' }], nextCursor: 'c1' }),
      )
      // problem p1, page 2 (last)
      .mockResolvedValueOnce(
        jsonResponse({ submissions: [{ externalId: 'e2', userRef: 'u2', problemRef: 'p1', language: 'cpp', source: 's2' }], nextCursor: null }),
      )
      // problem p2, page 1 (last)
      .mockResolvedValueOnce(
        jsonResponse({ submissions: [{ externalId: 'e3', userRef: 'u3', problemRef: 'p2', language: 'cpp', source: 's3' }], nextCursor: null }),
      );

    const onProgress = vi.fn();
    const result = await fetchContestSubmissions('c1', ['p1', 'p2'], onProgress);

    expect(result.map((s) => s.externalId)).toEqual(['e1', 'e2', 'e3']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Each page request must carry the internal auth header.
    for (const call of fetchMock.mock.calls) {
      const [, init] = call as [URL, RequestInit];
      expect((init.headers as Record<string, string>)['X-Internal-Token']).toBeTruthy();
    }
    // Fires once per completed problemId, not per page.
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it('retries a transient page failure with backoff, then succeeds', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(jsonResponse({ submissions: [{ externalId: 'e1', userRef: 'u1', problemRef: 'p1', language: 'cpp', source: 's1' }], nextCursor: null }));

    const result = await fetchContestSubmissions('c1', ['p1']);

    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws CodeArenaFetchError after exhausting all page retries', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, false, 500));

    await expect(fetchContestSubmissions('c1', ['p1'])).rejects.toThrow(CodeArenaFetchError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // MAX_PAGE_ATTEMPTS
  });
});
