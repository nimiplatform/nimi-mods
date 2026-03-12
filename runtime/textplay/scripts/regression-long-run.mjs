import assert from 'node:assert/strict';
import { runTextplayRender } from '../src/pipeline/run-textplay-render.ts';
import { createDeps, createUserTurnRequest } from './_render-smoke-helpers.mjs';

const deps = createDeps();
const storyId = 'story_01KXTEXTPLAYREGRESSION12345';
let failureCount = 0;

for (let index = 0; index < 30; index += 1) {
  const result = await runTextplayRender({
    request: createUserTurnRequest({
      storyId,
      runId: `run-regression-${index + 1}`,
      traceId: `trace-regression-${index + 1}`,
      userMessage: `Turn ${index + 1}: I probe the next opening in the cordon.`,
    }),
    deps,
    presenceReports: [],
  });
  if (!result.ok) {
    failureCount += 1;
  }
}

assert.equal(failureCount, 0);
process.stdout.write(`[textplay regression] turnCount=30 failureCount=${failureCount}\n`);
