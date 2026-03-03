import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTtsClientAdapter } from '../../src/adapters/tts-adapter.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createTtsClientAdapter', () => {
  it('forwards connector route options to speech.listVoices', async () => {
    const listVoices = vi.fn().mockResolvedValue([
      {
        id: 'Cherry',
        providerId: 'dashscope',
        name: 'Cherry',
        lang: 'zh',
      },
    ]);
    const speech = {
      listVoices,
      synthesize: vi.fn(),
    } as unknown as Parameters<typeof createTtsClientAdapter>[0];
    const adapter = createTtsClientAdapter(speech);

    const voices = await adapter.listVoices({
      connectorId: 'conn-1',
      routeSource: 'token-api',
      model: 'cloud/default',
    });

    expect(listVoices).toHaveBeenCalledWith({
      connectorId: 'conn-1',
      routeSource: 'token-api',
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
      audioUri: 'data:audio/mpeg;base64,AAAA',
      mimeType: 'audio/mpeg',
      durationMs: 1234,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
    }));

    const speech = {
      listVoices: vi.fn().mockResolvedValue([]),
      synthesize,
    } as unknown as Parameters<typeof createTtsClientAdapter>[0];
    const adapter = createTtsClientAdapter(speech);

    const result = await adapter.synthesize({
      text: 'hello',
      voiceId: 'Cherry',
      providerId: 'dashscope',
      connectorId: 'conn-1',
      routeSource: 'token-api',
      model: 'cloud/default',
    });

    expect(synthesize).toHaveBeenCalledWith({
      text: 'hello',
      voiceId: 'Cherry',
      providerId: 'dashscope',
      speakingRate: undefined,
      pitch: undefined,
      stylePrompt: undefined,
      connectorId: 'conn-1',
      routeSource: 'token-api',
      model: 'cloud/default',
    });
    expect(result.durationMs).toBe(1234);
  });
});
