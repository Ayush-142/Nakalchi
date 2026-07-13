'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchRegion } from '@nakalchi/core';
import { mapByteOffsetsToUtf16 } from '../lib/byteOffsets';
import { buildHighlightSpans, pickHighestTokenRegion, type HighlightRegion, type HighlightSpan } from '../lib/highlightSpans';
import { RegionList, type RegionListEntry } from './RegionList';
import styles from './DiffViewer.module.css';

interface DiffViewerProps {
  sourceA: string;
  sourceB: string;
  userRefA: string;
  userRefB: string;
  regions: MatchRegion[];
}

/**
 * Maps one side's regions (byte offsets) to UTF-16 HighlightRegions.
 * regionId = index into the original `regions` array, shared by both
 * sides, so a click on either pane (or the sidebar) resolves to the same
 * logical region regardless of which side rendered the click.
 */
function mapSideRegions(source: string, regions: readonly MatchRegion[], side: 'a' | 'b'): HighlightRegion[] {
  const offsets = regions.flatMap((r) => (side === 'a' ? [r.aStart, r.aEnd] : [r.bStart, r.bEnd]));
  const mapped = mapByteOffsetsToUtf16(source, offsets);
  return regions.map((r, i) => ({
    start: mapped[i * 2]!,
    end: mapped[i * 2 + 1]!,
    regionId: i,
    tokens: r.tokens,
  }));
}

export function DiffViewer({ sourceA, sourceB, userRefA, userRefB, regions }: DiffViewerProps) {
  const [activeRegionId, setActiveRegionId] = useState<number | undefined>(undefined);
  const [syncedScroll, setSyncedScroll] = useState(false);
  const paneARef = useRef<HTMLPreElement>(null);
  const paneBRef = useRef<HTMLPreElement>(null);
  const syncGuardRef = useRef(false);

  const aHighlightRegions = useMemo(() => mapSideRegions(sourceA, regions, 'a'), [sourceA, regions]);
  const bHighlightRegions = useMemo(() => mapSideRegions(sourceB, regions, 'b'), [sourceB, regions]);

  const aSpans = useMemo(() => buildHighlightSpans(sourceA.length, aHighlightRegions), [sourceA, aHighlightRegions]);
  const bSpans = useMemo(() => buildHighlightSpans(sourceB.length, bHighlightRegions), [sourceB, bHighlightRegions]);

  const regionEntries: RegionListEntry[] = useMemo(() => regions.map((region, regionId) => ({ regionId, region })), [regions]);

  function handleSpanClick(regionIds: number[]) {
    // tokens are identical for a given regionId on either side (same
    // underlying MatchRegion), so resolving against aHighlightRegions is
    // correct regardless of which pane was clicked.
    const target = pickHighestTokenRegion(regionIds, aHighlightRegions);
    if (target !== undefined) setActiveRegionId(target);
  }

  // Region click/select -> scroll both panes to the matching span.
  useEffect(() => {
    if (activeRegionId === undefined) return;
    for (const paneRef of [paneARef, paneBRef]) {
      const el = paneRef.current?.querySelector<HTMLElement>(`[data-region-ids~="${activeRegionId}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeRegionId]);

  // Independent synced-scroll toggle: proportionally mirrors scroll
  // position between panes, guarded against feedback loops.
  useEffect(() => {
    if (!syncedScroll) return;
    const a = paneARef.current;
    const b = paneBRef.current;
    if (!a || !b) return;

    function mirror(source: HTMLElement, target: HTMLElement) {
      if (syncGuardRef.current) return;
      syncGuardRef.current = true;
      const ratio = source.scrollTop / Math.max(1, source.scrollHeight - source.clientHeight);
      target.scrollTop = ratio * Math.max(1, target.scrollHeight - target.clientHeight);
      requestAnimationFrame(() => {
        syncGuardRef.current = false;
      });
    }

    const onAScroll = (): void => mirror(a, b);
    const onBScroll = (): void => mirror(b, a);
    a.addEventListener('scroll', onAScroll);
    b.addEventListener('scroll', onBScroll);
    return () => {
      a.removeEventListener('scroll', onAScroll);
      b.removeEventListener('scroll', onBScroll);
    };
  }, [syncedScroll]);

  function renderPane(source: string, spans: HighlightSpan[]) {
    return spans.map((span, i) => {
      const text = source.slice(span.start, span.end);
      if (span.regionIds.length === 0) {
        return <span key={i}>{text}</span>;
      }
      const isOverlap = span.regionIds.length > 1;
      const isActive = activeRegionId !== undefined && span.regionIds.includes(activeRegionId);
      return (
        <span
          key={i}
          data-region-ids={span.regionIds.join(' ')}
          className={[styles.highlight, isOverlap ? styles.overlap : '', isActive ? styles.activeHighlight : ''].join(' ').trim()}
          style={!isOverlap ? { backgroundColor: `var(--region-${span.regionIds[0]! % 6})` } : undefined}
          onClick={() => handleSpanClick(span.regionIds)}
        >
          {text}
        </span>
      );
    });
  }

  return (
    <div className={styles.layout}>
      <div className={styles.panes}>
        <div className={styles.paneColumn}>
          <div className={styles.paneHeader}>{userRefA}</div>
          <pre ref={paneARef} className={styles.pane}>
            <code>{renderPane(sourceA, aSpans)}</code>
          </pre>
        </div>
        <div className={styles.paneColumn}>
          <div className={styles.paneHeader}>{userRefB}</div>
          <pre ref={paneBRef} className={styles.pane}>
            <code>{renderPane(sourceB, bSpans)}</code>
          </pre>
        </div>
      </div>
      <aside className={styles.sidebar}>
        <label className={styles.syncToggle}>
          <input type="checkbox" checked={syncedScroll} onChange={(e) => setSyncedScroll(e.target.checked)} />
          Synced scroll
        </label>
        <RegionList entries={regionEntries} activeRegionId={activeRegionId} onSelect={setActiveRegionId} />
      </aside>
    </div>
  );
}
