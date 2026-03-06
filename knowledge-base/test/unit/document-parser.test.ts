import { describe, expect, it } from 'vitest';
import { parseDocument, guessMimeType, isSupportedMimeType } from '../../src/services/document-parser.js';
import { KB_ERROR_CODES } from '../../src/contracts.js';

describe('document-parser', () => {
  it('detects supported MIME types by extension', () => {
    expect(guessMimeType('notes.md')).toBe('text/markdown');
    expect(guessMimeType('report.json')).toBe('application/json');
    expect(isSupportedMimeType('text/html')).toBe(true);
    expect(isSupportedMimeType('application/pdf')).toBe(false);
  });

  it('fails close on unsupported MIME types', async () => {
    await expect(parseDocument({
      content: 'binary',
      mimeType: 'application/pdf',
    })).rejects.toThrow(KB_ERROR_CODES.FORMAT_UNSUPPORTED);
  });

  it('pretty-prints json content', async () => {
    const result = await parseDocument({
      content: '{"name":"nimi","items":[1,2]}',
      mimeType: 'application/json',
    });

    expect(result.text).toContain('"name": "nimi"');
    expect(result.text).toContain('"items": [');
  });

  it('strips script tags from html fallback parsing', async () => {
    const result = await parseDocument({
      content: '<html><body><h1>Hello</h1><script>alert(1)</script><p>World</p></body></html>',
      mimeType: 'text/html',
    });

    expect(result.text).toContain('Hello');
    expect(result.text).toContain('World');
    expect(result.text).not.toContain('alert');
  });
});
