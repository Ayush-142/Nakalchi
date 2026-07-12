import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tokenizeCpp } from '../src/tokenize/cpp.js';
import { tokenizePython } from '../src/tokenize/python.js';

const dir = dirname(fileURLToPath(import.meta.url));
const TARGET_BYTES = 1024 * 1024;

function loadConcatenated(lang: 'cpp' | 'python', targetBytes: number): string {
  const fixtureDir = join(dir, '..', 'test', 'fixtures', lang);
  const files = readdirSync(fixtureDir).filter((f) => !f.startsWith('.'));
  const unit = files.map((f) => readFileSync(join(fixtureDir, f), 'utf8')).join('\n');
  const unitBytes = Buffer.byteLength(unit, 'utf8');
  const repeats = Math.max(1, Math.ceil(targetBytes / unitBytes));
  return unit.repeat(repeats);
}

function bench(label: string, tokenizer: (source: string) => unknown, source: string): void {
  const bytes = Buffer.byteLength(source, 'utf8');
  const start = performance.now();
  tokenizer(source);
  const elapsedMs = performance.now() - start;
  const mbPerSec = bytes / (1024 * 1024) / (elapsedMs / 1000);
  console.log(
    `${label}: ${(bytes / (1024 * 1024)).toFixed(2)} MB in ${elapsedMs.toFixed(1)} ms -> ${mbPerSec.toFixed(2)} MB/s`,
  );
}

bench('cpp', tokenizeCpp, loadConcatenated('cpp', TARGET_BYTES));
bench('python', tokenizePython, loadConcatenated('python', TARGET_BYTES));
