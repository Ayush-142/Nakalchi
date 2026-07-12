import { describe, expect, it } from 'vitest';
import { CORE_PLACEHOLDER } from '../src/index.js';

describe('core placeholder', () => {
  it('is wired up', () => {
    expect(CORE_PLACEHOLDER).toBe(true);
  });
});
