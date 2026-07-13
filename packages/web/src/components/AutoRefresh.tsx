'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Polling strategy for "analysis still running": rather than a
 * client-side fetch to the service (which would need the API key exposed
 * to the browser), this calls router.refresh(), which re-runs the current
 * route's Server Components server-side and streams updated HTML/RSC
 * payload down - the API key never leaves the server. Renders nothing;
 * mount/unmount it based on whether the page has anything in flight.
 */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
