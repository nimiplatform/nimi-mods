#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Step 2 v2 — Plan B: Regex-first analysis with LLM speaker patch
//
// Phase 1: regexPreAnalyze() segments ALL chapters deterministically
// Phase 2: LLM patches only low-confidence speaker attributions (~3-5 tokens each)
// Phase 3: Merge patched speakers back into segments
//
// Token savings: ~98% vs original step2 (no text reproduction in LLM output)
//
// Usage:
//   npx tsx test/scripts/step2-analyze-v2.ts [path-to-novel.txt]
//
// Environment: same as step2-analyze.ts
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Runtime } from '../../../../sdk/src/runtime/index.js';
import { splitTextIntoChapters, computeTextStats } from '../../src/services/chapter-splitter.js';
import { regexPreAnalyze, type PreAnalyzedSegment } from '../../src/services/regex-pre-analyzer.js';
import { splitLongSegments } from '../../src/services/segment-post-processor.js';
import { classifyAllCharacters } from '../../src/services/character-tier.js';
import type { LlmClient, ScriptSegment } from '../../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RUNTIME_ENDPOINT = process.env.NIMI_RUNTIME_ENDPOINT ?? '127.0.0.1:46371';
const MODEL_ID = process.env.NIMI_MODEL_ID ?? 'cloud/default';
const CONNECTOR_ID = process.env.NIMI_CONNECTOR_ID ?? '';
const API_KEY = process.env.NIMI_API_KEY ?? '';
const PROVIDER_TYPE = process.env.NIMI_PROVIDER_TYPE ?? 'dashscope';
const PROVIDER_ENDPOINT = process.env.NIMI_PROVIDER_ENDPOINT ?? '';
const APP_ID = 'nimi.audio-book.layer2-test-v2';
const SUBJECT_USER_ID = 'user-audio-book-test';

/** Context window around each low-confidence segment for LLM patch */
const PATCH_CONTEXT_CHARS = 120;

/** Max segments to batch in a single LLM call */
const PATCH_BATCH_SIZE = 10;

const inputPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(__dirname, '../test-novel/sant-2.txt');

const outputName = `step2-v2-result-${basename(inputPath, '.txt')}.json`;
const OUTPUT_PATH = resolve(__dirname, '../output', outputName);

// ---------------------------------------------------------------------------
// Runtime setup (same as step2-analyze.ts)
// ---------------------------------------------------------------------------

type RuntimeConnectorRecord = {
  connectorId: string;
  provider: string;
  label: string;
  hasCredential: boolean;
};

type RuntimeConnectorModelRecord = {
  modelId: string;
  available: boolean;
  capabilities: string[];
};

function buildMetadata(): Record<string, string> | undefined {
  if (!API_KEY) return undefined;
  const md: Record<string, string> = {
    'x-nimi-key-source': 'inline',
    'x-nimi-provider-type': PROVIDER_TYPE,
    'x-nimi-provider-api-key': API_KEY,
  };
  if (PROVIDER_ENDPOINT) {
    md['x-nimi-provider-endpoint'] = PROVIDER_ENDPOINT;
  }
  return md;
}

function createRuntimeInstance(endpoint: string): Runtime {
  return new Runtime({
    appId: APP_ID,
    transport: {
      type: 'node-grpc',
      endpoint,
    },
    defaults: {
      callerKind: 'desktop-core',
      callerId: 'audio-book-step2-v2',
    },
    subjectContext: {
      subjectUserId: SUBJECT_USER_ID,
    },
  });
}

function isPlaceholderModel(modelId: string): boolean {
  const normalized = String(modelId || '').trim().toLowerCase();
  return !normalized || normalized === 'cloud/default';
}

function preferTextModel(models: RuntimeConnectorModelRecord[]): string {
  const availableTextModels = models
    .filter((model) => model.available && model.capabilities.includes('text.generate'))
    .map((model) => model.modelId);
  if (availableTextModels.length === 0) return 'cloud/default';
  const flash = availableTextModels.find((modelId) => modelId.includes('flash'));
  if (flash) return flash;
  return availableTextModels[0]!;
}

