import type { Token } from '../types.js';
import type { Tokenizer } from './Tokenizer.js';
import {
  Scanner,
  isDigit,
  isIdentStart,
  matchesAhead,
  scanIdentifierText,
  scanToLineEnd,
  makeOperatorMatcher,
  sortByLengthDescending,
} from './scanner.js';
import { CPP_KEYWORDS, NORM_NUM, NORM_RAW, NORM_STR, classifyIdentifier } from './normalize.js';

const CPP_OPERATORS_SORTED = sortByLengthDescending([
  '<<=', '>>=', '...', '->*', '<=>',
  '::', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '?', ':',
  ';', ',', '.', '(', ')', '{', '}', '[', ']',
]);
const matchCppOperator = makeOperatorMatcher(CPP_OPERATORS_SORTED);

interface Pos {
  line: number;
  col: number;
  startByte: number;
}

function mark(s: Scanner): Pos {
  return { line: s.line, col: s.col, startByte: s.byteOffset };
}

function pushRaw(tokens: Token[], p: Pos, s: Scanner): void {
  tokens.push({ type: 'Raw', norm: NORM_RAW, line: p.line, col: p.col, startByte: p.startByte, endByte: s.byteOffset });
}

function scanBlockComment(s: Scanner, tokens: Token[]): void {
  const p = mark(s);
  s.advance();
  s.advance(); // '/*'
  while (!s.isAtEnd()) {
    if (s.peek() === '*' && s.peek(1) === '/') {
      s.advance();
      s.advance();
      return;
    }
    s.advance();
  }
  pushRaw(tokens, p, s); // unterminated block comment -> Raw to EOF
}

function scanRawString(s: Scanner, tokens: Token[]): void {
  const p = mark(s);
  s.advance(); // 'R'
  s.advance(); // '"'
  let delim = '';
  while (!s.isAtEnd() && s.peek() !== '(') {
    delim += s.advance();
  }
  if (s.isAtEnd()) {
    pushRaw(tokens, p, s);
    return;
  }
  s.advance(); // '('
  const closer = ')' + delim + '"';
  while (!s.isAtEnd()) {
    if (s.peek() === ')' && matchesAhead(s, closer)) {
      for (let i = 0; i < closer.length; i++) s.advance();
      tokens.push({ type: 'String', norm: NORM_STR, line: p.line, col: p.col, startByte: p.startByte, endByte: s.byteOffset });
      return;
    }
    s.advance();
  }
  pushRaw(tokens, p, s); // unterminated raw string -> Raw to EOF
}

function scanQuoted(s: Scanner, tokens: Token[], quote: string, type: 'String' | 'Char'): void {
  const p = mark(s);
  s.advance(); // opening quote
  while (!s.isAtEnd()) {
    const c = s.peek();
    if (c === '\\') {
      s.advance();
      if (!s.isAtEnd()) s.advance();
      continue;
    }
    if (c === quote) {
      s.advance();
      tokens.push({ type, norm: NORM_STR, line: p.line, col: p.col, startByte: p.startByte, endByte: s.byteOffset });
      return;
    }
    if (c === '\n') break; // unterminated on this line
    s.advance();
  }
  pushRaw(tokens, p, s);
}

// Permissive maximal-munch: consumes digits/letters/./' greedily, plus a
// +/- immediately after an exponent marker (1e+10, 0x1p-3). This over-accepts
// invalid lexemes like "1abc" as a single Number, which is fine - our job is
// to never crash and to be stable on real (valid) competitive-code input,
// not to validate C++ grammar.
function scanNumber(s: Scanner): void {
  let last = '';
  while (!s.isAtEnd()) {
    const c = s.peek();
    if (isDigit(c) || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '.' || c === "'") {
      last = s.advance();
    } else if ((c === '+' || c === '-') && (last === 'e' || last === 'E' || last === 'p' || last === 'P')) {
      last = s.advance();
    } else {
      break;
    }
  }
}

function consumeHashAndDirective(s: Scanner): { word: string; p: Pos } {
  const p = mark(s);
  s.advance(); // '#'
  while (!s.isAtEnd() && (s.peek() === ' ' || s.peek() === '\t')) s.advance();
  let word = '';
  while (!s.isAtEnd() && /[A-Za-z_]/.test(s.peek())) {
    word += s.advance();
  }
  return { word, p };
}

export const tokenizeCpp: Tokenizer = (source) => {
  const tokens: Token[] = [];
  const s = new Scanner(source);
  let atLineStart = true;

  while (!s.isAtEnd()) {
    // whitespace / newlines
    let sawNewline = false;
    while (!s.isAtEnd() && ' \t\r\n\v\f'.includes(s.peek())) {
      if (s.peek() === '\n') sawNewline = true;
      s.advance();
    }
    if (sawNewline) atLineStart = true;
    if (s.isAtEnd()) break;

    const ch = s.peek();

    if (ch === '/' && s.peek(1) === '/') {
      scanToLineEnd(s);
      continue;
    }
    if (ch === '/' && s.peek(1) === '*') {
      scanBlockComment(s, tokens);
      atLineStart = false;
      continue;
    }
    if (ch === '#' && atLineStart) {
      const { word, p } = consumeHashAndDirective(s);
      if (word === 'include') {
        scanToLineEnd(s);
      } else {
        tokens.push({ type: 'Preproc', norm: '#' + word, line: p.line, col: p.col, startByte: p.startByte, endByte: s.byteOffset });
      }
      atLineStart = false;
      continue;
    }
    if (ch === 'R' && s.peek(1) === '"') {
      scanRawString(s, tokens);
      atLineStart = false;
      continue;
    }
    if (isIdentStart(ch)) {
      const p = mark(s);
      const text = scanIdentifierText(s);
      const { type, norm } = classifyIdentifier(text, CPP_KEYWORDS);
      tokens.push({ type, norm, line: p.line, col: p.col, startByte: p.startByte, endByte: s.byteOffset });
      atLineStart = false;
      continue;
    }
    if (isDigit(ch) || (ch === '.' && isDigit(s.peek(1)))) {
      const p = mark(s);
      scanNumber(s);
      tokens.push({ type: 'Number', norm: NORM_NUM, line: p.line, col: p.col, startByte: p.startByte, endByte: s.byteOffset });
      atLineStart = false;
      continue;
    }
    if (ch === '"') {
      scanQuoted(s, tokens, '"', 'String');
      atLineStart = false;
      continue;
    }
    if (ch === "'") {
      scanQuoted(s, tokens, "'", 'Char');
      atLineStart = false;
      continue;
    }
    const op = matchCppOperator(s);
    if (op) {
      const p = mark(s);
      for (let i = 0; i < op.length; i++) s.advance();
      tokens.push({ type: 'Punct', norm: op, line: p.line, col: p.col, startByte: p.startByte, endByte: s.byteOffset });
      atLineStart = false;
      continue;
    }

    const p = mark(s);
    s.advance();
    pushRaw(tokens, p, s);
    atLineStart = false;
  }

  return tokens;
};
