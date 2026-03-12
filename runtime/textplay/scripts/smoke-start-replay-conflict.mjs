import assert from 'node:assert/strict';
import { runTextplayRender } from '../src/pipeline/run-textplay-render.ts';
import { TEXTPLAY_REASON } from '../src/contracts.ts';
import { createDeps, createUserTurnRequest } from './_render-smoke-helpers.mjs';

const result = await runTextplayRender({
  request: createUserTurnRequest({
    binding: {
      source: 'cloud',
      connectorId: 'connector-main',
      model: 'gemini-3-flash-preview',
    },
  }),
  deps: createDeps({
    failGenerate: true,
  }),
  presenceReports: [],
});

assert.equal(result.ok, true);
assert.equal(result.meta.warnings.some((item) => item.code === TEXTPLAY_REASON.RENDER_FALLBACK_WARN), true);
assert.match(result.text, /Nimi Test User|局势|变化/);

process.stdout.write('[textplay smoke] fallback render passed\n');
