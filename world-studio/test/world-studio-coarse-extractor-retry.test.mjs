import test from 'node:test';
import assert from 'node:assert/strict';
import { extractChunkCoarse } from '../mods/world-studio/src/engine/coarse-extractor.ts';

function makeValidCoarsePayload() {
  return JSON.stringify({
    worldSetting: 'world',
    timeline: [],
    locations: [],
    characters: [],
    events: {
      primary: [],
      secondary: [],
    },
    characterRelations: [],
  });
}

test('extractChunkCoarse succeeds on third attempt via strict repair prompt', async () => {
  const calls = [];
  const llm = {
    generateText: async (request) => {
      calls.push({
        routeHint: request.routeHint,
        prompt: String(request.prompt || ''),
      });
      if (calls.length === 1) {
        return { text: 'not json', promptTraceId: 'trace-1' };
      }
      if (calls.length === 2) {
        return { text: '{"broken": ', promptTraceId: 'trace-2' };
      }
      return { text: makeValidCoarsePayload(), promptTraceId: 'trace-3' };
    },
  };

  const result = await extractChunkCoarse(llm, {
    chunk: 'chunk-source',
    index: 0,
    total: 1,
  });

  assert.equal(result.retryCount, 2);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].routeHint, 'chat/coarse');
  assert.equal(calls[1].routeHint, 'chat/retry-low-temp');
  assert.equal(calls[2].routeHint, 'chat/retry-low-temp');
  assert.equal(calls[2].prompt.includes('CRITICAL JSON REPAIR MODE.'), true);
  assert.equal(result.extraction.worldSetting, 'world');
});

test('extractChunkCoarse throws after third parse failure', async () => {
  const llm = {
    generateText: async () => ({ text: 'not-json-output', promptTraceId: 'trace-x' }),
  };

  await assert.rejects(
    () => extractChunkCoarse(llm, {
      chunk: 'chunk-source',
      index: 0,
      total: 1,
    }),
    /WORLD_STUDIO_COARSE_JSON_PARSE_FAILED/,
  );
});
