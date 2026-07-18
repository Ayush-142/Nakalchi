import { getAdminStats } from '../../lib/api';

export const dynamic = 'force-dynamic';

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  return `${ms.toFixed(0)} ms (${(ms / 1000).toFixed(2)}s)`;
}

export default async function AdminStatsPage() {
  const stats = await getAdminStats();

  return (
    <div>
      <h1>Admin stats</h1>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Analysis wall time (completed analyses)</h2>
        <table>
          <thead>
            <tr>
              <th>Completed analyses</th>
              <th>p50</th>
              <th>p95</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{stats.analysisWallMs.count}</td>
              <td>{formatMs(stats.analysisWallMs.p50)}</td>
              <td>{formatMs(stats.analysisWallMs.p95)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Analyses per day (last 30 days with activity)</h2>
        {stats.analysesPerDay.length === 0 ? (
          <p>No analyses yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Analyses</th>
              </tr>
            </thead>
            <tbody>
              {stats.analysesPerDay.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
