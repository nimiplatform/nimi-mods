// ---------------------------------------------------------------------------
// Analysis pipeline — per-chapter LLM analysis with three-retry + accumulator
// ---------------------------------------------------------------------------

import type {
  AnalysisChapterOutput,
  CharacterProfile,
  LlmClient,
  ScriptSegment,
  SegmentType,
  SourceChapter,
} from '../types.js';
import {
  parseAnalysisJsonRecord,
  summarizeModelError,
  buildRepairPrompt,
  buildStrictRepairPrompt,
} from './json-repair.js';
import {
  ANALYSIS_SCHEMA_LINES,
  buildAnalysisSystemPrompt,
  buildChapterAnalysisPrompt,
  buildAccumulatedContext,
} from './analysis-prompts.js';
import { rebaseChapterSegmentsToSource } from './text-fidelity.js';

const VALID_SEGMENT_TYPES = new Set<SegmentType>(['dialogue', 'narration', 'inner_thought', 'sound_effect']);
const RECENT_SEGMENTS_WINDOW = 3;
const MAX_CHUNK_CHARS = 3000;
const CHUNK_RETRY_SIZES = [MAX_CHUNK_CHARS, 2000, 1200, 800, 500] as const;

/**
 * Estimate output tokens needed for a chapter's analysis JSON.
 *
 * The output JSON reproduces ALL original text as segment values,
 * so output tokens ≈ source text tokens + JSON structural overhead.
 *
 * Token ratio: Chinese ~1.5 tokens/char, English ~0.25 tokens/word (~1.2 chars/token).
 * We use 1.8 tokens/char as a conservative Chinese-heavy estimate.
 *
 * JSON overhead per segment: keys + type + speaker + emotion ≈ 40 tokens.
 * Segment density: ~1 segment per 120-200 chars → use 150.
 * Character entries: ~50 tokens each, estimate 8 characters.
 */
function estimateMaxTokens(chapterCharCount: number): number {
  const textTokens = Math.ceil(chapterCharCount * 1.8);
  const estimatedSegments = Math.max(3, Math.ceil(chapterCharCount / 150));
  const structureTokens = estimatedSegments * 40;
  const characterTokens = 400;
  const total = Math.ceil((textTokens + structureTokens + characterTokens) * 1.1); // 10% safety margin
  return Math.max(4096, Math.min(total, 16384));
}

// ---------------------------------------------------------------------------
// Output normalization
// ---------------------------------------------------------------------------

function normalizeChapterOutput(raw: Record<string, unknown>): AnalysisChapterOutput {
  const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
  const rawCharacters = Array.isArray(raw.characters) ? raw.characters : [];

  const segments = rawSegments
    .filter((s): s is Record<string, unknown> => s !== null && typeof s === 'object')
    .map((s) => {
      const rawType = String(s.type || 'narration').trim().toLowerCase();
      const type: SegmentType = VALID_SEGMENT_TYPES.has(rawType as SegmentType)
        ? (rawType as SegmentType)
        : 'narration';
      return {
        type,
        speaker: String(s.speaker || 'narrator').trim(),
        text: String(s.text || '').trim(),
        ...(s.emotion ? { emotion: String(s.emotion).trim() } : {}),
      };
    })
    .filter((s) => s.text.length > 0);

  const characters = rawCharacters
    .filter((c): c is Record<string, unknown> => c !== null && typeof c === 'object')
    .map((c) => ({
      name: String(c.name || '').trim(),
      gender: normalizeGender(c.gender),
      ageGroup: normalizeAgeGroup(c.ageGroup),
      traits: Array.isArray(c.traits)
        ? c.traits.map((t: unknown) => String(t || '').trim()).filter((t: string) => t.length > 0)
        : [],
      isNew: Boolean(c.isNew),
    }))
    .filter((c) => c.name.length > 0 && c.name !== 'narrator');

  return { segments, characters };
}

function normalizeGender(value: unknown): 'male' | 'female' | 'neutral' {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'male' || s === 'female' || s === 'neutral') return s;
  return 'neutral';
}

function normalizeAgeGroup(value: unknown): 'child' | 'young' | 'adult' | 'elder' {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'child' || s === 'young' || s === 'adult' || s === 'elder') return s;
  return 'adult';
}

