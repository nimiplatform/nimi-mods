import { describe, it, expect } from 'vitest';
import { pickTestSegments } from '../../src/services/test-segment-picker.js';
import type { ScriptSegment, VoiceCasting } from '../../src/types.js';

function seg(id: string, speaker: string, text = 'test text'): ScriptSegment {
  return {
    id,
    chapterIndex: 0,
    index: 0,
    type: 'dialogue',
    speaker,
    text,
    startOffset: 0,
    endOffset: text.length,
  };
}

function casting(name: string, voiceId: string): VoiceCasting {
  return {
    characterName: name,
    voiceSource: 'preset',
    providerId: 'test',
    voiceId,
    voiceName: voiceId,
    speakingRate: 1.0,
    pitch: 0,
  };
}

describe('pickTestSegments', () => {
  it('returns empty for empty segments', () => {
    const result = pickTestSegments([], new Map(), 3);
    expect(result).toEqual([]);
  });

  it('picks one segment per voice, max 3', () => {
    const segments = [
      seg('s1', 'Alice'),
      seg('s2', 'Alice'),
      seg('s3', 'Bob'),
      seg('s4', 'Charlie'),
      seg('s5', 'Dave'),
    ];
    const map = new Map([
      ['Alice', casting('Alice', 'v-alice')],
      ['Bob', casting('Bob', 'v-bob')],
      ['Charlie', casting('Charlie', 'v-charlie')],
      ['Dave', casting('Dave', 'v-dave')],
    ]);

    const result = pickTestSegments(segments, map, 3);
    expect(result.length).toBe(3);

    // Should cover 3 different voices
    const voiceIds = result.map((s) => map.get(s.speaker)?.voiceId);
    expect(new Set(voiceIds).size).toBe(3);
  });

  it('prefers non-fallback segments', () => {
    const segments = [
      seg('ch0-fallback-0', 'narrator'),
      seg('s1', 'narrator'),
      seg('s2', 'Alice'),
    ];
    const map = new Map([
      ['narrator', casting('narrator', 'v-narrator')],
      ['Alice', casting('Alice', 'v-alice')],
    ]);

    const result = pickTestSegments(segments, map, 3);
    expect(result.length).toBe(2);
    // Should prefer 's1' over 'ch0-fallback-0'
    const narratorSeg = result.find((s) => s.speaker === 'narrator');
    expect(narratorSeg?.id).toBe('s1');
  });

  it('prefers shorter text segments to avoid API limits', () => {
    const longText = 'A'.repeat(1000);
    const shortText = 'Short test sentence.';
    const segments = [
      seg('s-long', 'Alice', longText),
      seg('s-short', 'Alice', shortText),
    ];
    const map = new Map([
      ['Alice', casting('Alice', 'v-alice')],
    ]);

    const result = pickTestSegments(segments, map, 3);
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe('s-short');
  });

  it('picks shortest when all segments are long', () => {
    const segments = [
      seg('s1', 'Alice', 'B'.repeat(800)),
      seg('s2', 'Alice', 'C'.repeat(600)),
    ];
    const map = new Map([
      ['Alice', casting('Alice', 'v-alice')],
    ]);

    const result = pickTestSegments(segments, map, 3);
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe('s2');
  });

  it('handles segments with same voice', () => {
    const segments = [
      seg('s1', 'Alice'),
      seg('s2', 'Bob'),
    ];
    const map = new Map([
      ['Alice', casting('Alice', 'shared-voice')],
      ['Bob', casting('Bob', 'shared-voice')],
    ]);

    // Both map to same voiceId -> only 1 picked
    const result = pickTestSegments(segments, map, 3);
    expect(result.length).toBe(1);
  });

  it('skips uncast speakers', () => {
    const segments = [
      seg('s1', 'Alice'),
      seg('s2', 'Unknown'),
    ];
    const map = new Map([
      ['Alice', casting('Alice', 'v-alice')],
    ]);

    // Unknown has no casting -> should be excluded from test segments
    const result = pickTestSegments(segments, map, 3);
    expect(result.length).toBe(1);
    expect(result[0]!.speaker).toBe('Alice');
  });
});
