/**
 * ARCHITECTURE.md §5 Phase 3 item 6 - corpus-level pipeline test. Loads
 * real corpus files from disk (test code may do I/O; core library code
 * never does) and runs analyzeCorpus() with DEFAULT params - k, w,
 * basecodeMaxFreq, minSharedFingerprints, flagThreshold, corpusCap are
 * all untouched config.ts defaults for this test, per instruction: the
 * corpus and the engine are frozen for this session.
 *
 * Per corpus/two-sum-cpp/README.md: sol02 (not sol01) is the disguise
 * base for variants/var_a..var_f. Genuine solutions sol01..sol10 are
 * independently-structured (different algorithms/idioms) and should not
 * flag against each other; every variant is derived from sol02 and should.
 *
 * evasions/ (see evasions/README.md) are adversarial variants of sol02
 * that deliberately exceed §5's variant disguise levels (aggressive
 * control-flow restructuring / interior-edited partial copy). At default
 * params they do NOT flag - asserted here as documentation of the
 * engine's measured current boundary, not a bug: a future change that
 * makes these start flagging is then a visible, reviewable behavioral
 * change instead of silent drift.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeCorpus } from '../src/pipeline.js';
import { DEFAULT_FLAG_THRESHOLD } from '../src/config.js';
import type { SubmissionInput } from '../src/types.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(testDir, '..', '..', '..', 'corpus', 'two-sum-cpp');
const variantsDir = join(corpusDir, 'variants');
const evasionsDir = join(corpusDir, 'evasions');

function idFromFilename(filename: string): string {
  const match = /^(sol\d+|var_[a-f]|evasion_\d+)/.exec(filename);
  if (!match) throw new Error(`unexpected corpus filename, can't derive an id: ${filename}`);
  return match[1]!;
}

function loadDir(dir: string): SubmissionInput[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.cpp'))
    .map((f) => ({ id: idFromFilename(f), language: 'cpp' as const, source: readFileSync(join(dir, f), 'utf8') }));
}

function loadSubmissions(): SubmissionInput[] {
  return [...loadDir(corpusDir), ...loadDir(variantsDir), ...loadDir(evasionsDir)];
}

function findPair(pairs: ReturnType<typeof analyzeCorpus>['pairs'], idA: string, idB: string) {
  return pairs.find((p) => (p.a === idA && p.b === idB) || (p.a === idB && p.b === idA));
}

/** Byte-offset span between two marker comment lines (exclusive of the markers themselves). */
function findMarkerBlockBytes(source: string, startMarker: string, endMarker: string): { startByte: number; endByte: number } {
  const startIdx = source.indexOf(startMarker);
  const endIdx = source.indexOf(endMarker, startIdx + startMarker.length);
  if (startIdx < 0 || endIdx <= startIdx) {
    throw new Error(`markers not found or out of order (start=${startIdx}, end=${endIdx})`);
  }
  const blockStartChar = source.indexOf('\n', startIdx) + 1;
  const blockEndChar = endIdx;
  return {
    startByte: Buffer.byteLength(source.slice(0, blockStartChar), 'utf8'),
    endByte: Buffer.byteLength(source.slice(0, blockEndChar), 'utf8'),
  };
}

const LIFT_START_MARKER = '// ---- lifted from the original solution (this is the copied part) ----';
const LIFT_END_MARKER = '// ---------------------------------------------------------------------';

const submissions = loadSubmissions();
const result = analyzeCorpus(submissions); // DEFAULT params - k, w, basecodeMaxFreq, minSharedFingerprints, flagThreshold, corpusCap all untouched

// Score matrix - printed unconditionally (before any assertions run), so
// the actual margin between genuine, variant, and evasion pairs is
// visible regardless of pass/fail, per instruction.
{
  const header = 'pair'.padEnd(24) + 'simAtoB'.padStart(10) + 'simBtoA'.padStart(10) + 'shared'.padStart(8) + '  flagged';
  const rows = [...result.pairs]
    .sort((x, y) => Math.max(y.simAtoB, y.simBtoA) - Math.max(x.simAtoB, x.simBtoA))
    .map(
      (p) =>
        `${p.a}~${p.b}`.padEnd(24) +
        p.simAtoB.toFixed(4).padStart(10) +
        p.simBtoA.toFixed(4).padStart(10) +
        String(p.sharedFingerprints).padStart(8) +
        `  ${p.flagged}`,
    );
  console.log('\n=== two-sum-cpp score matrix (candidate pairs only, incl. evasions) ===');
  console.log(
    `submissions=${result.stats.submissions}  candidatePairs=${result.stats.candidatePairs}  fullPairCount=${result.stats.fullPairCount}`,
  );
  console.log(header);
  console.log(rows.join('\n'));
  console.log('=========================================================================\n');
}

