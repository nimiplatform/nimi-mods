import test from 'node:test';
import assert from 'node:assert/strict';
import { setModSdkHost, clearModSdkHost } from '@nimiplatform/sdk/mod/host';
import { cloneDefaultSnapshot } from '../src/state/workspace/defaults.ts';
import { runCreatePhase1 } from '../src/hooks/actions/create/run-phase1.ts';
import { createMockTaskController } from './helpers/world-studio-task-controller-mock.mjs';

function makeValidPayload(index = 1) {
  return {
    worldSetting: `world-${index}`,
    timeline: [{ id: `t-${index}`, label: `T-${index}` }],
    locations: [{ id: `loc-${index}`, name: `Loc-${index}`, importance: 0.8 }],
    characters: [{ id: `char-${index}`, name: `Char-${index}`, significance: 0.8 }],
    events: {
      primary: [{
        id: `p-${index}`,
        title: `Primary-${index}`,
        summary: 'summary',
        cause: 'cause',
        process: 'process',
        result: 'result',
        timeRef: `T-${index}`,
        locationRefs: [`Loc-${index}`],
        characterRefs: [`Char-${index}`],
        dependsOnEventIds: [],
        evidenceRefs: [{
          segmentId: `seg-${index}`,
          offsetStart: 0,
          offsetEnd: 16,
          excerpt: 'excerpt',
          confidence: 0.9,
          sourceType: 'chunk',
        }],
        confidence: 0.9,
      }],
      secondary: [],
    },
    characterRelations: [{ source: `Char-${index}`, target: `Char-${index}`, relation: 'ally', reason: 'seed', strength: 0.5 }],
  };
}

test('runCreatePhase1 emits terminal failure histogram in diagnostics', async () => {
  const rendererLogs = [];
  setModSdkHost({
    runtime: {
      checkLocalLlmHealth: async () => ({ status: 'ok' }),
      executeLocalKernelTurn: async () => ({ text: '' }),
      withOpenApiContextLock: async (_context, task) => task(),
      getRuntimeHookRuntime: () => ({}),
      resolveRouteBinding: async () => ({
        source: 'token-api',
        connectorId: 'connector-1',
        model: 'deepseek/deepseek-chat',
      }),
    },
    ui: {
      useAppStore: () => ({}),
      SlotHost: () => null,
      useUiExtensionContext: () => ({
        isAuthenticated: true,
        activeTab: 'mods',
        setActiveTab: () => {},
        runtimeFields: {},
        setRuntimeFields: () => {},
      }),
    },
    logging: {
      emitRuntimeLog: () => {},
      createRendererFlowId: () => 'flow-test',
      logRendererEvent: (payload) => {
        rendererLogs.push(payload);
      },
    },
  });
  try {
    const snapshotRef = { current: cloneDefaultSnapshot() };
    const binding = {
      source: 'token-api',
      connectorId: 'connector-1',
      model: 'deepseek/deepseek-chat',
    };
    const routeOptions = {
      selected: binding,
      resolvedDefault: binding,
      ollamaModels: [],
      connectors: [{
        id: 'connector-1',
        label: 'Connector 1',
        models: ['deepseek/deepseek-chat'],
        modelProfiles: [{
          model: 'deepseek/deepseek-chat',
          maxContextTokens: 8192,
          contextSource: 'provider-api',
        }],
      }],
    };
    const taskController = createMockTaskController();

    const input = {
      aiClient: {
        async generateText(request) {
          const prompt = String(request.prompt || '');
          const chunkMatch = prompt.match(/CHUNK_INDEX:\s*(\d+)/);
          const chunkIndex = Number(chunkMatch?.[1] || 1);
          if (chunkIndex === 1) {
            return { text: 'invalid-json', promptTraceId: `trace-invalid-${chunkIndex}` };
          }
          return {
            text: JSON.stringify(makeValidPayload(chunkIndex)),
            promptTraceId: `trace-valid-${chunkIndex}`,
          };
        },
      },
      flowId: 'flow-phase1-terminal-failure-histogram',
      sourceEncoding: 'utf-8',
      setSourceEncoding: () => {},
      sourceMode: 'FILE',
      setSourceMode: () => {},
      setFilePreviewText: () => {},
      sourceChunksRef: { current: ['chunk-1', 'chunk-2'] },
      sourceRawTextRef: { current: '' },
      routeOptions,
      snapshot: snapshotRef.current,
      patchSnapshot: (patch) => {
        snapshotRef.current = {
          ...snapshotRef.current,
          ...patch,
          parseJob: {
            ...snapshotRef.current.parseJob,
            ...(patch.parseJob || {}),
          },
        };
        input.snapshot = snapshotRef.current;
      },
      patchPanel: () => {},
      setCreateStep: () => {},
      setPhase1: (value) => {
        input.phase1 = value;
      },
      setPhase2: () => {},
      phase1: null,
      retryConcurrency: 1,
      retryErrorCode: null,
      retryScope: 'all',
      retryWithFineRoute: false,
      resolveEffectiveRouteOverrides: () => ({ coarse: binding, fine: binding }),
      resolveRuntimeDefaultRouteBinding: async () => binding,
      routeOverrideMap: { coarse: binding, fine: binding },
      runtimeDefaultRouteBinding: binding,
      selectedDraftId: '',
      selectedWorldId: '',
      setLanding: () => {},
      mutations: {},
      queries: {},
      setStatusBanner: () => {},
      setError: () => {},
      setNotice: () => {},
      taskController,
    };

    await runCreatePhase1(input);

    const effectiveResultLog = rendererLogs.find(
      (entry) => String(entry.message || '').includes('[MODS-TEST-DIAG] Phase1 effective result'),
    );
    assert.equal(Boolean(effectiveResultLog), true);
    const histogram = effectiveResultLog?.details?.terminalFailureHistogram;
    assert.equal(Boolean(histogram), true);
    assert.equal(Number(histogram.terminalTotal), 2);
    assert.equal(Number(histogram.terminalFailed), 1);
    assert.equal(
      Array.isArray(histogram.failedByStage)
      && histogram.failedByStage.some((item) => item.stage === 'coarse' && Number(item.count) === 1),
      true,
    );
    assert.equal(
      Array.isArray(histogram.failedByKind)
      && histogram.failedByKind.some((item) => item.kind === 'json_parse' && Number(item.count) === 1),
      true,
    );
    assert.equal(
      Array.isArray(histogram.topFailedErrorCodes)
      && histogram.topFailedErrorCodes.some((item) => item.code === 'WORLD_STUDIO_COARSE_JSON_PARSE_FAILED'),
      true,
    );
  } finally {
    clearModSdkHost();
  }
});
