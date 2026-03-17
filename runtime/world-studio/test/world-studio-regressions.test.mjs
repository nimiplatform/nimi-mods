import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeExtractions } from '../src/engine/merge.ts';
import { createEmptyAccumulatedState } from '../src/engine/accumulated-context.ts';
import { upsertMergeExtraction, toChunkExtraction } from '../src/engine/accumulated-merge.ts';
import { canonicalizeCharacterNames } from '../src/engine/character/normalize-zh.ts';
import { createEmptyFinalDraftAccumulator } from '../src/engine/final-draft-accumulator.ts';
import { runPhase1GlobalRefine } from '../src/generation/phase1/global-refine.ts';
import { normalizeTemporalGraph } from '../src/generation/phase1/temporal-normalize.ts';
import { runSynthesizeDraft } from '../src/engine/synthesize.ts';
import { buildStartTimeOptionsFromEvents } from '../src/services/temporal-order.ts';
import { cloneDefaultSnapshot } from '../src/state/workspace/defaults.ts';
import { syncSnapshot } from '../src/state/workspace/normalize.ts';

function makePrimaryEvent(input) {
  return {
    id: String(input.id || 'evt-p1'),
    level: 'PRIMARY',
    parentEventId: null,
    title: String(input.title || ''),
    summary: String(input.summary || ''),
    cause: String(input.cause || ''),
    process: String(input.process || ''),
    result: String(input.result || ''),
    timeRef: String(input.timeRef || ''),
    locationRefs: Array.isArray(input.locationRefs) ? input.locationRefs : [],
    characterRefs: Array.isArray(input.characterRefs) ? input.characterRefs : [],
    dependsOnEventIds: [],
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [{
      segmentId: 'seg-1',
      offsetStart: 0,
      offsetEnd: 8,
      excerpt: '证据',
      confidence: 0.9,
      sourceType: 'chunk',
    }],
    confidence: Number.isFinite(input.confidence) ? Number(input.confidence) : 0.8,
    needsEvidence: false,
  };
}

test('mergeExtractions keeps multiple primary events even with placeholder ids', () => {
  const merged = mergeExtractions([
    {
      worldSetting: '修仙世界',
      timeline: [],
      locations: [],
      characters: [],
      events: {
        primary: [makePrimaryEvent({
          id: 'evt-p1',
          title: '韩立入门',
          summary: '入七玄门',
          timeRef: '卷一',
          characterRefs: ['韩立'],
        })],
        secondary: [],
      },
      characterRelations: [],
    },
    {
      worldSetting: '修仙世界',
      timeline: [],
      locations: [],
      characters: [],
      events: {
        primary: [makePrimaryEvent({
          id: 'evt-p1',
          title: '墨大夫收徒',
          summary: '拜师',
          timeRef: '卷一',
          characterRefs: ['韩立', '墨大夫'],
        })],
        secondary: [],
      },
      characterRelations: [],
    },
  ]);

  assert.equal(merged.events.primary.length, 2);
  assert.deepEqual(
    merged.events.primary.map((item) => item.title),
    ['韩立入门', '墨大夫收徒'],
  );
});

test('upsertMergeExtraction keeps placeholder-id events when semantics differ across chunks', () => {
  let state = createEmptyAccumulatedState();
  state = upsertMergeExtraction(state, {
    worldSetting: '修仙世界',
    timeline: [],
    locations: [],
    characters: [],
    events: {
      primary: [makePrimaryEvent({
        id: 'evt-p1',
        title: '韩立入门',
        summary: '进入七玄门',
        timeRef: '卷一',
      })],
      secondary: [],
    },
    characterRelations: [],
  }, 0);
  state = upsertMergeExtraction(state, {
    worldSetting: '修仙世界',
    timeline: [],
    locations: [],
    characters: [],
    events: {
      primary: [makePrimaryEvent({
        id: 'evt-p1',
        title: '墨大夫收徒',
        summary: '进入神手谷',
        timeRef: '卷一',
      })],
      secondary: [],
    },
    characterRelations: [],
  }, 1);

  const merged = toChunkExtraction(state);
  assert.equal(merged.events.primary.length, 2);
  assert.deepEqual(
    merged.events.primary.map((item) => item.title),
    ['韩立入门', '墨大夫收徒'],
  );
});

