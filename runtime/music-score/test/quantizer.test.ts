import test from 'node:test';
import assert from 'node:assert/strict';
import { quantize, defaultScoreConfig, fifthsToKeyName } from '../src/services/quantizer.js';
import type { NoteEvent } from '../src/services/pitch-detector.js';

function note(pitchMidi: number, startTime: number, endTime: number, velocity = 80): NoteEvent {
    return { pitchMidi, startTime, endTime, velocity, confidence: 0.9 };
}

test('quantize empty notes returns zero measures', () => {
    const result = quantize([]);
    assert.equal(result.totalMeasures, 0);
    assert.equal(result.notes.length, 0);
});

test('quantize single note places it in measure 0', () => {
    const result = quantize([note(60, 0, 0.5)], { bpm: 120 });
    assert.equal(result.notes.length, 1);
    assert.equal(result.notes[0]!.measure, 0);
    assert.equal(result.notes[0]!.pitchMidi, 60);
});

test('quantize respects BPM override', () => {
    const result = quantize([note(60, 0, 1.0)], { bpm: 60 });
    // At 60 BPM, 1 second = 1 beat, so duration should be ~1 beat
    assert.ok(result.notes[0]!.durationBeats >= 0.75);
    assert.ok(result.notes[0]!.durationBeats <= 1.25);
    assert.equal(result.config.bpm, 60);
});

test('quantize snaps to grid precision', () => {
    // At 120 BPM, 0.3 seconds = 0.6 beats → snaps to 0.5 beats with 0.25 precision
    const result = quantize([note(60, 0, 0.3)], { bpm: 120, quantizePrecision: 0.25 });
    const dur = result.notes[0]!.durationBeats;
    // Duration should be a multiple of 0.25
    assert.equal(dur % 0.25, 0);
});

test('quantize assigns correct measures for multi-measure sequence', () => {
    // At 120 BPM, 4/4 time: 4 beats = 2 seconds per measure
    const notes = [
        note(60, 0, 0.5),    // measure 0
        note(62, 2.5, 3.0),  // measure 1
        note(64, 4.5, 5.0),  // measure 2
    ];
    const result = quantize(notes, { bpm: 120, timeSignature: [4, 4] });
    assert.equal(result.notes[0]!.measure, 0);
    assert.equal(result.notes[1]!.measure, 1);
    assert.equal(result.notes[2]!.measure, 2);
    assert.equal(result.totalMeasures, 3);
});

test('quantize deduplicates notes at same grid position and pitch', () => {
    // Two notes with same pitch, very close start times → should deduplicate
    const notes = [
        note(60, 0, 0.5),
        note(60, 0.01, 0.51),
    ];
    const result = quantize(notes, { bpm: 120 });
    assert.equal(result.notes.length, 1);
});

test('quantize detects C major key for C-scale notes', () => {
    const cScale = [60, 62, 64, 65, 67, 69, 71, 72]; // C D E F G A B C
    const notes = cScale.map((midi, i) => note(midi, i * 0.5, i * 0.5 + 0.4));
    const result = quantize(notes);
    // C major = 0 fifths
    assert.equal(result.config.keySignature, 0);
});

test('defaultScoreConfig returns sensible defaults', () => {
    const cfg = defaultScoreConfig();
    assert.equal(cfg.bpm, 120);
    assert.deepEqual(cfg.timeSignature, [4, 4]);
    assert.equal(cfg.keySignature, 0);
    assert.equal(cfg.quantizePrecision, 0.25);
});

test('fifthsToKeyName maps correctly', () => {
    assert.equal(fifthsToKeyName(0), 'C');
    assert.equal(fifthsToKeyName(1), 'G');
    assert.equal(fifthsToKeyName(-1), 'F');
    assert.equal(fifthsToKeyName(-2), 'Bb');
    assert.equal(fifthsToKeyName(5), 'B');
});
