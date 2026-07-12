/**
 * ARCHITECTURE.md §5 Phase 3 item 1's own test: "inject a shared fast-IO
 * template into all fixture solutions; assert zero flagged pairs among
 * genuine solutions, while planted plagiarism pairs still flag."
 *
 * These are hand-written SYNTHETIC test fixtures, not real corpus data -
 * this is a mechanism test (does elimination correctly drop an
 * over-frequent hash while genuine matches still flag), not an evaluative
 * claim about real-world detection accuracy, so synthetic snippets are
 * legitimate here (unlike the blocked corpus-level test in
 * test/pipeline.test.ts, which needs real independently-authored
 * solutions and is deferred until that corpus exists).
 *
 * k/w are overridden small (5/2) so the shared template's ~9-token prefix
 * ("using namespace std ; int main ( ) {" - note #include is dropped
 * entirely by the tokenizer, contributing zero tokens) forms several
 * complete k-grams on its own, making the elimination mechanism's effect
 * observable without needing very long fixtures.
 */
import { describe, expect, it } from 'vitest';
import { analyzeCorpus } from '../src/pipeline.js';
import type { SubmissionInput } from '../src/types.js';

const TEMPLATE_HEADER = `#include <bits/stdc++.h>\nusing namespace std;\nint main() {`;
const TEMPLATE_FOOTER = `    return 0;\n}`;

function wrap(body: string): string {
  return `${TEMPLATE_HEADER}\n${body}\n${TEMPLATE_FOOTER}`;
}

// Three genuinely different, independently-written short solutions,
// all sharing the identical template header/footer.
const genuineA = wrap('    int a = 5;\n    int b = 10;\n    cout << a + b;');
const genuineB = wrap('    int x = 1;\n    while (x < 100) { x = x * 2; }\n    cout << x;');
const genuineC = wrap('    int sum = 0;\n    for (int i = 0; i < 3; i++) { sum += i; }\n    cout << sum;');

// A planted plagiarism pair: genuineA's body copied with renamed
// identifiers (a->p, b->q). Normalization collapses identifier names
// regardless (Phase 1's rename-invariance), so this produces the same
// normalized token stream as genuineA's body.
const plagiarized = wrap('    int p = 5;\n    int q = 10;\n    cout << p + q;');

const submissions: SubmissionInput[] = [
  { id: 'genuineA', language: 'cpp', source: genuineA },
  { id: 'genuineB', language: 'cpp', source: genuineB },
  { id: 'genuineC', language: 'cpp', source: genuineC },
  { id: 'plagiarized', language: 'cpp', source: plagiarized },
];

describe('base-code elimination mechanism (synthetic fixtures)', () => {
  it('WITHOUT elimination, the shared template alone can falsely inflate genuine-pair similarity', () => {
    // basecodeMaxFreq > 1 is impossible to exceed (docFreq/N <= 1 always),
    // and a huge corpusCap - effectively disables frequency filtering, to
    // demonstrate the problem the filter exists to solve.
    const unfiltered = analyzeCorpus(submissions, {
      k: 5,
      w: 2,
      basecodeMaxFreq: 1.1,
      corpusCap: 1_000_000,
      minSharedFingerprints: 1,
      flagThreshold: 0.35,
    });

    const genuinePairs = unfiltered.pairs.filter((p) => p.a.startsWith('genuine') && p.b.startsWith('genuine'));
    const anyFalselyFlagged = genuinePairs.some((p) => p.flagged);
    expect(anyFalselyFlagged).toBe(true); // demonstrates the template alone can cause a false flag
  });

  it('WITH elimination (defaults), zero genuine pairs flag while the planted pair still does', () => {
    const result = analyzeCorpus(submissions, {
      k: 5,
      w: 2,
      minSharedFingerprints: 1,
      flagThreshold: 0.35,
      // basecodeMaxFreq/corpusCap left at config.ts defaults (0.5 / 100) -
      // the shared template appears in all 4 submissions (docFreq/N=1.0 > 0.5),
      // so it's excluded automatically, no special-casing needed.
    });

    const genuinePairs = result.pairs.filter((p) => p.a.startsWith('genuine') && p.b.startsWith('genuine'));
    expect(genuinePairs.every((p) => !p.flagged)).toBe(true);

    const plagiarismPair = result.pairs.find(
      (p) => (p.a === 'genuineA' && p.b === 'plagiarized') || (p.a === 'plagiarized' && p.b === 'genuineA'),
    );
    expect(plagiarismPair).toBeDefined();
    expect(plagiarismPair!.flagged).toBe(true);
  });
});