test('mergeExtractions merges semantically duplicated primary events from different chunk ids', () => {
  const merged = mergeExtractions([
    {
      worldSetting: '修仙世界',
      timeline: [],
      locations: [{ id: 'loc-1', name: '神手谷外林间小路', description: 'path', importance: 0.8 }],
      characters: [{ id: 'char-1', name: '韩立', summary: '主角', significance: 1 }],
      events: {
        primary: [makePrimaryEvent({
          id: 'evt-find-green-bottle',
          title: '发现神秘绿色小瓶',
          summary: '韩立在深秋某日于林间发现绿瓶。',
          timeRef: '深秋某日',
          characterRefs: ['韩立'],
          locationRefs: ['神手谷外林间小路'],
        })],
        secondary: [],
      },
      characterRelations: [],
    },
    {
      worldSetting: '修仙世界',
      timeline: [],
      locations: [{ id: 'loc-1', name: '神手谷外林间小路', description: 'path', importance: 0.8 }],
      characters: [{ id: 'char-1', name: '韩立', summary: '主角', significance: 1 }],
      events: {
        primary: [makePrimaryEvent({
          id: 'evt-picked-green-bottle',
          title: '捡获神秘绿瓶',
          summary: '韩立在深秋时分意外拾得绿瓶。',
          timeRef: '深秋',
          characterRefs: ['韩立'],
          locationRefs: ['神手谷外林间小路'],
        })],
        secondary: [],
      },
      characterRelations: [],
    },
  ]);

  assert.equal(merged.events.primary.length, 1);
  assert.equal(merged.events.primary[0].characterRefs.includes('韩立'), true);
  assert.equal(merged.events.primary[0].locationRefs.includes('神手谷外林间小路'), true);
});

test('runPhase1GlobalRefine builds narrative arc from distinct events', () => {
  const graph = {
    worldSetting: '修仙世界',
    timeline: [],
    locations: [],
    characters: [{ id: 'char:韩立', name: '韩立', summary: '主角' }],
    events: {
      primary: [
        makePrimaryEvent({ id: 'evt-p1', title: '开端', cause: '开端缘起', confidence: 0.95, characterRefs: ['韩立'] }),
        makePrimaryEvent({ id: 'evt-p2', title: '冲突', result: '矛盾爆发', confidence: 0.88, characterRefs: ['韩立'] }),
        makePrimaryEvent({ id: 'evt-p3', title: '收束', result: '局面稳定', confidence: 0.75, characterRefs: ['韩立'] }),
      ],
      secondary: [],
    },
    characterRelations: [],
    futureHistoricalEvents: [],
  };

  const refined = runPhase1GlobalRefine(graph);
  assert.equal(refined.narrativeArc?.summary, '开端 -> 冲突 -> 收束');
});

test('runPhase1GlobalRefine keeps single-event narrative arc as single summary', () => {
  const graph = {
    worldSetting: '修仙世界',
    timeline: [],
    locations: [],
    characters: [{ id: 'char:韩立', name: '韩立', summary: '主角' }],
    events: {
      primary: [
        makePrimaryEvent({ id: 'evt-p1', title: '开端', cause: '开端缘起', result: '获得机缘', characterRefs: ['韩立'] }),
      ],
      secondary: [],
    },
    characterRelations: [],
    futureHistoricalEvents: [],
  };

  const refined = runPhase1GlobalRefine(graph);
  assert.equal(refined.narrativeArc?.summary, '开端');
});

