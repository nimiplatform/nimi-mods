#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Step 4 — Voice Differentiation Test (Layer 2 integration)
//
// Synthesizes the SAME text with DIFFERENT DashScope voices to verify that
// each voice actually produces distinct audio output. Saves one MP3 per voice
// so you can listen and compare.
//
// Usage:
//   NIMI_API_KEY=<key> npx tsx test/scripts/step4-voice-diff.ts
//
// Options:
//   NIMI_RUNTIME_ENDPOINT  — runtime gRPC (default: 127.0.0.1:46371)
//   NIMI_TTS_MODEL_ID      — TTS model (default: qwen3-tts-instruct-flash)
//   NIMI_PROVIDER_TYPE      — provider (default: dashscope)
//   NIMI_PROVIDER_ENDPOINT  — optional endpoint override
//   NIMI_VOICE_DIFF_TEXT    — custom test text (optional)
//
// Prerequisites:
//   1. Start nimi runtime:  cd runtime && go run ./cmd/nimi
//   2. Set NIMI_API_KEY (DashScope API key)
//
// Output:
//   test/output/voice-diff/<voiceId>.mp3   — one file per voice
//   test/output/voice-diff/report.json     — size/duration comparison
// ---------------------------------------------------------------------------

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Runtime } from '../../../../sdk/src/runtime/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RUNTIME_ENDPOINT = process.env.NIMI_RUNTIME_ENDPOINT ?? '127.0.0.1:46371';
const TTS_MODEL_ID = process.env.NIMI_TTS_MODEL_ID ?? 'qwen3-tts-instruct-flash';
const API_KEY = process.env.NIMI_API_KEY ?? '';
const PROVIDER_TYPE = process.env.NIMI_PROVIDER_TYPE ?? 'dashscope';
const PROVIDER_ENDPOINT = process.env.NIMI_PROVIDER_ENDPOINT ?? '';
const APP_ID = 'nimi.audio-book.voice-diff-test';
const SUBJECT_USER_ID = 'user-voice-diff-test';

const OUTPUT_DIR = resolve(__dirname, '../output/voice-diff');

// Same text for all voices — a neutral sentence with enough length to hear tonal differences
const TEST_TEXT = process.env.NIMI_VOICE_DIFF_TEXT
  ?? '在那遥远的群星之间，人类第一次听到了来自宇宙深处的回声。那声音古老而陌生，却又带着某种令人心安的温暖。';

// Single voice to test
const VOICES_TO_TEST: Array<{ voiceId: string; voiceName: string; description: string }> = [
  { voiceId: 'Vincent', voiceName: '田叔', description: '沙哑烟嗓、千军万马江湖豪情' },
];

// ---------------------------------------------------------------------------
// Runtime TTS client
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

function createRuntime(): Runtime {
  return new Runtime({
    appId: APP_ID,
    transport: { type: 'node-grpc', endpoint: RUNTIME_ENDPOINT },
    defaults: { callerKind: 'desktop-core', callerId: 'voice-diff-test' },
    subjectContext: {
      subjectUserId: SUBJECT_USER_ID,
    },
  });
}

