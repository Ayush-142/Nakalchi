import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokenizeCpp } from '../src/tokenize/cpp.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(dir, 'fixtures', 'cpp', name), 'utf8');

function summarize(source: string) {
  return tokenizeCpp(source).map((t) => [t.type, t.norm]);
}

describe('tokenizeCpp golden fixtures', () => {
  it('comments produce zero tokens', () => {
    expect(summarize(fixture('comments.cpp'))).toEqual([
      ['Keyword', 'int'],
      ['Identifier', 'IDENT'],
      ['Punct', ';'],
      ['Keyword', 'int'],
      ['Identifier', 'IDENT'],
      ['Punct', ';'],
    ]);
  });

  it('string/char literals with escapes', () => {
    expect(summarize(fixture('strings-escapes.cpp'))).toEqual([
      ['Keyword', 'const'],
      ['Keyword', 'char'],
      ['Punct', '*'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['String', 'STR'],
      ['Punct', ';'],
      ['Keyword', 'char'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['Char', 'STR'],
      ['Punct', ';'],
      ['Keyword', 'char'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['Char', 'STR'],
      ['Punct', ';'],
    ]);
  });

  it('raw strings R"(...)" with and without a delimiter', () => {
    expect(summarize(fixture('raw-strings.cpp'))).toEqual([
      ['Keyword', 'auto'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['String', 'STR'],
      ['Punct', ';'],
      ['Keyword', 'auto'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['String', 'STR'],
      ['Punct', ';'],
    ]);
  });

  it('#include is dropped entirely; #define is tokenized', () => {
    expect(summarize(fixture('preprocessor.cpp'))).toEqual([
      // #include <bits/stdc++.h> -> zero tokens
      ['Preproc', '#define'],
      ['Identifier', 'IDENT'], // MAX
      ['Number', 'NUM'], // 100
      ['Preproc', '#define'],
      ['Identifier', 'IDENT'], // SQR
      ['Punct', '('],
      ['Identifier', 'IDENT'], // x
      ['Punct', ')'],
      ['Punct', '('],
      ['Punct', '('],
      ['Identifier', 'IDENT'], // x
      ['Punct', ')'],
      ['Punct', '*'],
      ['Punct', '('],
      ['Identifier', 'IDENT'], // x
      ['Punct', ')'],
      ['Punct', ')'],
      ['Keyword', 'int'],
      ['Identifier', 'IDENT'], // main
      ['Punct', '('],
      ['Punct', ')'],
      ['Punct', '{'],
      ['Keyword', 'return'],
      ['Identifier', 'IDENT'], // SQR
      ['Punct', '('],
      ['Identifier', 'IDENT'], // MAX
      ['Punct', ')'],
      ['Punct', ';'],
      ['Punct', '}'],
    ]);
  });

  it('digit separators do not get confused with char literals', () => {
    expect(summarize(fixture('digit-separators.cpp'))).toEqual([
      ['Keyword', 'long'],
      ['Keyword', 'long'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['Number', 'NUM'], // 1'000'000
      ['Punct', ';'],
      ['Keyword', 'int'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['Number', 'NUM'], // 0x1'FFFF
      ['Punct', ';'],
      ['Keyword', 'char'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['Char', 'STR'], // 'a'
      ['Punct', ';'],
    ]);
  });

  it('an unsupported byte becomes a Raw token, not a crash', () => {
    expect(summarize(fixture('raw-fallback.cpp'))).toEqual([
      ['Keyword', 'int'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['Number', 'NUM'],
      ['Raw', 'RAW'],
      ['Number', 'NUM'],
      ['Punct', ';'],
    ]);
  });

  it('reports plausible byte offsets on a spot-checked token', () => {
    const tokens = tokenizeCpp(fixture('raw-fallback.cpp'));
    // "int a = 1 $ 2;" -> the Raw '$' token starts at byte 10
    const raw = tokens.find((t) => t.type === 'Raw');
    expect(raw).toBeDefined();
    expect(raw!.startByte).toBe(10);
    expect(raw!.endByte).toBe(11);
    expect(raw!.line).toBe(1);
  });
});