test('normalizeTemporalGraph rewrites canonical event order, timelineSeq, and timeline from temporal order', () => {
  const graph = {
    worldSetting: '修仙世界',
    timeline: [{ id: 'legacy-1', label: '旧时间线' }],
    locations: [],
    characters: [{ id: 'char:韩立', name: '韩立', summary: '主角' }],
    events: {
      primary: [
        {
          ...makePrimaryEvent({ id: 'evt-late', title: '后段事件', timeRef: '三年后', characterRefs: ['韩立'] }),
          temporalConfidence: 0.9,
          dependsOnEventIds: ['evt-middle'],
          temporalBeforeEventIds: ['evt-early'],
        },
        {
          ...makePrimaryEvent({ id: 'evt-early', title: '前段事件', timeRef: '入门之初', characterRefs: ['韩立'] }),
          temporalConfidence: 0.9,
          temporalAfterEventIds: ['evt-late'],
        },
      ],
      secondary: [
        {
          ...makePrimaryEvent({ id: 'evt-middle', title: '中段事件', timeRef: '半年后', characterRefs: ['韩立'] }),
          level: 'SECONDARY',
          temporalConfidence: 0.85,
          temporalBeforeEventIds: ['evt-early'],
          temporalAfterEventIds: ['evt-late'],
        },
      ],
    },
    characterRelations: [],
    futureHistoricalEvents: [],
  };

  const normalized = normalizeTemporalGraph(graph);

  assert.deepEqual(
    normalized.graph.events.primary.map((item) => item.id),
    ['evt-early', 'evt-late'],
  );
  assert.deepEqual(
    normalized.graph.events.secondary.map((item) => item.id),
    ['evt-middle'],
  );
  assert.deepEqual(
    Object.fromEntries(
      [...normalized.graph.events.primary, ...normalized.graph.events.secondary].map((item) => [item.id, item.timelineSeq]),
    ),
    {
      'evt-early': 1,
      'evt-middle': 2,
      'evt-late': 3,
    },
  );
  assert.equal(normalized.graph.timeline.length > 0, true);
  assert.equal(String(normalized.graph.timeline[0]?.eventId || ''), 'evt-early');
  assert.equal(normalized.summary.rewrittenTimelineSeq, 3);
  assert.equal(normalized.summary.startTimeCandidateCount > 0, true);
});

test('canonicalizeCharacterNames keeps protagonist separate from kinship descriptors', () => {
  const canonicalized = canonicalizeCharacterNames([
    '韩立',
    '韩立的叔叔',
    '韩立',
    '韩父',
  ]);

  assert.equal(canonicalized.aliasToCanonical['韩立'], '韩立');
  assert.notEqual(canonicalized.aliasToCanonical['韩立'], '韩立的叔叔');
  assert.equal(canonicalized.canonicalNames.includes('韩立'), true);
  assert.equal(canonicalized.canonicalNames.includes('韩立的叔叔'), true);
});

test('runSynthesizeDraft retries with compact prompt on timeout', async () => {
  const calls = [];
  const event = makePrimaryEvent({
    id: 'evt-p1',
    title: '韩立入门',
    summary: '韩立进入七玄门',
    timeRef: '卷一',
    characterRefs: ['韩立'],
  });

  const llm = {
    async generateText(input) {
      calls.push({
        maxTokens: input.maxTokens,
        promptLength: String(input.prompt || '').length,
        prompt: String(input.prompt || ''),
      });

      if (calls.length === 1) {
        throw new Error('Timeout expired');
      }

      return {
        text: JSON.stringify({
          world: {
            name: '凡人世界',
            description: '修仙世界',
            lore: '',
            genre: 'xianxia',
            themes: ['修仙'],
            era: '古代',
          },
          worldview: {
            timeModel: { timeFlowRatio: 1, calendarSystem: {} },
            spaceTopology: {},
            causality: {},
            coreSystem: { rules: [] },
            existences: {},
            resources: {},
            structures: {},
            visualGuide: {},
            narrativeHooks: {},
          },
          worldEvents: [event],
          worldLorebooks: [],
          futureHistoricalEvents: [],
          agentDrafts: [{
            characterName: '韩立',
            handle: 'hanli_1',
            concept: '主角',
            backstory: '',
            coreValues: '',
            relationshipStyle: '',
          }],
        }),
        promptTraceId: 'trace-2',
      };
    },
  };

  const result = await runSynthesizeDraft(llm, {
    selectedStartTimeId: 't-1',
    selectedCharacters: ['韩立'],
    knowledgeGraph: {
      worldSetting: '修仙世界',
      timeline: [{ id: 't-1', label: '卷一' }],
      locations: [{ id: 'loc:七玄门', name: '七玄门', description: '宗门', importance: 0.8 }],
      characters: [{ id: 'char:韩立', name: '韩立', summary: '主角' }],
      events: {
        primary: [event],
        secondary: [],
      },
      characterRelations: [],
      futureHistoricalEvents: [],
      characterProfiles: [{
        name: '韩立',
        aliases: [],
        summary: '主角',
        background: '山村少年',
        motivation: '求生修仙',
        relationships: [],
        keyEvents: ['韩立入门'],
      }],
      characterAliasMap: { 韩立: '韩立' },
    },
  });

  assert.equal(calls.length, 4);
  assert.equal(calls[0].maxTokens, 2200);
  assert.equal(calls[1].maxTokens, 2200);
  assert.equal(calls[2].maxTokens, 2200);
  assert.equal(calls[3].maxTokens, 2200);
  assert.equal(calls[0].prompt.includes('Produce the first complete world/worldview/agent draft'), true);
  assert.equal(calls[1].prompt.includes('Produce the first complete world/worldview/agent draft'), true);
  assert.equal(calls[2].prompt.includes('Enrich only weak or missing fields identified in weak_field_report'), true);
  assert.equal(calls[2].prompt.includes('<weak_field_report>'), true);
  assert.equal(calls[3].prompt.includes('Audit and finalize the entire publish-ready draft'), true);
  assert.equal(String(result.world.name), '凡人世界');
});

