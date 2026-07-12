export type Language = 'cpp' | 'python';

export type TokenType =
  | 'Keyword'
  | 'Identifier'
  | 'Number'
  | 'String'
  | 'Char'
  | 'Punct'
  | 'Preproc'
  | 'Raw';

export interface Token {
  type: TokenType;
  /** The value Phase 2 hashes: 'IDENT' | 'NUM' | 'STR' | 'RAW', or the literal text for Keyword/Punct/Preproc. */
  norm: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column, counted per Unicode code point. */
  col: number;
  /** UTF-8 byte offset, inclusive. */
  startByte: number;
  /** UTF-8 byte offset, exclusive. */
  endByte: number;
}
