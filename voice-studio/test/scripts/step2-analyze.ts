#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Step 2 — Script Analysis (Layer 2 integration test)
//
// Reads a .txt file, splits into chapters, calls runtime Token API for
// per-chapter LLM analysis, classifies characters by tier, outputs JSON.
// Supports resume: if a previous output file exists, completed chapters
// are skipped and only unfinished chapters are re-analyzed.
//
// Usage:
//   npx tsx test/scripts/step2-analyze.ts [path-to-novel.txt]
//
// Example (Gemini):
//   NIMI_API_KEY=<your-gemini-key> \
//   NIMI_PROVIDER_TYPE=gemini \
//   NIMI_MODEL_ID=gemini/gemini-2.0-flash \
//     npx tsx test/scripts/step2-analyze.ts test/samples/my-novel.txt
//
// Example (DashScope):
//   NIMI_API_KEY=<your-dashscope-key> \
//   NIMI_PROVIDER_TYPE=dashscope \
//   NIMI_MODEL_ID=cloud/default \
//     npx tsx test/scripts/step2-analyze.ts
//
// Default input: test/samples/short-story.txt
// Output:        test/output/step2-result-<basename>.json
//
// Environment:
//   NIMI_RUNTIME_ENDPOINT  — runtime gRPC address (default: 127.0.0.1:46371)
//   NIMI_MODEL_ID          — chat model ID for token-api (default: cloud/default)
//   NIMI_API_KEY            — cloud provider API key (inline key-source)
//   NIMI_PROVIDER_TYPE      — cloud provider type (default: dashscope)
//   NIMI_PROVIDER_ENDPOINT  — cloud provider endpoint (optional)
//
// Prerequisites:
//   1. Start nimi runtime:  cd runtime && go run ./cmd/nimi
//   2. Ensure the model is available via token-api or local runtime
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Runtime } from '../../../../sdk/src/runtime/index.js';
import { createNimiAiProvider } from '../../../../sdk/src/ai-provider/index.js';
import { splitTextIntoChapters, computeTextStats } from '../../src/services/chapter-splitter.js';
import { analyzeAllChapters } from '../../src/services/analysis-pipeline.js';
import { classifyAllCharacters } from '../../src/services/character-tier.js';
import type { CharacterProfile, LlmClient } from '../../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RUNTIME_ENDPOINT = process.env.NIMI_RUNTIME_ENDPOINT ?? '127.0.0.1:46371';
const MODEL_ID = process.env.NIMI_MODEL_ID ?? 'cloud/default';
const API_KEY = process.env.NIMI_API_KEY ?? '';
const PROVIDER_TYPE = process.env.NIMI_PROVIDER_TYPE ?? 'dashscope';
const PROVIDER_ENDPOINT = process.env.NIMI_PROVIDER_ENDPOINT ?? '';
const APP_ID = 'nimi.voice-studio.layer2-test';
const SUBJECT_USER_ID = 'user-voice-studio-test';

const inputPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(__dirname, '../samples/short-story.txt');

const outputName = `step2-result-${basename(inputPath, '.txt')}.json`;
const OUTPUT_PATH = resolve(__dirname, '../output', outputName);

// ---------------------------------------------------------------------------
// Build gRPC metadata for inline key-source
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Runtime-backed LLM client (Token API via gRPC)
// ---------------------------------------------------------------------------

