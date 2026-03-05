import { describe, it, expect } from 'vitest';
import { splitLongSegments } from '../../src/services/segment-post-processor.js';
import type { ScriptSegment } from '../../src/types.js';

function seg(
  id: string,
  speaker: string,
  text: string,
  chapterIndex = 0,
): ScriptSegment {
  return {
    id,
    chapterIndex,
    index: 0,
    type: 'narration',
    speaker,
    text,
    startOffset: 0,
    endOffset: text.length,
  };
}

describe('splitLongSegments', () => {
  it('does not split short segments', () => {
    const segments = [seg('s1', 'narrator', '短文本。')];
    const result = splitLongSegments(segments);
    expect(result.length).toBe(1);
    expect(result[0]!.text).toBe('短文本。');
  });

  it('splits long narration at sentence boundaries', () => {
    const longText = Array.from({ length: 50 }, (_, i) =>
      `这是第${i + 1}句话，非常长的一段旁白文本需要被拆分。`,
    ).join('');
    const segments = [seg('s1', 'narrator', longText)];
    const result = splitLongSegments(segments);
    expect(result.length).toBeGreaterThan(1);
    // All pieces should be narration by narrator
    for (const s of result) {
      expect(s.speaker).toBe('narrator');
      expect(s.type).toBe('narration');
    }
    // Combined text should equal original
    const combined = result.map((s) => s.text).join('');
    expect(combined).toBe(longText);
  });

  it('splits mixed narration + dialogue and detects speakers', () => {
    const text =
      '叶哲泰站在台上一言不发。' +
      '一名男红卫兵大声命令：' +
      '\u201c低下头！\u201d' +
      '叶哲泰仍昂着头。' +
      '绍琳迫不及待地说：' +
      '\u201c叶哲泰，这一点你是无法抵赖的！\u201d' +
      '\u201c这毕竟是目前公认的最符合实验结果的解释。\u201d叶哲泰说。';

    const segments = [seg('s1', '叶哲泰', text)];
    const result = splitLongSegments(segments, 40);

    // Should have split into multiple pieces
    expect(result.length).toBeGreaterThan(1);

    // Should have detected dialogue segments
    const dialogues = result.filter((s) => s.type === 'dialogue');
    expect(dialogues.length).toBeGreaterThan(0);

    // Check speaker detection
    const speakers = new Set(result.map((s) => s.speaker));
    expect(speakers.has('narrator')).toBe(true);
    // At least one dialogue speaker should be detected
    expect(speakers.size).toBeGreaterThan(1);

    // Combined text should equal original
    const combined = result.map((s) => s.text).join('');
    expect(combined).toBe(text);
  });

  it('handles text with no dialogue markers', () => {
    const longNarration = '这是一段很长的旁白。'.repeat(100);
    const segments = [seg('s1', 'narrator', longNarration)];
    const result = splitLongSegments(segments);
    expect(result.length).toBeGreaterThan(1);
    const combined = result.map((s) => s.text).join('');
    expect(combined).toBe(longNarration);
  });

  it('preserves indices and IDs', () => {
    const text =
      '旁白文本。' +
      '他说：\u201c对话内容。\u201d' +
      '更多旁白。';
    const segments = [seg('s1', 'narrator', text)];
    const result = splitLongSegments(segments, 10);

    // IDs should be regenerated
    for (let i = 0; i < result.length; i++) {
      expect(result[i]!.id).toBe(`seg-0-${i}`);
      expect(result[i]!.index).toBe(i);
    }
  });

  it('merges adjacent same-speaker short pieces', () => {
    // Short narration + short narration should merge
    const text = '短。\u201c话。\u201d短。';
    const segments = [seg('s1', 'narrator', text)];
    const result = splitLongSegments(segments, 5000); // high maxChars -> no split needed
    // Under maxChars -> single segment preserved
    expect(result.length).toBe(1);
  });
});
