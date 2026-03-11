#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Step 2 — Script Analysis (Layer 2 integration test)
//
// Reads a .txt file, splits into chapters, calls runtime Cloud for
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
// Default input: test/test-novel/sant-2.txt
// Output:        test/output/step2-result-<basename>.json
//
// Environment:
//   NIMI_RUNTIME_ENDPOINT  — runtime gRPC address (default: 127.0.0.1:46371)
//   NIMI_MODEL_ID          — chat model ID for cloud (default: cloud/default)
//   NIMI_CONNECTOR_ID      — preferred runtime connector ID (optional)
//   NIMI_API_KEY            — cloud provider API key (inline key-source)
//   NIMI_PROVIDER_TYPE      — cloud provider type (default: dashscope)
//   NIMI_PROVIDER_ENDPOINT  — cloud provider endpoint (optional)
//
// Prerequisites:
//   1. Start nimi runtime:  cd runtime && go run ./cmd/nimi
//   2. Ensure the model is available via cloud or local runtime
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Runtime } from '@nimiplatform/sdk/runtime';
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
const CONNECTOR_ID = process.env.NIMI_CONNECTOR_ID ?? '';
const API_KEY = process.env.NIMI_API_KEY ?? '';
const PROVIDER_TYPE = process.env.NIMI_PROVIDER_TYPE ?? 'dashscope';
const PROVIDER_ENDPOINT = process.env.NIMI_PROVIDER_ENDPOINT ?? '';
const APP_ID = 'nimi.audio-book.layer2-test';
const SUBJECT_USER_ID = 'user-audio-book-test';

const inputPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(__dirname, '../test-novel/sant-2.txt');

const outputName = `step2-result-${basename(inputPath, '.txt')}.json`;
const OUTPUT_PATH = resolve(__dirname, '../output', outputName);

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

const DEFAULT_LIST_CONNECTORS_REQUEST = {
  pageSize: 0,
  pageToken: '',
  kindFilter: 0,
  statusFilter: 0,
  providerFilter: '',
} as const;

function createListConnectorModelsRequest(connectorId: string) {
  return {
    connectorId,
    forceRefresh: false,
    pageSize: 0,
    pageToken: '',
  };
}

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
// Runtime-backed LLM client (Cloud via gRPC)
// ---------------------------------------------------------------------------

function createRuntimeInstance(endpoint: string): Runtime {
  return new Runtime({
    appId: APP_ID,
    transport: {
      type: 'node-grpc',
      endpoint,
    },
    defaults: {
      callerKind: 'desktop-core',
      callerId: 'audio-book-step2',
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
  const listResponse = await runtime.connector.listConnectors(DEFAULT_LIST_CONNECTORS_REQUEST);
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

  const modelResponse = await runtime.connector.listConnectorModels(
    createListConnectorModelsRequest(selectedConnector.connectorId),
  );
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Audio Book Step 2: Analysis Test (Runtime Cloud) ===');
  console.log(`Runtime:  ${RUNTIME_ENDPOINT}`);
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
  const runtime = createRuntimeInstance(RUNTIME_ENDPOINT);
  const route = await resolveRuntimeConnector(runtime);
  console.log(`Connector:${route.connectorId || '(auto)'}`);
  console.log(`Model:    ${route.modelId}`);
  if (route.availableConnectors.length > 0) {
    console.log(`Connectors:${route.availableConnectors.map((connector) => `${connector.connectorId}:${connector.provider}`).join(', ')}`);
  }

  const llm = createRuntimeLlmClient(runtime, route.modelId, route.connectorId);

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
      modelId: route.modelId,
      connectorId: route.connectorId || undefined,
      providerType: route.provider || PROVIDER_TYPE,
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
  const deterministicChapters = mergedChapterResults.filter((item) => !item.error && (item.chunkCount ?? 0) === 0).length;
  const llmChapters = mergedChapterResults.filter((item) => !item.error && (item.chunkCount ?? 0) > 0).length;
  const retriedChapters = mergedChapterResults.filter((item) => (item.retryCount ?? 0) > 0).length;
  console.log(`Deterministic chapters: ${deterministicChapters}`);
  console.log(`LLM chapters: ${llmChapters}`);
  console.log(`Retried chapters: ${retriedChapters}`);
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