test('runSynthesizeDraft retries with compact prompt on parse failure', async () => {
  const calls = [];
  const event = makePrimaryEvent({
    id: 'evt-p1',
    title: '韩立入门',
    summary: '韩立进入七玄门',
    timeRef: '卷一',
    characterRefs: ['韩立'],
  });
  const llm = {
    async generateText(input) {
      calls.push({
        maxTokens: input.maxTokens,
        promptLength: String(input.prompt || '').length,
        prompt: String(input.prompt || ''),
      });
      if (calls.length === 1) {
        return {
          text: 'output interrupted, not a json object',
          promptTraceId: 'trace-1',
        };
      }
      return {
        text: JSON.stringify({
          world: {
            name: '凡人世界',
            description: '修仙世界',
            lore: '',
            genre: 'xianxia',
            themes: ['修仙'],
            era: '古代',
          },
          worldview: {
            timeModel: { timeFlowRatio: 1, calendarSystem: {} },
            spaceTopology: {},
            causality: {},
            coreSystem: { rules: [] },
            existences: {},
            resources: {},
            structures: {},
            visualGuide: {},
            narrativeHooks: {},
          },
          worldEvents: [event],
          worldLorebooks: [],
          futureHistoricalEvents: [],
          agentDrafts: [{
            characterName: '韩立',
            handle: 'hanli_1',
            concept: '主角',
            backstory: '',
            coreValues: '',
            relationshipStyle: '',
          }],
        }),
        promptTraceId: 'trace-2',
      };
    },
  };

  const result = await runSynthesizeDraft(llm, {
    selectedStartTimeId: 't-1',
    selectedCharacters: ['韩立'],
    knowledgeGraph: {
      worldSetting: '修仙世界',
      timeline: [{ id: 't-1', label: '卷一' }],
      locations: [{ id: 'loc:七玄门', name: '七玄门', description: '宗门', importance: 0.8 }],
      characters: [{ id: 'char:韩立', name: '韩立', summary: '主角' }],
      events: {
        primary: [event],
        secondary: [],
      },
      characterRelations: [],
      futureHistoricalEvents: [],
      characterProfiles: [{
        name: '韩立',
        aliases: [],
        summary: '主角',
        background: '山村少年',
        motivation: '求生修仙',
        relationships: [],
        keyEvents: ['韩立入门'],
      }],
      characterAliasMap: { 韩立: '韩立' },
    },
  });

  assert.equal(calls.length, 4);
  assert.equal(calls[0].maxTokens, 2200);
  assert.equal(calls[1].maxTokens, 1400);
  assert.equal(calls[2].maxTokens, 2200);
  assert.equal(calls[3].maxTokens, 2200);
  assert.equal(calls[0].prompt.includes('Produce the first complete world/worldview/agent draft'), true);
  assert.equal(calls[1].prompt.includes('Produce the first complete world/worldview/agent draft'), true);
  assert.equal(calls[2].prompt.includes('Enrich only weak or missing fields identified in weak_field_report'), true);
  assert.equal(calls[2].prompt.includes('<weak_field_report>'), true);
  assert.equal(calls[3].prompt.includes('Audit and finalize the entire publish-ready draft'), true);
  assert.equal(String(result.world.name), '凡人世界');
});

