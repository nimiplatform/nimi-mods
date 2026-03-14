import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneDefaultSnapshot } from '../src/state/workspace/defaults.ts';
import { runCreatePhase2 } from '../src/hooks/actions/create/run-phase2.ts';
import { publishWorldDraft } from '../src/hooks/actions/create/draft-publish.ts';
import { createMockTaskController } from './helpers/world-studio-task-controller-mock.mjs';

function makePassQualityGate() {
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

function makeKnowledgeGraph() {
  return {
    worldSetting: 'world',
    timeline: [{ id: 't-1', label: '2004' }],
    locations: [{ id: 'loc-1', name: '北京' }],
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
        evidenceRefs: [{ segmentId: 'seg-1', offsetStart: 0, offsetEnd: 10, excerpt: 'evidence', confidence: 0.8, sourceType: 'chunk' }],
        confidence: 0.8,
        needsEvidence: false,
      }],
      secondary: [],
    },
    characterRelations: [],
    futureHistoricalEvents: [],
    narrativeArc: {
      summary: 'summary',
      opening: 'opening',
      development: 'development',
      climax: 'climax',
      resolution: 'resolution',
    },
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
}

test('world-studio agent drafts flow persists phase2 drafts and publishes with draft payload', async () => {
  const snapshotRef = { current: cloneDefaultSnapshot() };
  snapshotRef.current.selectedStartTimeId = 'event:p-1';
  snapshotRef.current.selectedCharacters = ['汪淼'];
  snapshotRef.current.agentSync.selectedCharacterIds = ['汪淼'];
  snapshotRef.current.knowledgeGraph = makeKnowledgeGraph();
  snapshotRef.current.phase1Artifact = {
    startTimeOptions: [{ id: 'event:p-1', label: '1. 2004 · 倒计时危机爆发', description: '', weight: 0.8 }],
    characterCandidates: [{ name: '汪淼', summary: 'summary', significance: 0.8 }],
    qualityGate: makePassQualityGate(),
    chunkTasks: [],
    narrativeArc: snapshotRef.current.knowledgeGraph.narrativeArc,
    sourceDigest: 'digest-1',
    updatedAt: new Date().toISOString(),
  };

  const binding = {
    source: 'cloud',
    connectorId: 'connector-1',
    model: 'deepseek/deepseek-chat',
  };

  const taskController = createMockTaskController();
  const batchPayloadRef = { current: null };

  const baseInput = {
    aiClient: {
      async generateText() {
        return {
          text: JSON.stringify({
            world: {
              name: 'World',
              description: 'Description',
              lore: '',
              rules: {},
            },
            worldview: {
              timeModel: { timeFlowRatio: 1, calendarSystem: {} },
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
              concept: '物理学家，理性且谨慎',
              backstory: '纳米科学家',
              coreValues: '求真',
              relationshipStyle: '克制协作',
              description: '汪淼是纳米科学家。',
              scenario: '你在倒计时危机后与我讨论实验进展。',
              greeting: '你好，我是汪淼。',
              exampleDialogue: '汪淼：先确认事实，再下结论。',
              systemPromptBase: '以科学事实与理性推理优先。',
              rules: {
                format: 'rule-lines-v1',
                lines: ['先验证再判断', '避免夸张结论'],
                text: '先验证再判断\n避免夸张结论',
              },
              referenceImageUrl: 'https://example.com/wangmiao.png',
              wakeStrategy: 'PROACTIVE',
              dnaPrimary: 'RATIONAL',
              dnaSecondary: ['CAUTIOUS', 'ANALYTICAL'],
              postHistoryInstructions: '回复应与既有事件线一致。',
              alternateGreetings: ['又见面了，实验还顺利吗？'],
              agentLorebooks: [
                {
                  name: '三体倒计时',
                  content: '汪淼曾看到神秘倒计时。',
                  keywords: ['倒计时', '三体'],
                  priority: 20,
                  insertionOrder: 80,
                  constant: true,
                  selective: false,
                  secondaryKeys: [],
                  enabled: true,
                  source: 'world-studio.synthesize',
                },
              ],
              dna: {
                identity: { name: '汪淼', role: '科学家', worldview: '三体危机', species: 'human' },
                biological: { gender: 'male', visualAge: 'adult', ethnicity: 'unspecified', heightCm: 176, weightKg: 68 },
                appearance: { artStyle: 'realistic', hair: 'black', eyes: 'dark', skin: 'fair', fashionStyle: 'modern', signatureItems: ['实验笔记'] },
                personality: { mbti: 'INTJ', interests: ['物理'], goals: ['求真'], relationshipMode: 'guarded' },
                communication: { responseLength: 'medium', formality: 'formal', sentiment: 'neutral' },
                nsfwLevel: 'SAFE',
              },
            }],
          }),
          promptTraceId: 'trace',
        };
      },
    },
    flowId: 'flow-agent-draft',
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
        parseJob: {
          ...snapshotRef.current.parseJob,
          ...(patch.parseJob || {}),
        },
        agentSync: {
          ...snapshotRef.current.agentSync,
          ...(patch.agentSync || {}),
        },
      };
      baseInput.snapshot = snapshotRef.current;
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
    selectedDraftId: 'draft-1',
    selectedWorldId: '',
    setLanding: () => {},
    mutations: {
      publishDraftMutation: {
        mutateAsync: async () => ({ worldId: 'world-1' }),
      },
      batchCreateCreatorAgentsMutation: {
        mutateAsync: async (payload) => {
          batchPayloadRef.current = payload;
          return { created: payload.items || [], failed: [] };
        },
      },
    },
    queries: {
      maintenanceQuery: {
        refetch: async () => ({ data: null }),
      },
    },
    setStatusBanner: () => {},
    setError: () => {},
    setNotice: () => {},
    taskController,
  };

  await runCreatePhase2(baseInput);

  const draftKeys = Object.keys(snapshotRef.current.agentSync.draftsByCharacter || {});
  assert.equal(draftKeys.length > 0, true);
  const wDraft = snapshotRef.current.agentSync.draftsByCharacter['汪淼']
    || snapshotRef.current.agentSync.draftsByCharacter[draftKeys[0]];
  assert.equal(wDraft.handle, '~wangmiao');
  assert.equal(wDraft.concept.includes('物理学家'), true);
  assert.equal(Boolean(wDraft.dna), true);
  assert.equal(wDraft.dna.identity.name, '汪淼');
  assert.equal(wDraft.description, '汪淼是纳米科学家。');
  assert.equal(wDraft.rules.lines.length, 2);
  assert.equal(wDraft.agentLorebooks.length, 1);
  assert.equal(wDraft.referenceImageUrl, 'https://example.com/wangmiao.png');
  assert.equal(wDraft.wakeStrategy, 'PROACTIVE');
  assert.equal(wDraft.dnaPrimary, 'INTELLECTUAL');
  assert.deepEqual(wDraft.dnaSecondary, ['REALISTIC', 'WISE']);

  const publishInput = {
    ...baseInput,
    snapshot: snapshotRef.current,
    selectedDraftId: 'draft-1',
    setLanding: () => {},
    patchPanel: () => {},
  };

  await publishWorldDraft(publishInput);

  assert.notEqual(batchPayloadRef.current, null);
  assert.equal(batchPayloadRef.current.items.length, 1);
  assert.equal(batchPayloadRef.current.items[0].handle, '~wangmiao');
  assert.equal(String(batchPayloadRef.current.items[0].concept || '').includes('物理学家'), true);
  assert.equal(batchPayloadRef.current.items[0].ownershipType, 'WORLD_OWNED');
  assert.equal(batchPayloadRef.current.items[0].worldId, 'world-1');
  assert.equal(Boolean(batchPayloadRef.current.items[0].dna), true);
  assert.equal(batchPayloadRef.current.items[0].dna.identity.name, '汪淼');
  assert.equal(batchPayloadRef.current.items[0].description, '汪淼是纳米科学家。');
  assert.equal(batchPayloadRef.current.items[0].scenario, '你在倒计时危机后与我讨论实验进展。');
  assert.equal(batchPayloadRef.current.items[0].rules.format, 'rule-lines-v1');
  assert.deepEqual(batchPayloadRef.current.items[0].rules.lines, ['先验证再判断', '避免夸张结论']);
  assert.equal(batchPayloadRef.current.items[0].rules.text, '先验证再判断\n避免夸张结论');
  assert.equal(Array.isArray(batchPayloadRef.current.items[0].agentLorebooks), true);
  assert.equal(batchPayloadRef.current.items[0].agentLorebooks.length, 1);
  assert.equal(batchPayloadRef.current.items[0].referenceImageUrl, 'https://example.com/wangmiao.png');
  assert.equal(batchPayloadRef.current.items[0].wakeStrategy, 'PROACTIVE');
  assert.equal(batchPayloadRef.current.items[0].dnaPrimary, 'INTELLECTUAL');
  assert.deepEqual(batchPayloadRef.current.items[0].dnaSecondary, ['REALISTIC', 'WISE']);
});

