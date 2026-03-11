import { describe, expect, it } from 'vitest';
import { parseAnalysisJsonRecord } from '../../src/services/json-repair.js';

describe('parseAnalysisJsonRecord', () => {
  it('recovers completed segment objects from truncated fenced output', () => {
    const input = [
      '```json',
      '{',
      '  "segments": [',
      '    { "type": "narration", "speaker": "narrator", "text": "中国，1967年。" },',
      '    { "type": "dialogue", "speaker": "林云", "text": "走吧。" },',
      '    { "type": "narration",',
    ].join('\n');

    const parsed = parseAnalysisJsonRecord(input);
    const segments = Array.isArray(parsed.segments) ? parsed.segments : [];

    expect(segments).toHaveLength(2);
    expect((segments[0] as { speaker: string }).speaker).toBe('narrator');
    expect((segments[1] as { speaker: string }).speaker).toBe('林云');
  });

  it('recovers characters and segments when tail is malformed', () => {
    const input = `{
  "segments": [
    {"type":"narration","speaker":"narrator","text":"A"},
    {"type":"dialogue","speaker":"甲","text":"B"}
  ],
  "characters": [
    {"name":"甲","gender":"male","ageGroup":"young","traits":["勇敢"],"isNew":true},
    {"name":"乙",`;

    const parsed = parseAnalysisJsonRecord(input);
    const segments = Array.isArray(parsed.segments) ? parsed.segments : [];
    const characters = Array.isArray(parsed.characters) ? parsed.characters : [];

    expect(segments).toHaveLength(2);
    expect(characters).toHaveLength(1);
    expect((characters[0] as { name: string }).name).toBe('甲');
  });
});
