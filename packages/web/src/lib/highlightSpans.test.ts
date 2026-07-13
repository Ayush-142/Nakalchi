import { describe, expect, it } from 'vitest';
import { buildHighlightSpans, pickHighestTokenRegion, type HighlightRegion } from './highlightSpans';

describe('buildHighlightSpans', () => {
  it('returns one unhighlighted span for no regions', () => {
    expect(buildHighlightSpans(10, [])).toEqual([{ start: 0, end: 10, regionIds: [] }]);
  });

  it('returns an empty array for a zero-length source', () => {
    expect(buildHighlightSpans(0, [])).toEqual([]);
  });

  it('produces three spans (before/inside/after) for a single region', () => {
    const regions: HighlightRegion[] = [{ start: 3, end: 7, regionId: 0, tokens: 20 }];
    expect(buildHighlightSpans(10, regions)).toEqual([
      { start: 0, end: 3, regionIds: [] },
      { start: 3, end: 7, regionIds: [0] },
      { start: 7, end: 10, regionIds: [] },
    ]);
  });

  it('handles two disjoint regions with a gap between them', () => {
    const regions: HighlightRegion[] = [
      { start: 1, end: 3, regionId: 0, tokens: 20 },
      { start: 5, end: 8, regionId: 1, tokens: 25 },
    ];
    expect(buildHighlightSpans(10, regions)).toEqual([
      { start: 0, end: 1, regionIds: [] },
      { start: 1, end: 3, regionIds: [0] },
      { start: 3, end: 5, regionIds: [] },
      { start: 5, end: 8, regionIds: [1] },
      { start: 8, end: 10, regionIds: [] },
    ]);
  });

  it('handles two adjacent regions (touching, no gap) as distinct back-to-back spans', () => {
    const regions: HighlightRegion[] = [
      { start: 2, end: 5, regionId: 0, tokens: 20 },
      { start: 5, end: 9, regionId: 1, tokens: 25 },
    ];
    const spans = buildHighlightSpans(10, regions);
    expect(spans).toEqual([
      { start: 0, end: 2, regionIds: [] },
      { start: 2, end: 5, regionIds: [0] },
      { start: 5, end: 9, regionIds: [1] },
      { start: 9, end: 10, regionIds: [] },
    ]);
    // No span claims to cover both - adjacency doesn't merge them.
    expect(spans.every((s) => s.regionIds.length <= 1)).toBe(true);
  });

  it('handles two partially overlapping regions with a distinct overlap span', () => {
    const regions: HighlightRegion[] = [
      { start: 2, end: 6, regionId: 0, tokens: 20 },
      { start: 4, end: 9, regionId: 1, tokens: 30 },
    ];
    expect(buildHighlightSpans(10, regions)).toEqual([
      { start: 0, end: 2, regionIds: [] },
      { start: 2, end: 4, regionIds: [0] },
      { start: 4, end: 6, regionIds: [0, 1] },
      { start: 6, end: 9, regionIds: [1] },
      { start: 9, end: 10, regionIds: [] },
    ]);
  });

  it('handles one region fully nested inside another', () => {
    const regions: HighlightRegion[] = [
      { start: 1, end: 9, regionId: 0, tokens: 40 },
      { start: 3, end: 6, regionId: 1, tokens: 17 },
    ];
    expect(buildHighlightSpans(10, regions)).toEqual([
      { start: 0, end: 1, regionIds: [] },
      { start: 1, end: 3, regionIds: [0] },
      { start: 3, end: 6, regionIds: [0, 1] },
      { start: 6, end: 9, regionIds: [0] },
      { start: 9, end: 10, regionIds: [] },
    ]);
  });

  it('handles a region touching the very start and end of the source', () => {
    const regions: HighlightRegion[] = [{ start: 0, end: 10, regionId: 0, tokens: 50 }];
    expect(buildHighlightSpans(10, regions)).toEqual([{ start: 0, end: 10, regionIds: [0] }]);
  });
});

describe('pickHighestTokenRegion', () => {
  const regions: HighlightRegion[] = [
    { start: 0, end: 5, regionId: 0, tokens: 20 },
    { start: 3, end: 9, regionId: 1, tokens: 45 },
    { start: 4, end: 6, regionId: 2, tokens: 30 },
  ];

  it('picks the region with the most tokens among the covering set, regardless of array/id order', () => {
    expect(pickHighestTokenRegion([0, 1, 2], regions)).toBe(1);
    expect(pickHighestTokenRegion([2, 0], regions)).toBe(2);
  });

  it('returns the sole id when only one region covers the span', () => {
    expect(pickHighestTokenRegion([0], regions)).toBe(0);
  });

  it('returns undefined for an empty covering set', () => {
    expect(pickHighestTokenRegion([], regions)).toBeUndefined();
  });
});
