/**
 * ARCHITECTURE.md §4's file tree: "loads corpus, runs an analysis, opens
 * report". The "opens report" part is Phase 5 (no Report UI exists yet) -
 * this Phase 4 version stops at "produces a completed analysis", matching
 * this phase's own acceptance wording exactly. Run against a REAL running
 * stack (e.g. `docker compose up`), as an HTTP client of the API - not a
 * direct Mongo/Redis script - so it exercises the exact same path a real
 * caller would.
 *
 * Usage: npx tsx scripts/seed-demo.ts
 * Env: API_BASE_URL (default http://localhost:3000), SEED_API_KEY
 * (default matches docker-compose.yml's dev placeholder).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
const API_KEY = process.env.SEED_API_KEY ?? 'dev-local-api-key';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(scriptDir, '..', 'corpus', 'two-sum-cpp');
const variantsDir = join(corpusDir, 'variants');

function idFromFilename(filename: string): string {
  const match = /^(sol\d+|var_[a-f])/.exec(filename);
  if (!match) throw new Error(`unexpected corpus filename: ${filename}`);
  return match[1]!;
}

function loadSubmissions(): { externalId: string; userRef: string; problemRef: string; language: 'cpp'; source: string }[] {
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

async function main(): Promise<void> {
  const submissions = loadSubmissions();
  console.log(`Loaded ${submissions.length} submissions from ${corpusDir}`);

  const postResponse = await fetch(`${API_BASE_URL}/api/v1/analyses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
    body: JSON.stringify({ submissions }),
  });

  if (postResponse.status !== 202) {
    const body = await postResponse.text();
    throw new Error(`POST /analyses failed: ${postResponse.status} ${body}`);
  }

  const { analysisId } = (await postResponse.json()) as { analysisId: string };
  console.log(`Analysis created: ${analysisId}`);

  const start = Date.now();
  const timeoutMs = 60_000;
  for (;;) {
    const getResponse = await fetch(`${API_BASE_URL}/api/v1/analyses/${analysisId}`, {
      headers: { 'X-Api-Key': API_KEY },
    });
    const analysis = (await getResponse.json()) as { status: string; progress: number; stats: Record<string, number>; error?: string };
    console.log(`  status=${analysis.status} progress=${analysis.progress}%`);

    if (analysis.status === 'completed') {
      console.log('Analysis completed:', analysis.stats);
      return;
    }
    if (analysis.status === 'failed') {
      throw new Error(`Analysis failed: ${analysis.error}`);
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Analysis did not complete within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