test('world-studio publish normalizes invalid handle to ASCII fallback', async () => {
  const snapshotRef = { current: cloneDefaultSnapshot() };
  snapshotRef.current.selectedCharacters = ['韩立'];
  snapshotRef.current.knowledgeGraph = {
    ...snapshotRef.current.knowledgeGraph,
    characters: [{ id: 'char-1', name: '韩立', summary: 'summary' }],
  };
  snapshotRef.current.worldPatch = { name: '凡人修仙传:神手谷篇' };
  snapshotRef.current.agentSync = {
    ...snapshotRef.current.agentSync,
    selectedCharacterIds: ['韩立'],
    draftsByCharacter: {
      韩立: {
        characterName: '韩立',
        handle: '~韩立-1',
        concept: 'concept',
        backstory: 'backstory',
        coreValues: 'core values',
        relationshipStyle: 'relationship style',
      },
    },
  };

  const taskController = createMockTaskController();
  let batchPayload = null;
  const input = {
    aiClient: null,
    flowId: 'flow-handle-fallback',
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
    setPhase2: () => {},
    phase1: null,
    retryConcurrency: 1,
    retryErrorCode: null,
    retryScope: 'all',
    retryWithFineRoute: false,
    resolveEffectiveRouteBindings: () => ({ coarse: null, fine: null }),
    resolveRuntimeDefaultRouteBinding: async () => null,
    bindingMap: { coarse: null, fine: null },
    runtimeDefaultRouteBinding: null,
    selectedDraftId: 'draft-1',
    selectedWorldId: '',
    setLanding: () => {},
    mutations: {
      publishDraftMutation: {
        mutateAsync: async () => ({ worldId: 'world-1', worldviewVersion: 1 }),
      },
      batchCreateCreatorAgentsMutation: {
        mutateAsync: async (payload) => {
          batchPayload = payload;
          return { created: payload.items || [], failed: [] };
        },
      },
    },
    queries: {
      maintenanceQuery: {
        refetch: async () => ({ data: null }),
      },
    },
    setStatusBanner: () => {},
    setError: () => {},
    setNotice: () => {},
    taskController,
  };

  await publishWorldDraft(input);

  assert.notEqual(batchPayload, null);
  assert.equal(batchPayload.items.length, 1);
  assert.equal(batchPayload.items[0].handle === '~韩立-1', false);
  assert.equal(/^~[a-z0-9_]{4,16}$/.test(batchPayload.items[0].handle), true);
  assert.equal(Object.prototype.hasOwnProperty.call(batchPayload.items[0], 'dna'), false);
});

