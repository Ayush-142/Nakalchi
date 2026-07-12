/**
 * Backs the inverted-index key representation decision in
 * match/index.ts's comment: string concatenation `${h1}:${h2}` vs a
 * nested Map<number, Map<number, Posting[]>>. Real numbers, not asserted.
 */
interface Posting {
  submissionId: string;
  position: number;
}

const POSTING_COUNT = 500_000;
const DISTINCT_HASHES = 50_000;

function hashPairFor(i: number): { h1: number; h2: number } {
  const bucket = i % DISTINCT_HASHES;
  return { h1: bucket % 1000, h2: Math.floor(bucket / 1000) };
}

function benchStringKey(): number {
  const index = new Map<string, Posting[]>();
  const start = performance.now();
  for (let i = 0; i < POSTING_COUNT; i++) {
    const { h1, h2 } = hashPairFor(i);
    const key = `${h1}:${h2}`;
    let postings = index.get(key);
    if (!postings) {
      postings = [];
      index.set(key, postings);
    }
    postings.push({ submissionId: `s${i % 1000}`, position: i });
  }
  const elapsedMs = performance.now() - start;
  console.log(`String-key:  ${POSTING_COUNT} postings, ${index.size} buckets, ${elapsedMs.toFixed(1)} ms`);
  return elapsedMs;
}

function benchNestedMap(): number {
  const index = new Map<number, Map<number, Posting[]>>();
  const start = performance.now();
  for (let i = 0; i < POSTING_COUNT; i++) {
    const { h1, h2 } = hashPairFor(i);
    let inner = index.get(h1);
    if (!inner) {
      inner = new Map<number, Posting[]>();
      index.set(h1, inner);
    }
    let postings = inner.get(h2);
    if (!postings) {
      postings = [];
      inner.set(h2, postings);
    }
    postings.push({ submissionId: `s${i % 1000}`, position: i });
  }
  const elapsedMs = performance.now() - start;
  let bucketCount = 0;
  for (const inner of index.values()) bucketCount += inner.size;
  console.log(`Nested Map:  ${POSTING_COUNT} postings, ${bucketCount} buckets, ${elapsedMs.toFixed(1)} ms`);
  return elapsedMs;
}

const stringMs = benchStringKey();
const nestedMs = benchNestedMap();
console.log(
  `String-key took ${(stringMs / nestedMs).toFixed(2)}x the nested-Map time ` +
    `(>1 means nested Map is faster, <1 means string-key is faster).`,
);
