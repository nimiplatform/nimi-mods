import { describe, expect, it } from 'vitest';
import { rebaseChapterSegmentsToSource } from '../../src/services/text-fidelity.js';

function normalize(input: string): string {
  return String(input || '')
    .replace(/\s+/g, '')
    .replace(/[，,]/g, '，')
    .replace(/[。\.]/g, '。')
    .replace(/[！!]/g, '！')
    .replace(/[？?]/g, '？')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, '\'')
    .replace(/[：:]/g, '：')
    .replace(/[；;]/g, '；')
    .replace(/[（(]/g, '（')
    .replace(/[）)]/g, '）')
    .replace(/[—]/g, '-');
}

describe('rebaseChapterSegmentsToSource', () => {
  it('reconstructs full chapter text with offsets even when segment text is reordered', () => {
    const chapterText = [
      '小红卫兵那茫然的思路立刻找到了立脚点，她举起紧握皮带的手指着叶哲泰，',
      '“你，是想说有上帝？！”',
      '“我不知道。”',
    ].join('');

    const result = rebaseChapterSegmentsToSource({
      chapterText,
      chapterIndex: 0,
      segments: [
        {
          type: 'dialogue',
          speaker: '小红卫兵',
          text: '“你，是想说有上帝？！”小红卫兵那茫然的思路立刻找到了立脚点，她举起紧握皮带的手指着叶哲泰，',
        },
        {
          type: 'dialogue',
          speaker: '叶哲泰',
          text: '“我不知道。”',
        },
      ],
    });

    const rebuilt = result.segments.map((segment) => segment.text).join('');
    expect(normalize(rebuilt)).toBe(normalize(chapterText));
    expect(result.segments[0]?.startOffset).toBe(0);
    expect(result.segments[1]?.endOffset).toBe(chapterText.length);
  });

  it('throws fidelity mismatch for unrelated content', () => {
    const chapterText = '这是原文第一句。这是原文第二句。';
    expect(() => rebaseChapterSegmentsToSource({
      chapterText,
      chapterIndex: 0,
      segments: [
        { type: 'narration', speaker: 'narrator', text: '完全无关内容A' },
        { type: 'narration', speaker: 'narrator', text: '完全无关内容B' },
      ],
    })).toThrow(/VS_TEXT_FIDELITY_MISMATCH/);
  });
});
