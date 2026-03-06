import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTtsClientAdapter } from '../../src/adapters/tts-adapter.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createTtsClientAdapter', () => {
  it('forwards connector route options to speech.listVoices', async () => {
    const listVoices = vi.fn().mockResolvedValue({
      voices: [
        {
          voiceId: 'Cherry',
          name: 'Cherry',
          lang: 'zh',
          supportedLangs: ['zh'],
        },
      ],
      modelResolved: 'cloud/default',
      traceId: 'trace-audio-book-tts-list',
    });
    const runtimeClient = {
      media: {
        tts: {
          listVoices,
          synthesize: vi.fn(),
        },
      },
      route: {
        resolve: vi.fn().mockResolvedValue({
          provider: 'dashscope',
        }),
      },
    } as unknown as Parameters<typeof createTtsClientAdapter>[0];
    const binding = {
      source: 'token-api' as const,
      connectorId: 'conn-1',
      model: 'cloud/default',
    };
    const adapter = createTtsClientAdapter(runtimeClient);

    const voices = await adapter.listVoices({
      binding,
      model: 'cloud/default',
    });

    expect(listVoices).toHaveBeenCalledWith({
      binding,
      model: 'cloud/default',
    });
    expect(voices).toEqual([
      {
        providerId: 'dashscope',
        voiceId: 'Cherry',
        voiceName: 'Cherry',
        language: 'zh',
      },
    ]);
  });

  it('forwards model to speech.synthesize', async () => {
    const synthesize = vi.fn().mockResolvedValue({
      job: {
        jobId: 'job-audio-book-tts',
      },
      artifacts: [
        {
          uri: 'data:audio/mpeg;base64,AAAA',
          mimeType: 'audio/mpeg',
        },
      ],
      trace: {
        traceId: 'trace-audio-book-tts',
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      blob: async () => new Blob([new Uint8Array(16_000)], { type: 'audio/mpeg' }),
    }));

    const runtimeClient = {
      media: {
        tts: {
          listVoices: vi.fn().mockResolvedValue([]),
          synthesize,
        },
      },
      route: {
        resolve: vi.fn().mockResolvedValue({
          provider: 'dashscope',
        }),
      },
    } as unknown as Parameters<typeof createTtsClientAdapter>[0];
    const binding = {
      source: 'token-api' as const,
      connectorId: 'conn-1',
      model: 'cloud/default',
    };
    const adapter = createTtsClientAdapter(runtimeClient);

    const result = await adapter.synthesize({
      text: 'hello',
      voiceId: 'Cherry',
      providerId: 'dashscope',
      binding,
      model: 'cloud/default',
    });

    expect(synthesize).toHaveBeenCalledWith({
      text: 'hello',
      voice: 'Cherry',
      speed: undefined,
      pitch: undefined,
      emotion: undefined,
      binding,
      model: 'cloud/default',
    });
    expect(result.audioBlob.type).toBe('audio/mpeg');
    expect(result.durationMs).toBeGreaterThan(0);
  });
});
