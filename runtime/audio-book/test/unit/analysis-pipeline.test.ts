import { describe, expect, it } from 'vitest';
import { analyzeAllChapters } from '../../src/services/analysis-pipeline.js';
import type { LlmClient, SourceChapter } from '../../src/types.js';

function extractChapterContentFromPrompt(prompt: string): string {
  const startTag = '<chapter_content>';
  const endTag = '</chapter_content>';
  const start = prompt.indexOf(startTag);
  const end = prompt.indexOf(endTag);
  if (start < 0 || end < 0 || end <= start) return '';
  return prompt.slice(start + startTag.length, end).trim();
}

function createMockLlm(callChunkSizes: number[]): LlmClient {
  return {
    async generateText(input) {
      const chunkText = extractChapterContentFromPrompt(input.userPrompt);
      callChunkSizes.push(chunkText.length);
      const safeChunk = chunkText.trim();
      const one = Math.max(1, Math.floor(safeChunk.length / 3));
      const two = Math.max(one + 1, Math.floor((safeChunk.length * 2) / 3));
      return {
        text: JSON.stringify({
          segments: [
            { type: 'narration', speaker: 'narrator', text: safeChunk.slice(0, one) },
            { type: 'narration', speaker: 'narrator', text: safeChunk.slice(one, two) },
            { type: 'narration', speaker: 'narrator', text: safeChunk.slice(two) },
          ],
          characters: [],
        }),
      };
    },
  };
}

describe('analysis-pipeline chunking', () => {
  it('splits oversized single-paragraph chapter into multiple chunk calls', async () => {
    const chapterText = Array.from({ length: 1200 }, (_, i) => `段${i}中国，1967年。`).join('');
    const chapters: SourceChapter[] = [
      { index: 0, title: '1.疯狂年代', rawText: chapterText },
    ];

    const callChunkSizes: number[] = [];
    const llm = createMockLlm(callChunkSizes);

    const result = await analyzeAllChapters(llm, chapters);

    expect(callChunkSizes.length).toBeGreaterThan(1);
    expect(callChunkSizes.every((size) => size <= 3000)).toBe(true);
    expect(result.chapterResults[0]?.error).toBeUndefined();
  });

  it('falls back to hard split when a paragraph has no punctuation breaks', async () => {
    const chapterText = Array.from({ length: 1300 }, (_, i) => `段落标记${i.toString(16).padStart(4, '0')}`).join('');
    const chapters: SourceChapter[] = [
      { index: 0, title: '1.无标点章节', rawText: chapterText },
    ];

    const callChunkSizes: number[] = [];
    const llm = createMockLlm(callChunkSizes);

    const result = await analyzeAllChapters(llm, chapters);

    expect(callChunkSizes.length).toBeGreaterThan(1);
    expect(callChunkSizes.every((size) => size <= 3000)).toBe(true);
    expect(result.chapterResults[0]?.error).toBeUndefined();
  });

  it('retries chapter analysis with smaller chunk sizes when large-chunk JSON keeps failing', async () => {
    const chapterText = Array.from({ length: 1200 }, (_, i) => `段${i}中国，1967年。`).join('');
    const chapters: SourceChapter[] = [
      { index: 0, title: '1.自适应切块', rawText: chapterText },
    ];

    const callChunkSizes: number[] = [];
    const llm: LlmClient = {
      async generateText(input) {
        const chunkText = extractChapterContentFromPrompt(input.userPrompt);
        callChunkSizes.push(chunkText.length);

        if (chunkText.length > 1000) {
          return { text: '```json\n{ "segments": [ { "type": "narration"' };
        }

        const safeChunk = chunkText.trim();
        const one = Math.max(1, Math.floor(safeChunk.length / 3));
        const two = Math.max(one + 1, Math.floor((safeChunk.length * 2) / 3));
        return {
          text: JSON.stringify({
            segments: [
              { type: 'narration', speaker: 'narrator', text: safeChunk.slice(0, one) },
              { type: 'narration', speaker: 'narrator', text: safeChunk.slice(one, two) },
              { type: 'narration', speaker: 'narrator', text: safeChunk.slice(two) },
            ],
            characters: [],
          }),
        };
      },
    };

    const result = await analyzeAllChapters(llm, chapters);

    expect(callChunkSizes.some((size) => size > 1000)).toBe(true);
    expect(callChunkSizes.some((size) => size <= 1000)).toBe(true);
    expect(result.chapterResults[0]?.error).toBeUndefined();
  });
});
