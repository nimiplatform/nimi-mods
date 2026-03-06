import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneDefaultSnapshot } from '../src/state/workspace/defaults.ts';
import {
  generateCharacterPortraitAsset,
  generateLocationImageAsset,
  generateWorldCoverAsset,
} from '../src/hooks/actions/create/assets-generation.ts';
import { createMockTaskController } from './helpers/world-studio-task-controller-mock.mjs';

function createAssetGenerationInput(overrides = {}) {
  const snapshotRef = { current: cloneDefaultSnapshot() };
  snapshotRef.current.worldPatch = {
    name: 'Nimi Realm',
    description: 'Floating cities over a flooded world',
  };
  snapshotRef.current.knowledgeGraph = {
    ...snapshotRef.current.knowledgeGraph,
    worldSetting: 'A flooded techno-mythic world',
  };

  let lastError = null;
  let lastNotice = null;
  let lastStatusBanner = null;

  const binding = {
    source: 'token-api',
    connectorId: 'connector-image',
    model: 'openai/gpt-image-1',
  };
  const input = {
    aiClient: overrides.aiClient,
    flowId: 'flow-assets',
    sourceEncoding: 'utf-8',
    setSourceEncoding: () => {},
    sourceMode: 'TEXT',
    setSourceMode: () => {},
    setFilePreviewText: () => {},
    sourceChunksRef: { current: [] },
    sourceRawTextRef: { current: '' },
    routeOptions: null,
    snapshot: snapshotRef.current,
    patchSnapshot: (patch) => {
      snapshotRef.current = {
        ...snapshotRef.current,
        ...patch,
        assets: {
          ...snapshotRef.current.assets,
          ...(patch.assets || {}),
          characterPortraits: {
            ...snapshotRef.current.assets.characterPortraits,
            ...(patch.assets?.characterPortraits || {}),
          },
          locationImages: {
            ...snapshotRef.current.assets.locationImages,
            ...(patch.assets?.locationImages || {}),
          },
        },
      };
      input.snapshot = snapshotRef.current;
    },
    patchPanel: () => {},
    setCreateStep: () => {},
    setPhase1: () => {},
    setPhase2: () => {},
    phase1: null,
    retryConcurrency: 1,
    retryErrorCode: null,
    retryScope: 'all',
    retryWithFineRoute: false,
    resolveEffectiveRouteBindings: () => ({ coarse: binding, fine: binding }),
    resolveRuntimeDefaultRouteBinding: async () => binding,
    bindingMap: { coarse: binding, fine: binding },
    runtimeDefaultRouteBinding: binding,
    selectedDraftId: '',
    selectedWorldId: '',
    setLanding: () => {},
    mutations: {},
    queries: {},
    setStatusBanner: (value) => {
      lastStatusBanner = value;
    },
    setError: (value) => {
      lastError = value;
    },
    setNotice: (value) => {
      lastNotice = value;
    },
    taskController: createMockTaskController(),
  };

  return {
    input,
    snapshotRef,
    getLastError: () => lastError,
    getLastNotice: () => lastNotice,
    getLastStatusBanner: () => lastStatusBanner,
  };
}

test('world-studio asset generation routes cover, portrait, and location through generateImage', async () => {
  const imageCalls = [];
  let generateTextCalls = 0;
  const { input, snapshotRef, getLastError } = createAssetGenerationInput({
    aiClient: {
      async generateImage(request) {
        imageCalls.push(request);
        return {
          artifacts: [{
            uri: `https://cdn.example/${imageCalls.length}.png`,
            mimeType: 'image/png',
          }],
          traceId: `trace-${imageCalls.length}`,
        };
      },
      async generateText() {
        generateTextCalls += 1;
        throw new Error('generateText should not be used for image assets');
      },
    },
  });

  await generateWorldCoverAsset(input);
  await generateCharacterPortraitAsset(input, 'Astra');
  await generateLocationImageAsset(input, 'Sky Harbor');

  assert.equal(generateTextCalls, 0);
  assert.equal(imageCalls.length, 3);
  assert.equal(snapshotRef.current.assets.worldCover.imageUrl, 'https://cdn.example/1.png');
  assert.equal(snapshotRef.current.assets.characterPortraits.Astra.imageUrl, 'https://cdn.example/2.png');
  assert.equal(snapshotRef.current.assets.locationImages['Sky Harbor'].imageUrl, 'https://cdn.example/3.png');
  assert.equal(snapshotRef.current.assets.worldCover.status, 'succeeded');
  assert.equal(snapshotRef.current.assets.characterPortraits.Astra.status, 'succeeded');
  assert.equal(snapshotRef.current.assets.locationImages['Sky Harbor'].status, 'succeeded');
  assert.equal(getLastError(), null);
});

test('world-studio asset generation falls back to data url when artifact uri is missing', async () => {
  const { input, snapshotRef, getLastNotice, getLastStatusBanner } = createAssetGenerationInput({
    aiClient: {
      async generateImage() {
        return {
          artifacts: [{
            mimeType: 'image/webp',
            bytes: new Uint8Array([1, 2, 3]),
          }],
          traceId: 'trace-inline',
        };
      },
      async generateText() {
        throw new Error('generateText should not be used for image assets');
      },
    },
  });

  await generateCharacterPortraitAsset(input, 'Nova');

  assert.equal(snapshotRef.current.assets.characterPortraits.Nova.status, 'succeeded');
  assert.equal(snapshotRef.current.assets.characterPortraits.Nova.imageUrl, 'data:image/webp;base64,AQID');
  assert.equal(getLastNotice(), null);
  assert.equal(getLastStatusBanner()?.kind, 'success');
});
