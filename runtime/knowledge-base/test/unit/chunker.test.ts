import { describe, expect, it } from 'vitest';
import { estimateTokens, splitIntoChunks } from '../../src/services/chunker.js';

describe('chunker', () => {
  it('estimates tokens with 4 chars per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('nimi')).toBe(1);
    expect(estimateTokens('nimi platform')).toBe(Math.ceil('nimi platform'.length / 4));
  });

  it('splits paragraphs into overlapped chunks', () => {
    const text = [
      'Paragraph one about Nimi.',
      'Paragraph two about runtime routing.',
      'Paragraph three about citations.',
    ].join('\n\n');

    const ids = ['chunk-1', 'chunk-2', 'chunk-3'];
    const chunks = splitIntoChunks(text, {
      documentId: 'doc-1',
      chunkSize: 12,
      chunkOverlap: 8,
      generateId: () => ids.shift() || 'chunk-x',
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.id).toBe('chunk-1');
    expect(chunks[1]?.text).toContain('runtime routing');
    expect(chunks[1]?.chunkIndex).toBe(1);
  });

  it('emits oversized single paragraph as its own chunk', () => {
    const paragraph = 'x'.repeat(4096);
    const chunks = splitIntoChunks(paragraph, {
      documentId: 'doc-2',
      chunkSize: 32,
      chunkOverlap: 8,
      generateId: () => 'chunk-oversized',
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(paragraph);
    expect(chunks[0]?.tokenCount).toBe(estimateTokens(paragraph));
  });
});
