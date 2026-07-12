import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { tokenizeCpp } from '../src/tokenize/cpp.js';
import { tokenizePython } from '../src/tokenize/python.js';
import { CPP_KEYWORDS, PYTHON_KEYWORDS } from '../src/tokenize/normalize.js';
import { computeKGramHashes } from '../src/fingerprint/rollingHash.js';
import { winnow } from '../src/fingerprint/winnow.js';
import { DEFAULT_K, DEFAULT_W } from '../src/config.js';
import type { Token } from '../src/types.js';
import type { Tokenizer } from '../src/tokenize/Tokenizer.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (lang: 'cpp' | 'python', name: string): string =>
  readFileSync(join(dir, 'fixtures', lang, name), 'utf8');

const IDENT_START = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('');
const IDENT_PART = (IDENT_START.join('') + '0123456789').split('');

function identifierArb(keywords: ReadonlySet<string>): fc.Arbitrary<string> {
  return fc
    .tuple(fc.constantFrom(...IDENT_START), fc.array(fc.constantFrom(...IDENT_PART), { maxLength: 8 }))
    .map(([first, rest]) => first + rest.join(''))
    .filter((name) => !keywords.has(name));
}

interface Span {
  startByte: number;
  endByte: number;
}

function identifierSpans(tokens: Token[]): Span[] {
  return tokens.filter((t) => t.type === 'Identifier').map((t) => ({ startByte: t.startByte, endByte: t.endByte }));
}

// Fixtures used here are pure ASCII, so byte offsets coincide 1:1 with JS
// string indices - splicing by startByte/endByte as if they were string
// indices is safe only because of that; it would not be for non-ASCII source.
function spliceIdentifiers(source: string, spans: Span[], replacements: readonly string[]): string {
  const ordered = spans
    .map((span, i) => ({ span, replacement: replacements[i]! }))
    .sort((a, b) => b.span.startByte - a.span.startByte);
  let result = source;
  for (const { span, replacement } of ordered) {
    result = result.slice(0, span.startByte) + replacement + result.slice(span.endByte);
  }
  return result;
}

function summarize(tokens: Token[]) {
  return tokens.map((t) => [t.type, t.norm]);
}

function checkRenameInvariance(tokenizer: Tokenizer, keywords: ReadonlySet<string>, source: string): void {
  const originalTokens = tokenizer(source);
  const spans = identifierSpans(originalTokens);
  expect(spans.length).toBeGreaterThan(0); // fixture must actually exercise identifiers

  const arb = fc.array(identifierArb(keywords), { minLength: spans.length, maxLength: spans.length });

  fc.assert(
    fc.property(arb, (replacements) => {
      const renamedSource = spliceIdentifiers(source, spans, replacements);
      const renamedSummary = summarize(tokenizer(renamedSource));
      expect(renamedSummary).toEqual(summarize(originalTokens));
    }),
    { numRuns: 1000 },
  );
}

describe('rename-invariance property', () => {
  it('C++: renaming every identifier leaves the normalized token stream unchanged', () => {
    checkRenameInvariance(tokenizeCpp, CPP_KEYWORDS, fixture('cpp', 'rename-target.cpp'));
  });

  it('Python: renaming every identifier leaves the normalized token stream unchanged', () => {
    checkRenameInvariance(tokenizePython, PYTHON_KEYWORDS, fixture('python', 'rename-target.py'));
  });
});

const K = DEFAULT_K;
const W = DEFAULT_W;
const T = W + K - 1; // guarantee threshold

const tokenArb = fc.integer({ min: 0, max: 19 }); // small synthetic vocabulary

function fingerprintKeySet(tokenIds: readonly number[]): Set<string> {
  return new Set(winnow(computeKGramHashes(tokenIds, K), W).map((f) => `${f.hash.h1}:${f.hash.h2}`));
}

describe('winnowing guarantee property', () => {
  it('any shared run >= t = w+k-1 tokens produces at least one common fingerprint (10,000 trials)', () => {
    fc.assert(
      fc.property(
        fc.array(tokenArb, { minLength: T, maxLength: T + 10 }), // shared run
        fc.array(tokenArb, { maxLength: 30 }), // prefixA
        fc.array(tokenArb, { maxLength: 30 }), // suffixA
        fc.array(tokenArb, { maxLength: 30 }), // prefixB
        fc.array(tokenArb, { maxLength: 30 }), // suffixB
        (sharedRun, prefixA, suffixA, prefixB, suffixB) => {
          const streamA = [...prefixA, ...sharedRun, ...suffixA];
          const streamB = [...prefixB, ...sharedRun, ...suffixB];

          const setA = fingerprintKeySet(streamA);
          const fpB = winnow(computeKGramHashes(streamB, K), W);

          const hasCommon = fpB.some((f) => setA.has(`${f.hash.h1}:${f.hash.h2}`));
          expect(hasCommon).toBe(true);
        },
      ),
      { numRuns: 10000 },
    );
  });
});

describe('density property', () => {
  it('selected fraction of k-grams is loosely near 2/(w+1)', () => {
    const vocabSize = 50;
    const length = 20_000;
    const tokenIds = Array.from({ length }, () => Math.floor(Math.random() * vocabSize));

    const hashes = computeKGramHashes(tokenIds, K);
    const selected = winnow(hashes, W);
    const density = selected.length / hashes.length;
    const theoretical = 2 / (W + 1);

    // Loose bounds per ARCHITECTURE.md's own framing ("loose statistical
    // bound"), not a tight confidence interval.
    expect(density).toBeGreaterThan(theoretical / 2);
    expect(density).toBeLessThan(theoretical * 1.8);
  });
});

describe('position-independence property', () => {
  it('the same core substring yields the same selected fingerprints for windows fully inside it', () => {
    const L = T + 20; // comfortably more than one window's worth of interior

    // Corrected safe range (see plan review): it's not enough for a
    // position's own k-gram to lie inside the core - whether it gets
    // SELECTED AT ALL depends on every window that could compare against
    // it, which needs an extra w-1 margin trimmed off both ends of the
    // base "k-gram fully inside" range [0, L-k].
    const lo = W - 1;
    const hi = L - K - W + 1;

    fc.assert(
      fc.property(
        fc.array(tokenArb, { minLength: L, maxLength: L }), // core
        fc.array(tokenArb, { maxLength: 30 }), // prefixA
        fc.array(tokenArb, { maxLength: 30 }), // suffixA
        fc.array(tokenArb, { maxLength: 30 }), // prefixB
        fc.array(tokenArb, { maxLength: 30 }), // suffixB
        (core, prefixA, suffixA, prefixB, suffixB) => {
          const offsetA = prefixA.length;
          const offsetB = prefixB.length;

          const streamA = [...prefixA, ...core, ...suffixA];
          const streamB = [...prefixB, ...core, ...suffixB];

          const fpA = winnow(computeKGramHashes(streamA, K), W);
          const fpB = winnow(computeKGramHashes(streamB, K), W);

          const relativeKeySet = (fps: typeof fpA, offset: number) =>
            new Set(
              fps
                .filter((f) => f.position >= offset + lo && f.position <= offset + hi)
                .map((f) => `${f.position - offset}:${f.hash.h1}:${f.hash.h2}`),
            );

          expect(relativeKeySet(fpB, offsetB)).toEqual(relativeKeySet(fpA, offsetA));
        },
      ),
      { numRuns: 1000 },
    );
  });
});
