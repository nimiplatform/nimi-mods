#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Step 4 — Audio Synthesis (Layer 2 integration test)
//
// Reads step2 (segments) + step3 (castings), synthesizes audio for the first
// chapter via runtime TTS (SubmitMediaJob → DashScope native adapter).
// Saves individual segment MP3 files to test/output/audio/<basename>/.
// Uses sliding-window concurrency with retry and error classification.
//
// Usage:
//   npx tsx test/scripts/step4-synthesize.ts [step2-result.json] [step3-result.json]
//
// Example (synthesize first 3 segments only):
//   NIMI_API_KEY=<your-dashscope-key> \
//   NIMI_PROVIDER_TYPE=dashscope \
//   NIMI_TTS_MAX_SEGMENTS=3 \
//     npx tsx test/scripts/step4-synthesize.ts \
//       test/output/step2-result-my-novel.json \
//       test/output/step3-result-my-novel.json
//
// Example (synthesize all segments in first chapter):
//   NIMI_API_KEY=<your-dashscope-key> \
//   NIMI_PROVIDER_TYPE=dashscope \
//     npx tsx test/scripts/step4-synthesize.ts
//
// Default inputs: test/output/step2-result-short-story.json
//                 test/output/step3-result-short-story.json
// Output:         test/output/step4-result-<basename>.json
// Audio:          test/output/audio/<basename>/<segmentId>.mp3
//
// Environment:
//   NIMI_RUNTIME_ENDPOINT  — runtime gRPC address (default: 127.0.0.1:46371)
//   NIMI_TTS_MODEL_ID      — TTS model ID (default: qwen3-tts-instruct-flash)
//   NIMI_API_KEY            — cloud provider API key (inline key-source)
//   NIMI_PROVIDER_TYPE      — cloud provider type (default: dashscope)
//   NIMI_PROVIDER_ENDPOINT  — cloud provider endpoint (optional)
//   NIMI_TTS_MAX_SEGMENTS   — limit segments to synthesize (default: 0 = all)
//
// Prerequisites:
//   1. Start nimi runtime:  cd runtime && go run ./cmd/nimi
//   2. Run step2 + step3 first to produce analysis + casting JSON
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Runtime } from '../../../../sdk/src/runtime/index.js';
import { runSynthesisJob } from '../../src/services/synthesis-scheduler.js';
import type { ScriptSegment, TtsClient, VoiceCasting } from '../../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RUNTIME_ENDPOINT = process.env.NIMI_RUNTIME_ENDPOINT ?? '127.0.0.1:46371';
const TTS_MODEL_ID = process.env.NIMI_TTS_MODEL_ID ?? 'qwen3-tts-instruct-flash';
const API_KEY = process.env.NIMI_API_KEY ?? '';
const PROVIDER_TYPE = process.env.NIMI_PROVIDER_TYPE ?? 'dashscope';
const PROVIDER_ENDPOINT = process.env.NIMI_PROVIDER_ENDPOINT ?? '';
const APP_ID = 'nimi.audio-book.layer2-test';
const SUBJECT_USER_ID = 'user-audio-book-test';

const step2Path = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(__dirname, '../output/step2-result-short-story.json');

const step3Path = process.argv[3]
  ? resolve(process.argv[3])
  : resolve(__dirname, '../output/step3-result-short-story.json');

const baseName = basename(step2Path, '.json').replace('step2-result-', '');
const OUTPUT_PATH = resolve(__dirname, '../output', `step4-result-${baseName}.json`);
const AUDIO_DIR = resolve(__dirname, '../output/audio', baseName);
const MAX_SEGMENTS = Number(process.env.NIMI_TTS_MAX_SEGMENTS || 0); // 0 = all

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
// Runtime-backed TTS client (StreamSpeechSynthesis via gRPC)
// ---------------------------------------------------------------------------

