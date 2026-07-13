import { listAnalyses } from '../lib/api';
import { AnalysesTable } from '../components/AnalysesTable';
import { AutoRefresh } from '../components/AutoRefresh';
import { Pagination } from '../components/Pagination';
import type { AnalysisStatus } from '../lib/types';

export const dynamic = 'force-dynamic';

const STATUS_VALUES: AnalysisStatus[] = ['queued', 'running', 'completed', 'failed'];

function parseStatus(value: string | undefined): AnalysisStatus | undefined {
  return STATUS_VALUES.includes(value as AnalysisStatus) ? (value as AnalysisStatus) : undefined;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const cursor = params.cursor;

  const { analyses, nextCursor } = await listAnalyses({ status, cursor });
  const hasInFlight = analyses.some((a) => a.status === 'queued' || a.status === 'running');

  return (
    <div>
      <h1>Analyses</h1>
      {hasInFlight && <AutoRefresh intervalMs={2000} />}
      <AnalysesTable analyses={analyses} />
      <Pagination basePath="/" currentParams={{ status }} nextCursor={nextCursor} />
    </div>
  );
}
