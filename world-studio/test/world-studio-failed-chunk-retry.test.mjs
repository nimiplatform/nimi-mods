import test from 'node:test';
import assert from 'node:assert/strict';
import { runPhase1ExtractionFromChunks } from '../mods/world-studio/src/generation/pipeline.ts';

function makeStrictJsonChunkResult(index) {
  return JSON.stringify({
    worldSetting: `chunk-${index}`,
    timeline: [{ id: `t-${index}`, label: `T${index}` }],
    locations: [{ id: `loc-${index}`, name: `Loc ${index}`, importance: 0.7 }],
    characters: [{ id: `char-${index}`, name: `Char ${index}`, significance: 0.8 }],
    events: {
      primary: [{
        id: `p-${index}`,
        title: `Primary ${index}`,
        summary: 's',
        cause: 'c',
        process: 'p',
        result: 'r',
        timeRef: `T${index}`,
        locationRefs: [`loc-${index}`],
        characterRefs: [`char-${index}`],
        dependsOnEventIds: [],
        evidenceRefs: [{
          segmentId: `seg-${index}`,
          offsetStart: 0,
          offsetEnd: 12,
          excerpt: 'excerpt',
          confidence: 0.9,
          sourceType: 'chunk',
        }],
        confidence: 0.8,
      }],
      secondary: [],
    },
    characterRelations: [{ source: `char-${index}`, target: `char-${index}`, relation: 'self', reason: 'seed', strength: 0.5 }],
  });
}

test('phase1 retry run keeps logical chunk indices from chunkIndexMap', async () => {
  const calls = [];
  const aiClient = {
    generateText: async () => {
      const index = calls.length + 1;
      calls.push(index);
      return {
        text: makeStrictJsonChunkResult(index),
        promptTraceId: `trace-${index}`,
      };
    },
  };

  const result = await runPhase1ExtractionFromChunks(
    aiClient,
    ['chunk-a', 'chunk-b'],
    {
      chunkIndexMap: [3, 7],
      maxConcurrency: 2,
    },
  );

  const coarseSuccessIndices = result.chunkTasks
    .filter((task) => task.stage === 'coarse' && task.status === 'success')
    .map((task) => task.chunkIndex)
    .sort((a, b) => a - b);

  assert.deepEqual(coarseSuccessIndices, [3, 7]);
  assert.ok(result.qualityGate.metrics.successChunks >= 2);
});

test('phase1 retry can rerun only failed logical chunk subset', async () => {
  let invokeCount = 0;
  const aiClient = {
    generateText: async () => {
      invokeCount += 1;
      return {
        text: makeStrictJsonChunkResult(9),
        promptTraceId: 'trace-subset',
      };
    },
  };

  const result = await runPhase1ExtractionFromChunks(
    aiClient,
    ['chunk-only-failed'],
    {
      chunkIndexMap: [9],
      maxConcurrency: 1,
    },
  );

  // Coarse + fine both run for each chunk in the accumulator-based pipeline.
  assert.equal(invokeCount, 2);
  const coarseTasks = result.chunkTasks.filter((task) => task.stage === 'coarse');
  assert.equal(coarseTasks.length, 1);
  assert.equal(coarseTasks[0].chunkIndex, 9);
  assert.equal(coarseTasks[0].status, 'success');
});
