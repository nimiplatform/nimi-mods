// ---------------------------------------------------------------------------
// Document parser — text extraction by MIME type (SSOT §3.3)
// Supports: txt, md, csv, json, html. Unsupported formats fail-close.
// ---------------------------------------------------------------------------

import { KB_ERROR_CODES } from '../contracts.js';

export type ParseResult = {
  text: string;
  metadata?: { pageCount?: number };
};

const SUPPORTED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
]);

export function isSupportedMimeType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.has(mimeType);
}

export function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    markdown: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    html: 'text/html',
    htm: 'text/html',
  };
  return map[ext] ?? 'application/octet-stream';
}

/**
 * Extract text from a file or raw string based on MIME type.
 * Throws with KB_FORMAT_UNSUPPORTED for unrecognized formats.
 */
export async function parseDocument(input: {
  content: string;
  mimeType: string;
}): Promise<ParseResult> {
  const { content, mimeType } = input;

  if (!isSupportedMimeType(mimeType)) {
    throw new Error(KB_ERROR_CODES.FORMAT_UNSUPPORTED);
  }

  switch (mimeType) {
    case 'text/plain':
    case 'text/markdown':
      return { text: content };

    case 'text/csv':
      return { text: parseCsv(content) };

    case 'application/json':
      return { text: parseJson(content) };

    case 'text/html':
      return { text: parseHtml(content) };

    default:
      throw new Error(KB_ERROR_CODES.FORMAT_UNSUPPORTED);
  }
}

function parseCsv(content: string): string {
  // Preserve CSV as readable text; each row becomes a line
  return content.trim();
}

function parseJson(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}

function parseHtml(content: string): string {
  // Browser-side DOM parsing to extract text content
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    // Remove script, style, nav, footer elements
    for (const tag of ['script', 'style', 'nav', 'footer', 'header', 'aside']) {
      for (const el of Array.from(doc.querySelectorAll(tag))) {
        el.remove();
      }
    }
    return (doc.body?.textContent ?? '').trim();
  }
  // Fallback: strip tags with regex
  return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
