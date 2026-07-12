/**
 * Backs the performance claim in config.ts's comment: does a plain-Number
 * rolling update (our chosen design, config.ts §1) actually beat an
 * equivalent BigInt-based 64-bit rolling update? Both loops do one
 * multiply + add + reduce per iteration, same iteration count - the only
 * difference is Number arithmetic vs BigInt arithmetic.
 */
import { HASH1_BASE, HASH1_MOD } from '../src/config.js';

const ITERATIONS = 5_000_000;

function benchNumber(): number {
  let hash = 0;
  const base = HASH1_BASE;
  const mod = HASH1_MOD;
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    hash = (hash * base + (i % 97)) % mod;
  }
  const elapsedMs = performance.now() - start;
  console.log(`Number-based:  ${ITERATIONS} updates in ${elapsedMs.toFixed(1)} ms (final hash sink: ${hash})`);
  return elapsedMs;
}

function benchBigInt(): number {
  let hash = 0n;
  const base = 0xc96c5795d287592dn; // arbitrary odd 64-bit-ish constant
  const mask = (1n << 64n) - 1n;
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    hash = (hash * base + BigInt(i % 97)) & mask;
  }
  const elapsedMs = performance.now() - start;
  console.log(`BigInt-based:  ${ITERATIONS} updates in ${elapsedMs.toFixed(1)} ms (final hash sink: ${hash})`);
  return elapsedMs;
}

const numberMs = benchNumber();
const bigintMs = benchBigInt();
console.log(`BigInt took ${(bigintMs / numberMs).toFixed(2)}x as long as plain Number arithmetic.`);