function createRuntimeTtsClient(endpoint: string, modelId: string): TtsClient {
  const runtime = new Runtime({
    appId: APP_ID,
    transport: {
      type: 'node-grpc',
      endpoint,
    },
    defaults: {
      callerKind: 'desktop-core',
      callerId: 'audio-book-step4',
    },
  });

  const metadata = buildMetadata();

  return {
    async listVoices() {
      const result = await runtime.media.tts.listVoices({
        model: modelId,
        subjectUserId: SUBJECT_USER_ID,
        route: 'token-api',
        fallback: 'deny',
        metadata,
      });
      return result.voices.map((v) => ({
        providerId: PROVIDER_TYPE,
        voiceId: v.voiceId,
        voiceName: v.name,
        language: v.lang,
      }));
    },

    async synthesize(input) {
      // Use tts.synthesize() (SubmitMediaJob → DashScope native adapter)
      // NOT streamSynthesis() which uses OpenAI-compat /v1/audio/speech
      const result = await runtime.media.tts.synthesize({
        model: modelId,
        text: input.text,
        voice: input.voiceId,
        audioFormat: 'mp3',
        sampleRateHz: 24000,
        speed: input.speakingRate ?? 1.0,
        pitch: input.pitch ?? 0,
        emotion: input.emotion ?? '',
        subjectUserId: SUBJECT_USER_ID,
        route: 'token-api',
        fallback: 'deny',
        timeoutMs: 60_000,
        metadata,
      });

      // Get audio bytes from first artifact
      const artifact = result.artifacts[0];
      if (!artifact || artifact.bytes.length === 0) {
        throw new Error('TTS returned empty audio');
      }

      const audioBlob = new Blob([artifact.bytes], { type: artifact.mimeType || 'audio/mpeg' });
      const totalLength = artifact.bytes.length;

      // Estimate duration: MP3 at ~128kbps → bytes * 8 / 128000 * 1000
      const estimatedDurationMs = Math.round(totalLength * 8 / 128000 * 1000);

      return { audioBlob, durationMs: estimatedDurationMs };
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Audio Book Step 4: Synthesis Test (Runtime TTS) ===');
  console.log(`Runtime:   ${RUNTIME_ENDPOINT}`);
  console.log(`TTS Model: ${TTS_MODEL_ID}`);
  console.log(`Provider:  ${PROVIDER_TYPE}`);
  console.log(`KeyMode:   ${API_KEY ? 'inline' : 'runtime-config'}`);
  console.log(`Step2:     ${step2Path}`);
  console.log(`Step3:     ${step3Path}`);
  console.log(`Output:    ${OUTPUT_PATH}`);
  console.log(`Audio:     ${AUDIO_DIR}`);
  console.log('');

  // 1. Read step2 + step3 results
  const step2 = JSON.parse(readFileSync(step2Path, 'utf-8'));
  const step3 = JSON.parse(readFileSync(step3Path, 'utf-8'));

  const allSegments: ScriptSegment[] = step2.segments;
  const castings: VoiceCasting[] = step3.castings;

  // Only synthesize first chapter (optionally truncated by MAX_SEGMENTS)
  let firstChapterSegments = allSegments.filter((s: ScriptSegment) => s.chapterIndex === 0);
  if (MAX_SEGMENTS > 0 && firstChapterSegments.length > MAX_SEGMENTS) {
    firstChapterSegments = firstChapterSegments.slice(0, MAX_SEGMENTS);
  }

  console.log(`Total segments: ${allSegments.length}`);
  console.log(`First chapter segments: ${firstChapterSegments.length}`);
  console.log(`Voice castings: ${castings.length}`);
  for (const c of castings) {
    console.log(`  ${c.characterName} → ${c.voiceId} (${c.voiceName})`);
  }
  console.log('');

  // 2. Build casting map
  const castingMap = new Map<string, VoiceCasting>();
  for (const c of castings) {
    castingMap.set(c.characterName, c);
  }

  // 3. Synthesize via runtime TTS
  const tts = createRuntimeTtsClient(RUNTIME_ENDPOINT, TTS_MODEL_ID);

  // Save audio files to disk
  mkdirSync(AUDIO_DIR, { recursive: true });
  const audioFiles: Array<{ segmentId: string; filePath: string; durationMs: number }> = [];

  console.log('Synthesizing first chapter...');
  const startedAt = performance.now();

  const { promise } = runSynthesisJob(tts, firstChapterSegments, castingMap, 'test-project', {
    maxConcurrency: 2, // conservative for TTS rate limits
    onProgress: (p) => {
      const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `  [${p.completed}/${p.total}] failed: ${p.failed}, ` +
        `remaining: ~${(p.estimatedRemainingMs / 1000).toFixed(1)}s ` +
        `(${elapsed}s elapsed)`,
      );
    },
    onAudioReady: async (segmentId, blob, durationMs) => {
      const filePath = resolve(AUDIO_DIR, `${segmentId}.mp3`);
      const buffer = Buffer.from(await blob.arrayBuffer());
      writeFileSync(filePath, buffer);
      audioFiles.push({ segmentId, filePath, durationMs });
    },
  });

  const job = await promise;
  const totalTime = ((performance.now() - startedAt) / 1000).toFixed(1);

  // 4. Output
  const output = {
    meta: {
      step2Input: step2Path,
      step3Input: step3Path,
      ttsModelId: TTS_MODEL_ID,
      providerType: PROVIDER_TYPE,
      runtimeEndpoint: RUNTIME_ENDPOINT,
      keyMode: API_KEY ? 'inline' : 'runtime-config',
      totalTimeSeconds: Number(totalTime),
      timestamp: new Date().toISOString(),
    },
    status: job.status,
    totalSegments: job.segmentJobs.length,
    completed: job.segmentJobs.filter((sj) => sj.status === 'done').length,
    failed: job.segmentJobs.filter((sj) => sj.status === 'failed').length,
    audioDir: AUDIO_DIR,
    audioFiles,
    segmentJobs: job.segmentJobs.map((sj) => ({
      segmentId: sj.segmentId,
      status: sj.status,
      durationMs: sj.durationMs,
      retryCount: sj.retryCount,
      error: sj.error,
    })),
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  console.log('');
  console.log(`Done in ${totalTime}s`);
  console.log(`Results: ${OUTPUT_PATH}`);
  console.log(`Audio:   ${AUDIO_DIR}`);
  console.log(`Status:  ${job.status}`);
  console.log(`Completed: ${output.completed}/${output.totalSegments}`);
  console.log(`Failed: ${output.failed}`);

  if (audioFiles.length > 0) {
    const totalDuration = audioFiles.reduce((sum, f) => sum + f.durationMs, 0);
    console.log(`Total audio: ${(totalDuration / 1000).toFixed(1)}s across ${audioFiles.length} files`);
  }

  const failed = job.segmentJobs.filter((sj) => sj.status === 'failed');
  if (failed.length > 0) {
    console.log('\nFailed segments:');
    for (const f of failed) {
      console.log(`  ${f.segmentId}: ${f.error}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
