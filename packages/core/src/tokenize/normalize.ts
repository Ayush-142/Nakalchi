export const NORM_IDENT = 'IDENT';
export const NORM_NUM = 'NUM';
export const NORM_STR = 'STR';
export const NORM_RAW = 'RAW';

// Practical C++11-20 reserved-word set for competitive code. Not the full
// standard's exhaustive list (e.g. rarely-seen alternative tokens like
// `atomic_cancel` are omitted) - extend here, never in cpp.ts, if a real
// fixture needs one that's missing.
export const CPP_KEYWORDS: ReadonlySet<string> = new Set([
  'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor', 'bool', 'break',
  'case', 'catch', 'char', 'char8_t', 'char16_t', 'char32_t', 'class', 'compl', 'concept',
  'const', 'consteval', 'constexpr', 'constinit', 'const_cast', 'continue', 'co_await',
  'co_return', 'co_yield', 'decltype', 'default', 'delete', 'do', 'double', 'dynamic_cast',
  'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto',
  'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq',
  'nullptr', 'operator', 'or', 'or_eq', 'private', 'protected', 'public', 'register',
  'reinterpret_cast', 'requires', 'return', 'short', 'signed', 'sizeof', 'static',
  'static_assert', 'static_cast', 'struct', 'switch', 'template', 'this', 'thread_local',
  'throw', 'true', 'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using',
  'virtual', 'void', 'volatile', 'wchar_t', 'while', 'xor', 'xor_eq',
]);

// Standard keyword.kwlist equivalent. Deliberately excludes soft keywords
// (match, case, _, type as of 3.12) - see docs/plan discussion: they're
// context-sensitive and valid as ordinary identifiers elsewhere.
export const PYTHON_KEYWORDS: ReadonlySet<string> = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
  'try', 'while', 'with', 'yield',
]);

export function classifyIdentifier(
  text: string,
  keywords: ReadonlySet<string>,
): { type: 'Keyword' | 'Identifier'; norm: string } {
  return keywords.has(text) ? { type: 'Keyword', norm: text } : { type: 'Identifier', norm: NORM_IDENT };
}

// Raw (unsorted) operator/punctuation literals. Centralized here rather
// than in cpp.ts/python.ts because Phase 2's token-interning registry
// (below) needs the full closed vocabulary, and cpp.ts/python.ts already
// import keyword sets from this module - keeping the raw lists here too
// avoids a circular import. cpp.ts/python.ts import these and apply their
// own sortByLengthDescending() for maximal-munch matching, same as before;
// this is a structural move only, tokenizer output is unchanged.
export const CPP_OPERATORS: readonly string[] = [
  '<<=', '>>=', '...', '->*', '<=>',
  '::', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '?', ':',
  ';', ',', '.', '(', ')', '{', '}', '[', ']',
];

export const PYTHON_OPERATORS: readonly string[] = [
  '**=', '//=', '<<=', '>>=', '...',
  '**', '//', '<<', '>>', '<=', '>=', '==', '!=', '->', ':=',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '@=',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '@',
  '(', ')', '[', ']', '{', '}', ':', ',', '.', ';',
];

// The ~13 real C/C++ preprocessor directives. Preproc is the one norm
// category that isn't otherwise closed (the tokenizer doesn't validate
// that a directive word is a real one) - anything outside this list falls
// back to UNKNOWN_PREPROC_ID below, mirroring the Raw escape hatch's
// "never crash, never grow unboundedly" spirit.
const KNOWN_PREPROC_DIRECTIVES: readonly string[] = [
  'define', 'undef', 'include', 'if', 'ifdef', 'ifndef', 'else', 'elif', 'endif',
  'line', 'error', 'warning', 'pragma',
].map((word) => '#' + word);

// Closed, deterministic token-interning registry for Phase 2's rolling
// hash. Built once at module load, sorted alphabetically for a canonical
// order independent of insertion/call order - this is what makes interning
// safe across separate fingerprint() calls: the same norm string always
// gets the same id, whichever submission it came from or whatever order
// distinct norms first appeared in. See config.ts for why the resulting
// id range (well under 1,000) keeps the rolling-hash arithmetic safe.
const CLOSED_VOCABULARY: readonly string[] = Array.from(
  new Set([
    NORM_IDENT,
    NORM_NUM,
    NORM_STR,
    NORM_RAW,
    ...CPP_KEYWORDS,
    ...PYTHON_KEYWORDS,
    ...CPP_OPERATORS,
    ...PYTHON_OPERATORS,
    ...KNOWN_PREPROC_DIRECTIVES,
  ]),
).sort();

const TOKEN_ID_BY_NORM: ReadonlyMap<string, number> = new Map(
  CLOSED_VOCABULARY.map((norm, i) => [norm, i]),
);

// Fallback bucket for a Preproc norm outside KNOWN_PREPROC_DIRECTIVES
// (e.g. a non-standard or malformed directive word).
const UNKNOWN_PREPROC_ID = CLOSED_VOCABULARY.length;

export function internNorm(norm: string): number {
  return TOKEN_ID_BY_NORM.get(norm) ?? UNKNOWN_PREPROC_ID;
}
