import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneDefaultSnapshot } from '../src/state/workspace/defaults.ts';
import { runCreatePhase2 } from '../src/hooks/actions/create/run-phase2.ts';
import { createMockTaskController } from './helpers/world-studio-task-controller-mock.mjs';

function makeQualityGatePass() {
  return {
    status: 'PASS',
    issues: [],
    pass: true,
    reasons: [],
    metrics: {
      totalChunks: 1,
      successChunks: 1,
      failedChunks: 0,
      chunkSuccessRatio: 1,
      primaryCount: 1,
      secondaryCount: 0,
      worldSettingCount: 1,
      timelineCount: 1,
      locationsCount: 1,
      charactersCount: 1,
      characterRelationsCount: 0,
      futureEventsCount: 0,
      primaryEvidenceCoverage: 1,
      eventCharacterCoverage: 1,
      eventLocationCoverage: 1,
      primaryNarrativeCompleteness: 1,
      storyArcCompleteness: 1,
      characterNamePurity: 1,
      characterProfileCoverage: 1,
    },
  };
}

test('world-studio phase2 can synthesize without full source text after refresh', async () => {
  const snapshotRef = { current: cloneDefaultSnapshot() };
  snapshotRef.current.selectedStartTimeId = 'event:p-1';
  snapshotRef.current.selectedCharacters = ['汪淼'];
  snapshotRef.current.phase1Artifact = {
    startTimeOptions: [{ id: 'event:p-1', label: '1. 2004 · 倒计时危机爆发', description: '', weight: 0.8 }],
    characterCandidates: [{ name: '汪淼', summary: 'summary', significance: 0.8 }],
    qualityGate: makeQualityGatePass(),
    chunkTasks: [],
    narrativeArc: {
      summary: 'summary',
      opening: 'opening',
      development: 'development',
      climax: 'climax',
      resolution: 'resolution',
    },
    sourceDigest: 'digest-1',
    updatedAt: new Date().toISOString(),
  };
  snapshotRef.current.knowledgeGraph = {
    ...snapshotRef.current.knowledgeGraph,
    worldSetting: 'world',
    timeline: [{ id: 't-1', label: '2004' }],
    characters: [{ id: 'char-1', name: '汪淼', summary: 'summary' }],
    events: {
      primary: [{
        id: 'p-1',
        level: 'PRIMARY',
        parentEventId: null,
        title: '倒计时危机爆发',
        summary: 'summary',
        cause: 'cause',
        process: 'process',
        result: 'result',
        timeRef: '2004',
        locationRefs: ['北京'],
        characterRefs: ['汪淼'],
        dependsOnEventIds: [],
        evidenceRefs: [{ segmentId: 'seg-1', offsetStart: 0, offsetEnd: 12, excerpt: 'evidence', confidence: 0.8, sourceType: 'chunk' }],
        confidence: 0.8,
        needsEvidence: false,
      }],
      secondary: [],
    },
    narrativeArc: snapshotRef.current.phase1Artifact.narrativeArc,
    characterProfiles: [{
      name: '汪淼',
      aliases: [],
      summary: 'summary',
      background: 'background',
      motivation: 'motivation',
      relationships: ['常伟思:合作'],
      keyEvents: ['倒计时危机爆发'],
    }],
    characterAliasMap: { 汪淼: '汪淼' },
  };

  const taskController = createMockTaskController();
  let phase2 = null;
  let seenStructuredContext = false;
  let seenFullSource = false;
  let lastNotice = null;
  let lastStatusBanner = null;

  const binding = {
    source: 'token-api',
    connectorId: 'connector-1',
    model: 'deepseek/deepseek-chat',
  };

  const input = {
    aiClient: {
      async generateText(request) {
        const prompt = String(request.prompt || '');
        if (prompt.includes('STRUCTURED_CONTEXT:') || prompt.includes('<structured_context>')) {
          seenStructuredContext = true;
        }
        if (prompt.includes('FULL_SOURCE:')) {
          seenFullSource = true;
        }
        return {
          text: JSON.stringify({
            world: {
              name: 'World',
              description: 'Description',
              lore: '',
              timeFlowRatio: 1,
              rules: {},
            },
            worldview: {
              timeModel: { currentNode: 't-1', timeline: [] },
              spaceTopology: {},
              causality: {},
              coreSystem: {},
              existences: {},
              resources: {},
              structures: {},
              visualGuide: {},
              narrativeHooks: {},
            },
            worldEvents: snapshotRef.current.knowledgeGraph.events.primary,
            futureHistoricalEvents: [],
            agentDrafts: [{
              characterName: '汪淼',
              handle: '~wangmiao',
              concept: 'concept',
              backstory: 'background',
              coreValues: 'motivation',
              relationshipStyle: 'cooperative',
            }],
          }),
          promptTraceId: 'trace-syn',
        };
      },
    },
    flowId: 'flow-phase2-without-full-source',
    sourceEncoding: 'utf-8',
    setSourceEncoding: () => {},
    sourceMode: 'FILE',
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
        parseJob: {
          ...snapshotRef.current.parseJob,
          ...(patch.parseJob || {}),
        },
        agentSync: {
          ...snapshotRef.current.agentSync,
          ...(patch.agentSync || {}),
        },
      };
      input.snapshot = snapshotRef.current;
    },
    patchPanel: () => {},
    setCreateStep: () => {},
    setPhase1: () => {},
    setPhase2: (value) => {
      phase2 = value;
    },
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
    setStatusBanner: (value) => {
      lastStatusBanner = value;
    },
    setError: () => {},
    setNotice: (value) => {
      lastNotice = value;
    },
    taskController,
  };

  await runCreatePhase2(input);

  assert.equal(Boolean(phase2), true);
  assert.equal(seenStructuredContext, true);
  assert.equal(seenFullSource, false);
  assert.equal(snapshotRef.current.agentSync.draftsByCharacter['汪淼'].handle, '~wangmiao');
  assert.equal(Boolean(snapshotRef.current.agentSync.draftsByCharacter['汪淼'].dna), false);
  assert.equal(String(lastNotice || '').includes('missing DNA'), true);
  assert.equal(lastStatusBanner?.kind, 'warn');
});
