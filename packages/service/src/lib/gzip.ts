import { gzipSync, gunzipSync } from 'node:zlib';

/** ARCHITECTURE.md §4.1: "gzip if > 64KB (utility in service)". */
export const GZIP_THRESHOLD_BYTES = 64 * 1024;

export type SourceEncoding = 'utf8' | 'gzip';

export function encodeSource(source: string): { buffer: Buffer; encoding: SourceEncoding } {
  const raw = Buffer.from(source, 'utf8');
  if (raw.byteLength > GZIP_THRESHOLD_BYTES) {
    return { buffer: gzipSync(raw), encoding: 'gzip' };
  }
  return { buffer: raw, encoding: 'utf8' };
}

export function decodeSource(buffer: Buffer, encoding: SourceEncoding): string {
  return encoding === 'gzip' ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
}
