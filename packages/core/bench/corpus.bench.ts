/**
 * ARCHITECTURE.md §5 Phase 3 item 7: synthetic corpus generator
 * (parameterized: n submissions, plagiarism rate, template share); record
 * wall time and peak RSS for n in {100, 500, 1000}. This is explicitly a
 * PERFORMANCE-measurement generator, not a substitute for the blocked
 * accuracy test (2)/§5 item 6, which needs real independently-authored
 * solutions - see the phase plan.
 *
 * Also checks the phase's own acceptance gate: 1,000-submission analysis
 * < 60s end-to-end, single-threaded.
 *
 * RSS caveat: process.memoryUsage().rss is sampled only after each run
 * completes (a proxy for "peak so far" across the 3 successive,
 * memory-monotonic runs in this one process), not a true continuously-
 * sampled peak - good enough for a sanity-check bench, not a precision
 * profiling tool.
 */
import { analyzeCorpus } from '../src/pipeline.js';
import type { SubmissionInput } from '../src/types.js';

const TEMPLATE_LINES = [
  '#include <bits/stdc++.h>',
  'using namespace std;',
  'int main() {',
  'ios::sync_with_stdio(false);',
  'cin.tie(nullptr);',
];

// Different statement SHAPES (not just different numeric literals) -
// numbers normalize to NUM regardless of value, so varying only numbers
// (an earlier version of this generator's bug) makes every submission's
// body normalize to the identical repetitive pattern, which the base-code
// filter then (correctly) treats as 100% template, leaving nothing left
// to match on. Varying which shape gets picked per line, deterministically
// from `seed`, makes different seeds produce genuinely different
// normalized token sequences, while the same seed reproduces the same
// sequence exactly (a genuine synthetic "duplicate").
const STATEMENT_SHAPES: ((i: number, a: number, b: number) => string)[] = [
  (i, a, b) => `    int x${i} = ${a} + ${b} * ${i};`,
  (i, a, b) => `    int x${i} = ${a} - ${b};`,
  (i, a, b) => `    if (x${i} > ${a}) { x${i} = ${b}; }`,
  (i, a) => `    for (int j = 0; j < ${a}; j++) { x${i} += j; }`,
  (i, a, b) => `    x${i} = (${a} * ${b}) % 7;`,
  (i, a) => `    while (x${i} < ${a}) { x${i}++; }`,
];

function generateBody(seed: number, lineCount: number): string[] {
  let state = seed || 1;
  const nextRand = (): number => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state;
  };

  return Array.from({ length: lineCount }, (_, i) => {
    const shape = STATEMENT_SHAPES[nextRand() % STATEMENT_SHAPES.length]!;
    const a = nextRand() % 97;
    const b = nextRand() % 53;
    return shape(i, a, b);
  });
}

function generateSubmissionSource(bodySeed: number, templateShare: number, totalLines = 200): string {
  const templateLineCount = Math.round(totalLines * templateShare);
  const bodyLineCount = totalLines - templateLineCount;
  const templateBlock = Array.from(
    { length: templateLineCount },
    (_, i) => TEMPLATE_LINES[i % TEMPLATE_LINES.length]!,
  );
  const body = generateBody(bodySeed, bodyLineCount);
  return [...templateBlock, ...body, '    return 0;', '}'].join('\n');
}

function generateCorpus(n: number, plagiarismRate: number, templateShare: number): SubmissionInput[] {
  const bodySeeds: number[] = [];
  const submissions: SubmissionInput[] = [];

  for (let i = 0; i < n; i++) {
    const isPlagiarized = i > 0 && Math.random() < plagiarismRate;
    const bodySeed = isPlagiarized ? bodySeeds[Math.floor(Math.random() * bodySeeds.length)]! : i + 1;
    bodySeeds.push(bodySeed);
    submissions.push({ id: `s${i}`, language: 'cpp', source: generateSubmissionSource(bodySeed, templateShare) });
  }

  return submissions;
}

function bench(n: number): { n: number; elapsedMs: number; rssMB: number; candidatePairs: number; flagged: number } {
  const submissions = generateCorpus(n, 0.05, 0.3); // 5% plagiarism rate, 30% template share

  const start = performance.now();
  const result = analyzeCorpus(submissions);
  const elapsedMs = performance.now() - start;
  const rssMB = process.memoryUsage().rss / (1024 * 1024);

  console.log(
    `n=${n}: ${elapsedMs.toFixed(1)} ms (${(elapsedMs / 1000).toFixed(2)}s), RSS ${rssMB.toFixed(1)} MB, ` +
      `candidatePairs=${result.stats.candidatePairs}, fullPairCount=${result.stats.fullPairCount}, ` +
      `flagged=${result.pairs.filter((p) => p.flagged).length}`,
  );

  return { n, elapsedMs, rssMB, candidatePairs: result.stats.candidatePairs, flagged: result.pairs.filter((p) => p.flagged).length };
}

const results = [100, 500, 1000].map(bench);

const at1000 = results.find((r) => r.n === 1000)!;
console.log(
  at1000.elapsedMs < 60_000
    ? `\nPASS: 1,000-submission analysis (${(at1000.elapsedMs / 1000).toFixed(2)}s) is under the 60s acceptance gate.`
    : `\nFAIL: 1,000-submission analysis (${(at1000.elapsedMs / 1000).toFixed(2)}s) exceeds the 60s acceptance gate.`,
);