describe('analyzeCorpus: corpus-level pipeline test (corpus/two-sum-cpp, §5 Phase 3 item 6)', () => {
  it('sanity: exactly 18 submissions loaded (10 genuine + 6 variants + 2 evasions)', () => {
    expect(submissions).toHaveLength(18);
    expect(submissions.filter((s) => s.id.startsWith('sol'))).toHaveLength(10);
    expect(submissions.filter((s) => s.id.startsWith('var_'))).toHaveLength(6);
    expect(submissions.filter((s) => s.id.startsWith('evasion_'))).toHaveLength(2);
  });

  it('every variant (var_a..var_f) pairs with sol02 above flagThreshold', () => {
    for (const variantId of ['var_a', 'var_b', 'var_c', 'var_d', 'var_e', 'var_f']) {
      const pair = findPair(result.pairs, 'sol02', variantId);
      expect(pair, `expected a candidate pair between sol02 and ${variantId}`).toBeDefined();
      expect(
        Math.max(pair!.simAtoB, pair!.simBtoA),
        `sol02~${variantId}: simAtoB=${pair!.simAtoB}, simBtoA=${pair!.simBtoA}`,
      ).toBeGreaterThanOrEqual(DEFAULT_FLAG_THRESHOLD);
      expect(pair!.flagged, `sol02~${variantId} should be flagged`).toBe(true);
    }
  });

  it('zero flagged pairs among sol01..sol10 (genuine, independently-structured solutions)', () => {
    const genuinePairs = result.pairs.filter((p) => p.a.startsWith('sol') && p.b.startsWith('sol'));
    const falsePositives = genuinePairs.filter((p) => p.flagged);
    expect(falsePositives, JSON.stringify(falsePositives, null, 2)).toEqual([]);
  });

  it('(sol02, var_f): a region on the var_f side falls within the banner-marked lifted block', () => {
    const pair = findPair(result.pairs, 'sol02', 'var_f');
    expect(pair).toBeDefined();

    const varFSource = readFileSync(join(variantsDir, 'var_f_partial_copy.cpp'), 'utf8');
    const { startByte, endByte } = findMarkerBlockBytes(varFSource, LIFT_START_MARKER, LIFT_END_MARKER);

    const isAVarF = pair!.a === 'var_f';
    const regionsOnVarFSide = pair!.regions.map((r) => (isAVarF ? { start: r.aStart, end: r.aEnd } : { start: r.bStart, end: r.bEnd }));

    const withinBlock = regionsOnVarFSide.some((r) => r.start >= startByte && r.end <= endByte);
    expect(
      withinBlock,
      `no region on the var_f side falls within the lifted block [${startByte},${endByte}). ` +
        `regions on var_f side: ${JSON.stringify(regionsOnVarFSide)}`,
    ).toBe(true);
  });

  describe('evasions (measured boundary of token-level winnowing - see evasions/README.md)', () => {
    it('evasion_1 (control-flow restructuring) does NOT flag against sol02 at default params', () => {
      const pair = findPair(result.pairs, 'sol02', 'evasion_1');
      expect(pair, 'expected a candidate pair between sol02 and evasion_1').toBeDefined();
      expect(
        pair!.flagged,
        `sol02~evasion_1: simAtoB=${pair!.simAtoB}, simBtoA=${pair!.simBtoA} - if this now flags, that's a real ` +
          `behavioral change (k/w/threshold or matching logic changed) worth reviewing deliberately, not a broken test`,
      ).toBe(false);
    });

    it('evasion_2 (interior-edited partial copy) does NOT flag against sol02 at default params', () => {
      const pair = findPair(result.pairs, 'sol02', 'evasion_2');
      expect(pair, 'expected a candidate pair between sol02 and evasion_2').toBeDefined();
      expect(
        pair!.flagged,
        `sol02~evasion_2: simAtoB=${pair!.simAtoB}, simBtoA=${pair!.simBtoA} - if this now flags, that's a real ` +
          `behavioral change worth reviewing deliberately, not a broken test`,
      ).toBe(false);
    });

    it('evasion_2 still produces a region overlapping its marked lifted block, even though the ratio stays under threshold', () => {
      const pair = findPair(result.pairs, 'sol02', 'evasion_2');
      expect(pair).toBeDefined();

      const evasion2Source = readFileSync(join(evasionsDir, 'evasion_2_rewritten_lift.cpp'), 'utf8');
      const { startByte, endByte } = findMarkerBlockBytes(evasion2Source, LIFT_START_MARKER, LIFT_END_MARKER);

      const isAEvasion2 = pair!.a === 'evasion_2';
      const regionsOnEvasion2Side = pair!.regions.map((r) => (isAEvasion2 ? { start: r.aStart, end: r.aEnd } : { start: r.bStart, end: r.bEnd }));

      // Overlap, not full containment - evasion_2's interior edits (cin -> indexed
      // array access) break some k-grams inside the lifted block, so a matched
      // region may not span the block's full extent, only overlap it. Region
      // recall surviving at all (while the aggregate ratio doesn't clear
      // threshold) is exactly what motivates giving longestRegionTokens
      // prominence in the report UI - see docs/detection-boundary.md.
      const overlapsBlock = regionsOnEvasion2Side.some((r) => r.start < endByte && r.end > startByte);
      expect(
        overlapsBlock,
        `no region on the evasion_2 side overlaps the lifted block [${startByte},${endByte}). ` +
          `regions on evasion_2 side: ${JSON.stringify(regionsOnEvasion2Side)}`,
      ).toBe(true);
    });
  });
});
