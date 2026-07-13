'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import styles from './FilterBar.module.css';

interface FilterBarProps {
  flaggedOnly: boolean;
  minSim: number | undefined;
  problemRef: string | undefined;
}

/**
 * Edits the URL's search params and navigates - no direct call to the
 * service from the browser. Changing a filter always drops any existing
 * `cursor` (restart pagination from page 1), since a stale cursor from a
 * different filter set is meaningless.
 */
export function FilterBar({ flaggedOnly, minSim, problemRef }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [minSimInput, setMinSimInput] = useState(minSim !== undefined ? String(minSim) : '');
  const [problemRefInput, setProblemRefInput] = useState(problemRef ?? '');

  function navigate(next: { flaggedOnly: boolean; minSim: string; problemRef: string }) {
    const params = new URLSearchParams();
    if (next.flaggedOnly) params.set('flaggedOnly', 'true');
    if (next.minSim) params.set('minSim', next.minSim);
    if (next.problemRef) params.set('problemRef', next.problemRef);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className={styles.bar}>
      <label className={styles.field}>
        <input
          type="checkbox"
          checked={flaggedOnly}
          onChange={(e) => navigate({ flaggedOnly: e.target.checked, minSim: minSimInput, problemRef: problemRefInput })}
        />
        Flagged only
      </label>
      <label className={styles.field}>
        Min similarity
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={minSimInput}
          onChange={(e) => setMinSimInput(e.target.value)}
          onBlur={() => navigate({ flaggedOnly, minSim: minSimInput, problemRef: problemRefInput })}
          className={styles.numberInput}
        />
      </label>
      <label className={styles.field}>
        Problem
        <input
          type="text"
          value={problemRefInput}
          onChange={(e) => setProblemRefInput(e.target.value)}
          onBlur={() => navigate({ flaggedOnly, minSim: minSimInput, problemRef: problemRefInput })}
        />
      </label>
    </div>
  );
}
