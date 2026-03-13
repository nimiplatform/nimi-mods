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

test('deriveFilename handles file with multiple dots', async () => {
    const { deriveFilename } = await import('../src/services/export.js');
    assert.equal(deriveFilename('my.song.v2.mp3', 'mid'), 'my.song.v2.mid');
});

test('scoreNotesToNoteEvents converts quantized beats to seconds', async () => {
    const { scoreNotesToNoteEvents } = await import('../src/services/export.js');
    const score: QuantizedScore = {
        config: { bpm: 60, timeSignature: [4, 4], keySignature: 0, quantizePrecision: 0.25 },
        notes: [{
            pitchMidi: 64, startBeat: 3, durationBeats: 2,
            velocity: 90, measure: 0, beatInMeasure: 3,
        }],
        totalMeasures: 2,
    };
    const events = scoreNotesToNoteEvents(score);
    assert.equal(events.length, 1);
    // At 60 BPM: 1 beat = 1 second
    assert.equal(events[0]!.startTime, 3.0);
    assert.equal(events[0]!.endTime, 5.0);
    assert.equal(events[0]!.velocity, 90);
});
