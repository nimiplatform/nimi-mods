import { describe, it, expect, vi } from 'vitest';
import { runSynthesisJob } from '../../src/services/synthesis-scheduler.js';
import type { ScriptSegment, TtsClient, VoiceCasting } from '../../src/types.js';

function makeSegment(id: string, speaker: string, chapterIndex = 0, index = 0): ScriptSegment {
  const text = `Text for ${id}`;
  return {
    id,
    chapterIndex,
    index,
    type: 'dialogue',
    speaker,
    text,
    startOffset: 0,
    endOffset: text.length,
  };
}

function makeCasting(characterName: string): VoiceCasting {
  return {
    characterName,
    voiceSource: 'preset',
    providerId: 'test',
    voiceId: 'voice-1',
    voiceName: 'Test Voice',
    speakingRate: 1.0,
    pitch: 0,
  };
}

function createMockTts(options?: {
  failIds?: Set<string>;
  delayMs?: number;
  permanentFailIds?: Set<string>;
}): TtsClient {
  const failIds = options?.failIds ?? new Set();
  const permanentFailIds = options?.permanentFailIds ?? new Set();
  const delayMs = options?.delayMs ?? 0;
  let callCount = 0;

  return {
    async listVoices() { return []; },
    async synthesize(input) {
      callCount++;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

      if (permanentFailIds.has(input.text.replace('Text for ', ''))) {
        throw new Error('invalid voice: 400');
      }
      if (failIds.has(input.text.replace('Text for ', ''))) {
        failIds.delete(input.text.replace('Text for ', '')); // fail only first time
        throw new Error('network timeout');
      }

      return {
        audioBlob: new Blob(['fake-audio'], { type: 'audio/mp3' }),
        durationMs: 1500,
      };
    },
  };
}

describe('runSynthesisJob', () => {
  it('synthesizes all segments successfully', async () => {
    const segments = [
      makeSegment('s1', 'Alice', 0, 0),
      makeSegment('s2', 'Bob', 0, 1),
      makeSegment('s3', 'Alice', 1, 2),
    ];
    const castingMap = new Map<string, VoiceCasting>([
      ['Alice', makeCasting('Alice')],
      ['Bob', makeCasting('Bob')],
    ]);

    const tts = createMockTts();
    const audioReady = vi.fn();

    const { promise } = runSynthesisJob(tts, segments, castingMap, 'proj-1', {
      onAudioReady: audioReady,
    });

    const job = await promise;
    expect(job.status).toBe('done');
    expect(job.segmentJobs.every((sj) => sj.status === 'done')).toBe(true);
    expect(audioReady).toHaveBeenCalledTimes(3);
  });

  it('retries transient errors and succeeds', async () => {
    const segments = [makeSegment('s1', 'Alice')];
    const castingMap = new Map([['Alice', makeCasting('Alice')]]);
    const tts = createMockTts({ failIds: new Set(['s1']) });

    const { promise } = runSynthesisJob(tts, segments, castingMap, 'proj-2', {
      maxConcurrency: 1,
    });

    const job = await promise;
    expect(job.status).toBe('done');
    expect(job.segmentJobs[0]!.retryCount).toBeGreaterThan(0);
  });

  it('marks permanent errors as failed without retry', async () => {
    const segments = [makeSegment('s1', 'Alice')];
    const castingMap = new Map([['Alice', makeCasting('Alice')]]);
    const tts = createMockTts({ permanentFailIds: new Set(['s1']) });

    const { promise } = runSynthesisJob(tts, segments, castingMap, 'proj-3');

    const job = await promise;
    expect(job.status).toBe('done_with_errors');
    expect(job.segmentJobs[0]!.status).toBe('failed');
    expect(job.segmentJobs[0]!.errorClassification).toBe('permanent');
    expect(job.segmentJobs[0]!.retryCount).toBe(0);
  });

  it('handles missing voice casting gracefully', async () => {
    const segments = [makeSegment('s1', 'UnknownChar')];
    const castingMap = new Map<string, VoiceCasting>();
    const tts = createMockTts();

    const { promise } = runSynthesisJob(tts, segments, castingMap, 'proj-4');

    const job = await promise;
    expect(job.status).toBe('done_with_errors');
    expect(job.segmentJobs[0]!.status).toBe('failed');
    expect(job.segmentJobs[0]!.error).toContain('No voice casting');
  });

  it('cancels in-progress synthesis', async () => {
    const segments = [
      makeSegment('s1', 'Alice'),
      makeSegment('s2', 'Alice'),
      makeSegment('s3', 'Alice'),
    ];
    const castingMap = new Map([['Alice', makeCasting('Alice')]]);
    const tts = createMockTts({ delayMs: 100 });

    const { promise, controller } = runSynthesisJob(tts, segments, castingMap, 'proj-5', {
      maxConcurrency: 1,
    });

    // Cancel after a short delay
    setTimeout(() => controller.cancel(), 50);

    const job = await promise;
    expect(job.status).toBe('cancelled');
  });

  it('respects maxConcurrency', async () => {
    const segments = Array.from({ length: 6 }, (_, i) =>
      makeSegment(`s${i}`, 'Alice', 0, i),
    );
    const castingMap = new Map([['Alice', makeCasting('Alice')]]);

    let maxConcurrent = 0;
    let currentConcurrent = 0;
    const tts: TtsClient = {
      async listVoices() { return []; },
      async synthesize() {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 50));
        currentConcurrent--;
        return { audioBlob: new Blob(['audio']), durationMs: 1000 };
      },
    };

    const { promise } = runSynthesisJob(tts, segments, castingMap, 'proj-6', {
      maxConcurrency: 2,
    });

    await promise;
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('reports progress correctly', async () => {
    const segments = [
      makeSegment('s1', 'Alice', 0, 0),
      makeSegment('s2', 'Alice', 1, 1),
    ];
    const castingMap = new Map([['Alice', makeCasting('Alice')]]);
    const tts = createMockTts();
    const progressCalls: number[] = [];

    const { promise } = runSynthesisJob(tts, segments, castingMap, 'proj-7', {
      maxConcurrency: 1,
      onProgress: (p) => progressCalls.push(p.completed),
    });

    await promise;
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    expect(progressCalls[progressCalls.length - 1]).toBe(2);
  });

  it('handles empty segments', async () => {
    const tts = createMockTts();
    const castingMap = new Map<string, VoiceCasting>();

    const { promise } = runSynthesisJob(tts, [], castingMap, 'proj-8');
    const job = await promise;
    expect(job.status).toBe('done');
    expect(job.segmentJobs).toHaveLength(0);
  });

  it('preserves already-done segments on resume', async () => {
    const segments = [
      makeSegment('s1', 'Alice'),
      makeSegment('s2', 'Alice'),
    ];
    const castingMap = new Map([['Alice', makeCasting('Alice')]]);
    const tts = createMockTts();
    const audioReady = vi.fn();

    const { promise } = runSynthesisJob(tts, segments, castingMap, 'proj-9', {
      onAudioReady: audioReady,
      existingJobs: [
        {
          segmentId: 's1',
          status: 'done',
          audioStorageKey: 'vs:audio:proj-9:s1',
          durationMs: 1500,
          retryCount: 0,
          completedAt: new Date().toISOString(),
        },
      ],
    });

    const job = await promise;
    expect(job.status).toBe('done');
    // Only s2 should have been synthesized (s1 already done)
    expect(audioReady).toHaveBeenCalledTimes(1);
    expect(job.segmentJobs[0]!.status).toBe('done');
    expect(job.segmentJobs[1]!.status).toBe('done');
  });
});
