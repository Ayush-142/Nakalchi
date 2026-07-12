export const CORE_PLACEHOLDER = true;

export type { Language, Token, TokenType, Hash64, Fingerprint } from './types.js';
export type { Tokenizer } from './tokenize/Tokenizer.js';
export { tokenizeCpp } from './tokenize/cpp.js';
export { tokenizePython } from './tokenize/python.js';
export { DEFAULT_K, DEFAULT_W } from './config.js';
export { fingerprint } from './pipeline.js';
export type { FingerprintParams } from './pipeline.js';
