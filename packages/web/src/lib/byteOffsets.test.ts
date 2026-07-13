import { describe, expect, it } from 'vitest';
import { mapByteOffsetsToUtf16 } from './byteOffsets';

describe('mapByteOffsetsToUtf16', () => {
  it('is the identity mapping for pure ASCII (byte offsets already equal UTF-16 indices)', () => {
    const source = 'int solve(int n) { return n; }';
    const offsets = [0, 4, 10, source.length];
    expect(mapByteOffsetsToUtf16(source, offsets)).toEqual(offsets);
  });

  it('handles a 2-byte UTF-8 character (é, U+00E9) before the target offset', () => {
    // "café " -> c(1) a(1) f(1) é(2 bytes, 1 UTF-16 unit) (space)(1) = 6 bytes, 5 UTF-16 units
    const source = 'café solve()';
    // byte offset of 's' in "solve": "café " is 6 bytes -> 's' starts at byte 6
    const byteOfS = Buffer.byteLength('café ', 'utf8');
    expect(byteOfS).toBe(6);
    const [utf16Index] = mapByteOffsetsToUtf16(source, [byteOfS]);
    expect(source.slice(utf16Index)).toBe('solve()');
    // UTF-16 index is 5 (not 6) because é is 1 UTF-16 unit but 2 bytes.
    expect(utf16Index).toBe(5);
  });

  it('handles a 3-byte UTF-8 character (CJK, 中) before the target offset', () => {
    const source = '中solve()';
    const byteLen = Buffer.byteLength('中', 'utf8');
    expect(byteLen).toBe(3);
    const [utf16Index] = mapByteOffsetsToUtf16(source, [byteLen]);
    expect(source.slice(utf16Index)).toBe('solve()');
    expect(utf16Index).toBe(1); // 1 UTF-16 unit, despite being 3 bytes
  });

  it('handles a 4-byte UTF-8 character (emoji, surrogate pair) before the target offset', () => {
    const emoji = '😀'; // U+1F600, 4 bytes UTF-8, 2 UTF-16 code units
    expect(emoji.length).toBe(2);
    const source = `${emoji}solve()`;
    const byteLen = Buffer.byteLength(emoji, 'utf8');
    expect(byteLen).toBe(4);
    const [utf16Index] = mapByteOffsetsToUtf16(source, [byteLen]);
    expect(source.slice(utf16Index)).toBe('solve()');
    expect(utf16Index).toBe(2); // 2 UTF-16 units (surrogate pair), despite 4 bytes
  });

  it('handles offset 0 and offset === full byte length', () => {
    const source = 'ab中c'; // a(1) b(1) 中(3) c(1) = 6 bytes, 4 UTF-16 units
    const fullByteLength = Buffer.byteLength(source, 'utf8');
    expect(fullByteLength).toBe(6);
    const [start, end] = mapByteOffsetsToUtf16(source, [0, fullByteLength]);
    expect(start).toBe(0);
    expect(end).toBe(source.length);
  });

  it('falls back to the nearest lower boundary for an off-boundary offset rather than throwing', () => {
    // 中 occupies bytes [0,3) and UTF-16 index [0,1). Byte offset 1 or 2
    // lands mid-character - not something the real tokenizer would ever
    // produce, but the mapping must not crash or corrupt on it.
    const source = '中solve()';
    expect(() => mapByteOffsetsToUtf16(source, [1])).not.toThrow();
    expect(() => mapByteOffsetsToUtf16(source, [2])).not.toThrow();
    // Both snap down to the last real boundary at byte 0 / utf16 0.
    expect(mapByteOffsetsToUtf16(source, [1])).toEqual([0]);
    expect(mapByteOffsetsToUtf16(source, [2])).toEqual([0]);
  });

  it('handles multiple offsets and an empty source', () => {
    expect(mapByteOffsetsToUtf16('', [0])).toEqual([0]);
    const source = 'héllo wörld';
    const fullByteLength = Buffer.byteLength(source, 'utf8');
    const mapped = mapByteOffsetsToUtf16(source, [0, fullByteLength]);
    expect(mapped[0]).toBe(0);
    // é and ö are each 2 bytes / 1 UTF-16 unit, so the UTF-16 end index is
    // shorter than the byte length, but still lands exactly at the end
    // of the string.
    expect(mapped[1]).toBe(source.length);
    expect(source.slice(mapped[1]!)).toBe('');
  });
});
