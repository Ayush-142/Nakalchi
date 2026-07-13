import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('lib/api.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NAKALCHI_API_BASE_URL = 'http://service.internal:3000';
    process.env.NAKALCHI_API_KEY = 'the-secret-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NAKALCHI_API_BASE_URL;
    delete process.env.NAKALCHI_API_KEY;
  });

  it('attaches X-Api-Key on every request and hits the right URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ analyses: [], nextCursor: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { listAnalyses } = await import('./api');
    await listAnalyses({ status: 'completed', limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('http://service.internal:3000/api/v1/analyses?status=completed&limit=10');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('the-secret-key');
    expect(init.cache).toBe('no-store');
  });

  it('parses the {error:{code,message,details?}} envelope into a typed ApiClientError', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'not_found', message: 'Pair not found.' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getPair, ApiClientError } = await import('./api');

    await expect(getPair('abc123')).rejects.toMatchObject(
      expect.objectContaining({
        status: 404,
        code: 'not_found',
        message: 'Pair not found.',
      }),
    );
    await expect(getPair('abc123')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('omits undefined query params rather than sending "undefined" literally', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pairs: [], nextCursor: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { listPairs } = await import('./api');
    await listPairs('analysis-1', { flaggedOnly: undefined, minSim: 0.5 });

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.searchParams.has('flaggedOnly')).toBe(false);
    expect(url.searchParams.get('minSim')).toBe('0.5');
  });

  it('throws a clear error if server env vars are missing', async () => {
    delete process.env.NAKALCHI_API_BASE_URL;
    const { getAnalysis } = await import('./api');
    await expect(getAnalysis('x')).rejects.toThrow(/NAKALCHI_API_BASE_URL/);
  });
});
