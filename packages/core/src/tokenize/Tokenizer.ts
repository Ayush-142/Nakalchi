import type { Token } from '../types.js';

export type Tokenizer = (source: string) => Token[];
