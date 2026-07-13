/**
 * MatchRegion's aStart/aEnd/bStart/bEnd (packages/core/src/match/regions.ts)
 * are UTF-8 BYTE offsets, taken straight from Token.startByte/endByte -
 * confirmed by reading regions.ts directly, not inferred. JS strings index
 * by UTF-16 code unit, so slicing/rendering at a raw byte offset is wrong
 * wherever a multi-byte UTF-8 character appears before it.
 *
 * The corpus and every fixture are pure ASCII today (verified directly),
 * so offsets happen to equal UTF-16 indices in the current demo - but
 * that's incidental, not something the type contract guarantees, so this
 * mapping is implemented for real rather than assumed away.
 */

interface Breakpoint {
  byte: number;
  utf16: number;
}

function utf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function buildBreakpoints(source: string): Breakpoint[] {
  const breakpoints: Breakpoint[] = [{ byte: 0, utf16: 0 }];
  let byte = 0;
  let utf16 = 0;
  // for...of iterates by Unicode code point, correctly grouping surrogate
  // pairs - `ch.length` is then 1 or 2 UTF-16 units for that one code point.
  for (const ch of source) {
    byte += utf8ByteLength(ch.codePointAt(0)!);
    utf16 += ch.length;
    breakpoints.push({ byte, utf16 });
  }
  return breakpoints;
}

/**
 * Finds the UTF-16 index for a target byte offset. Token boundaries from
 * the tokenizer always land on code-point boundaries, so `breakpoints`
 * should always contain an exact match. Documented safe fallback: if a
 * target doesn't land exactly on a boundary (malformed input, or a future
 * non-ASCII edge case), snap to the nearest boundary strictly below it
 * rather than throwing or slicing mid-character - worst case a highlight
 * is off by a character or two, never a crash or a garbled render.
 */
function resolveOffset(breakpoints: Breakpoint[], target: number): number {
  let lo = 0;
  let hi = breakpoints.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const bp = breakpoints[mid]!;
    if (bp.byte === target) return bp.utf16;
    if (bp.byte < target) lo = mid + 1;
    else hi = mid - 1;
  }
  const fallbackIndex = Math.max(0, hi);
  return breakpoints[fallbackIndex]!.utf16;
}

export function mapByteOffsetsToUtf16(source: string, byteOffsets: number[]): number[] {
  const breakpoints = buildBreakpoints(source);
  return byteOffsets.map((offset) => resolveOffset(breakpoints, offset));
}
