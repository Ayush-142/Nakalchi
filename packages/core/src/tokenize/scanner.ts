/**
 * Shared scanning primitives used by both the C++ and Python hand-written
 * lexers. Tracks position three ways at once: a JS string index (for
 * actual character access), a line/col pair (per Unicode code point, not
 * UTF-16 code unit), and a running UTF-8 byte offset (what Token exposes).
 */
export class Scanner {
  private readonly source: string;
  private pos = 0;
  line = 1;
  col = 1;
  byteOffset = 0;

  constructor(source: string) {
    this.source = source;
  }

  isAtEnd(offset = 0): boolean {
    return this.pos + offset >= this.source.length;
  }

  /** Peek a single UTF-16 code unit ahead; fine for comparing against ASCII delimiters. */
  peek(offset = 0): string {
    const idx = this.pos + offset;
    return idx < this.source.length ? this.source[idx]! : '';
  }

  advance(): string {
    const idx = this.pos;
    const codePoint = this.source.codePointAt(idx);
    if (codePoint === undefined) return '';
    const ch = String.fromCodePoint(codePoint);
    this.pos += ch.length;
    this.byteOffset += utf8Length(codePoint);
    if (ch === '\n') {
      this.line += 1;
      this.col = 1;
    } else {
      this.col += 1;
    }
    return ch;
  }
}

function utf8Length(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

export function isIdentStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

export function isIdentPart(c: string): boolean {
  return isIdentStart(c) || isDigit(c);
}

/** True if the scanner is positioned exactly at the start of `text`. */
export function matchesAhead(s: Scanner, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (s.peek(i) !== text[i]) return false;
  }
  return true;
}

/** Consumes an identifier-shaped run (caller has already confirmed isIdentStart on the first char). */
export function scanIdentifierText(s: Scanner): string {
  let text = '';
  while (!s.isAtEnd() && isIdentPart(s.peek())) {
    text += s.advance();
  }
  return text;
}

/** Consumes to end of line (or EOF); used for both `//` and `#` line comments. */
export function scanToLineEnd(s: Scanner): void {
  while (!s.isAtEnd() && s.peek() !== '\n') {
    s.advance();
  }
}

/**
 * Builds a maximal-munch matcher over a fixed operator/punctuation list.
 * The list must already be sorted longest-first so e.g. "<<=" is tried
 * before "<<" before "<".
 */
export function makeOperatorMatcher(sortedOperators: readonly string[]) {
  return (s: Scanner): string | null => {
    for (const op of sortedOperators) {
      if (matchesAhead(s, op)) return op;
    }
    return null;
  };
}

export function sortByLengthDescending(operators: readonly string[]): string[] {
  return [...operators].sort((a, b) => b.length - a.length);
}
