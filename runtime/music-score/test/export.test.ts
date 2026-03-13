import test from 'node:test';
import assert from 'node:assert/strict';
import type { NoteEvent } from '../src/services/pitch-detector.js';
import type { QuantizedScore } from '../src/services/quantizer.js';

// We can't call browser-dependent functions (downloadBlob, etc.) in Node,
// but we can test the pure MIDI byte generation by importing the module
// and checking exported helpers.

test('deriveFilename strips extension and appends new one', async () => {
    const { deriveFilename } = await import('../src/services/export.js');
    assert.equal(deriveFilename('song.mp3', 'mid'), 'song.mid');
    assert.equal(deriveFilename('my-track.wav', 'musicxml'), 'my-track.musicxml');
    assert.equal(deriveFilename('noext', 'mid'), 'noext.mid');
});

test('isExportable returns false for null or empty score', async () => {
    const { isExportable } = await import('../src/services/export.js');
    assert.equal(isExportable(null), false);
    assert.equal(isExportable({
        config: { bpm: 120, timeSignature: [4, 4], keySignature: 0, quantizePrecision: 0.25 },
        notes: [],
        totalMeasures: 0,
    }), false);
});

test('isExportable returns true for non-empty score', async () => {
    const { isExportable } = await import('../src/services/export.js');
    const score: QuantizedScore = {
        config: { bpm: 120, timeSignature: [4, 4], keySignature: 0, quantizePrecision: 0.25 },
        notes: [{
            pitchMidi: 60, startBeat: 0, durationBeats: 1,
            velocity: 80, measure: 0, beatInMeasure: 0,
        }],
        totalMeasures: 1,
    };
    assert.equal(isExportable(score), true);
});
