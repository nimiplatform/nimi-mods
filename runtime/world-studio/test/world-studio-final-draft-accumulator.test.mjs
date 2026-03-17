import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDraftPatch,
  buildFinalDraftAccumulatorSlice,
  createEmptyFinalDraftAccumulator,
} from '../src/engine/final-draft-accumulator.ts';

test('final draft accumulator routes strong prose patch into working prose', () => {
  const accumulator = applyDraftPatch(createEmptyFinalDraftAccumulator(), {
    chunkIndex: 1,
    world: {
      name: '凡人修仙界',
    },
    worldProse: {
      description: {
        content: '凡人修仙界以弱肉强食和漫长求生为底色，凡人与修士之间始终隔着残酷而清醒的生存秩序。',
        confidence: 0.91,
        evidenceRefs: [{ fieldPath: 'world.description', segmentId: 'seg-1', confidence: 0.91 }],
      },
    },
    agentProse: {
      韩立: {
        greeting: {
          content: '先别急着下定论，看清局势再行动。',
          confidence: 0.88,
          evidenceRefs: [{ fieldPath: 'agent:韩立.greeting', segmentId: 'seg-2', confidence: 0.88 }],
        },
      },
    },
  }).next;

  assert.equal(accumulator.worldWorkingProseByField.description?.content.includes('凡人修仙界'), true);
  assert.equal(accumulator.agentWorkingProseByCharacterAndField['韩立']?.greeting?.content.includes('局势'), true);
  assert.equal((accumulator.worldProseCandidatesByField.description || []).length, 0);
});

test('final draft accumulator routes weaker prose patch into bounded candidate pools', () => {
  let accumulator = createEmptyFinalDraftAccumulator();

  accumulator = applyDraftPatch(accumulator, {
    chunkIndex: 1,
    worldProse: {
      description: {
        content: '韩立初入七玄门时仍是谨慎求生的外门弟子，对整个修仙秩序只有模糊而紧张的认识。',
        confidence: 0.55,
        evidenceRefs: [{ fieldPath: 'world.description', segmentId: 'seg-1', confidence: 0.55 }],
      },
    },
  }).next;

  accumulator = applyDraftPatch(accumulator, {
    chunkIndex: 2,
    worldProse: {
      description: {
        content: '韩立初入七玄门后逐渐意识到，所谓修仙世界并不浪漫，而是层层试探与谨慎求生的秩序。',
        confidence: 0.72,
        evidenceRefs: [{ fieldPath: 'world.description', segmentId: 'seg-2', confidence: 0.72 }],
      },
    },
  }).next;

  accumulator = applyDraftPatch(accumulator, {
    chunkIndex: 3,
    worldProse: {
      description: {
        content: '墨大夫收徒之后，韩立开始被更深的修仙暗流牵引，早期世界观也因此变得更危险、更现实。',
        confidence: 0.74,
        evidenceRefs: [{ fieldPath: 'world.description', segmentId: 'seg-3', confidence: 0.74 }],
      },
      overview: {
        content: '七玄门、神手谷与散修秩序交错成早期凡人修仙界的主要生存图景。',
        confidence: 0.73,
        evidenceRefs: [{ fieldPath: 'world.overview', segmentId: 'seg-4', confidence: 0.73 }],
      },
    },
  }).next;

  accumulator = applyDraftPatch(accumulator, {
    chunkIndex: 4,
    worldProse: {
      description: {
        content: '弱肉强食与谨慎存身，是韩立踏入修仙世界后的第一重叙事底色，也决定了他日后的判断方式。',
        confidence: 0.71,
        evidenceRefs: [{ fieldPath: 'world.description', segmentId: 'seg-5', confidence: 0.71 }],
      },
    },
  }).next;

  const bucket = accumulator.worldProseCandidatesByField.description || [];
  assert.equal(bucket.length, 3);
  assert.equal(accumulator.worldWorkingProseByField.description, undefined);
  assert.equal(bucket.some((item) => item.content.includes('第一重叙事底色')), true);
});

test('accumulator slice includes working prose but excludes candidate pools', () => {
  const accumulator = applyDraftPatch(createEmptyFinalDraftAccumulator(), {
    chunkIndex: 1,
    world: {
      name: '凡人世界',
    },
    worldProse: {
      tagline: {
        content: '凡人亦可在尘世问长生',
        confidence: 0.82,
        evidenceRefs: [{ fieldPath: 'world.tagline', segmentId: 'seg-1', confidence: 0.82 }],
      },
    },
    agentProse: {
      韩立: {
        greeting: {
          content: '韩立在此，先看清局势再说。',
          confidence: 0.88,
          evidenceRefs: [{ fieldPath: 'agent:韩立.greeting', segmentId: 'seg-2', confidence: 0.88 }],
        },
      },
    },
  }).next;

  const slice = buildFinalDraftAccumulatorSlice(accumulator, {
    maxLorebooks: 4,
    maxFutureEvents: 4,
    maxAgentDrafts: 4,
    maxRevisions: 4,
  });

  assert.equal(slice.world.name, '凡人世界');
  assert.equal(slice.worldProse.tagline.content, '凡人亦可在尘世问长生');
  assert.equal(slice.agentProse['韩立'].greeting.content, '韩立在此，先看清局势再说。');
  assert.equal(Object.prototype.hasOwnProperty.call(slice, 'worldProseCandidatesByField'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(slice, 'agentProseCandidatesByCharacterAndField'), false);
});

test('semantic prose match no longer revises on arbitrary middle substring inclusion', () => {
  let accumulator = createEmptyFinalDraftAccumulator();

  accumulator = applyDraftPatch(accumulator, {
    chunkIndex: 1,
    worldProse: {
      description: {
        content: '韩立在七玄门与神手谷之间逐步建立起对修仙世界的第一层现实认识。',
        confidence: 0.7,
        evidenceRefs: [{ fieldPath: 'world.description', segmentId: 'seg-1', confidence: 0.7 }],
      },
    },
  }).next;

  accumulator = applyDraftPatch(accumulator, {
    chunkIndex: 2,
    worldProse: {
      description: {
        content: '在七玄门与神手谷之间逐步建立起对修仙世界的第一层现实',
        confidence: 0.69,
        evidenceRefs: [{ fieldPath: 'world.description', segmentId: 'seg-2', confidence: 0.69 }],
      },
    },
  }).next;

  const bucket = accumulator.worldProseCandidatesByField.description || [];
  assert.equal(bucket.length, 2);
});
