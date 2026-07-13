/**
 * Turns a (possibly overlapping, possibly adjacent) set of match regions
 * into a flat, non-overlapping partition of the source string, each piece
 * tagged with which region(s) cover it. This is the only correct way to
 * render overlapping regions as DOM spans - naively wrapping each region
 * in its own tag produces invalid overlapping markup the moment two
 * regions overlap.
 *
 * Operates purely on already UTF-16-mapped `[start, end)` positions (see
 * byteOffsets.ts) - decoupled from byte offsets entirely so each piece of
 * logic is independently testable.
 */

export interface HighlightRegion {
  /** UTF-16 index, inclusive. */
  start: number;
  /** UTF-16 index, exclusive. */
  end: number;
  regionId: number;
  tokens: number;
}

export interface HighlightSpan {
  start: number;
  end: number;
  /** Empty = no highlight. One id = single region. 2+ = overlap. */
  regionIds: number[];
}

export function buildHighlightSpans(sourceLength: number, regions: readonly HighlightRegion[]): HighlightSpan[] {
  if (sourceLength <= 0) return [];

  const cutPoints = new Set<number>([0, sourceLength]);
  for (const region of regions) {
    if (region.start > 0 && region.start < sourceLength) cutPoints.add(region.start);
    if (region.end > 0 && region.end < sourceLength) cutPoints.add(region.end);
  }

  const sortedCuts = [...cutPoints].sort((a, b) => a - b);

  const spans: HighlightSpan[] = [];
  for (let i = 0; i < sortedCuts.length - 1; i++) {
    const start = sortedCuts[i]!;
    const end = sortedCuts[i + 1]!;
    const regionIds = regions.filter((r) => r.start <= start && end <= r.end).map((r) => r.regionId);
    spans.push({ start, end, regionIds });
  }
  return spans;
}

/**
 * Resolves which region a click on an overlapping span should jump to:
 * the highest-`tokens` region among the covering set, found by comparing
 * `tokens` directly rather than relying on any assumed array order.
 */
export function pickHighestTokenRegion(coveringIds: readonly number[], regions: readonly HighlightRegion[]): number | undefined {
  let best: number | undefined;
  let bestTokens = -1;
  for (const id of coveringIds) {
    const region = regions.find((r) => r.regionId === id);
    const tokens = region?.tokens ?? -1;
    if (tokens > bestTokens) {
      bestTokens = tokens;
      best = id;
    }
  }
  return best;
}
