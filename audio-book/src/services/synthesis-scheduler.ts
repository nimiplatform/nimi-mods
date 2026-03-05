// ---------------------------------------------------------------------------
// Synthesis scheduler — sliding window TTS with retry + pause/cancel
// ---------------------------------------------------------------------------

import type {
  ErrorClassification,
  ScriptSegment,
  SegmentJob,
  SegmentJobStatus,
  SynthesisJob,
  SynthesisJobStatus,
  TtsClient,
  VoiceCasting,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_CONCURRENCY = 3;
const MAX_RETRIES = 2; // 3 total attempts
const BACKOFF_MS = [1000, 3000];
const RATE_LIMIT_BACKOFF_MS = [5000, 15000];
// Keep chunk size conservative for Qwen/CosyVoice TTS input limits to avoid AI_INPUT_INVALID.
// DashScope CosyVoice models have ~500 char limit; use 300 for safety with multi-byte Chinese text.
const MAX_TTS_TEXT_CHARS = 300;

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function classifyError(error: unknown): ErrorClassification {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();

  // Permanent errors — no retry
  if (
    lower.includes('invalid voice') ||
    lower.includes('voice not found') ||
    lower.includes('text too long') ||
    lower.includes('unsupported') ||
    lower.includes('invalid_request') ||
    lower.includes('invalidargument') ||
    lower.includes('ai_input_invalid') ||
    lower.includes('400')
  ) {
    return 'permanent';
  }

  // Everything else is transient
  return 'transient';
}

function getBackoffMs(retryCount: number, classification: ErrorClassification): number {
  const backoffs = classification === 'transient' ? BACKOFF_MS : RATE_LIMIT_BACKOFF_MS;
  return backoffs[Math.min(retryCount, backoffs.length - 1)] ?? 1000;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('aborted')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
  });
}

function sanitizeEmotion(value?: string): string | undefined {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  if (normalized.length > 64) return undefined;
  return normalized;
}

function splitTextForTts(text: string, maxChars = MAX_TTS_TEXT_CHARS): string[] {
  const normalized = String(text || '').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const sentenceParts = normalized
    .split(/(?<=[。！？!?；;])/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const parts = sentenceParts.length > 0 ? sentenceParts : [normalized];

  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    if (!current) {
      current = part;
      continue;
    }
    if (current.length + part.length <= maxChars) {
      current += part;
      continue;
    }
    chunks.push(current);
    current = part;
  }
  if (current) chunks.push(current);

  const hardSplitChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChars) {
      hardSplitChunks.push(chunk);
      continue;
    }
    for (let i = 0; i < chunk.length; i += maxChars) {
      hardSplitChunks.push(chunk.slice(i, i + maxChars));
    }
  }
  return hardSplitChunks.filter(Boolean);
}

async function synthesizeWithChunking(
  tts: TtsClient,
  input: {
    text: string;
    voiceId: string;
    providerId: string;
    speakingRate?: number;
    pitch?: number;
    emotion?: string;
    connectorId?: string;
    routeSource?: 'auto' | 'local-runtime' | 'token-api';
    model?: string;
  },
): Promise<{ audioBlob: Blob; durationMs: number }> {
  const chunks = splitTextForTts(input.text);
  if (chunks.length <= 1) {
    return tts.synthesize(input);
  }

  const blobParts: BlobPart[] = [];
  let totalDurationMs = 0;
  let mimeType = 'audio/mpeg';
  for (const chunk of chunks) {
    const result = await tts.synthesize({
      ...input,
      text: chunk,
    });
    blobParts.push(result.audioBlob);
    totalDurationMs += result.durationMs;
    if (result.audioBlob.type) mimeType = result.audioBlob.type;
  }
  return {
    audioBlob: new Blob(blobParts, { type: mimeType }),
    durationMs: totalDurationMs,
  };
}

// ---------------------------------------------------------------------------
// Sliding window concurrency (adapted from world-studio)
// ---------------------------------------------------------------------------

async function runWithConcurrency(
  indices: number[],
  maxConcurrency: number,
  worker: (index: number) => Promise<void>,
  shouldStop: () => boolean,
): Promise<void> {
  if (indices.length === 0) return;
  const safeConcurrency = Math.max(1, Math.min(maxConcurrency, indices.length));
  let cursor = 0;

  const takeNext = (): number | null => {
    if (shouldStop()) return null;
    if (cursor >= indices.length) return null;
    const index = indices[cursor]!;
    cursor++;
    return index;
  };

  const runners = Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const index = takeNext();
      if (index === null) break;
      await worker(index);
    }
  });

  await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// Synthesis job runner
// ---------------------------------------------------------------------------

export type SynthesisProgressCallback = (progress: {
  projectId: string;
  completed: number;
  total: number;
  failed: number;
  currentChapterIndex: number;
  estimatedRemainingMs: number;
}) => void;

export type SynthesisJobController = {
  pause(): void;
  resume(): void;
  cancel(): void;
};

export type SynthesisJobHandle = {
  promise: Promise<SynthesisJob>;
  controller: SynthesisJobController;
};

/**
 * Run a complete synthesis job for a project.
 * Returns a handle with a promise and a controller for pause/resume/cancel.
 */
