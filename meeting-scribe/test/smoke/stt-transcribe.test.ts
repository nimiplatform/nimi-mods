/**
 * Meeting Scribe — STT Transcription Smoke Test
 *
 * Tests that STT transcription works end-to-end through the runtime.
 * Uses the Runtime SDK class with node-grpc transport.
 *
 * Prerequisites:
 *   - Gemini API key set in env
 *   - A sample audio file at test/fixtures/sample.wav (or override via env)
 *
 * Run:
 *   NIMI_SDK_LIVE=1 \
 *   NIMI_LIVE_GEMINI_API_KEY=<key> \
 *   npx tsx --test nimi-mods/meeting-scribe/test/smoke/stt-transcribe.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { Runtime } from '../../../../sdk/src/runtime/runtime.js';
import { withRuntimeDaemon } from '../../../../sdk/test/runtime/contract/helpers/runtime-daemon.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ID = 'nimi.meeting-scribe.smoke.stt';

function requiredEnvOrSkip(t: { skip: (msg?: string) => void }, key: string): string | null {
  const value = String(process.env[key] || '').trim();
  if (!value) {
    t.skip(`set ${key} to run this smoke test`);
    return null;
  }
  return value;
}

// gRPC default max message size is 4MB. Protobuf overhead roughly doubles
// the raw byte count, so we cap audio at ~1.8MB to stay safely under the limit.
const GRPC_SAFE_AUDIO_BYTES = 1_800_000;

function loadAudioFixture(): { bytes: Uint8Array; mimeType: string; fileName: string; truncated: boolean } {
  const customPath = process.env.MS_TEST_AUDIO_FILE;
  if (customPath && existsSync(customPath)) {
    const ext = customPath.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      webm: 'audio/webm',
      ogg: 'audio/ogg',
    };
    const raw = readFileSync(customPath);
    const truncated = raw.length > GRPC_SAFE_AUDIO_BYTES;
    const bytes = truncated ? new Uint8Array(raw.subarray(0, GRPC_SAFE_AUDIO_BYTES)) : new Uint8Array(raw);
    return {
      bytes,
      mimeType: mimeMap[ext] ?? 'audio/wav',
      fileName: customPath,
      truncated,
    };
  }

  const fixturePath = resolve(__dirname, '../fixtures/sample.wav');
  if (!existsSync(fixturePath)) {
    throw new Error(
      `No audio fixture found. Either:\n` +
      `  1. Place a sample audio file at ${fixturePath}\n` +
      `  2. Set MS_TEST_AUDIO_FILE=/path/to/your/audio.wav`,
    );
  }

  const raw = readFileSync(fixturePath);
  const truncated = raw.length > GRPC_SAFE_AUDIO_BYTES;
  const bytes = truncated ? new Uint8Array(raw.subarray(0, GRPC_SAFE_AUDIO_BYTES)) : new Uint8Array(raw);
  return {
    bytes,
    mimeType: 'audio/wav',
    fileName: fixturePath,
    truncated,
  };
}

test('meeting-scribe stt: gemini cloud transcription', {
  skip: process.env.NIMI_SDK_LIVE !== '1',
  timeout: 300_000,
}, async (t) => {
  const apiKey = requiredEnvOrSkip(t, 'NIMI_LIVE_GEMINI_API_KEY');
  if (!apiKey) return;

  const audio = loadAudioFixture();
  console.log(`[stt-test] Audio file: ${audio.fileName} (${audio.bytes.length} bytes, ${audio.mimeType}${audio.truncated ? ', TRUNCATED to fit gRPC 4MB limit' : ''})`);

  await withRuntimeDaemon({
    appId: APP_ID,
    runtimeEnv: {
      NIMI_RUNTIME_CLOUD_GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      NIMI_RUNTIME_CLOUD_GEMINI_API_KEY: apiKey,
      NIMI_RUNTIME_AI_HTTP_TIMEOUT: '120s', // STT on audio files needs more than default 30s
    },
    run: async ({ endpoint }) => {
      const runtime = new Runtime({
        appId: APP_ID,
        transport: { type: 'node-grpc', endpoint },
        defaults: {
          callerKind: 'desktop-core',
          callerId: 'meeting-scribe-stt-smoke',
        },
      });

      console.log('[stt-test] Submitting STT job to Gemini...');
      const result = await runtime.media.stt.transcribe({
        model: 'gemini/gemini-2.0-flash',
        subjectUserId: 'user-ms-smoke',
        audio: { kind: 'bytes', bytes: audio.bytes },
        mimeType: audio.mimeType,
        diarization: true,
        route: 'cloud',
        fallback: 'deny',
        timeoutMs: 300_000,
      });

      console.log('[stt-test] Transcription result:');
      console.log(`  Text length: ${result.text.length} chars`);
      console.log(`  First 500 chars: ${result.text.slice(0, 500)}`);
      console.log(`  Route: ${result.trace.routeDecision}`);
      console.log(`  Model: ${result.trace.modelResolved}`);

      assert.ok(result.text.length > 0, 'transcription should produce non-empty text');
      assert.ok(result.job, 'should return job metadata');
    },
  });
});
