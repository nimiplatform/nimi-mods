import type { SourceChapter, TextStats } from '../types.js';

// ---------------------------------------------------------------------------
// Chapter detection regex patterns (priority order)
// ---------------------------------------------------------------------------

const CHAPTER_PATTERNS: Array<{ pattern: RegExp; labelFn: (m: RegExpMatchArray) => string }> = [
  // Chinese: 第X章/节/回/卷/篇/部 (with optional title after whitespace)
  {
    pattern: /^(第[一二三四五六七八九十百千\d]+[章节回卷篇部].*)/m,
    labelFn: (m) => m[1]!.trim(),
  },
  // Numeric: 1.标题 / 2.标题 (common Chinese novel format)
  {
    pattern: /^(\d+[.．、]\S+.*)/m,
    labelFn: (m) => m[1]!.trim(),
  },
  // English: Chapter/Part/Prologue/Epilogue + number (with optional title)
  {
    pattern: /^((?:Chapter|Part|Prologue|Epilogue)\s+[\d]+.*)/mi,
    labelFn: (m) => m[1]!.trim(),
  },
  // Roman numerals: CHAPTER I / CHAPTER IV etc.
  {
    pattern: /^(CHAPTER\s+[IVXLCDM\d]+.*)/mi,
    labelFn: (m) => m[1]!.trim(),
  },
];

/**
 * Split raw text into chapters based on heading patterns.
 * Falls back to a single chapter if no pattern matches.
 */
export function splitTextIntoChapters(text: string): SourceChapter[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  for (const { pattern, labelFn } of CHAPTER_PATTERNS) {
    const chapters = splitByPattern(trimmed, pattern, labelFn);
    if (chapters.length > 1) {
      return chapters;
    }
  }

  // Fallback: entire text as single chapter
  return [
    {
      index: 0,
      title: '全文',
      rawText: trimmed,
    },
  ];
}

function splitByPattern(
  text: string,
  pattern: RegExp,
  labelFn: (m: RegExpMatchArray) => string,
): SourceChapter[] {
  // Global search for heading positions
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const matches: Array<{ index: number; label: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = globalPattern.exec(text)) !== null) {
    matches.push({ index: match.index, label: labelFn(match) });
  }

  if (matches.length === 0) {
    return [];
  }

  // Single heading with substantial prelude → still split into 2 chapters
  if (matches.length === 1) {
    const prelude = text.slice(0, matches[0]!.index).trim();
    if (prelude.length < 50) {
      return [];
    }
  }

  const chapters: SourceChapter[] = [];

  // Text before first heading (if any non-empty content)
  const prelude = text.slice(0, matches[0]!.index).trim();
  if (prelude.length > 0) {
    chapters.push({
      index: 0,
      title: '前言',
      rawText: prelude,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const nextIndex = i + 1 < matches.length ? matches[i + 1]!.index : text.length;
    const headingEndIndex = current.index + current.label.length;
    const bodyText = text.slice(headingEndIndex, nextIndex).trim();

    chapters.push({
      index: chapters.length,
      title: current.label,
      rawText: bodyText,
    });
  }

  return chapters;
}

/**
 * Compute text statistics from split chapters.
 */
export function computeTextStats(chapters: SourceChapter[]): TextStats {
  return {
    totalChars: chapters.reduce((sum, ch) => sum + ch.rawText.length, 0),
    totalChapters: chapters.length,
    chapterStats: chapters.map((ch) => ({
      index: ch.index,
      title: ch.title,
      charCount: ch.rawText.length,
    })),
  };
}