// ---------------------------------------------------------------------------
// Sub-chunk splitting for long chapters
// ---------------------------------------------------------------------------

/**
 * Split long text into chunks at paragraph boundaries, each ≤ maxChars.
 */
function splitTextIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const splitOversizedParagraph = (paragraph: string): string[] => {
    const trimmed = paragraph.trim();
    if (trimmed.length <= maxChars) return [trimmed];

    const parts: string[] = [];
    let remaining = trimmed;

    while (remaining.length > maxChars) {
      const maxIndex = Math.min(maxChars, remaining.length - 1);
      const minSearchIndex = Math.floor(maxChars * 0.5);
      let cut = -1;

      for (let i = maxIndex; i >= minSearchIndex; i -= 1) {
        const ch = remaining[i];
        if (ch === '\n' || ch === '。' || ch === '！' || ch === '？' || ch === '；' || ch === '.' || ch === '!' || ch === '?' || ch === ';') {
          cut = i + 1;
          break;
        }
      }

      if (cut <= 0) {
        cut = maxChars;
      }

      const piece = remaining.slice(0, cut).trim();
      if (piece) parts.push(piece);
      remaining = remaining.slice(cut).trimStart();
    }

    if (remaining.trim()) {
      parts.push(remaining.trim());
    }

    return parts;
  };

  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const parts = splitOversizedParagraph(trimmed);
    for (const part of parts) {
      if (current.length + part.length + 2 > maxChars && current.length > 0) {
        chunks.push(current.trim());
        current = part;
      } else {
        current += (current ? '\n\n' : '') + part;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Analyze a long chapter by splitting into sub-chunks.
 * Each chunk is analyzed independently with accumulated context from prior chunks.
 */
async function analyzeChapterInChunks(
  llm: LlmClient,
  chapterText: string,
  chapterIndex: number,
  totalChapters: number,
  accCtx: string,
): Promise<{ output: AnalysisChapterOutput; retryCount: number }> {
  const chunkSizes: number[] = [];
  for (const size of CHUNK_RETRY_SIZES) {
    if (!chunkSizes.includes(size)) {
      chunkSizes.push(size);
    }
  }

  let lastError: unknown;
  const chunkSizeErrors: Array<{ chunkSize: number; error: string }> = [];

  for (const chunkSize of chunkSizes) {
    const chunks = splitTextIntoChunks(chapterText, chunkSize);

    const allSegments: AnalysisChapterOutput['segments'] = [];
    const characterMap = new Map<string, AnalysisChapterOutput['characters'][number]>();
    let totalRetries = 0;
    let runningAccCtx = accCtx;

    try {
      for (let ci = 0; ci < chunks.length; ci++) {
        const { output, retryCount } = await analyzeChapter(
          llm,
          chunks[ci]!,
          chapterIndex,
          totalChapters,
          runningAccCtx + `\n\n(Processing chunk ${ci + 1}/${chunks.length} of this chapter)`,
        );

        allSegments.push(...output.segments);
        totalRetries = Math.max(totalRetries, retryCount);

        for (const ch of output.characters) {
          const existing = characterMap.get(ch.name);
          if (existing) {
            const mergedTraits = Array.from(new Set([...existing.traits, ...ch.traits]));
            characterMap.set(ch.name, { ...existing, traits: mergedTraits });
          } else {
            characterMap.set(ch.name, ch);
          }
        }

        const recentSegs = allSegments.slice(-RECENT_SEGMENTS_WINDOW);
        const charsForCtx = Array.from(characterMap.values()).map((c) => ({
          name: c.name,
          gender: c.gender,
          ageGroup: c.ageGroup,
          traits: c.traits,
          segmentCount: 0,
          tier: 'minor' as const,
        }));
        runningAccCtx = buildAccumulatedContext(charsForCtx, recentSegs.map((s, idx) => ({
          id: `tmp-${idx}`,
          chapterIndex,
          index: idx,
          ...s,
        })));
      }

      return {
        output: {
          segments: allSegments,
          characters: Array.from(characterMap.values()),
        },
        retryCount: totalRetries,
      };
    } catch (error) {
      lastError = error;
      chunkSizeErrors.push({
        chunkSize,
        error: summarizeModelError(error),
      });
    }
  }

  const chunkErrorSummary = chunkSizeErrors
    .map((entry) => `chunk<=${entry.chunkSize}: ${entry.error}`)
    .join('\n');

  throw new Error(
    `AB_ANALYSIS_CHAPTER_FAILED_AFTER_CHUNK_RETRIES: chapter ${chapterIndex + 1}/${totalChapters}\n` +
    (chunkErrorSummary ? `${chunkErrorSummary}\n` : '') +
    `LAST_ERROR: ${summarizeModelError(lastError)}`,
  );
}

// ---------------------------------------------------------------------------
// Single chapter/chunk analysis with three-retry
// ---------------------------------------------------------------------------

async function analyzeChapter(
  llm: LlmClient,
  chapterText: string,
  chapterIndex: number,
  totalChapters: number,
  accCtx: string,
): Promise<{ output: AnalysisChapterOutput; retryCount: number }> {
  const systemPrompt = buildAnalysisSystemPrompt();
  const userPrompt = buildChapterAnalysisPrompt({
    chapterText,
    chapterIndex,
    totalChapters,
    accumulatedContext: accCtx,
  });
  const maxTokens = estimateMaxTokens(chapterText.length);

  const minExpectedSegments = chapterText.length > 200 ? 3 : 0;

  // Attempt 1: standard
  const first = await llm.generateText({
    routeHint: 'chat/default',
    systemPrompt,
    userPrompt,
    maxTokens,
  });
  try {
    const output = normalizeChapterOutput(parseAnalysisJsonRecord(first.text));
    if (output.segments.length < minExpectedSegments) {
      throw new Error(`VS_TOO_FEW_SEGMENTS: got ${output.segments.length}, expected at least ${minExpectedSegments} for ${chapterText.length}-char chapter`);
    }
    return { output, retryCount: 0 };
  } catch (firstError) {
    // Attempt 2: repair prompt (low temp)
    const repairPrompt = buildRepairPrompt({
      schemaLines: ANALYSIS_SCHEMA_LINES,
      sourceText: chapterText,
      chapterIndex,
      chapterTotal: totalChapters,
      invalidOutput: first.text,
      parseError: summarizeModelError(firstError),
    });
    const second = await llm.generateText({
      routeHint: 'chat/retry-low-temp',
      systemPrompt: 'You are a JSON repair assistant. Return valid JSON only.',
      userPrompt: repairPrompt,
      temperature: 0.1,
      maxTokens,
    });
    try {
      const output2 = normalizeChapterOutput(parseAnalysisJsonRecord(second.text));
      if (output2.segments.length < minExpectedSegments) {
        throw new Error(`VS_TOO_FEW_SEGMENTS: got ${output2.segments.length}, expected at least ${minExpectedSegments}`);
      }
      return { output: output2, retryCount: 1 };
    } catch (secondError) {
      // Attempt 3: strict repair
      const strictPrompt = buildStrictRepairPrompt({
        schemaLines: ANALYSIS_SCHEMA_LINES,
        sourceText: chapterText,
        chapterIndex,
        chapterTotal: totalChapters,
        firstOutput: first.text,
        secondOutput: second.text,
        firstError: summarizeModelError(firstError),
        secondError: summarizeModelError(secondError),
      });
      const third = await llm.generateText({
        routeHint: 'chat/retry-low-temp',
        systemPrompt: 'CRITICAL JSON REPAIR. Return one valid JSON object.',
        userPrompt: strictPrompt,
        temperature: 0,
        maxTokens,
      });
      try {
        const output3 = normalizeChapterOutput(parseAnalysisJsonRecord(third.text));
        if (output3.segments.length < minExpectedSegments) {
          throw new Error(`VS_TOO_FEW_SEGMENTS: got ${output3.segments.length}, expected at least ${minExpectedSegments}`);
        }
        return { output: output3, retryCount: 2 };
      } catch (thirdError) {
        const snippet = (s: string) => s.length > 300 ? s.slice(0, 300) + '...' : s;
        throw new Error(
          `AB_ANALYSIS_CHAPTER_FAILED: chapter ${chapterIndex + 1}/${totalChapters}\n` +
          `  attempt1: ${summarizeModelError(firstError)}\n    output: ${snippet(first.text)}\n` +
          `  attempt2: ${summarizeModelError(secondError)}\n    output: ${snippet(second.text)}\n` +
          `  attempt3: ${summarizeModelError(thirdError)}\n    output: ${snippet(third.text)}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Full pipeline: analyzeAllChapters
// ---------------------------------------------------------------------------

export type AnalysisResult = {
  segments: ScriptSegment[];
  characters: CharacterProfile[];
  chapterResults: Array<{
    chapterIndex: number;
    segmentCount: number;
    newCharacters: number;
    retryCount: number;
    error?: string;
  }>;
  lastProcessedChapter: number;
};

export type AnalysisProgressCallback = (progress: {
  completedChapters: number;
  totalChapters: number;
  currentChapterIndex: number;
  segmentsSoFar: number;
  charactersSoFar: number;
}) => void;

function normalizeExistingSegments(
  chapters: SourceChapter[],
  existingSegments: ScriptSegment[],
): ScriptSegment[] {
  if (existingSegments.length === 0) return [];
  if (existingSegments.every(
    (segment) => Number.isFinite(segment.startOffset) && Number.isFinite(segment.endOffset),
  )) {
    return [...existingSegments];
  }

  const segmentsByChapter = new Map<number, ScriptSegment[]>();
  for (const segment of existingSegments) {
    const list = segmentsByChapter.get(segment.chapterIndex) ?? [];
    list.push(segment);
    segmentsByChapter.set(segment.chapterIndex, list);
  }

  const repaired: ScriptSegment[] = [];
  for (const [chapterIndex, chapterSegments] of segmentsByChapter.entries()) {
    const chapter = chapters[chapterIndex];
    if (!chapter) {
      repaired.push(...chapterSegments);
      continue;
    }

    const sorted = [...chapterSegments].sort((a, b) => a.index - b.index);
    try {
      const rebased = rebaseChapterSegmentsToSource({
        chapterText: chapter.rawText,
        chapterIndex,
        segments: sorted.map((segment) => ({
          type: segment.type,
          speaker: segment.speaker,
          text: segment.text,
          ...(segment.emotion ? { emotion: segment.emotion } : {}),
        })),
      });
      repaired.push(...sorted.map((segment, idx) => ({
        ...segment,
        text: rebased.segments[idx]!.text,
        startOffset: rebased.segments[idx]!.startOffset,
        endOffset: rebased.segments[idx]!.endOffset,
      })));
    } catch {
      repaired.push(...sorted.map((segment) => ({
        ...segment,
        startOffset: Number.isFinite(segment.startOffset) ? segment.startOffset : 0,
        endOffset: Number.isFinite(segment.endOffset) ? segment.endOffset : Math.max(0, segment.text.length),
      })));
    }
  }

  return repaired.sort((a, b) => a.index - b.index);
}

function buildFallbackChapterSegments(input: {
  chapter: SourceChapter;
  chapterIndex: number;
  startGlobalIndex: number;
}): ScriptSegment[] {
  const text = String(input.chapter.rawText || '').trim();
  if (!text) return [];
  return [{
    id: `seg-${input.chapterIndex}-fallback-0`,
    chapterIndex: input.chapterIndex,
    index: input.startGlobalIndex,
    type: 'narration',
    speaker: 'narrator',
    text,
    startOffset: 0,
    endOffset: text.length,
  }];
}

/**
 * Analyze all chapters sequentially with accumulated context.
 * Supports resumption via `startFromChapter` parameter.
 */
export async function analyzeAllChapters(
  llm: LlmClient,
  chapters: SourceChapter[],
  options?: {
    startFromChapter?: number;
    existingSegments?: ScriptSegment[];
    existingCharacters?: CharacterProfile[];
    onProgress?: AnalysisProgressCallback;
    abortSignal?: AbortSignal;
  },
): Promise<AnalysisResult> {
  const startFrom = options?.startFromChapter ?? 0;
  const allSegments: ScriptSegment[] = normalizeExistingSegments(chapters, options?.existingSegments ?? []);
  const characterMap = new Map<string, CharacterProfile>();

  // Initialize from existing characters
  for (const ch of options?.existingCharacters ?? []) {
    characterMap.set(ch.name, ch);
  }

  // Ensure narrator is always present
  if (!characterMap.has('narrator')) {
    characterMap.set('narrator', {
      name: 'narrator',
      gender: 'neutral',
      ageGroup: 'adult',
      traits: [],
      segmentCount: 0,
      tier: 'major',
    });
  }

  const chapterResults: AnalysisResult['chapterResults'] = [];
  let lastProcessedChapter = startFrom > 0 ? startFrom - 1 : -1;
  let globalSegmentIndex = allSegments.length;

  for (let i = startFrom; i < chapters.length; i++) {
    if (options?.abortSignal?.aborted) {
      break;
    }

    const chapter = chapters[i]!;

    // Build accumulated context for this chapter
    const recentSegments = allSegments.slice(-RECENT_SEGMENTS_WINDOW);
    const accCtx = buildAccumulatedContext(
      Array.from(characterMap.values()),
      recentSegments,
    );

    try {
      const { output, retryCount } = await analyzeChapterInChunks(
        llm,
        chapter.rawText,
        i,
        chapters.length,
        accCtx,
      );

      const rebased = rebaseChapterSegmentsToSource({
        chapterText: chapter.rawText,
        chapterIndex: i,
        segments: output.segments,
      });

      // Convert raw segments to ScriptSegments with IDs
      const chapterSegments: ScriptSegment[] = rebased.segments.map((seg, segIdx) => ({
        id: `seg-${i}-${segIdx}`,
        chapterIndex: i,
        index: globalSegmentIndex + segIdx,
        type: seg.type,
        speaker: seg.speaker,
        text: seg.text,
        startOffset: seg.startOffset,
        endOffset: seg.endOffset,
        ...(seg.emotion ? { emotion: seg.emotion } : {}),
      }));

      allSegments.push(...chapterSegments);
      globalSegmentIndex += chapterSegments.length;

      // Update character profiles
      let newCharCount = 0;
      for (const ch of output.characters) {
        const existing = characterMap.get(ch.name);
        if (existing) {
          // Update traits if new ones discovered
          const mergedTraits = Array.from(new Set([...existing.traits, ...ch.traits]));
          characterMap.set(ch.name, { ...existing, traits: mergedTraits });
        } else {
          characterMap.set(ch.name, {
            name: ch.name,
            gender: ch.gender,
            ageGroup: ch.ageGroup,
            traits: ch.traits,
            segmentCount: 0,
            tier: 'minor',
          });
          newCharCount++;
        }
      }

      chapterResults.push({
        chapterIndex: i,
        segmentCount: chapterSegments.length,
        newCharacters: newCharCount,
        retryCount,
      });
      lastProcessedChapter = i;

    } catch (err) {
      const fallbackSegments = buildFallbackChapterSegments({
        chapter,
        chapterIndex: i,
        startGlobalIndex: globalSegmentIndex,
      });
      if (fallbackSegments.length > 0) {
        allSegments.push(...fallbackSegments);
        globalSegmentIndex += fallbackSegments.length;
      }
      chapterResults.push({
        chapterIndex: i,
        segmentCount: fallbackSegments.length,
        newCharacters: 0,
        retryCount: 2,
        error: `analysis_failed_fallback_used: ${summarizeModelError(err)}`,
      });
      // Continue to next chapter — failed chapter falls back to narration segment
    }

    // Report progress
    options?.onProgress?.({
      completedChapters: i - startFrom + 1,
      totalChapters: chapters.length - startFrom,
      currentChapterIndex: i,
      segmentsSoFar: allSegments.length,
      charactersSoFar: characterMap.size,
    });
  }

  // Recompute segment counts for each character
  const segmentCountMap = new Map<string, number>();
  for (const seg of allSegments) {
    segmentCountMap.set(seg.speaker, (segmentCountMap.get(seg.speaker) ?? 0) + 1);
  }

  const characters = Array.from(characterMap.values()).map((ch) => ({
    ...ch,
    segmentCount: segmentCountMap.get(ch.name) ?? 0,
  }));

  if (allSegments.length === 0) {
    const failures = chapterResults
      .filter((item) => Boolean(item.error))
      .map((item) => `chapter ${item.chapterIndex + 1}: ${item.error}`)
      .join('; ');
    throw new Error(
      failures
        ? `AB_ANALYSIS_EMPTY_SEGMENTS: ${failures}`
        : 'AB_ANALYSIS_EMPTY_SEGMENTS: no segments produced',
    );
  }

  return {
    segments: allSegments,
    characters,
    chapterResults,
    lastProcessedChapter,
  };
}
