import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { tokenizeCpp } from '../src/tokenize/cpp.js';
import { tokenizePython } from '../src/tokenize/python.js';
import { CPP_KEYWORDS, PYTHON_KEYWORDS } from '../src/tokenize/normalize.js';
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
