/**
 * Full happy path (§5 Phase 4 item 9): POST -> poll -> pairs match
 * Phase 3 expectations on the fixture corpus. Loads the real
 * corpus/two-sum-cpp files (test code does I/O) and cross-validates that
 * the service's Mongo round-trip reproduces the same flagged/genuine
 * split already proven in packages/core/test/pipeline.test.ts - not
 * re-deriving expected values here, just checking the service doesn't
 * corrupt or drop what core computed.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestHarness, clearDatabase, waitForAnalysisStatus, type TestHarness } from './testHarness.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(testDir, '..', '..', '..', '..', 'corpus', 'two-sum-cpp');
const variantsDir = join(corpusDir, 'variants');

function idFromFilename(filename: string): string {
  const match = /^(sol\d+|var_[a-f])/.exec(filename);
  if (!match) throw new Error(`unexpected corpus filename: ${filename}`);
  return match[1]!;
}

function loadCorpusSubmissions(): { externalId: string; userRef: string; problemRef: string; language: 'cpp'; source: string }[] {
  const solFiles = readdirSync(corpusDir).filter((f) => f.endsWith('.cpp'));
  const variantFiles = readdirSync(variantsDir).filter((f) => f.endsWith('.cpp'));
  const toSubmission = (dir: string, filename: string) => ({
    externalId: idFromFilename(filename),
    userRef: idFromFilename(filename),
    problemRef: 'two-sum',
    language: 'cpp' as const,
    source: readFileSync(join(dir, filename), 'utf8'),
  });
  return [...solFiles.map((f) => toSubmission(corpusDir, f)), ...variantFiles.map((f) => toSubmission(variantsDir, f))];
}

describe('POST /analyses -> GET /analyses/:id -> GET /analyses/:id/pairs -> GET /pairs/:id (happy path)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await startTestHarness();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('produces the same flagged/genuine split as core/test/pipeline.test.ts', async () => {
    const submissions = loadCorpusSubmissions();
    expect(submissions).toHaveLength(16);

    const postResponse = await request(harness.app)
      .post('/api/v1/analyses')
      .set('X-Api-Key', 'test-api-key')
      .send({ submissions })
      .expect(202);

    const { analysisId } = postResponse.body as { analysisId: string };
    expect(analysisId).toBeTruthy();

    await waitForAnalysisStatus(analysisId, ['completed', 'failed']);

    const getResponse = await request(harness.app).get(`/api/v1/analyses/${analysisId}`).set('X-Api-Key', 'test-api-key').expect(200);
    expect(getResponse.body.status).toBe('completed');
    expect(getResponse.body.progress).toBe(100);
    expect(getResponse.body.stats.submissions).toBe(16);

    const pairsResponse = await request(harness.app)
      .get(`/api/v1/analyses/${analysisId}/pairs`)
      .set('X-Api-Key', 'test-api-key')
      .query({ limit: 100 })
      .expect(200);

    const pairs = pairsResponse.body.pairs as { a: { userRef: string }; b: { userRef: string }; flagged: boolean }[];
    expect(pairs.length).toBeGreaterThan(0);
    // List rows must not carry full regions (see routes/analyses.ts's projection).
    expect(pairsResponse.body.pairs[0].regions).toBeUndefined();

    const isVariantPair = (a: string, b: string): boolean =>
      (a === 'sol02' && b.startsWith('var_')) || (b === 'sol02' && a.startsWith('var_'));

    for (const pair of pairs) {
      if (isVariantPair(pair.a.userRef, pair.b.userRef)) {
        expect(pair.flagged, `${pair.a.userRef}~${pair.b.userRef} should flag`).toBe(true);
      }
      if (pair.a.userRef.startsWith('sol') && pair.b.userRef.startsWith('sol')) {
        expect(pair.flagged, `${pair.a.userRef}~${pair.b.userRef} (genuine pair) should not flag`).toBe(false);
      }
    }

    // GET /pairs/:id assembles both full sources + regions.
    const firstPairId = (pairsResponse.body.pairs[0] as { id: string }).id;
    const pairDetail = await request(harness.app).get(`/api/v1/pairs/${firstPairId}`).set('X-Api-Key', 'test-api-key').expect(200);
    expect(pairDetail.body.a.source).toEqual(expect.any(String));
    expect(pairDetail.body.b.source).toEqual(expect.any(String));
    expect(Array.isArray(pairDetail.body.regions)).toBe(true);
  });
});
