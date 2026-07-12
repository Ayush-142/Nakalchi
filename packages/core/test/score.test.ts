/**
 * Hand-constructed micro cases. Same discipline as Phase 2: expected
 * values are derived here, in writing, BEFORE being used as test
 * expectations - never from running the implementation first.
 *
 * These tests construct Fingerprint[]/Token[] arrays directly (bypassing
 * the tokenizer and rolling hash entirely, same pattern as Phase 2's
 * winnow.test.ts paper-example test bypassing rollingHash.ts) so the
 * expected numbers are exact and trivially hand-checkable, rather than
 * requiring a fragile hand-computation of real 30-bit rolling hashes for
 * a multi-token source string.
 *
 * --- scorePair hand derivation ---
 * FP(A) = distinct hashes {10:100, 20:200, 30:300, 40:400, 50:500} -> |FP(A)|=5
 * FP(B) = distinct hashes {20:200, 30:300, 40:400, 999:999}        -> |FP(B)|=4
 * Intersection = {20:200, 30:300, 40:400}                          -> shared=3
 * simAtoB = 3/5 = 0.6
 * simBtoA = 3/4 = 0.75
 * flagged (threshold 0.35) = max(0.6,0.75)=0.75 >= 0.35 -> true
 *
 * --- extractRegions hand derivation (normal merge, k=3, w=4) ---
 * Shared positions (posA,posB): (1,10),(2,11),(3,12), sorted by posA.
 * Merge (1,10)->(2,11): dA=1<=4 ok; dB=1, 0<1<=4 ok -> merge.
 * Merge (2,11)->(3,12): dA=1<=4 ok; dB=1, 0<1<=4 ok -> merge.
 * One region: startA=1,endA=3,startB=10,endB=12.
 * lastA=endA+k-1=3+2=5, lastB=endB+k-1=12+2=14. tokenSpan=5-1+1=5.
 * Using tokens[i] = {startByte:i*10, endByte:i*10+9, line:i+1}:
 *   aStart=tokensA[1].startByte=10, aEnd=tokensA[5].endByte=59
 *   aLineStart=2, aLineEnd=6
 *   bStart=tokensB[10].startByte=100, bEnd=tokensB[14].endByte=149
 *   bLineStart=11, bLineEnd=15
 *   tokens=5, longestRegionTokens=5
 *
 * --- extractRegions hand derivation (crossed match must break, k=3, w=4) ---
 * hash{1,1} at posA=0, posB=5. hash{2,2} at posA=1, posB=3 (B's order is
 * REVERSED relative to A - a genuine crossed/reordered match).
 * Sorted by posA: (0,5),(1,3).
 * Merge (0,5)->(1,3): dA=1<=4 ok; dB=3-5=-2, NOT >0 -> merge FAILS, break.
 * Two regions: {startA:0,endA:0,startB:5,endB:5} and {startA:1,endA:1,startB:3,endB:3}.
 * Both: lastA=start+2, lastB=start+2, tokenSpan=3 each (tie).
 * Sort by tokens desc then aStart asc -> region(aStart=0) first, then region(aStart=1).
 * longestRegionTokens=3.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { scorePair } from '../src/match/score.js';
import { extractRegions } from '../src/match/regions.js';
import { generateCandidatePairs } from '../src/match/candidates.js';
import { buildExclusionSet, filterFingerprints } from '../src/match/basecode.js';
import { buildInvertedIndex } from '../src/match/index.js';
import type { InvertedIndex } from '../src/match/index.js';
import { analyzeCorpus } from '../src/pipeline.js';
import type { Fingerprint, Token } from '../src/types.js';

function fp(h1: number, h2: number, position: number): Fingerprint {
  return { hash: { h1, h2 }, position };
}

function makeTokens(count: number): Token[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'Identifier',
    norm: 'IDENT',
    line: i + 1,
    col: 1,
    startByte: i * 10,
    endByte: i * 10 + 9,
  }));
}

describe('scorePair: hand-derived micro case', () => {
  const fpA = [fp(10, 100, 0), fp(20, 200, 1), fp(30, 300, 2), fp(40, 400, 3), fp(50, 500, 4)];
  const fpB = [fp(20, 200, 10), fp(30, 300, 11), fp(40, 400, 12), fp(999, 999, 20)];

  it('matches the hand-derived simAtoB/simBtoA/sharedFingerprints', () => {
    expect(scorePair(fpA, fpB)).toEqual({ simAtoB: 0.6, simBtoA: 0.75, sharedFingerprints: 3 });
  });

  it('flags at max(simAtoB,simBtoA) >= threshold, per §4.1', () => {
    const { simAtoB, simBtoA } = scorePair(fpA, fpB);
    expect(Math.max(simAtoB, simBtoA) >= 0.35).toBe(true);
  });
});

describe('extractRegions: hand-derived micro cases', () => {
  it('merges a run of consecutive shared positions into one region', () => {
    const fpA = [fp(20, 200, 1), fp(30, 300, 2), fp(40, 400, 3)];
    const fpB = [fp(20, 200, 10), fp(30, 300, 11), fp(40, 400, 12)];
    const tokensA = makeTokens(6);
    const tokensB = makeTokens(15);

    const { regions, longestRegionTokens } = extractRegions(fpA, fpB, tokensA, tokensB, 3, 4);

    expect(regions).toEqual([
      { aStart: 10, aEnd: 59, bStart: 100, bEnd: 149, aLineStart: 2, aLineEnd: 6, bLineStart: 11, bLineEnd: 15, tokens: 5 },
    ]);
    expect(longestRegionTokens).toBe(5);
  });

  it('breaks the region on a crossed/reordered match (required fix)', () => {
    const fpA = [fp(1, 1, 0), fp(2, 2, 1)];
    const fpB = [fp(1, 1, 5), fp(2, 2, 3)]; // B's order reversed vs A
    const tokensA = makeTokens(4);
    const tokensB = makeTokens(8);

    const { regions, longestRegionTokens } = extractRegions(fpA, fpB, tokensA, tokensB, 3, 4);

    expect(regions).toEqual([
      { aStart: 0, aEnd: 29, bStart: 50, bEnd: 79, aLineStart: 1, aLineEnd: 3, bLineStart: 6, bLineEnd: 8, tokens: 3 },
      { aStart: 10, aEnd: 39, bStart: 30, bEnd: 59, aLineStart: 2, aLineEnd: 4, bLineStart: 4, bLineEnd: 6, tokens: 3 },
    ]);
    expect(longestRegionTokens).toBe(3);
  });
});

describe('generateCandidatePairs: hand-derived micro case', () => {
  it('tallies distinct shared hashes per pair and filters by minSharedFingerprints', () => {
    // hash (1,1) shared by A,B,C (3 distinct submissions); hash (2,2) shared by A,B only.
    const index: InvertedIndex = new Map([
      [
        1,
        new Map([
          [
            1,
            [
              { submissionId: 'A', position: 0 },
              { submissionId: 'B', position: 5 },
              { submissionId: 'C', position: 9 },
            ],
          ],
        ]),
      ],
      [2, new Map([[2, [{ submissionId: 'A', position: 1 }, { submissionId: 'B', position: 6 }]]])],
      [3, new Map([[3, [{ submissionId: 'C', position: 2 }]]])], // singleton bucket, no pairs
    ]);

    // A-B share both (1,1),(2,2) -> tally 2. A-C share (1,1) -> tally 1. B-C share (1,1) -> tally 1.
    const candidates = generateCandidatePairs(index, 2);
    expect(candidates).toEqual([{ a: 'A', b: 'B', sharedFingerprints: 2 }]);

    const allCandidates = generateCandidatePairs(index, 1);
    expect(allCandidates.sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b))).toEqual([
      { a: 'A', b: 'B', sharedFingerprints: 2 },
      { a: 'A', b: 'C', sharedFingerprints: 1 },
      { a: 'B', b: 'C', sharedFingerprints: 1 },
    ]);
  });
});

describe('buildExclusionSet / filterFingerprints: hand-derived micro case', () => {
  it('excludes a hash present in every submission (basecodeMaxFreq) but keeps a rare shared hash', () => {
    // 4 submissions; "template" hash appears in all 4 (docFreq/N=1.0 > 0.5);
    // "genuine" hash appears in only 2 of them (docFreq/N=0.5, NOT > 0.5).
    const bySubmission = new Map<string, Fingerprint[]>([
      ['s1', [fp(1, 1, 0), fp(2, 2, 1)]],
      ['s2', [fp(1, 1, 0), fp(2, 2, 1)]],
      ['s3', [fp(1, 1, 0)]],
      ['s4', [fp(1, 1, 0)]],
    ]);

    const exclusion = buildExclusionSet(bySubmission, { basecodeMaxFreq: 0.5, corpusCap: 100 });
    expect(exclusion.has('1:1')).toBe(true); // docFreq 4/4=1.0 > 0.5
    expect(exclusion.has('2:2')).toBe(false); // docFreq 2/4=0.5, NOT > 0.5

    expect(filterFingerprints(bySubmission.get('s1')!, exclusion)).toEqual([fp(2, 2, 1)]);
  });

  it('excludes a hash exceeding corpusCap even when under basecodeMaxFreq (required fix)', () => {
    // 10 submissions; "wide" hash appears in 6 of them - docFreq/N=0.6 <= basecodeMaxFreq(0.8),
    // so basecodeMaxFreq alone would NOT exclude it, but corpusCap=5 must.
    const bySubmission = new Map<string, Fingerprint[]>();
    for (let i = 0; i < 10; i++) {
      bySubmission.set(`s${i}`, i < 6 ? [fp(7, 7, 0)] : []);
    }

    const exclusion = buildExclusionSet(bySubmission, { basecodeMaxFreq: 0.8, corpusCap: 5 });
    expect(exclusion.has('7:7')).toBe(true); // docFreq=6 > corpusCap=5, even though 6/10=0.6 <= 0.8
  });

  it('subtracts starterCode fingerprints outright, regardless of frequency', () => {
    const bySubmission = new Map<string, Fingerprint[]>([['s1', [fp(1, 1, 0)]]]);
    const exclusion = buildExclusionSet(bySubmission, {
      basecodeMaxFreq: 0.99,
      corpusCap: 1000,
      starterCodeFingerprints: [[fp(1, 1, 0)]],
    });
    expect(exclusion.has('1:1')).toBe(true);
  });
});

describe('buildInvertedIndex: hand-derived micro case', () => {
  it('groups postings by hash key across submissions', () => {
    const bySubmission = new Map<string, Fingerprint[]>([
      ['s1', [fp(1, 1, 0), fp(2, 2, 1)]],
      ['s2', [fp(1, 1, 5)]],
    ]);
    const index = buildInvertedIndex(bySubmission);
    expect(index.get(1)?.get(1)).toEqual([
      { submissionId: 's1', position: 0 },
      { submissionId: 's2', position: 5 },
    ]);
    expect(index.get(2)?.get(2)).toEqual([{ submissionId: 's1', position: 1 }]);
  });
});

describe('property: scoring', () => {
  const fpArb = fc.array(
    fc.record({
      hash: fc.record({ h1: fc.integer({ min: 0, max: 20 }), h2: fc.integer({ min: 0, max: 20 }) }),
      position: fc.integer({ min: 0, max: 1000 }),
    }),
    { maxLength: 30 },
  );

  it('sharedFingerprints (set intersection) is symmetric', () => {
    fc.assert(
      fc.property(fpArb, fpArb, (a, b) => {
        expect(scorePair(a, b).sharedFingerprints).toBe(scorePair(b, a).sharedFingerprints);
      }),
    );
  });

  it('simAtoB and simBtoA always stay in [0, 1]', () => {
    fc.assert(
      fc.property(fpArb, fpArb, (a, b) => {
        const { simAtoB, simBtoA } = scorePair(a, b);
        expect(simAtoB).toBeGreaterThanOrEqual(0);
        expect(simAtoB).toBeLessThanOrEqual(1);
        expect(simBtoA).toBeGreaterThanOrEqual(0);
        expect(simBtoA).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('self-comparison scores 1.0 in both directions (non-empty fingerprint sets)', () => {
    fc.assert(
      fc.property(fpArb.filter((a) => a.length > 0), (a) => {
        const { simAtoB, simBtoA } = scorePair(a, a);
        expect(simAtoB).toBe(1);
        expect(simBtoA).toBe(1);
      }),
    );
  });
});

describe('analyzeCorpus: pipeline-level smoke test (two sources with a known shared block)', () => {
  it('flags two sources sharing an identical >=t-token block', () => {
    // sourceA's entire body (27 tokens) is byte-identical to sourceB's
    // suffix after "int extra = 99;". 27 > t = w+k-1 = 4+17-1 = 20 (the
    // production defaults), so Phase 2's own (already-tested) guarantee
    // property directly implies at least one shared fingerprint must
    // exist - no need to hand-compute exact hash values here, only that
    // the shared block clears the guarantee threshold. basecodeMaxFreq is
    // disabled below (see comment at the analyzeCorpus call) since with
    // only 2 submissions, base-code filtering would otherwise (correctly)
    // treat the shared block as "template" - a separate concern already
    // covered by basecode.test.ts, not what this test checks.
    const shared = `
      int total = 0;
      for (int i = 0; i < n; i++) {
          total = total + i;
      }
    `;
    const sourceA = shared;
    const sourceB = `int extra = 99;\n${shared}`;

    // basecodeMaxFreq disabled (>1, impossible to exceed): with only 2
    // submissions, any content genuinely shared between them has
    // docFreq/N = 2/2 = 1.0, which would otherwise (correctly) be treated
    // as "template" by the default filter - that's base-code filtering
    // working as intended (and separately tested in basecode.test.ts),
    // not what this test is checking. This test is only about
    // analyzeCorpus finding and flagging a genuine shared block.
    const result = analyzeCorpus(
      [
        { id: 'A', language: 'cpp', source: sourceA },
        { id: 'B', language: 'cpp', source: sourceB },
      ],
      { minSharedFingerprints: 1, flagThreshold: 0.1, basecodeMaxFreq: 1.1 },
    );

    expect(result.pairs).toHaveLength(1);
    const [pair] = result.pairs;
    expect(pair!.sharedFingerprints).toBeGreaterThan(0);
    expect(pair!.flagged).toBe(true);
    expect(pair!.regions.length).toBeGreaterThan(0);
  });
});