test('runSynthesizeDraft prefers working prose over candidate pools and writes audited prose back', async () => {
  const calls = [];
  const event = makePrimaryEvent({
    id: 'evt-p1',
    title: '韩立入门',
    summary: '韩立进入七玄门',
    timeRef: '卷一',
    characterRefs: ['韩立'],
  });
  const llm = {
    async generateText(input) {
      calls.push(String(input.prompt || ''));
      return {
        text: JSON.stringify({
          world: {
            name: '凡人世界',
            description: 'working prose should stay primary',
            tagline: '凡人亦可问长生',
            genre: 'xianxia',
            themes: ['修仙'],
            era: '古代',
          },
          worldview: {
            timeModel: { timeFlowRatio: 1, calendarSystem: {} },
            spaceTopology: {},
            causality: {},
            coreSystem: { rules: [] },
            existences: {},
            resources: {},
            structures: {},
            visualGuide: {},
            narrativeHooks: {},
          },
          worldEvents: [event],
          worldLorebooks: [],
          futureHistoricalEvents: [],
          agentDrafts: [{
            characterName: '韩立',
            handle: 'hanli_1',
            concept: '主角',
            backstory: '山村少年',
            coreValues: '谨慎求生',
            relationshipStyle: '克制',
            greeting: '先看清局势，再决定要不要出手。',
          }],
        }),
        promptTraceId: `trace-${calls.length}`,
      };
    },
  };

  const result = await runSynthesizeDraft(llm, {
    selectedStartTimeId: 't-1',
    selectedCharacters: ['韩立'],
    knowledgeGraph: {
      worldSetting: '修仙世界',
      timeline: [{ id: 't-1', label: '卷一' }],
      locations: [{ id: 'loc:七玄门', name: '七玄门', description: '宗门', importance: 0.8 }],
      characters: [{ id: 'char:韩立', name: '韩立', summary: '主角' }],
      events: {
        primary: [event],
        secondary: [],
      },
      characterRelations: [],
      futureHistoricalEvents: [],
      characterProfiles: [{
        name: '韩立',
        aliases: [],
        summary: '主角',
        background: '山村少年',
        motivation: '求生修仙',
        relationships: [],
        keyEvents: ['韩立入门'],
      }],
      characterAliasMap: { 韩立: '韩立' },
    },
    finalDraftAccumulator: {
      ...createEmptyFinalDraftAccumulator(),
      worldWorkingProseByField: {
        description: {
          content: 'working prose should stay primary',
          confidence: 0.92,
          evidenceRefs: [{ fieldPath: 'world.description', segmentId: 'seg-1', confidence: 0.92 }],
          chunkIndex: 4,
          updatedAt: '2026-03-17T00:00:00.000Z',
        },
      },
      worldProseCandidatesByField: {
        description: [{
          content: 'candidate prose should only be secondary',
          confidence: 0.71,
          evidenceRefs: [{ fieldPath: 'world.description', segmentId: 'seg-2', confidence: 0.71 }],
          chunkIndex: 3,
          updatedAt: '2026-03-17T00:00:00.000Z',
        }],
      },
      agentWorkingProseByCharacterAndField: {
        韩立: {
          greeting: {
            content: '先看清局势，再决定要不要出手。',
            confidence: 0.9,
            evidenceRefs: [{ fieldPath: 'agent:韩立.greeting', segmentId: 'seg-3', confidence: 0.9 }],
            chunkIndex: 4,
            updatedAt: '2026-03-17T00:00:00.000Z',
          },
        },
      },
      agentProseCandidatesByCharacterAndField: {
        韩立: {
          greeting: [{
            content: '候选问候语',
            confidence: 0.6,
            evidenceRefs: [{ fieldPath: 'agent:韩立.greeting', segmentId: 'seg-4', confidence: 0.6 }],
            chunkIndex: 2,
            updatedAt: '2026-03-17T00:00:00.000Z',
          }],
        },
      },
    },
  });

  assert.equal(calls[0].includes('working prose should stay primary'), true);
  assert.equal(calls[0].includes('candidate prose should only be secondary'), true);
  assert.equal(result.finalDraftAccumulator.worldWorkingProseByField.description.content, 'working prose should stay primary');
  assert.equal(result.finalDraftAccumulator.agentWorkingProseByCharacterAndField['韩立'].greeting.content.includes('看清局势'), true);
});

