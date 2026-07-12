import type { Fingerprint, MatchRegion, Token } from '../types.js';
import { fingerprintKey } from './index.js';

const MAX_REGIONS_PER_PAIR = 200;

interface PositionPair {
  posA: number;
  posB: number;
}

interface RawRegion {
  startA: number;
  endA: number;
  startB: number;
  endB: number;
}

function groupPositionsByHash(fingerprints: readonly Fingerprint[]): Map<string, number[]> {
  const byHash = new Map<string, number[]>();
  for (const f of fingerprints) {
    const key = fingerprintKey(f.hash);
    let positions = byHash.get(key);
    if (!positions) {
      positions = [];
      byHash.set(key, positions);
    }
    positions.push(f.position);
  }
  return byHash;
}

/**
 * ARCHITECTURE.md §5 Phase 3 item 5: shared fingerprints carry token
 * positions in both docs; sort by position, merge runs within a gap
 * tolerance of w tokens in BOTH docs; map merged runs back through byte
 * offsets. Cap at 200 regions/pair; compute longestRegionTokens.
 *
 * Merge condition (B-side corrected per review): `nextPosA - lastPosA <= w`
 * AND `0 < nextPosB - lastPosB <= w`. Sorting primarily by posA guarantees
 * nextPosA >= lastPosA within the scan, but says nothing about posB's
 * direction - a crossed/reordered match (two matched fragments appearing
 * in a different relative order on side B than side A) can have
 * `nextPosB <= lastPosB` while still passing a bare `<= w` check (any
 * zero/negative delta is trivially <= w), which would silently stretch
 * the region's B-side byte span across code that isn't part of the match.
 * The strict `0 <` floor on the B-side forces a region break whenever B
 * goes backward or doesn't move forward. No equivalent floor is needed on
 * the A-side: `nextPosA == lastPosA` legitimately represents one
 * A-position matching multiple B-positions from a repeated hash, which
 * the sort's tie-break on posB keeps in increasing order.
 */
export function extractRegions(
  fingerprintsA: readonly Fingerprint[],
  fingerprintsB: readonly Fingerprint[],
  tokensA: readonly Token[],
  tokensB: readonly Token[],
  k: number,
  w: number,
): { regions: MatchRegion[]; longestRegionTokens: number } {
  const positionsByHashA = groupPositionsByHash(fingerprintsA);
  const positionsByHashB = groupPositionsByHash(fingerprintsB);

  const pairs: PositionPair[] = [];
  for (const [key, positionsA] of positionsByHashA) {
    const positionsB = positionsByHashB.get(key);
    if (!positionsB) continue;
    for (const posA of positionsA) {
      for (const posB of positionsB) {
        pairs.push({ posA, posB });
      }
    }
  }

  pairs.sort((x, y) => x.posA - y.posA || x.posB - y.posB);

  const rawRegions: RawRegion[] = [];
  for (const { posA, posB } of pairs) {
    const current = rawRegions[rawRegions.length - 1];
    const bDelta = current ? posB - current.endB : NaN;
    if (current && posA - current.endA <= w && bDelta > 0 && bDelta <= w) {
      current.endA = posA;
      current.endB = posB;
    } else {
      rawRegions.push({ startA: posA, endA: posA, startB: posB, endB: posB });
    }
  }

  let longestRegionTokens = 0;
  const regions: MatchRegion[] = rawRegions.map(({ startA, endA, startB, endB }) => {
    const lastA = endA + k - 1;
    const lastB = endB + k - 1;
    const tokenSpan = lastA - startA + 1;
    longestRegionTokens = Math.max(longestRegionTokens, tokenSpan);

    return {
      aStart: tokensA[startA]!.startByte,
      aEnd: tokensA[lastA]!.endByte,
      bStart: tokensB[startB]!.startByte,
      bEnd: tokensB[lastB]!.endByte,
      aLineStart: tokensA[startA]!.line,
      aLineEnd: tokensA[lastA]!.line,
      bLineStart: tokensB[startB]!.line,
      bLineEnd: tokensB[lastB]!.line,
      tokens: tokenSpan,
    };
  });

  regions.sort((a, b) => b.tokens - a.tokens || a.aStart - b.aStart);

  return { regions: regions.slice(0, MAX_REGIONS_PER_PAIR), longestRegionTokens };
}
