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

/** A pair of independent polynomial-hash values ("double hashing" - see config.ts). */
export interface Hash64 {
  h1: number;
  h2: number;
}

export interface Fingerprint {
  hash: Hash64;
  /**
   * 0-based index into the Token[] stream the k-gram starts at. For byte
   * offsets, look up tokens[position].startByte / tokens[position + k -
   * 1].endByte - not duplicated here.
   */
  position: number;
}