test('runSynthesizeDraft degrades enrich failure into audit and returns warning metadata', async () => {
  const calls = [];
  const event = makePrimaryEvent({
    id: 'evt-p1',
    title: '韩立入门',
    summary: '韩立进入七玄门',
    timeRef: '卷一',
    characterRefs: ['韩立'],
  });
  const llm = {
    async generateText(input) {
      const prompt = String(input.prompt || '');
      calls.push(prompt);
      if (calls.length === 1) {
        return {
          text: JSON.stringify({
            world: {
              name: '凡人世界',
              description: '一个已经可以切出的初始世界。',
              genre: 'xianxia',
              era: '古代',
            },
            worldview: {
              timeModel: { timeFlowRatio: 1 },
              spaceTopology: {},
              causality: {},
              coreSystem: { rules: [] },
            },
            worldEvents: [event],
            worldLorebooks: [],
            futureHistoricalEvents: [],
            agentDrafts: [{
              characterName: '韩立',
              handle: '~hanli',
              concept: '少年修士',
              backstory: '出身凡俗',
              coreValues: '谨慎',
              relationshipStyle: '克制',
            }],
          }),
          promptTraceId: 'trace-r1',
        };
      }
      if (calls.length === 2 || calls.length === 3) {
        return {
          text: 'not-json-object',
          promptTraceId: `trace-r2-${calls.length}`,
        };
      }
      return {
        text: JSON.stringify({
          world: {
            name: '凡人世界',
            description: '一个已经可以切出的初始世界。',
            genre: 'xianxia',
            era: '古代',
          },
          worldview: {
            timeModel: { timeFlowRatio: 1 },
            spaceTopology: {},
            causality: {},
            coreSystem: { rules: [] },
          },
          worldEvents: [event],
          worldLorebooks: [],
          futureHistoricalEvents: [],
          agentDrafts: [{
            characterName: '韩立',
            handle: '~hanli',
            concept: '少年修士',
            backstory: '出身凡俗',
            coreValues: '谨慎',
            relationshipStyle: '克制',
          }],
        }),
        promptTraceId: 'trace-r3',
      };
    },
  };

  const result = await runSynthesizeDraft(llm, {
    selectedStartTimeId: 'event:evt-p1',
    selectedCharacters: ['韩立'],
    knowledgeGraph: {
      worldSetting: '修仙世界',
      timeline: [{ id: 'timeline:1', label: '1. 卷一 · 韩立入门' }],
      locations: [],
      characters: [{ id: 'char:韩立', name: '韩立', summary: '主角' }],
      events: {
        primary: [event],
        secondary: [],
      },
      characterRelations: [],
      futureHistoricalEvents: [],
      characterProfiles: [{
        name: '韩立',
        aliases: [],
        summary: '主角',
        background: '山村少年',
        motivation: '求生修仙',
        relationships: [],
        keyEvents: ['韩立入门'],
      }],
      characterAliasMap: { 韩立: '韩立' },
    },
    finalDraftAccumulator: createEmptyFinalDraftAccumulator(),
  });

  assert.equal(result.enrichDegraded, true);
  assert.equal(Boolean(result.enrichFailureReason), true);
  assert.equal(Array.isArray(result.weakFieldIssues), true);
  assert.equal(calls.length, 4);
  assert.equal(calls[2].includes('Return a SPARSE PATCH'), true);
  assert.equal(calls[3].includes('round2-enrich did not complete successfully'), true);
  assert.equal(calls[3].includes('empty/thin fields as "not yet rich enough"'), true);
});

