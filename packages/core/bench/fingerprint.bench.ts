/**
 * Phase 2 perf gate: fingerprint 1,000 synthetic ~200-line submissions,
 * single-threaded, must complete < 10s. Run manually (per ARCHITECTURE.md
 * §6 - benchmarks run manually, not on every CI push), real numbers pasted
 * into the phase report, not asserted inside the vitest suite.
 */
import { fingerprint } from '../src/pipeline.js';

function generateSubmission(seed: number): string {
  const lines: string[] = ['#include <bits/stdc++.h>', 'using namespace std;', 'int main() {'];
  for (let i = 0; i < 200; i++) {
    const a = (seed + i) % 97;
    const b = (seed * 3 + i * 7) % 53;
    lines.push(`    int x${i} = ${a} + ${b} * ${i};`);
  }
  lines.push('    return 0;', '}');
  return lines.join('\n');
}

const SUBMISSION_COUNT = 1000;
const submissions = Array.from({ length: SUBMISSION_COUNT }, (_, i) => generateSubmission(i + 1));

const start = performance.now();
let totalFingerprints = 0;
for (const source of submissions) {
  totalFingerprints += fingerprint(source, 'cpp').length;
}
const elapsedMs = performance.now() - start;

console.log(
  `Fingerprinted ${SUBMISSION_COUNT} synthetic ~200-line submissions in ${elapsedMs.toFixed(1)} ms ` +
    `(${(elapsedMs / 1000).toFixed(2)}s), ${totalFingerprints} total fingerprints.`,
);
console.log(elapsedMs < 10_000 ? 'PASS: under the 10s perf gate.' : 'FAIL: exceeds the 10s perf gate.');
