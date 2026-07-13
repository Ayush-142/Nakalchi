import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiClientError, getPair } from '../../../lib/api';
import { PairHeader } from '../../../components/PairHeader';
import { DiffViewer } from '../../../components/DiffViewer';

export const dynamic = 'force-dynamic';

export default async function PairDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let pair;
  try {
    pair = await getPair(id);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div>
      <p>
        <Link href={`/analyses/${pair.analysisId}`}>← Back to analysis</Link>
      </p>
      <PairHeader pair={pair} />
      <DiffViewer sourceA={pair.a.source} sourceB={pair.b.source} userRefA={pair.a.userRef} userRefB={pair.b.userRef} regions={pair.regions} />
    </div>
  );
}