test('runSynthesizeDraft enrichment patch preserves stable array fields instead of replacing them wholesale', async () => {
  const event = makePrimaryEvent({
    id: 'evt-p1',
    title: '韩立入门',
    summary: '韩立进入七玄门',
    timeRef: '卷一',
    characterRefs: ['韩立'],
  });
  const llm = {
    calls: 0,
    async generateText() {
      this.calls += 1;
      if (this.calls === 1) {
        return {
          text: JSON.stringify({
            world: {
              name: '凡人世界',
              description: '一个已经可以切出的初始世界。',
              genre: 'xianxia',
              era: '古代',
              themes: ['修仙', '求生', '因果'],
            },
            worldview: {
              timeModel: { timeFlowRatio: 1 },
              spaceTopology: {},
              causality: {},
              coreSystem: {
                rules: [
                  { key: 'survival', title: '求生第一', value: '先活下来。' },
                ],
              },
            },
            worldEvents: [event],
            worldLorebooks: [
              { name: '七玄门', content: '基础宗门设定' },
            ],
            futureHistoricalEvents: [
              { id: 'future-1', title: '韩立外出历练' },
            ],
            agentDrafts: [{
              characterName: '韩立',
              handle: '~hanli',
              concept: '少年修士',
              backstory: '出身凡俗',
              coreValues: '谨慎',
              relationshipStyle: '克制',
              agentLorebooks: [
                { name: '绿瓶', content: '关键机缘' },
              ],
            }],
          }),
          promptTraceId: 'trace-r1',
        };
      }
      if (this.calls === 2) {
        return {
          text: JSON.stringify({
            world: {
              themes: ['成长'],
            },
            worldview: {
              coreSystem: {
                rules: [
                  { key: 'causality', title: '因果代价', value: '每次机缘都有代价。' },
                ],
              },
            },
            worldLorebooks: [
              { name: '墨大夫', content: '韩立早期重要人物' },
            ],
            futureHistoricalEvents: [
              { id: 'future-2', title: '墨大夫图谋暴露' },
            ],
            agentDrafts: [{
              characterName: '韩立',
              agentLorebooks: [
                { name: '神手谷', content: '早期修行地点' },
              ],
            }],
          }),
          promptTraceId: 'trace-r2',
        };
      }
      return {
        text: JSON.stringify({
          world: {
            name: '凡人世界',
            description: '一个已经可以切出的初始世界。',
          },
          worldview: {
            timeModel: { timeFlowRatio: 1 },
            spaceTopology: {},
            causality: {},
            coreSystem: {},
          },
          worldEvents: [event],
          worldLorebooks: [],
          futureHistoricalEvents: [],
          agentDrafts: [{
            characterName: '韩立',
            handle: '~hanli',
            concept: '少年修士',
            backstory: '出身凡俗',
            coreValues: '谨慎',
            relationshipStyle: '克制',
          }],
        }),
        promptTraceId: 'trace-r3',
      };
    },
  };

  const result = await runSynthesizeDraft(llm, {
    selectedStartTimeId: 'event:evt-p1',
    selectedCharacters: ['韩立'],
    knowledgeGraph: {
      worldSetting: '修仙世界',
      timeline: [{ id: 'timeline:1', label: '1. 卷一 · 韩立入门' }],
      locations: [],
      characters: [{ id: 'char:韩立', name: '韩立', summary: '主角' }],
      events: {
        primary: [event],
        secondary: [],
      },
      characterRelations: [],
      futureHistoricalEvents: [],
      characterProfiles: [{
        name: '韩立',
        aliases: [],
        summary: '主角',
        background: '山村少年',
        motivation: '求生修仙',
        relationships: [],
        keyEvents: ['韩立入门'],
      }],
      characterAliasMap: { 韩立: '韩立' },
    },
    finalDraftAccumulator: createEmptyFinalDraftAccumulator(),
  });

  assert.deepEqual(result.world.themes, ['修仙', '求生', '因果', '成长']);
  assert.deepEqual(
    result.worldview.coreSystem.rules.map((item) => item.key),
    ['survival', 'causality'],
  );
  assert.deepEqual(
    result.worldLorebooks.map((item) => item.name),
    ['七玄门', '墨大夫'],
  );
  assert.deepEqual(
    result.futureHistoricalEvents.map((item) => item.id),
    ['future-1', 'future-2'],
  );
  assert.deepEqual(
    result.agentDrafts[0].agentLorebooks.map((item) => item.name),
    ['绿瓶', '神手谷'],
  );
});

