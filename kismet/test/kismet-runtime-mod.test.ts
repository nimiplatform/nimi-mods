import assert from 'node:assert/strict';
import test from 'node:test';

import { clearModSdkHost, setModSdkHost } from '@nimiplatform/sdk/mod/host';
import {
  KISMET_NAV_SLOT,
  KISMET_ROUTE_SLOT,
} from '../src/contracts.js';
import {
  createKismetRuntimeMod,
  getKismetHookClient,
  getKismetRuntimeClient,
} from '../src/runtime-mod.js';

function createSdkRuntimeContext() {
  const uiRegistrations: Array<{ slot: string; extension: Record<string, unknown> }> = [];

  const runtime = {
    registerUIExtensionV2: async (input: { slot: string; extension: Record<string, unknown> }) => {
      uiRegistrations.push({
        slot: input.slot,
        extension: input.extension,
      });
    },
  };

  const runtimeHost = {
    getRuntimeHookRuntime: () => runtime,
    checkLocalLlmHealth: async () => ({
      healthy: true,
      status: 'healthy',
    }),
    getModAiDependencySnapshot: async () => ({
      modId: 'world.nimi.kismet',
      status: 'ready',
      routeSource: 'unknown',
      warnings: [],
      dependencies: [],
      repairActions: [],
      updatedAt: new Date().toISOString(),
    }),
    route: {
      listOptions: async () => ({
        selected: null,
        resolvedDefault: null,
        local: { models: [] },
        connectors: [],
      }),
      resolve: async () => ({
        source: 'cloud',
        connectorId: 'connector-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        endpoint: 'https://api.openai.com/v1',
        localOpenAiEndpoint: '',
      }),
      checkHealth: async () => ({
        healthy: true,
        status: 'healthy',
      }),
    },
    ai: {
      text: {
        generate: async () => {
          throw new Error('UNEXPECTED_TEXT_GENERATE');
        },
        stream: async () => {
          throw new Error('UNEXPECTED_TEXT_STREAM');
        },
      },
      embedding: {
        generate: async () => {
          throw new Error('UNEXPECTED_EMBEDDING_GENERATE');
        },
      },
    },
    media: {
      image: {
        generate: async () => {
          throw new Error('UNEXPECTED_IMAGE_GENERATE');
        },
        stream: async () => {
          throw new Error('UNEXPECTED_IMAGE_STREAM');
        },
      },
      video: {
        generate: async () => {
          throw new Error('UNEXPECTED_VIDEO_GENERATE');
        },
        stream: async () => {
          throw new Error('UNEXPECTED_VIDEO_STREAM');
        },
      },
      tts: {
        synthesize: async () => {
          throw new Error('UNEXPECTED_TTS_SYNTHESIZE');
        },
        stream: async () => {
          throw new Error('UNEXPECTED_TTS_STREAM');
        },
        listVoices: async () => ({
          voices: [],
        }),
      },
      stt: {
        transcribe: async () => {
          throw new Error('UNEXPECTED_STT_TRANSCRIBE');
        },
      },
      jobs: {
        get: async () => {
          throw new Error('UNEXPECTED_JOB_GET');
        },
        cancel: async () => {
          throw new Error('UNEXPECTED_JOB_CANCEL');
        },
        subscribe: async () => {
          throw new Error('UNEXPECTED_JOB_SUBSCRIBE');
        },
        getArtifacts: async () => {
          throw new Error('UNEXPECTED_JOB_ARTIFACTS');
        },
      },
    },
    voice: {
      getAsset: async () => {
        throw new Error('UNEXPECTED_VOICE_GET');
      },
      listAssets: async () => {
        throw new Error('UNEXPECTED_VOICE_LIST');
      },
      deleteAsset: async () => {
        throw new Error('UNEXPECTED_VOICE_DELETE');
      },
      listPresetVoices: async () => ({
        voices: [],
      }),
    },
  };

  return {
    sdkRuntimeContext: {
      runtime: runtime as never,
      runtimeHost: runtimeHost as never,
    },
    runtimeHost,
    uiRegistrations,
  };
}

function installModSdkHost(runtimeHost: Record<string, unknown>): () => void {
  setModSdkHost({
    runtime: runtimeHost as never,
    ui: {
      useAppStore: () => undefined as never,
      SlotHost: (() => null) as never,
      useUiExtensionContext: () => ({
        isAuthenticated: false,
        activeTab: 'mods',
        setActiveTab: () => {},
        runtimeFields: {},
        setRuntimeFields: () => {},
      }),
    },
    logging: {
      emitRuntimeLog: () => {},
      createRendererFlowId: (prefix: string) => `${prefix}-test-flow`,
      logRendererEvent: () => {},
    },
  });
  return () => {
    clearModSdkHost();
  };
}

test('kismet runtime mod setup registers runtime-aligned UI surfaces', async () => {
  const { sdkRuntimeContext, runtimeHost, uiRegistrations } = createSdkRuntimeContext();
  const restoreHost = installModSdkHost(runtimeHost);
  const mod = createKismetRuntimeMod();

  try {
    assert.ok(mod.capabilities.includes('runtime.ai.text.generate'));
    assert.ok(mod.capabilities.includes('runtime.route.list.options'));
    assert.ok(mod.capabilities.includes('runtime.route.resolve'));
    assert.ok(mod.capabilities.includes('runtime.route.check.health'));
    assert.equal(mod.capabilities.some((capability) => capability.startsWith('llm.')), false);

    await mod.setup({ sdkRuntimeContext } as never);

    assert.equal(typeof getKismetHookClient().ui.register, 'function');
    assert.equal(typeof getKismetRuntimeClient().route.listOptions, 'function');
    assert.deepEqual(
      uiRegistrations.map((entry) => entry.slot),
      [KISMET_NAV_SLOT, KISMET_ROUTE_SLOT],
    );
  } finally {
    restoreHost();
  }
});
