import Link from 'next/link';

/**
 * The service only supports forward cursor pagination (no prevCursor).
 * Each "Next" click pushes a new URL onto the browser's history stack, so
 * the browser's own Back button returns to the exact previous-page URL,
 * which the Server Component re-fetches - correct "previous page"
 * behavior without the API needing to support it.
 */
export function Pagination({
  basePath,
  currentParams,
  nextCursor,
}: {
  basePath: string;
  currentParams: Record<string, string | undefined>;
  nextCursor: string | null;
}) {
  if (!nextCursor) return null;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(currentParams)) {
    if (value !== undefined) params.set(key, value);
  }
  params.set('cursor', nextCursor);

  return (
    <div style={{ marginTop: '1rem' }}>
      <Link href={`${basePath}?${params.toString()}`}>Next page →</Link>
    </div>
  );
}
