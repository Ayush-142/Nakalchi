import Link from 'next/link';
import type { AnalysisSummary } from '../lib/types';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';

export function AnalysesTable({ analyses }: { analyses: AnalysisSummary[] }) {
  if (analyses.length === 0) {
    return <p>No analyses yet. Run `npm run seed-demo --workspace=@nakalchi/service` to create one.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Analysis</th>
          <th>Status</th>
          <th>Progress</th>
          <th>Submissions</th>
          <th>Candidate pairs</th>
          <th>Flagged</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {analyses.map((a) => (
          <tr key={a.analysisId}>
            <td>
              <Link href={`/analyses/${a.analysisId}`}>{a.analysisId}</Link>
            </td>
            <td>
              <StatusBadge status={a.status} />
            </td>
            <td>
              <ProgressBar progress={a.progress} />
            </td>
            <td>{a.stats.submissions}</td>
            <td>{a.stats.candidatePairs}</td>
            <td>{a.stats.flaggedPairs}</td>
            <td>{new Date(a.createdAt).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
