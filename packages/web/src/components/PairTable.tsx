import Link from 'next/link';
import type { PairListItem } from '../lib/types';
import { SimilarityBadge } from './SimilarityBadge';
import styles from './PairTable.module.css';

export function PairTable({ pairs }: { pairs: PairListItem[] }) {
  if (pairs.length === 0) {
    return null;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>A</th>
          <th>B</th>
          <th>sim(A→B)</th>
          <th>sim(B→A)</th>
          <th>Longest region</th>
          <th>Flagged</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((pair) => (
          <tr key={pair.id}>
            <td>{pair.a.userRef}</td>
            <td>{pair.b.userRef}</td>
            <td>
              <SimilarityBadge label="A→B" value={pair.simAtoB} />
            </td>
            <td>
              <SimilarityBadge label="B→A" value={pair.simBtoA} />
            </td>
            <td>{pair.longestRegionTokens} tokens</td>
            <td>
              {pair.flagged && <span className={styles.flaggedTag}>FLAGGED</span>}
              <Link href={`/pairs/${pair.id}`}>view</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
