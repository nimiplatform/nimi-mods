import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC_SCORE_CAPABILITIES, MUSIC_SCORE_MOD_ID } from '../src/contracts.js';
import { createMusicScoreRuntimeMod } from '../src/runtime-mod.js';

test('music-score mod id matches contract', () => {
    assert.equal(MUSIC_SCORE_MOD_ID, 'world.nimi.music-score');
});

test('music-score capabilities include UI registration slots', () => {
    const caps = [...MUSIC_SCORE_CAPABILITIES];
    assert.ok(caps.includes('ui.register.ui-extension.app.sidebar.mods'));
    assert.ok(caps.includes('ui.register.ui-extension.app.content.routes'));
    assert.equal(caps.length, 2);
});

test('music-score runtime mod factory returns correct structure', () => {
    const mod = createMusicScoreRuntimeMod();
    assert.equal(mod.modId, MUSIC_SCORE_MOD_ID);
    assert.deepEqual(mod.capabilities, [...MUSIC_SCORE_CAPABILITIES]);
    assert.equal(mod.isDefaultPrivateExecution, false);
    assert.equal(typeof mod.setup, 'function');
    assert.equal(typeof mod.teardown, 'function');
});