async function resolveRuntimeConnector(runtime: Runtime): Promise<{
  connectorId: string;
  modelId: string;
  provider: string;
  availableConnectors: RuntimeConnectorRecord[];
}> {
  const listResponse = await runtime.connector.listConnectors({});
  const connectors = Array.isArray((listResponse as { connectors?: unknown[] }).connectors)
    ? ((listResponse as { connectors?: unknown[] }).connectors ?? []).map((item) => {
      const record = item as Record<string, unknown>;
      return {
        connectorId: String(record.connectorId || ''),
        provider: String(record.provider || ''),
        label: String(record.label || ''),
        hasCredential: Boolean(record.hasCredential),
      };
    }).filter((item) => item.connectorId)
    : [];

  const cloudConnectors = connectors.filter((connector) => connector.provider !== 'local');
  const exactConnector = CONNECTOR_ID
    ? cloudConnectors.find((connector) => connector.connectorId === CONNECTOR_ID) || null
    : null;
  const providerPreferred = PROVIDER_TYPE
    ? cloudConnectors.find((connector) => connector.provider === PROVIDER_TYPE && connector.hasCredential) || null
    : null;
  const firstReadyCloud = cloudConnectors.find((connector) => connector.hasCredential) || cloudConnectors[0] || null;
  const selectedConnector = exactConnector || providerPreferred || firstReadyCloud;

  if (!selectedConnector) {
    return {
      connectorId: CONNECTOR_ID,
      modelId: MODEL_ID,
      provider: PROVIDER_TYPE,
      availableConnectors: connectors,
    };
  }

  const modelResponse = await runtime.connector.listConnectorModels({
    connectorId: selectedConnector.connectorId,
  });
  const models = Array.isArray((modelResponse as { models?: unknown[] }).models)
    ? ((modelResponse as { models?: unknown[] }).models ?? []).map((item) => {
      const record = item as Record<string, unknown>;
      return {
        modelId: String(record.modelId || ''),
        available: Boolean(record.available),
        capabilities: Array.isArray(record.capabilities)
          ? record.capabilities.map((capability) => String(capability || ''))
          : [],
      };
    }).filter((item) => item.modelId)
    : [];

  const selectedModel = isPlaceholderModel(MODEL_ID)
    ? preferTextModel(models)
    : MODEL_ID;

  return {
    connectorId: selectedConnector.connectorId,
    modelId: selectedModel,
    provider: selectedConnector.provider,
    availableConnectors: connectors,
  };
}

