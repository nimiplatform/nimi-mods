import assert from 'node:assert/strict';
import { runTextplayRender } from '../src/pipeline/run-textplay-render.ts';
import { createDeps, createOpeningRequest } from './_render-smoke-helpers.mjs';

const result = await runTextplayRender({
  request: createOpeningRequest(),
  deps: createDeps(),
  presenceReports: [],
});

assert.equal(result.ok, true);
assert.equal(result.text.length > 0, true);
assert.equal(result.meta.storyId, 'story_01KXTEXTPLAYSMOKEOPENING12345');
assert.equal(result.meta.route.model.length > 0, true);

process.stdout.write('[textplay smoke] opening render passed\n');