test('syncSnapshot preserves degraded draft quality state across reload normalization', () => {
  const snapshot = cloneDefaultSnapshot();
  snapshot.draftQuality = {
    worldCutStatus: 'ready',
    enrichStatus: 'incomplete',
    enrichFailureReason: 'WORLD_STUDIO_JSON_OBJECT_REQUIRED',
    weakFieldIssues: [
      {
        path: 'world.description',
        reason: 'low_information',
        detail: 'chars=24 threshold=50',
      },
    ],
    updatedAt: '2026-03-18T10:00:00.000Z',
  };

  const synced = syncSnapshot(snapshot);

  assert.equal(synced.draftQuality.worldCutStatus, 'ready');
  assert.equal(synced.draftQuality.enrichStatus, 'incomplete');
  assert.equal(synced.draftQuality.enrichFailureReason, 'WORLD_STUDIO_JSON_OBJECT_REQUIRED');
  assert.equal(synced.draftQuality.weakFieldIssues.length, 1);
  assert.equal(synced.draftQuality.weakFieldIssues[0].path, 'world.description');
});

test('buildStartTimeOptionsFromEvents orders by temporal hint before source order fallback', () => {
  const options = buildStartTimeOptionsFromEvents({
    primary: [
      makePrimaryEvent({ id: 'evt-3', title: '四年闭关突破第三层', timeRef: '四年后' }),
      makePrimaryEvent({ id: 'evt-1', title: '岳堂主接手新弟子', timeRef: '抵达当日傍晚' }),
      makePrimaryEvent({ id: 'evt-2', title: '选拔考核开始', timeRef: '次日清晨' }),
    ],
    secondary: [],
  });
  assert.equal(options.length, 3);
  assert.equal(options[0].id, 'event:evt-1');
  assert.equal(options[1].id, 'event:evt-2');
  assert.equal(options[2].id, 'event:evt-3');
});

test('buildStartTimeOptionsFromEvents removes semantically duplicated options', () => {
  const options = buildStartTimeOptionsFromEvents({
    primary: [
      makePrimaryEvent({
        id: 'evt-1',
        title: '发现神秘绿色小瓶',
        summary: '韩立在深秋某日发现绿瓶',
        timeRef: '深秋某日',
        characterRefs: ['韩立'],
        locationRefs: ['神手谷外林间小路'],
      }),
      makePrimaryEvent({
        id: 'evt-2',
        title: '捡获神秘绿瓶',
        summary: '韩立在深秋拾得绿瓶',
        timeRef: '深秋',
        characterRefs: [],
        locationRefs: ['神手谷外林间小路'],
      }),
      makePrimaryEvent({
        id: 'evt-3',
        title: '四年闭关突破第三层',
        summary: '韩立四年后突破',
        timeRef: '四年后',
        characterRefs: ['韩立'],
      }),
    ],
    secondary: [],
  });

  assert.equal(options.length, 2);
  assert.equal(options[0].id, 'event:evt-1');
  assert.equal(options[1].id, 'event:evt-3');
});

test('buildStartTimeOptionsFromEvents strips synthetic temporal refs in labels', () => {
  const options = buildStartTimeOptionsFromEvents({
    primary: [
      makePrimaryEvent({
        id: 'evt-1',
        title: '选拔考核集结',
        timeRef: 'timeline-selection-morning',
      }),
      makePrimaryEvent({
        id: 'evt-2',
        title: '落日峰下交接弟子',
        timeRef: 'tl-6-1',
      }),
    ],
    secondary: [],
  });

  assert.equal(options.length, 2);
  assert.equal(options[0].label, '1. 选拔考核集结');
  assert.equal(options[1].label, '2. 落日峰下交接弟子');
});

test('buildStartTimeOptionsFromEvents ignores contradictory dependency edges when time hints are strong', () => {
  const options = buildStartTimeOptionsFromEvents({
    primary: [
      makePrimaryEvent({
        id: 'evt-late',
        title: '四年闭关突破第三层',
        timeRef: '四年后',
      }),
      makePrimaryEvent({
        id: 'evt-early',
        title: '深秋捡获神秘绿瓶',
        timeRef: '深秋',
        dependsOnEventIds: ['evt-late'],
      }),
    ],
    secondary: [],
  });

  assert.equal(options.length, 2);
  assert.equal(options[0].id, 'event:evt-early');
  assert.equal(options[1].id, 'event:evt-late');
});
