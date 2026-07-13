import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiClientError, getAnalysis, listPairs } from '../../../lib/api';
import { StatusBadge } from '../../../components/StatusBadge';
import { ProgressBar } from '../../../components/ProgressBar';
import { AutoRefresh } from '../../../components/AutoRefresh';
import { FilterBar } from '../../../components/FilterBar';
import { PairTable } from '../../../components/PairTable';
import { Pagination } from '../../../components/Pagination';

export const dynamic = 'force-dynamic';

interface PageParams {
  id: string;
}

interface PageSearchParams {
  cursor?: string;
  minSim?: string;
  flaggedOnly?: string;
  problemRef?: string;
}

export default async function AnalysisDetailPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<PageSearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;

  let analysis;
  try {
    analysis = await getAnalysis(id);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFound();
    throw err;
  }

  const flaggedOnly = query.flaggedOnly === 'true';
  const minSim = query.minSim !== undefined ? Number(query.minSim) : undefined;
  const problemRef = query.problemRef || undefined;

  const isRunning = analysis.status === 'queued' || analysis.status === 'running';
  const isCompleted = analysis.status === 'completed';

  const pairsResult = isCompleted
    ? await listPairs(id, { cursor: query.cursor, minSim, flaggedOnly, problemRef })
    : null;

  const hasAnyFilter = flaggedOnly || minSim !== undefined || !!problemRef;

  return (
    <div>
      <p>
        <Link href="/">← All analyses</Link>
      </p>
      <h1>Analysis {id}</h1>
      {isRunning && <AutoRefresh intervalMs={2000} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0.75rem 0 1.25rem' }}>
        <StatusBadge status={analysis.status} />
        {(isRunning || analysis.status === 'completed') && <ProgressBar progress={analysis.progress} />}
      </div>

      {analysis.status === 'failed' && (
        <p style={{ color: 'var(--danger)', background: 'var(--danger-bg)', padding: '0.75rem', borderRadius: 6 }}>
          Analysis failed: {analysis.error ?? 'no error message recorded.'}
        </p>
      )}

      {isRunning && <p>Analysis is still running — pairs will appear here once it completes.</p>}

      {isCompleted && (
        <>
          <p style={{ color: 'var(--text-muted)' }}>
            {analysis.stats.submissions} submissions · {analysis.stats.candidatePairs} candidate pairs ·{' '}
            {analysis.stats.flaggedPairs} flagged · {analysis.stats.wallMs}ms
          </p>

          <FilterBar flaggedOnly={flaggedOnly} minSim={minSim} problemRef={problemRef} />

          {pairsResult && pairsResult.pairs.length === 0 && analysis.stats.candidatePairs === 0 && (
            <p>No candidate pairs were found for this analysis.</p>
          )}
          {pairsResult && pairsResult.pairs.length === 0 && analysis.stats.candidatePairs > 0 && hasAnyFilter && (
            <p>
              No pairs match the current filters. <Link href={`/analyses/${id}`}>Clear filters</Link>
            </p>
          )}

          {pairsResult && pairsResult.pairs.length > 0 && (
            <>
              <PairTable pairs={pairsResult.pairs} />
              <Pagination basePath={`/analyses/${id}`} currentParams={{ flaggedOnly: query.flaggedOnly, minSim: query.minSim, problemRef }} nextCursor={pairsResult.nextCursor} />
            </>
          )}
        </>
      )}
    </div>
  );
}