export function runSynthesisJob(
  tts: TtsClient,
  segments: ScriptSegment[],
  castingMap: Map<string, VoiceCasting>,
  projectId: string,
  options?: {
    maxConcurrency?: number;
    onProgress?: SynthesisProgressCallback;
    onAudioReady?: (segmentId: string, audioBlob: Blob, durationMs: number) => void | Promise<void>;
    existingJobs?: SegmentJob[];
    /** TTS routing options — connectorId and routeSource passed to every synthesize call. */
    ttsRoute?: { connectorId?: string; routeSource?: 'auto' | 'local-runtime' | 'token-api'; model?: string };
  },
): SynthesisJobHandle {
  const maxConcurrency = options?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  let paused = false;
  let cancelled = false;
  const abortController = new AbortController();

  // Initialize segment jobs
  const existingMap = new Map<string, SegmentJob>();
  for (const j of options?.existingJobs ?? []) {
    existingMap.set(j.segmentId, j);
  }

  const segmentJobs: SegmentJob[] = segments.map((seg) => {
    const existing = existingMap.get(seg.id);
    if (existing && existing.status === 'done') return existing;
    return {
      segmentId: seg.id,
      status: 'pending' as SegmentJobStatus,
      audioStorageKey: `ab:audio:${projectId}:${seg.id}`,
      retryCount: 0,
    };
  });

  const job: SynthesisJob = {
    projectId,
    status: 'running',
    segmentJobs,
    startedAt: new Date().toISOString(),
  };

  // Timing for progress estimation
  const completionTimes: number[] = [];

  const controller: SynthesisJobController = {
    pause() { paused = true; job.status = 'paused'; },
    resume() { paused = false; job.status = 'running'; },
    cancel() { cancelled = true; abortController.abort(); job.status = 'cancelled'; },
  };

  const promise = (async (): Promise<SynthesisJob> => {
    // Get indices of pending/failed segments
    const pendingIndices = segmentJobs
      .map((sj, i) => ({ sj, i }))
      .filter(({ sj }) => sj.status === 'pending' || sj.status === 'failed')
      .map(({ i }) => i);

    const shouldStop = () => cancelled;

    await runWithConcurrency(
      pendingIndices,
      maxConcurrency,
      async (segIdx) => {
        // Wait while paused
        while (paused && !cancelled) {
          await sleep(500);
        }
        if (cancelled) return;

        const segJob = segmentJobs[segIdx]!;
        const segment = segments[segIdx]!;
        const casting = castingMap.get(segment.speaker);

        if (!casting) {
          segJob.status = 'failed';
          segJob.error = `No voice casting for speaker: ${segment.speaker}`;
          segJob.errorClassification = 'permanent';
          return;
        }

        segJob.status = 'running';
        segJob.startedAt = new Date().toISOString();

        let lastError: unknown;
        let attempts = 0;

        while (attempts <= MAX_RETRIES) {
          if (cancelled) { segJob.status = 'pending'; return; }

          try {
            const result = await synthesizeWithChunking(tts, {
              text: String(segment.text || '').replace(/\s+/g, ' ').trim(),
              voiceId: casting.voiceId,
              providerId: casting.providerId,
              speakingRate: casting.speakingRate,
              pitch: casting.pitch,
              emotion: sanitizeEmotion(segment.emotion ?? casting.emotion),
              connectorId: options?.ttsRoute?.connectorId,
              routeSource: options?.ttsRoute?.routeSource,
              model: options?.ttsRoute?.model,
            });

            segJob.status = 'done';
            segJob.durationMs = result.durationMs;
            segJob.completedAt = new Date().toISOString();
            segJob.retryCount = attempts;

            // Notify caller to store audio
            await options?.onAudioReady?.(segment.id, result.audioBlob, result.durationMs);

            completionTimes.push(performance.now());
            break;
          } catch (err) {
            lastError = err;
            const classification = classifyError(err);
            segJob.errorClassification = classification;

            if (classification === 'permanent' || attempts >= MAX_RETRIES) {
              segJob.status = 'failed';
              segJob.error = err instanceof Error ? err.message : String(err);
              segJob.retryCount = attempts;
              break;
            }

            // Transient — wait and retry
            const backoff = getBackoffMs(attempts, classification);
            try {
              await sleep(backoff, abortController.signal);
            } catch {
              if (cancelled) { segJob.status = 'pending'; return; }
            }
            attempts++;
          }
        }

        // Report progress
        const completed = segmentJobs.filter((sj) => sj.status === 'done').length;
        const failed = segmentJobs.filter((sj) => sj.status === 'failed').length;
        const remaining = segmentJobs.length - completed - failed;
        const avgTimeMs = completionTimes.length >= 2
          ? (completionTimes[completionTimes.length - 1]! - completionTimes[0]!) / (completionTimes.length - 1)
          : 3000; // default 3s estimate

        options?.onProgress?.({
          projectId,
          completed,
          total: segmentJobs.length,
          failed,
          currentChapterIndex: segment.chapterIndex,
          estimatedRemainingMs: Math.round(remaining * avgTimeMs),
        });
      },
      shouldStop,
    );

    // Determine final status
    const allDone = segmentJobs.every((sj) => sj.status === 'done');
    const anyFailed = segmentJobs.some((sj) => sj.status === 'failed');

    if (cancelled) {
      job.status = 'cancelled';
    } else if (paused) {
      job.status = 'paused';
    } else if (allDone) {
      job.status = 'done';
    } else if (anyFailed) {
      job.status = 'done_with_errors';
    }

    job.completedAt = new Date().toISOString();
    return job;
  })();

  return { promise, controller };
}