test('world-studio publish sanitizes dna traits to backend enums', async () => {
  const snapshotRef = { current: cloneDefaultSnapshot() };
  snapshotRef.current.selectedCharacters = ['韩立', '瘦长师兄'];
  snapshotRef.current.knowledgeGraph = {
    ...snapshotRef.current.knowledgeGraph,
    characters: [
      { id: 'char-1', name: '韩立', summary: '主角' },
      { id: 'char-2', name: '瘦长师兄', summary: '外门师兄' },
    ],
  };
  snapshotRef.current.worldPatch = { name: '凡人修仙传:七玄门篇' };
  snapshotRef.current.agentSync = {
    ...snapshotRef.current.agentSync,
    selectedCharacterIds: ['韩立', '瘦长师兄'],
    draftsByCharacter: {
      韩立: {
        characterName: '韩立',
        handle: '~hanli',
        concept: 'concept',
        backstory: 'backstory',
        coreValues: 'core values',
        relationshipStyle: 'relationship style',
        dnaPrimary: 'RATIONAL',
        dnaSecondary: ['CAUTIOUS', 'ANALYTICAL', 'GENTLE'],
      },
      瘦长师兄: {
        characterName: '瘦长师兄',
        handle: '~senior',
        concept: 'concept',
        backstory: 'backstory',
        coreValues: 'core values',
        relationshipStyle: 'relationship style',
        dnaPrimary: '冷酷',
      },
    },
  };

  const taskController = createMockTaskController();
  let batchPayload = null;
  const input = {
    aiClient: null,
    flowId: 'flow-dna-sanitize',
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
    setPhase2: () => {},
    phase1: null,
    retryConcurrency: 1,
    retryErrorCode: null,
    retryScope: 'all',
    retryWithFineRoute: false,
    resolveEffectiveRouteBindings: () => ({ coarse: null, fine: null }),
    resolveRuntimeDefaultRouteBinding: async () => null,
    bindingMap: { coarse: null, fine: null },
    runtimeDefaultRouteBinding: null,
    selectedDraftId: 'draft-1',
    selectedWorldId: '',
    setLanding: () => {},
    mutations: {
      publishDraftMutation: {
        mutateAsync: async () => ({ worldId: 'world-1', worldviewVersion: 1 }),
      },
      batchCreateCreatorAgentsMutation: {
        mutateAsync: async (payload) => {
          batchPayload = payload;
          return { created: payload.items || [], failed: [] };
        },
      },
    },
    queries: {
      maintenanceQuery: {
        refetch: async () => ({ data: null }),
      },
    },
    setStatusBanner: () => {},
    setError: () => {},
    setNotice: () => {},
    taskController,
  };

  await publishWorldDraft(input);

  assert.notEqual(batchPayload, null);
  assert.equal(batchPayload.items.length, 2);
  assert.equal(batchPayload.items[0].dnaPrimary, 'INTELLECTUAL');
  assert.deepEqual(batchPayload.items[0].dnaSecondary, ['REALISTIC', 'WISE', 'GENTLE']);
  assert.equal(Object.prototype.hasOwnProperty.call(batchPayload.items[1], 'dnaPrimary'), false);
});
