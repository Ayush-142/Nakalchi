'use client';

import type { MatchRegion } from '@nakalchi/core';
import styles from './RegionList.module.css';

export interface RegionListEntry {
  regionId: number;
  region: MatchRegion;
}

/**
 * Sidebar list of every matched region, sorted by tokens desc. The
 * service's stored order is already tokens-desc (verified directly:
 * packages/core/src/match/regions.ts sorts before capping, and the
 * worker stores the array as a direct passthrough) but this re-sorts
 * defensively anyway - cheap, idempotent display math, not something to
 * depend on as an implicit API contract.
 */
export function RegionList({
  entries,
  activeRegionId,
  onSelect,
}: {
  entries: RegionListEntry[];
  activeRegionId: number | undefined;
  onSelect: (regionId: number) => void;
}) {
  const sorted = [...entries].sort((x, y) => y.region.tokens - x.region.tokens);

  if (sorted.length === 0) {
    return <p className={styles.empty}>No matched regions for this pair.</p>;
  }

  return (
    <ul className={styles.list}>
      {sorted.map(({ regionId, region }) => (
        <li key={regionId}>
          <button
            type="button"
            className={`${styles.row} ${activeRegionId === regionId ? styles.active : ''}`}
            style={{ borderLeftColor: `var(--region-${regionId % 6})` }}
            onClick={() => onSelect(regionId)}
          >
            <span className={styles.tokens}>{region.tokens} tokens</span>
            <span className={styles.lines}>
              A: L{region.aLineStart}-{region.aLineEnd} · B: L{region.bLineStart}-{region.bLineEnd}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
