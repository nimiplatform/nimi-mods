import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMouthFormFromPhonemes,
  resolveMouthOpenFromPhonemes,
} from '../src/live2d/plugins/lip-sync.js';

describe('resolveMouthOpenFromPhonemes', () => {
  it('opens wider for open vowels than silence', () => {
    const open = resolveMouthOpenFromPhonemes({
      A: 0.9,
      E: 0.05,
      I: 0.02,
      O: 0.02,
      U: 0.01,
      S: 0,
    });
    const silence = resolveMouthOpenFromPhonemes({
      A: 0,
      E: 0,
      I: 0,
      O: 0,
      U: 0,
      S: 1,
    });
    assert.ok(open > 0.7);
    assert.equal(silence, 0);
  });

  it('keeps close vowels tighter than open vowels', () => {
    const open = resolveMouthOpenFromPhonemes({
      A: 0.85,
      E: 0.05,
      I: 0.03,
      O: 0.04,
      U: 0.03,
      S: 0,
    });
    const close = resolveMouthOpenFromPhonemes({
      A: 0.02,
      E: 0.12,
      I: 0.68,
      O: 0.04,
      U: 0.14,
      S: 0,
    });
    assert.ok(close < open);
  });

  it('rounds and smiles mouth form for different phoneme groups', () => {
    const smileLike = resolveMouthFormFromPhonemes({
      A: 0.05,
      E: 0.48,
      I: 0.38,
      O: 0.04,
      U: 0.03,
      S: 0.02,
    });
    const roundLike = resolveMouthFormFromPhonemes({
      A: 0.04,
      E: 0.03,
      I: 0.05,
      O: 0.54,
      U: 0.28,
      S: 0.06,
    });
    assert.ok(smileLike > 0.2);
    assert.ok(roundLike < -0.2);
  });
});