function createRuntimeLlmClient(runtime: Runtime, modelId: string, connectorId?: string): LlmClient {
  return {
    async generateText(input) {
      const generated = await runtime.ai.text.generate({
        model: modelId,
        input: input.userPrompt,
        system: input.systemPrompt,
        route: 'cloud',
        fallback: 'deny',
        connectorId: String(connectorId || '').trim() || undefined,
        metadata: buildMetadata(),
        temperature: input.temperature ?? 0.7,
        maxTokens: input.maxTokens ?? 4096,
        timeoutMs: 300_000,
      });
      return { text: generated.text.trim() };
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 2: LLM speaker patch
// ---------------------------------------------------------------------------

type PatchTarget = {
  chapterIndex: number;
  segmentIndex: number;
  quoteText: string;
  contextBefore: string;
  contextAfter: string;
  regexSpeaker: string;
  confidence: string;
};

function collectPatchTargets(
  chapters: Array<{ rawText: string }>,
  allChapterSegments: Array<{ chapterIndex: number; segments: PreAnalyzedSegment[] }>,
): PatchTarget[] {
  const targets: PatchTarget[] = [];

  for (const entry of allChapterSegments) {
    const chapterText = chapters[entry.chapterIndex]!.rawText;

    for (let si = 0; si < entry.segments.length; si++) {
      const seg = entry.segments[si]!;
      if (seg.confidence !== 'low' || seg.type === 'narration') continue;

      const contextBefore = chapterText.slice(
        Math.max(0, seg.startOffset - PATCH_CONTEXT_CHARS),
        seg.startOffset,
      );
      const contextAfter = chapterText.slice(
        seg.endOffset,
        Math.min(chapterText.length, seg.endOffset + PATCH_CONTEXT_CHARS),
      );

      targets.push({
        chapterIndex: entry.chapterIndex,
        segmentIndex: si,
        quoteText: seg.text,
        contextBefore,
        contextAfter,
        regexSpeaker: seg.speaker,
        confidence: seg.confidence,
      });
    }
  }

  return targets;
}

function buildPatchPrompt(
  batch: PatchTarget[],
  knownCharacters: string[],
): { systemPrompt: string; userPrompt: string } {
  const charList = knownCharacters.length > 0
    ? `已知角色：${knownCharacters.join('、')}`
    : '（暂无已知角色）';

  const systemPrompt = [
    '你是一个中文小说对白归属判断器。',
    '给定对白片段及其前后文，判断说话人是谁。',
    '只返回JSON数组，每项只有一个 speaker 字段。',
    '如果无法确定，返回 "unknown"。',
    '不要返回任何其他文字。',
  ].join('');

  const entries = batch.map((target, idx) => {
    const lines = [
      `[${idx}]`,
      `前文：…${target.contextBefore}`,
      `对白：${target.quoteText}`,
      `后文：${target.contextAfter}…`,
    ];
    if (target.regexSpeaker && target.regexSpeaker !== 'unknown' && target.regexSpeaker !== 'narrator') {
      lines.push(`regex推测：${target.regexSpeaker}（低置信度，需验证）`);
    }
    return lines.join('\n');
  });

  const userPrompt = [
    charList,
    '',
    '请判断以下每段对白的说话人：',
    '',
    ...entries,
    '',
    `返回JSON数组（${batch.length}项），格式：[{"speaker":"角色名"},...]`,
  ].join('\n');

  return { systemPrompt, userPrompt };
}

function parsePatchResponse(text: string, batchSize: number): string[] {
  // Extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return Array(batchSize).fill('unknown');

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return Array(batchSize).fill('unknown');

    return parsed.map((item: unknown) => {
      if (item && typeof item === 'object' && 'speaker' in item) {
        return String((item as { speaker: unknown }).speaker || 'unknown').trim();
      }
      return 'unknown';
    });
  } catch {
    return Array(batchSize).fill('unknown');
  }
}

async function patchSpeakers(
  llm: LlmClient,
  targets: PatchTarget[],
  knownCharacters: string[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (targets.length === 0) return results;

  // Process in batches
  for (let i = 0; i < targets.length; i += PATCH_BATCH_SIZE) {
    const batch = targets.slice(i, i + PATCH_BATCH_SIZE);
    const { systemPrompt, userPrompt } = buildPatchPrompt(batch, knownCharacters);

    const estimatedInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) * 1.8);
    const estimatedOutputTokens = batch.length * 15; // ~15 tokens per {"speaker":"XX"}

    console.log(`  Patch batch ${Math.floor(i / PATCH_BATCH_SIZE) + 1}: ${batch.length} segments (~${estimatedInputTokens} input + ~${estimatedOutputTokens} output tokens)`);

    try {
      const response = await llm.generateText({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: Math.max(256, estimatedOutputTokens * 2),
      });

      const speakers = parsePatchResponse(response.text, batch.length);
      for (let bi = 0; bi < batch.length; bi++) {
        const target = batch[bi]!;
        const key = `${target.chapterIndex}:${target.segmentIndex}`;
        const speaker = speakers[bi] ?? 'unknown';
        results.set(key, speaker);
      }
    } catch (err) {
      console.log(`  Patch batch failed: ${err instanceof Error ? err.message : String(err)}`);
      // Keep regex speaker on failure
      for (const target of batch) {
        const key = `${target.chapterIndex}:${target.segmentIndex}`;
        results.set(key, target.regexSpeaker);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Audio Book Step 2 v2: Regex + LLM Speaker Patch ===');
  console.log(`Input:    ${inputPath}`);
  console.log(`Output:   ${OUTPUT_PATH}`);
  console.log('');

  // 1. Read & split
  const rawText = readFileSync(inputPath, 'utf-8');
  const chapters = splitTextIntoChapters(rawText);
  const stats = computeTextStats(chapters);

  console.log(`Text: ${stats.totalChars} chars, ${stats.totalChapters} chapters`);
  for (const ch of stats.chapterStats) {
    console.log(`  Chapter ${ch.index}: "${ch.title}" (${ch.charCount} chars)`);
  }
  console.log('');

  // =========================================================================
  // Phase 1: Regex pre-analysis on ALL chapters
  // =========================================================================

  console.log('--- Phase 1: Regex Segmentation ---\n');
  const phase1Start = performance.now();

  const allChapterSegments: Array<{
    chapterIndex: number;
    segments: PreAnalyzedSegment[];
    characterNames: string[];
    stats: { highConfidence: number; mediumConfidence: number; lowConfidence: number; highConfidenceRatio: number };
    canBypassLlm: boolean;
  }> = [];

  const allCharacterNames = new Set<string>();
  let totalRegexSegments = 0;
  let totalLowConfidence = 0;
  let totalDialogueSegments = 0;

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]!;
    const result = regexPreAnalyze(chapter.rawText);

    allChapterSegments.push({
      chapterIndex: i,
      segments: result.segments,
      characterNames: result.characterNames,
      stats: result.stats,
      canBypassLlm: result.canBypassLlm,
    });

    for (const name of result.characterNames) allCharacterNames.add(name);
    totalRegexSegments += result.segments.length;

    const lowDialogueCount = result.segments.filter(
      (s) => s.confidence === 'low' && s.type !== 'narration',
    ).length;
    const dialogueCount = result.segments.filter((s) => s.type !== 'narration').length;
    totalLowConfidence += lowDialogueCount;
    totalDialogueSegments += dialogueCount;

    console.log(`  Chapter ${i}: "${chapter.title}" — ${result.segments.length} segments, ` +
      `confidence: H${result.stats.highConfidence}/M${result.stats.mediumConfidence}/L${result.stats.lowConfidence} ` +
      `(${(result.stats.highConfidenceRatio * 100).toFixed(0)}%), ` +
      `low-dialogue: ${lowDialogueCount}`);
  }

  const phase1Time = performance.now() - phase1Start;
  console.log(`\nPhase 1 complete: ${phase1Time.toFixed(2)}ms`);
  console.log(`  Total segments: ${totalRegexSegments}`);
  console.log(`  Characters found: ${Array.from(allCharacterNames).join(', ')}`);
  console.log(`  Low-confidence dialogue segments needing LLM: ${totalLowConfidence}/${totalDialogueSegments}`);
  console.log('');

  // =========================================================================
  // Phase 2: LLM speaker patch (only low-confidence segments)
  // =========================================================================

  const patchTargets = collectPatchTargets(chapters, allChapterSegments);

  let phase2Time = 0;
  let llmPatchCount = 0;
  let estimatedTotalTokens = 0;
  const patchResults = new Map<string, string>();

  if (patchTargets.length > 0) {
    console.log(`--- Phase 2: LLM Speaker Patch (${patchTargets.length} segments) ---\n`);

    // Connect to runtime
    const runtime = createRuntimeInstance(RUNTIME_ENDPOINT);
    const route = await resolveRuntimeConnector(runtime);
    console.log(`  Connector: ${route.connectorId || '(auto)'}`);
    console.log(`  Model:     ${route.modelId}`);
    console.log('');

    const llm = createRuntimeLlmClient(runtime, route.modelId, route.connectorId);

    const phase2Start = performance.now();
    const results = await patchSpeakers(llm, patchTargets, Array.from(allCharacterNames));
    phase2Time = performance.now() - phase2Start;
    llmPatchCount = results.size;

    // Merge patch results
    for (const [key, speaker] of results) {
      patchResults.set(key, speaker);
    }

    // Estimate tokens
    for (let i = 0; i < patchTargets.length; i += PATCH_BATCH_SIZE) {
      const batch = patchTargets.slice(i, i + PATCH_BATCH_SIZE);
      const { systemPrompt, userPrompt } = buildPatchPrompt(batch, Array.from(allCharacterNames));
      estimatedTotalTokens += Math.ceil((systemPrompt.length + userPrompt.length) * 1.8);
      estimatedTotalTokens += batch.length * 15;
    }

    console.log(`\nPhase 2 complete: ${phase2Time.toFixed(0)}ms`);
    console.log(`  Patched: ${llmPatchCount} segments`);
    console.log(`  Estimated tokens: ~${estimatedTotalTokens}`);
  } else {
    console.log('--- Phase 2: Skipped (no low-confidence dialogue segments) ---');
  }
  console.log('');

  // =========================================================================
  // Phase 3: Build final segments
  // =========================================================================

  console.log('--- Phase 3: Build Final Segments ---\n');
  const phase3Start = performance.now();

  const allSegments: ScriptSegment[] = [];
  let globalIndex = 0;

  for (const entry of allChapterSegments) {
    const chapterSegs = entry.segments;

    // Apply LLM patches
    for (let si = 0; si < chapterSegs.length; si++) {
      const key = `${entry.chapterIndex}:${si}`;
      const patchedSpeaker = patchResults.get(key);
      if (patchedSpeaker && patchedSpeaker !== 'unknown') {
        chapterSegs[si]!.speaker = patchedSpeaker;
      }
    }

    // Convert to ScriptSegment
    const rawSegments: ScriptSegment[] = chapterSegs.map((seg, segIdx) => ({
      id: `seg-${entry.chapterIndex}-${segIdx}`,
      chapterIndex: entry.chapterIndex,
      index: globalIndex + segIdx,
      type: seg.type,
      speaker: seg.speaker,
      text: seg.text,
      startOffset: seg.startOffset,
      endOffset: seg.endOffset,
    }));

    // Post-process: split long segments
    const finalSegments = splitLongSegments(rawSegments);
    for (let si = 0; si < finalSegments.length; si++) {
      finalSegments[si]!.index = globalIndex + si;
    }

    allSegments.push(...finalSegments);
    globalIndex += finalSegments.length;
  }

  const phase3Time = performance.now() - phase3Start;
  const totalTime = phase1Time + phase2Time + phase3Time;

  // Build character profiles
  const characterMap = new Map<string, { name: string; segmentCount: number }>();
  characterMap.set('narrator', { name: 'narrator', segmentCount: 0 });
  for (const seg of allSegments) {
    const existing = characterMap.get(seg.speaker);
    if (existing) {
      existing.segmentCount += 1;
    } else {
      characterMap.set(seg.speaker, { name: seg.speaker, segmentCount: 1 });
    }
  }

  const characters = Array.from(characterMap.values())
    .filter((c) => c.name !== 'narrator' && c.name !== 'unknown')
    .map((c) => ({
      name: c.name,
      gender: 'neutral' as const,
      ageGroup: 'adult' as const,
      traits: [] as string[],
      segmentCount: c.segmentCount,
      tier: 'minor' as const,
    }));

  const classifiedCharacters = classifyAllCharacters(characters);

  console.log(`Phase 3 complete: ${phase3Time.toFixed(2)}ms`);
  console.log('');

  // =========================================================================
  // Output & summary
  // =========================================================================

  const output = {
    meta: {
      inputFile: inputPath,
      version: 'v2-plan-b',
      totalTimeMs: Math.round(totalTime),
      phase1TimeMs: Math.round(phase1Time),
      phase2TimeMs: Math.round(phase2Time),
      phase3TimeMs: Math.round(phase3Time),
      llmPatchCount,
      estimatedLlmTokens: estimatedTotalTokens,
      timestamp: new Date().toISOString(),
    },
    stats,
    segments: allSegments,
    characters: classifiedCharacters,
    chapterDetails: allChapterSegments.map((entry) => ({
      chapterIndex: entry.chapterIndex,
      segmentCount: entry.segments.length,
      characters: entry.characterNames,
      confidence: entry.stats,
      canBypassLlm: entry.canBypassLlm,
    })),
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  console.log('=== Summary ===\n');
  console.log(`Total time:        ${totalTime.toFixed(0)}ms`);
  console.log(`  Phase 1 (regex): ${phase1Time.toFixed(2)}ms`);
  console.log(`  Phase 2 (LLM):   ${phase2Time.toFixed(0)}ms (${llmPatchCount} patches)`);
  console.log(`  Phase 3 (build): ${phase3Time.toFixed(2)}ms`);
  console.log(`Total segments:    ${allSegments.length}`);
  console.log(`Characters:        ${classifiedCharacters.length}`);
  for (const ch of classifiedCharacters) {
    console.log(`  ${ch.name}: ${ch.tier} (${ch.segmentCount} segments)`);
  }
  console.log('');

  // Compare with original step2 LLM result
  const llmResultPath = resolve(__dirname, '../output', `step2-result-${basename(inputPath, '.txt')}.json`);
  if (existsSync(llmResultPath)) {
    const llmResult = JSON.parse(readFileSync(llmResultPath, 'utf-8'));
    const llmTime = llmResult.meta?.totalTimeSeconds;
    const llmSegments = llmResult.segments?.length ?? 0;

    console.log('=== vs Original Step 2 (full LLM) ===\n');
    if (typeof llmTime === 'number') {
      const llmTimeMs = llmTime * 1000;
      console.log(`Time:   ${totalTime.toFixed(0)}ms vs ${llmTimeMs.toFixed(0)}ms (${(llmTimeMs / totalTime).toFixed(0)}x faster)`);
    }
    console.log(`Segments: ${allSegments.length} vs ${llmSegments}`);

    // Estimate original token usage: ~1.8 tokens/char * 2 (input+output) per chapter
    const originalEstimatedTokens = chapters.reduce(
      (sum, ch) => sum + Math.ceil(ch.rawText.length * 1.8 * 2),
      0,
    );
    console.log(`Estimated tokens: ~${estimatedTotalTokens} vs ~${originalEstimatedTokens} ` +
      `(${estimatedTotalTokens > 0 ? (100 - (estimatedTotalTokens / originalEstimatedTokens) * 100).toFixed(1) : '100'}% savings)`);
  }

  console.log(`\nOutput: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
