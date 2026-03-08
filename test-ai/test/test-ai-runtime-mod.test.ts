import assert from 'node:assert/strict';
import test from 'node:test';

import { clearModSdkHost, setModSdkHost } from '@nimiplatform/sdk/mod/host';
import {
  TEST_AI_NAV_SLOT,
  TEST_AI_ROUTE_SLOT,
} from '../src/contracts.js';
import {
  createTestAiRuntimeMod,
  getTestAiRuntimeClient,
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
      modId: 'world.nimi.test-ai',
      status: 'ready',
      routeSource: 'mixed',
      warnings: [],
      dependencies: [],
      repairActions: [],
      updatedAt: new Date().toISOString(),
    }),
    route: {
      listOptions: async () => ({
        selected: { source: 'token-api', connectorId: '', model: '' },
        resolvedDefault: null,
        localRuntime: { models: [] },
        connectors: [],
      }),
      resolve: async () => ({
        source: 'token-api',
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
    localRuntime: {
      listArtifacts: async () => [],
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
        submit: async () => {
          throw new Error('UNEXPECTED_JOB_SUBMIT');
        },
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

test('test-ai runtime mod registers all 19 capabilities', async () => {
  const { sdkRuntimeContext, runtimeHost, uiRegistrations } = createSdkRuntimeContext();
  const restoreHost = installModSdkHost(runtimeHost);
  const mod = createTestAiRuntimeMod();

  try {
    assert.ok(mod.capabilities.includes('runtime.ai.text.generate'), 'missing runtime.ai.text.generate');
    assert.ok(mod.capabilities.includes('runtime.ai.text.embed'), 'missing runtime.ai.text.embed');
    assert.ok(mod.capabilities.includes('runtime.media.image.generate'), 'missing runtime.media.image.generate');
    assert.ok(mod.capabilities.includes('runtime.media.jobs.submit'), 'missing runtime.media.jobs.submit');
    assert.ok(mod.capabilities.includes('runtime.media.jobs.get'), 'missing runtime.media.jobs.get');
    assert.ok(mod.capabilities.includes('runtime.media.jobs.cancel'), 'missing runtime.media.jobs.cancel');
    assert.ok(mod.capabilities.includes('runtime.media.jobs.subscribe'), 'missing runtime.media.jobs.subscribe');
    assert.ok(mod.capabilities.includes('runtime.media.jobs.get.artifacts'), 'missing runtime.media.jobs.get.artifacts');
    assert.ok(mod.capabilities.includes('runtime.media.video.generate'), 'missing runtime.media.video.generate');
    assert.ok(mod.capabilities.includes('runtime.media.tts.list.voices'), 'missing runtime.media.tts.list.voices');
    assert.ok(mod.capabilities.includes('runtime.media.tts.synthesize'), 'missing runtime.media.tts.synthesize');
    assert.ok(mod.capabilities.includes('runtime.media.stt.transcribe'), 'missing runtime.media.stt.transcribe');
    assert.ok(mod.capabilities.includes('runtime.media.voice.clone'), 'missing runtime.media.voice.clone');
    assert.ok(mod.capabilities.includes('runtime.media.voice.design'), 'missing runtime.media.voice.design');
    assert.ok(mod.capabilities.includes('runtime.route.list.options'), 'missing runtime.route.list.options');
    assert.ok(mod.capabilities.includes('runtime.route.resolve'), 'missing runtime.route.resolve');
    assert.ok(mod.capabilities.includes('runtime.local.artifacts.list'), 'missing runtime.local.artifacts.list');
    assert.ok(mod.capabilities.includes('ui.register.ui-extension.app.sidebar.mods'), 'missing sidebar slot');
    assert.ok(mod.capabilities.includes('ui.register.ui-extension.app.content.routes'), 'missing routes slot');

    assert.equal(mod.capabilities.some((capability) => capability.startsWith('llm.')), false, 'must not contain legacy llm.* prefix');
    assert.equal(mod.capabilities.length, 19, 'expected exactly 19 capabilities');

    await mod.setup({ sdkRuntimeContext } as never);

    assert.equal(typeof getTestAiRuntimeClient().route.listOptions, 'function', 'route.listOptions must be a function');

    assert.deepEqual(
      uiRegistrations.map((entry) => entry.slot),
      [TEST_AI_NAV_SLOT, TEST_AI_ROUTE_SLOT],
    );
  } finally {
    restoreHost();
  }
});

test('test-ai runtime mod registers nav-slot and route-slot in order', async () => {
  const { sdkRuntimeContext, runtimeHost, uiRegistrations } = createSdkRuntimeContext();
  const restoreHost = installModSdkHost(runtimeHost);
  const mod = createTestAiRuntimeMod();

  try {
    await mod.setup({ sdkRuntimeContext } as never);
    assert.equal(uiRegistrations.length, 2, 'expected exactly 2 UI registrations');
    assert.equal(uiRegistrations[0]?.slot, TEST_AI_NAV_SLOT);
    assert.equal(uiRegistrations[1]?.slot, TEST_AI_ROUTE_SLOT);
  } finally {
    restoreHost();
  }
});

test('test-ai runtime client exposes embed, stt, video api surfaces', async () => {
  const { sdkRuntimeContext, runtimeHost } = createSdkRuntimeContext();
  const restoreHost = installModSdkHost(runtimeHost);
  const mod = createTestAiRuntimeMod();

  try {
    await mod.setup({ sdkRuntimeContext } as never);
    const client = getTestAiRuntimeClient();
    assert.equal(typeof client.ai.embedding.generate, 'function', 'ai.embedding.generate must be a function');
    assert.equal(typeof client.media.stt.transcribe, 'function', 'media.stt.transcribe must be a function');
    assert.equal(typeof client.media.video.generate, 'function', 'media.video.generate must be a function');
    assert.equal(typeof client.media.tts.synthesize, 'function', 'media.tts.synthesize must be a function');
    assert.equal(typeof client.media.tts.listVoices, 'function', 'media.tts.listVoices must be a function');
    assert.equal(typeof client.media.image.generate, 'function', 'media.image.generate must be a function');
    assert.equal(typeof client.media.jobs.submit, 'function', 'media.jobs.submit must be a function');
    assert.equal(typeof client.localRuntime.listArtifacts, 'function', 'localRuntime.listArtifacts must be a function');
  } finally {
    restoreHost();
  }
});

test('test-ai route unavailability surfaces structured error from listOptions', async () => {
  const { sdkRuntimeContext, runtimeHost } = createSdkRuntimeContext();

  const routeError = new Error('ROUTE_OPTIONS_UNAVAILABLE');
  runtimeHost.route.listOptions = async () => {
    throw routeError;
  };

  const restoreHost = installModSdkHost(runtimeHost);
  const mod = createTestAiRuntimeMod();

  try {
    await mod.setup({ sdkRuntimeContext } as never);
    const client = getTestAiRuntimeClient();
    await assert.rejects(
      async () => {
        await client.route.listOptions({ capability: 'text.generate' });
      },
      (error: Error) => {
        assert.ok(error.message.includes('ROUTE_OPTIONS_UNAVAILABLE'), `unexpected error: ${error.message}`);
        return true;
      },
    );
  } finally {
    restoreHost();
  }
});
