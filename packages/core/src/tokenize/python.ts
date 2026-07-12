import type { Token } from '../types.js';
import type { Tokenizer } from './Tokenizer.js';
import {
  Scanner,
  isDigit,
  isIdentStart,
  scanIdentifierText,
  scanToLineEnd,
  makeOperatorMatcher,
  sortByLengthDescending,
} from './scanner.js';
import { PYTHON_KEYWORDS, NORM_NUM, NORM_RAW, NORM_STR, classifyIdentifier } from './normalize.js';

const PYTHON_OPERATORS_SORTED = sortByLengthDescending([
  '**=', '//=', '<<=', '>>=', '...',
  '**', '//', '<<', '>>', '<=', '>=', '==', '!=', '->', ':=',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '@=',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '@',
  '(', ')', '[', ']', '{', '}', ':', ',', '.', ';',
]);
const matchPythonOperator = makeOperatorMatcher(PYTHON_OPERATORS_SORTED);

interface Pos {
  line: number;
  col: number;
  startByte: number;
}

function mark(s: Scanner): Pos {
  return { line: s.line, col: s.col, startByte: s.byteOffset };
}

function isStringPrefixLetter(c: string): boolean {
  return /[rRfFbBuU]/.test(c);
}

interface StringStart {
  prefix: string;
  quote: string;
  triple: boolean;
}

function detectStringStart(s: Scanner): StringStart | null {
  let offset = 0;
  let prefix = '';
  while (prefix.length < 2 && isStringPrefixLetter(s.peek(offset))) {
    prefix += s.peek(offset);
    offset++;
  }
  const q = s.peek(offset);
  if (q === '"' || q === "'") {
    const triple = s.peek(offset + 1) === q && s.peek(offset + 2) === q;
    return { prefix, quote: q, triple };
  }
  return null;
}

/** Skips a nested string literal inside an f-string's {expr} (simple form - no prefixes/triples). */
function skipNestedString(s: Scanner, quote: string): void {
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
      return;
    }
    if (c === '\n') return; // don't hang on an unterminated inner string
    s.advance();
  }
}

/**
 * Scans the body of a string (after any prefix/opening quote has been
 * consumed by the caller). For f-strings, tracks {expr} brace depth so
 * interior braces/quotes don't get confused with the literal's own
 * boundary; doubled {{ }} are literal braces, not expression starts.
 * Returns true if the string closed properly, false if EOF was hit first.
 */
function scanStringBody(s: Scanner, quote: string, isFString: boolean, triple: boolean): boolean {
  let depth = 0;
  while (!s.isAtEnd()) {
    const c = s.peek();
    if (depth === 0) {
      if (triple) {
        if (c === quote && s.peek(1) === quote && s.peek(2) === quote) {
          s.advance();
          s.advance();
          s.advance();
          return true;
        }
      } else {
        if (c === quote) {
          s.advance();
          return true;
        }
        if (c === '\n') return false;
      }
      if (c === '\\') {
        s.advance();
        if (!s.isAtEnd()) s.advance();
        continue;
      }
      if (isFString && c === '{') {
        if (s.peek(1) === '{') {
          s.advance();
          s.advance();
          continue;
        }
        s.advance();
        depth = 1;
        continue;
      }
      if (isFString && c === '}' && s.peek(1) === '}') {
        s.advance();
        s.advance();
        continue;
      }
      s.advance();
    } else {
      if (c === '{') {
        s.advance();
        depth++;
        continue;
      }
      if (c === '}') {
        s.advance();
        depth--;
        continue;
      }
      if (c === '"' || c === "'") {
        skipNestedString(s, c);
        continue;
      }
      s.advance();
    }
  }
  return false;
}

function scanPythonString(s: Scanner, tokens: Token[], info: StringStart): void {
  const p = mark(s);
  for (let i = 0; i < info.prefix.length; i++) s.advance();
  const isFString = /f/i.test(info.prefix);
  if (info.triple) {
    s.advance();
    s.advance();
    s.advance();
  } else {
    s.advance();
  }
  const ok = scanStringBody(s, info.quote, isFString, info.triple);
  tokens.push({
    type: ok ? 'String' : 'Raw',
    norm: ok ? NORM_STR : NORM_RAW,
    line: p.line,
    col: p.col,
    startByte: p.startByte,
    endByte: s.byteOffset,
  });
}

// Permissive maximal-munch, mirroring cpp.ts's scanNumber: digits, ASCII
// letters (hex digits, e/E exponent, j/J complex suffix), '.', and '_'
// separators, plus a +/- immediately after an exponent marker.
function scanNumber(s: Scanner): void {
  let last = '';
  while (!s.isAtEnd()) {
    const c = s.peek();
    if (isDigit(c) || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '.' || c === '_') {
      last = s.advance();
    } else if ((c === '+' || c === '-') && (last === 'e' || last === 'E')) {
      last = s.advance();
    } else {
      break;
    }
  }
}

export const tokenizePython: Tokenizer = (source) => {
  const tokens: Token[] = [];
  const s = new Scanner(source);

  while (!s.isAtEnd()) {
    // Whitespace and newlines are skipped uniformly - indentation is
    // intentionally never tokenized (see ARCHITECTURE.md / notes).
    while (!s.isAtEnd() && ' \t\r\n\v\f'.includes(s.peek())) {
      s.advance();
    }
    if (s.isAtEnd()) break;

    const ch = s.peek();

    if (ch === '#') {
      scanToLineEnd(s);
      continue;
    }

    const strInfo = detectStringStart(s);
    if (strInfo) {
      scanPythonString(s, tokens, strInfo);
      continue;
    }

    if (isIdentStart(ch)) {
      const p = mark(s);
      const text = scanIdentifierText(s);
      const { type, norm } = classifyIdentifier(text, PYTHON_KEYWORDS);
      tokens.push({ type, norm, line: p.line, col: p.col, startByte: p.startByte, endByte: s.byteOffset });
      continue;
    }

    if (isDigit(ch) || (ch === '.' && isDigit(s.peek(1)))) {
      const p = mark(s);
      scanNumber(s);
      tokens.push({ type: 'Number', norm: NORM_NUM, line: p.line, col: p.col, startByte: p.startByte, endByte: s.byteOffset });
      continue;
    }

    const op = matchPythonOperator(s);
    if (op) {
      const p = mark(s);
      for (let i = 0; i < op.length; i++) s.advance();
      tokens.push({ type: 'Punct', norm: op, line: p.line, col: p.col, startByte: p.startByte, endByte: s.byteOffset });
      continue;
    }

    const p = mark(s);
    s.advance();
    tokens.push({ type: 'Raw', norm: NORM_RAW, line: p.line, col: p.col, startByte: p.startByte, endByte: s.byteOffset });
  }

  return tokens;
};
