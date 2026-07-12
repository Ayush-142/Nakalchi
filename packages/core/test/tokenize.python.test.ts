import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokenizePython } from '../src/tokenize/python.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(dir, 'fixtures', 'python', name), 'utf8');

function summarize(source: string) {
  return tokenizePython(source).map((t) => [t.type, t.norm]);
}

describe('tokenizePython golden fixtures', () => {
  it('# comments produce zero tokens', () => {
    expect(summarize(fixture('comments.py'))).toEqual([
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['Number', 'NUM'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['Number', 'NUM'],
    ]);
  });

  it('single/double/triple-quoted strings, including one spanning multiple lines', () => {
    expect(summarize(fixture('strings.py'))).toEqual([
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['String', 'STR'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['String', 'STR'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['String', 'STR'],
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['String', 'STR'],
    ]);
  });

  it('f-strings collapse to one String token, including nested braces', () => {
    expect(summarize(fixture('fstrings.py'))).toEqual([
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['String', 'STR'], // "world"
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['String', 'STR'], // f"hello {name}!"
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['String', 'STR'], // f"{ {1: 2}[1] }"
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['String', 'STR'], // f"{{not interp}}"
    ]);
  });

  it('numeric literals: decimal/float/hex/octal/binary/underscore/imaginary/exponent', () => {
    expect(summarize(fixture('numbers.py'))).toEqual(
      Array.from({ length: 8 }, () => [
        ['Identifier', 'IDENT'],
        ['Punct', '='],
        ['Number', 'NUM'],
      ]).flat(),
    );
  });

  it('indentation is never tokenized', () => {
    expect(summarize(fixture('indentation.py'))).toEqual([
      ['Keyword', 'def'],
      ['Identifier', 'IDENT'], // f
      ['Punct', '('],
      ['Identifier', 'IDENT'], // n
      ['Punct', ')'],
      ['Punct', ':'],
      ['Keyword', 'if'],
      ['Identifier', 'IDENT'], // n
      ['Punct', '<='],
      ['Number', 'NUM'],
      ['Punct', ':'],
      ['Keyword', 'return'],
      ['Identifier', 'IDENT'], // n
      ['Keyword', 'return'],
      ['Identifier', 'IDENT'], // f
      ['Punct', '('],
      ['Identifier', 'IDENT'], // n
      ['Punct', '-'],
      ['Number', 'NUM'],
      ['Punct', ')'],
      ['Punct', '+'],
      ['Identifier', 'IDENT'], // f
      ['Punct', '('],
      ['Identifier', 'IDENT'], // n
      ['Punct', '-'],
      ['Number', 'NUM'],
      ['Punct', ')'],
    ]);
  });

  it('an unsupported byte becomes a Raw token, not a crash', () => {
    expect(summarize(fixture('raw-fallback.py'))).toEqual([
      ['Identifier', 'IDENT'],
      ['Punct', '='],
      ['Number', 'NUM'],
      ['Raw', 'RAW'],
      ['Number', 'NUM'],
    ]);
  });
});
