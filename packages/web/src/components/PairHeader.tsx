import type { PairDetail } from '../lib/types';
import { SimilarityBadge } from './SimilarityBadge';
import styles from './PairHeader.module.css';

// ARCHITECTURE.md §4.1: regions are capped at 200/pair by core.
const REGION_CAP = 200;

export function PairHeader({ pair }: { pair: PairDetail }) {
  return (
    <div className={styles.header}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>
          {pair.a.userRef} <span className={styles.vs}>vs</span> {pair.b.userRef}
        </h1>
        {pair.flagged && <span className={styles.flaggedTag}>FLAGGED</span>}
      </div>
      <p className={styles.problemRef}>Problem: {pair.problemRef}</p>

      <div className={styles.statsRow}>
        <SimilarityBadge label="A→B" value={pair.simAtoB} flagged={pair.flagged} />
        <SimilarityBadge label="B→A" value={pair.simBtoA} flagged={pair.flagged} />
        <span className={styles.stat}>
          <span className={styles.statLabel}>Shared fingerprints</span>
          <span className={styles.statValue}>{pair.sharedFingerprints}</span>
        </span>
      </div>

      {/* Prominent, not buried: docs/detection-boundary.md documents pairs
          that stay under flagThreshold on aggregate similarity but still
          have a real matched region - a reviewer must see this even when
          `flagged` is false. */}
      <div className={styles.longestRegion}>
        <span className={styles.longestRegionNumber}>{pair.longestRegionTokens}</span>
        <span className={styles.longestRegionLabel}>tokens in the longest matched region</span>
      </div>

      {pair.regions.length === REGION_CAP && (
        <p className={styles.cappedNotice}>Showing all {REGION_CAP} regions (capped) — there may be additional matches beyond the cap.</p>
      )}
    </div>
  );
}
