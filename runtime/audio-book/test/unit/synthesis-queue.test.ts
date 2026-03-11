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

  it('passes distinct voice parameters per speaker to TTS', async () => {
    // Use real DashScope voice IDs from step3 casting results
    const segments = [
      makeSegment('s1', 'narrator', 0, 0),
      makeSegment('s2', '叶文洁', 0, 1),
      makeSegment('s3', 'narrator', 0, 2),
      makeSegment('s4', '史强', 0, 3),
    ];

    const narratorCasting: VoiceCasting = {
      characterName: 'narrator',
      voiceSource: 'preset',
      providerId: 'dashscope',
      voiceId: 'Neil',
      voiceName: '阿闻（字正腔圆、专业新闻主持人）',
      speakingRate: 1.0,
      pitch: 0,
    };
    const yeWenjieCasting: VoiceCasting = {
      characterName: '叶文洁',
      voiceSource: 'preset',
      providerId: 'dashscope',
      voiceId: 'Seren',
      voiceName: '小婉（温和舒缓、助眠系声线）',
      speakingRate: 0.97,
      pitch: -1,
      emotion: 'calm',
    };
    const shiQiangCasting: VoiceCasting = {
      characterName: '史强',
      voiceSource: 'preset',
      providerId: 'dashscope',
      voiceId: 'Vincent',
      voiceName: '田叔（沙哑烟嗓、千军万马江湖豪情）',
      speakingRate: 1.04,
      pitch: 1,
      emotion: 'steady',
    };

    const castingMap = new Map<string, VoiceCasting>([
      ['narrator', narratorCasting],
      ['叶文洁', yeWenjieCasting],
      ['史强', shiQiangCasting],
    ]);

    // Capture all synthesize() call inputs
    const synthesizeCalls: Array<{
      text: string;
      voiceId: string;
      providerId: string;
      speakingRate?: number;
      pitch?: number;
      emotion?: string;
    }> = [];

    const tts: TtsClient = {
      async listVoices() { return []; },
      async synthesize(input) {
        synthesizeCalls.push({ ...input });
        return { audioBlob: new Blob([`audio-${input.voiceId}`]), durationMs: 1500 };
      },
    };

    const { promise } = runSynthesisJob(tts, segments, castingMap, 'proj-voice-1', {
      maxConcurrency: 1, // sequential for deterministic call order
    });

    const job = await promise;
    expect(job.status).toBe('done');
    expect(synthesizeCalls).toHaveLength(4);

    // s1 → narrator → Neil
    expect(synthesizeCalls[0]!.voiceId).toBe('Neil');
    expect(synthesizeCalls[0]!.speakingRate).toBe(1.0);
    expect(synthesizeCalls[0]!.pitch).toBe(0);

    // s2 → 叶文洁 → Seren
    expect(synthesizeCalls[1]!.voiceId).toBe('Seren');
    expect(synthesizeCalls[1]!.speakingRate).toBe(0.97);
    expect(synthesizeCalls[1]!.pitch).toBe(-1);
    expect(synthesizeCalls[1]!.emotion).toBe('calm');

    // s3 → narrator → Neil (same voice as s1)
    expect(synthesizeCalls[2]!.voiceId).toBe('Neil');

    // s4 → 史强 → Vincent
    expect(synthesizeCalls[3]!.voiceId).toBe('Vincent');
    expect(synthesizeCalls[3]!.speakingRate).toBe(1.04);
    expect(synthesizeCalls[3]!.pitch).toBe(1);
    expect(synthesizeCalls[3]!.emotion).toBe('steady');
  });

  it('applies segment-level emotion over casting-level emotion', async () => {
    const segment: ScriptSegment = {
      id: 's1',
      chapterIndex: 0,
      index: 0,
      type: 'dialogue',
      speaker: '丁仪',
      text: '物理学不存在了。',
      startOffset: 0,
      endOffset: 8,
      emotion: 'excited', // segment emotion overrides casting
    };

    const casting: VoiceCasting = {
      characterName: '丁仪',
      voiceSource: 'preset',
      providerId: 'dashscope',
      voiceId: 'Ryan',
      voiceName: '甜茶（节奏拉满、戏感炸裂）',
      speakingRate: 1.0,
      pitch: 0,
      emotion: 'calm', // casting default — should be overridden
    };

    const castingMap = new Map([['丁仪', casting]]);
    let capturedEmotion: string | undefined;

    const tts: TtsClient = {
      async listVoices() { return []; },
      async synthesize(input) {
        capturedEmotion = input.emotion;
        return { audioBlob: new Blob(['audio']), durationMs: 1000 };
      },
    };

    const { promise } = runSynthesisJob(tts, [segment], castingMap, 'proj-voice-2');
    await promise;

    // synthesis-scheduler uses: segment.emotion ?? casting.emotion
    // so segment-level "excited" wins over casting-level "calm"
    expect(capturedEmotion).toBe('excited');
  });

  it('falls back to casting emotion when segment has no emotion', async () => {
    const segment: ScriptSegment = {
      id: 's1',
      chapterIndex: 0,
      index: 0,
      type: 'narration',
      speaker: 'narrator',
      text: '红岸基地坐落在内蒙古大兴安岭的一座山峰上。',
      startOffset: 0,
      endOffset: 20,
      // no emotion on segment
    };

    const casting: VoiceCasting = {
      characterName: 'narrator',
      voiceSource: 'preset',
      providerId: 'dashscope',
      voiceId: 'Neil',
      voiceName: '阿闻（字正腔圆、专业新闻主持人）',
      speakingRate: 1.0,
      pitch: 0,
      emotion: 'steady',
    };

    const castingMap = new Map([['narrator', casting]]);
    let capturedEmotion: string | undefined;

    const tts: TtsClient = {
      async listVoices() { return []; },
      async synthesize(input) {
        capturedEmotion = input.emotion;
        return { audioBlob: new Blob(['audio']), durationMs: 1000 };
      },
    };

    const { promise } = runSynthesisJob(tts, [segment], castingMap, 'proj-voice-3');
    await promise;

    expect(capturedEmotion).toBe('steady');
  });

  it('routes different speakers to distinct audio via voiceId', async () => {
    const segments = [
      makeSegment('s1', '汪淼', 0, 0),
      makeSegment('s2', '常伟思', 0, 1),
    ];

    const castingMap = new Map<string, VoiceCasting>([
      ['汪淼', {
        characterName: '汪淼',
        voiceSource: 'preset',
        providerId: 'dashscope',
        voiceId: 'Kai',
        voiceName: '凯（耳朵的一场SPA、治愈系）',
        speakingRate: 1.0,
        pitch: 0,
      }],
      ['常伟思', {
        characterName: '常伟思',
        voiceSource: 'preset',
        providerId: 'dashscope',
        voiceId: 'Eldric Sage',
        voiceName: '沧明子（沉稳睿智的老者、沧桑如松）',
        speakingRate: 0.95,
        pitch: -2,
      }],
    ]);

    // Mock TTS produces voice-dependent audio content so we can verify differentiation
    const audioOutputs = new Map<string, Blob>();
    const tts: TtsClient = {
      async listVoices() { return []; },
      async synthesize(input) {
        const blob = new Blob([`audio-${input.voiceId}`], { type: 'audio/mp3' });
        return { audioBlob: blob, durationMs: 2000 };
      },
    };

    const { promise } = runSynthesisJob(tts, segments, castingMap, 'proj-voice-4', {
      maxConcurrency: 1,
      onAudioReady: async (segmentId, blob) => {
        audioOutputs.set(segmentId, blob);
      },
    });

    const job = await promise;
    expect(job.status).toBe('done');
    expect(audioOutputs.size).toBe(2);

    const wangMiaoAudio = await audioOutputs.get('s1')!.text();
    const changWeisiAudio = await audioOutputs.get('s2')!.text();

    expect(wangMiaoAudio).toContain('Kai');
    expect(changWeisiAudio).toContain('Eldric Sage');
    expect(wangMiaoAudio).not.toBe(changWeisiAudio);
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
          audioStorageKey: 'ab:audio:proj-9:s1',
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
