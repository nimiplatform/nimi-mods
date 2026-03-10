import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getBuddyMotionProfile } from '../src/live2d/motion-profile.js';

describe('getBuddyMotionProfile', () => {
  it('uses named motion groups for full haru', () => {
    const profile = getBuddyMotionProfile('haru');
    assert.ok(profile.tap.includes('Tap'));
    assert.ok(profile.idle.includes('Idle'));
    assert.ok(profile.emotion.excited.includes('Shake'));
  });

  it('falls back to anonymous motion group for haru greeter', () => {
    const profile = getBuddyMotionProfile('haru_greeter');
    assert.deepEqual(profile.idle, ['']);
    assert.deepEqual(profile.tap, ['']);
    assert.deepEqual(profile.emotion.happy, ['']);
  });

  it('uses hiyori motion groups when hiyori is selected', () => {
    const profile = getBuddyMotionProfile('hiyori');
    assert.ok(profile.idle.includes('Idle'));
    assert.ok(profile.tap.includes('Tap@Body'));
    assert.ok(profile.emotion.surprised.includes('FlickUp'));
  });
});