async function synthesizeOne(
  runtime: Runtime,
  voiceId: string,
  text: string,
): Promise<{ bytes: Uint8Array; mimeType: string; estimatedDurationMs: number }> {
  const metadata = buildMetadata();
  const result = await runtime.media.tts.synthesize({
    model: TTS_MODEL_ID,
    text,
    voice: voiceId,
    audioFormat: 'mp3',
    sampleRateHz: 24000,
    speed: 1.0,
    pitch: 0,
    emotion: '',
    route: 'token-api',
    fallback: 'deny',
    timeoutMs: 60_000,
    metadata,
  });

  const artifact = result.artifacts[0];
  if (!artifact || artifact.bytes.length === 0) {
    throw new Error(`TTS returned empty audio for voice: ${voiceId}`);
  }

  // Log artifact providerRaw to verify voice was actually used by provider
  const raw = artifact.providerRaw ?? {};
  console.log(`    [debug] requested voice=${voiceId}, providerRaw=${JSON.stringify(raw)}`);

  const estimatedDurationMs = Math.round(artifact.bytes.length * 8 / 128000 * 1000);
  return {
    bytes: artifact.bytes,
    mimeType: artifact.mimeType || 'audio/mpeg',
    estimatedDurationMs,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Voice Differentiation Test ===');
  console.log(`Runtime:   ${RUNTIME_ENDPOINT}`);
  console.log(`TTS Model: ${TTS_MODEL_ID}`);
  console.log(`Provider:  ${PROVIDER_TYPE}`);
  console.log(`Voices:    ${VOICES_TO_TEST.length}`);
  console.log(`Text:      ${TEST_TEXT.slice(0, 40)}...`);
  console.log(`Output:    ${OUTPUT_DIR}`);
  console.log('');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const runtime = createRuntime();
  const results: Array<{
    voiceId: string;
    voiceName: string;
    description: string;
    filePath: string;
    sizeBytes: number;
    estimatedDurationMs: number;
    status: 'ok' | 'error';
    error?: string;
  }> = [];

  for (const voice of VOICES_TO_TEST) {
    const tag = `[${voice.voiceId}] ${voice.voiceName}`;
    process.stdout.write(`  ${tag} ... `);
    const t0 = performance.now();

    try {
      const { bytes, estimatedDurationMs } = await synthesizeOne(runtime, voice.voiceId, TEST_TEXT);

      const filePath = resolve(OUTPUT_DIR, `${voice.voiceId.replace(/\s+/g, '-')}.mp3`);
      writeFileSync(filePath, bytes);

      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      console.log(`OK  ${bytes.length} bytes, ~${(estimatedDurationMs / 1000).toFixed(1)}s audio (${elapsed}s)`);

      results.push({
        voiceId: voice.voiceId,
        voiceName: voice.voiceName,
        description: voice.description,
        filePath,
        sizeBytes: bytes.length,
        estimatedDurationMs,
        status: 'ok',
      });
    } catch (err) {
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL  (${elapsed}s) ${msg}`);

      results.push({
        voiceId: voice.voiceId,
        voiceName: voice.voiceName,
        description: voice.description,
        filePath: '',
        sizeBytes: 0,
        estimatedDurationMs: 0,
        status: 'error',
        error: msg,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Byte-level comparison: check that successful voices produce different audio
  // ---------------------------------------------------------------------------

  const okResults = results.filter((r) => r.status === 'ok');
  const audioBytes = new Map<string, Uint8Array>();
  for (const r of okResults) {
    const { readFileSync } = await import('node:fs');
    audioBytes.set(r.voiceId, new Uint8Array(readFileSync(r.filePath)));
  }

  const duplicatePairs: string[] = [];
  const voiceIds = [...audioBytes.keys()];
  for (let i = 0; i < voiceIds.length; i++) {
    for (let j = i + 1; j < voiceIds.length; j++) {
      const a = audioBytes.get(voiceIds[i]!)!;
      const b = audioBytes.get(voiceIds[j]!)!;
      if (a.length === b.length && a.every((byte, idx) => byte === b[idx])) {
        duplicatePairs.push(`${voiceIds[i]} === ${voiceIds[j]}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  const report = {
    meta: {
      testText: TEST_TEXT,
      ttsModelId: TTS_MODEL_ID,
      providerType: PROVIDER_TYPE,
      runtimeEndpoint: RUNTIME_ENDPOINT,
      timestamp: new Date().toISOString(),
    },
    voicesTotal: VOICES_TO_TEST.length,
    voicesOk: okResults.length,
    voicesFailed: results.filter((r) => r.status === 'error').length,
    duplicatePairs,
    results,
  };

  const reportPath = resolve(OUTPUT_DIR, 'report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log('');
  console.log('--- Summary ---');
  console.log(`OK: ${okResults.length}/${VOICES_TO_TEST.length}`);

  if (okResults.length >= 2) {
    const sizes = okResults.map((r) => r.sizeBytes);
    const allSameSize = sizes.every((s) => s === sizes[0]);
    if (allSameSize) {
      console.log(`WARNING: All ${okResults.length} voices produced identical file sizes (${sizes[0]} bytes). Voice routing may not be working.`);
    } else {
      console.log(`File sizes vary (${Math.min(...sizes)} ~ ${Math.max(...sizes)} bytes) — voices are producing different audio.`);
    }
  }

  if (duplicatePairs.length > 0) {
    console.log(`WARNING: ${duplicatePairs.length} voice pair(s) produced byte-identical audio:`);
    for (const pair of duplicatePairs) {
      console.log(`  ${pair}`);
    }
  } else if (okResults.length >= 2) {
    console.log('All voice pairs produce distinct audio bytes.');
  }

  console.log(`Report: ${reportPath}`);
  console.log(`Audio:  ${OUTPUT_DIR}/*.mp3`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
