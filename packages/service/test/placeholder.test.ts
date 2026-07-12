import { describe, expect, it } from 'vitest';
import { CORE_PLACEHOLDER } from '@nakalchi/core';

describe('service placeholder', () => {
  it('resolves @nakalchi/core via the workspace + vitest alias', () => {
    expect(CORE_PLACEHOLDER).toBe(true);
  });
});
