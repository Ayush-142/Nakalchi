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