function createRuntimeLlmClient(endpoint: string, modelId: string): LlmClient {
  const runtime = new Runtime({
    appId: APP_ID,
    transport: {
      type: 'node-grpc',
      endpoint,
    },
    defaults: {
      callerKind: 'desktop-core',
      callerId: 'voice-studio-step2',
    },
  });

  const provider = createNimiAiProvider({
    runtime,
    appId: APP_ID,
    subjectUserId: SUBJECT_USER_ID,
    routePolicy: 'token-api',
    fallback: 'deny',
    timeoutMs: 300_000,
    metadata: buildMetadata(),
  });

  const model = provider.text(modelId);

  return {
    async generateText(input) {
      const generated = await model.doGenerate({
        prompt: [
          { role: 'system', content: input.systemPrompt },
          {
            role: 'user',
            content: [{ type: 'text', text: input.userPrompt }],
          },
        ],
        temperature: input.temperature ?? 0.7,
        maxOutputTokens: input.maxTokens ?? 4096,
        providerOptions: {},
      });

      const text = generated.content
        .filter((item) => item.type === 'text')
        .map((item) => (item as { type: 'text'; text: string }).text)
        .join('')
        .trim();

      return { text };
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Voice Studio Step 2: Analysis Test (Runtime Token API) ===');
  console.log(`Runtime:  ${RUNTIME_ENDPOINT}`);
  console.log(`Model:    ${MODEL_ID}`);
  console.log(`Provider: ${PROVIDER_TYPE}`);
  console.log(`KeyMode:  ${API_KEY ? 'inline' : 'runtime-config'}`);
  console.log(`Input:    ${inputPath}`);
  console.log(`Output:   ${OUTPUT_PATH}`);
  console.log('');

  // 1. Read & split
  const rawText = readFileSync(inputPath, 'utf-8');
  const chapters = splitTextIntoChapters(rawText);
  const stats = computeTextStats(chapters);

  console.log(`Text stats: ${stats.totalChars} chars, ${stats.totalChapters} chapters`);
  for (const ch of stats.chapterStats) {
    console.log(`  Chapter ${ch.index}: "${ch.title}" (${ch.charCount} chars)`);
  }
  console.log('');

  // 2. Check for existing output (resume support)
  let startFromChapter = 0;
  let existingSegments: typeof result.segments = [];
  let existingCharacters: CharacterProfile[] = [];
  let previousChapterResults: typeof result.chapterResults = [];

  if (existsSync(OUTPUT_PATH)) {
    try {
      const prev = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
      const lastDone = prev.lastProcessedChapter ?? -1;
      // Find next chapter to process: skip chapters that succeeded
      const completedSet = new Set<number>();
      for (const cr of prev.chapterResults ?? []) {
        if (!cr.error) completedSet.add(cr.chapterIndex);
      }
      // Find first incomplete chapter
      let resumeFrom = chapters.length; // default: all done
      for (let i = 0; i < chapters.length; i++) {
        if (!completedSet.has(i)) { resumeFrom = i; break; }
      }
      if (resumeFrom > 0 && resumeFrom < chapters.length) {
        startFromChapter = resumeFrom;
        existingSegments = (prev.segments ?? []).filter(
          (s: { chapterIndex: number }) => completedSet.has(s.chapterIndex),
        );
        existingCharacters = prev.characters ?? [];
        // Keep only completed chapter results
        previousChapterResults = (prev.chapterResults ?? []).filter(
          (cr: { error?: string }) => !cr.error,
        );
        console.log(`Resuming from chapter ${resumeFrom} (${completedSet.size} chapters cached)`);
      } else if (resumeFrom >= chapters.length) {
        console.log('All chapters already completed. Delete output file to re-run.');
        return;
      }
    } catch {
      console.log('Could not read previous output, starting fresh.');
    }
  }

  // 3. Analyze via runtime Token API
  const llm = createRuntimeLlmClient(RUNTIME_ENDPOINT, MODEL_ID);

  console.log('Analyzing chapters...');
  const startedAt = performance.now();

  const result = await analyzeAllChapters(llm, chapters, {
    startFromChapter,
    existingSegments,
    existingCharacters,
    onProgress: (p) => {
      const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `  [${p.completedChapters}/${p.totalChapters}] ` +
        `chapter ${p.currentChapterIndex + 1} done — ` +
        `${p.segmentsSoFar} segments, ${p.charactersSoFar} characters ` +
        `(${elapsed}s)`,
      );
    },
  });

  // Merge with previously completed chapter results
  const mergedChapterResults = [...previousChapterResults, ...result.chapterResults];

  const totalTime = ((performance.now() - startedAt) / 1000).toFixed(1);

  // 4. Classify tiers
  const classifiedCharacters = classifyAllCharacters(result.characters);

  // 4. Output
  const output = {
    meta: {
      inputFile: inputPath,
      modelId: MODEL_ID,
      providerType: PROVIDER_TYPE,
      keyMode: API_KEY ? 'inline' : 'runtime-config',
      runtimeEndpoint: RUNTIME_ENDPOINT,
      totalTimeSeconds: Number(totalTime),
      timestamp: new Date().toISOString(),
    },
    stats,
    segments: result.segments,
    characters: classifiedCharacters,
    chapterResults: mergedChapterResults,
    lastProcessedChapter: result.lastProcessedChapter,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  console.log('');
  console.log(`Done in ${totalTime}s`);
  console.log(`Results written to: ${OUTPUT_PATH}`);
  console.log(`Total segments: ${result.segments.length}`);
  console.log(`Total characters: ${classifiedCharacters.length}`);
  for (const ch of classifiedCharacters) {
    console.log(`  ${ch.name}: ${ch.tier} (${ch.segmentCount} segments, ${ch.gender}, ${ch.ageGroup})`);
  }

  const failed = result.chapterResults.filter((r) => r.error);
  if (failed.length > 0) {
    console.log(`\nFailed chapters: ${failed.length}`);
    for (const f of failed) {
      console.log(`  Chapter ${f.chapterIndex}: ${f.error}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
