import assert from 'node:assert/strict';
import test from 'node:test';

import { clearModSdkHost, setModSdkHost } from '@nimiplatform/sdk/mod/host';
import {
  MINTYOU_NAV_SLOT,
  MINTYOU_ROUTE_SLOT,
  MINTYOU_RUNTIME_PROFILE_READ_AGENT,
} from '../src/contracts.js';
import {
  createMintYouRuntimeMod,
  getMintYouHookClient,
  getMintYouRuntimeClient,
} from '../src/runtime-mod.js';
import {
  requestPhoto,
  respondToRequest,
  revokeAccess,
} from '../src/services/photo-auth.js';

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function installLocalStorage(): () => void {
  const store = new Map<string, string>();
  const previous = (globalThis as typeof globalThis & {
    localStorage?: LocalStorageLike;
  }).localStorage;
  const localStorage: LocalStorageLike = {
    getItem: (key) => (store.has(key) ? store.get(key) || null : null),
    setItem: (key, value) => {
      store.set(String(key), String(value));
    },
    removeItem: (key) => {
      store.delete(String(key));
    },
    clear: () => {
      store.clear();
    },
  };
  (globalThis as typeof globalThis & { localStorage?: LocalStorageLike }).localStorage = localStorage;
  return () => {
    if (previous) {
      (globalThis as typeof globalThis & { localStorage?: LocalStorageLike }).localStorage = previous;
    } else {
      delete (globalThis as typeof globalThis & { localStorage?: LocalStorageLike }).localStorage;
    }
  };
}

function createSdkRuntimeContext() {
  const uiRegistrations: Array<{ slot: string; extension: Record<string, unknown> }> = [];
  const profileFilters: Array<{
    modId: string;
    handler: (input: {
      viewerUserId?: string;
      ownerAgentId: string;
      worldId?: string;
      profile: Record<string, unknown>;
    }) => Promise<{ referenceImageUrl?: string | null }> | { referenceImageUrl?: string | null };
  }> = [];

  const runtime = {
    registerUIExtensionV2: async (input: { slot: string; extension: Record<string, unknown> }) => {
      uiRegistrations.push({
        slot: input.slot,
        extension: input.extension,
      });
    },
    registerAgentProfileReadFilter: async (input: {
      modId: string;
      handler: (payload: {
        viewerUserId?: string;
        ownerAgentId: string;
        worldId?: string;
        profile: Record<string, unknown>;
      }) => Promise<{ referenceImageUrl?: string | null }> | { referenceImageUrl?: string | null };
    }) => {
      profileFilters.push(input);
    },
  };

  const runtimeHost = {
    getRuntimeHookRuntime: () => runtime,
    checkLocalLlmHealth: async () => ({
      healthy: true,
      status: 'healthy',
    }),
    getModAiDependencySnapshot: async () => ({
      modId: 'world.nimi.mint-you',
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
    profileFilters,
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

test('mint-you runtime mod setup registers profile filter and enforces photo visibility', async () => {
  const restoreLocalStorage = installLocalStorage();
  try {
    const {
      sdkRuntimeContext,
      runtimeHost,
      uiRegistrations,
      profileFilters,
    } = createSdkRuntimeContext();
    const restoreHost = installModSdkHost(runtimeHost);
    const mod = createMintYouRuntimeMod();

    try {
      assert.ok(mod.capabilities.includes(MINTYOU_RUNTIME_PROFILE_READ_AGENT));
      assert.equal(mod.capabilities.some((capability) => capability.startsWith('llm.')), false);

      await mod.setup({ sdkRuntimeContext } as never);

      assert.equal(typeof getMintYouHookClient().profile.registerAgentReadFilter, 'function');
      assert.equal(typeof getMintYouRuntimeClient().route.listOptions, 'function');
      assert.deepEqual(
        uiRegistrations.map((entry) => entry.slot),
        [MINTYOU_NAV_SLOT, MINTYOU_ROUTE_SLOT],
      );
      assert.equal(profileFilters.length, 1);

      const profileFilter = profileFilters[0]?.handler;
      const profile = {
        id: 'agent-owner',
        worldId: 'world-1',
        referenceImageUrl: 'https://example.com/photo.png',
      };

      const unauthorized = await profileFilter({
        viewerUserId: 'viewer-a',
        ownerAgentId: 'agent-owner',
        worldId: 'world-1',
        profile,
      });
      assert.equal(unauthorized.referenceImageUrl, null);

      const ownerView = await profileFilter({
        viewerUserId: 'agent-owner',
        ownerAgentId: 'agent-owner',
        worldId: 'world-1',
        profile,
      });
      assert.equal(ownerView.referenceImageUrl, 'https://example.com/photo.png');

      requestPhoto('viewer-b', 'agent-owner', 'world-1');
      respondToRequest('agent-owner', 'viewer-b', 'world-1', true);
      const mutualView = await profileFilter({
        viewerUserId: 'viewer-b',
        ownerAgentId: 'agent-owner',
        worldId: 'world-1',
        profile,
      });
      assert.equal(mutualView.referenceImageUrl, 'https://example.com/photo.png');

      revokeAccess('viewer-b', 'agent-owner', 'world-1');
      const revokedView = await profileFilter({
        viewerUserId: 'viewer-b',
        ownerAgentId: 'agent-owner',
        worldId: 'world-1',
        profile,
      });
      assert.equal(revokedView.referenceImageUrl, null);
    } finally {
      restoreHost();
    }
  } finally {
    restoreLocalStorage();
  }
});
