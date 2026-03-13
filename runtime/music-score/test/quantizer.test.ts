import test from 'node:test';
import assert from 'node:assert/strict';
import { quantize, defaultScoreConfig, fifthsToKeyName, pearsonCorrelation, snapToGrid } from '../src/services/quantizer.js';
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

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('quantize normalizes very low BPM by doubling into 60-200 range', () => {
    // Notes spaced 1.5s apart → raw BPM ~40, should double to ~80
    const notes = Array.from({ length: 10 }, (_, i) => note(60, i * 1.5, i * 1.5 + 0.3));
    const result = quantize(notes);
    assert.ok(result.config.bpm >= 60, `BPM ${result.config.bpm} is below 60`);
    assert.ok(result.config.bpm <= 200, `BPM ${result.config.bpm} is above 200`);
});

test('quantize normalizes very high BPM by halving into 60-200 range', () => {
    // Notes spaced 0.15s apart → raw BPM ~400, should halve to ~100-200
    const notes = Array.from({ length: 20 }, (_, i) => note(60, i * 0.15, i * 0.15 + 0.1));
    const result = quantize(notes);
    assert.ok(result.config.bpm >= 60, `BPM ${result.config.bpm} is below 60`);
    assert.ok(result.config.bpm <= 200, `BPM ${result.config.bpm} is above 200`);
});

test('quantize detects G major (1 sharp) key signature', () => {
    // G major scale: G A B C D E F#
    const gScale = [67, 69, 71, 60, 62, 64, 66]; // G4 A4 B4 C4 D4 E4 F#4
    const notes = gScale.map((midi, i) => note(midi, i * 0.5, i * 0.5 + 0.4));
    const result = quantize(notes);
    assert.equal(result.config.keySignature, 1);
});

test('quantize detects Bb major (-2 flats) key signature', () => {
    // Bb major scale: Bb C D Eb F G A
    const bbScale = [70, 72, 74, 75, 77, 79, 81]; // Bb4 C5 D5 Eb5 F5 G5 A5
    const notes = bbScale.map((midi, i) => note(midi, i * 0.5, i * 0.5 + 0.4));
    const result = quantize(notes);
    assert.equal(result.config.keySignature, -2);
});

test('quantize floors very short notes to minimum precision', () => {
    // At 120 BPM, 0.01 seconds = 0.02 beats, below 0.25 precision
    const result = quantize([note(60, 0, 0.01)], { bpm: 120, quantizePrecision: 0.25 });
    assert.equal(result.notes[0]!.durationBeats, 0.25);
});

test('quantize single note falls back to 120 BPM', () => {
    // Only 1 note → BPM detection requires >= 2 notes
    const result = quantize([note(60, 0, 0.5)]);
    assert.equal(result.config.bpm, 120);
});

test('quantize handles A minor (relative of C major, fifths=0)', () => {
    // A minor: A B C D E F G (natural minor)
    const aMinor = [69, 71, 72, 74, 76, 77, 79]; // A4 B4 C5 D5 E5 F5 G5
    const notes = aMinor.map((midi, i) => note(midi, i * 0.5, i * 0.5 + 0.4));
    const result = quantize(notes);
    // A minor shares key signature with C major (0 fifths)
    assert.equal(result.config.keySignature, 0);
});

// ---------------------------------------------------------------------------
// pearsonCorrelation
// ---------------------------------------------------------------------------

test('pearsonCorrelation returns ~1.0 for perfect positive correlation', () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
    assert.ok(Math.abs(r - 1.0) < 0.001, `Expected ~1.0 but got ${r}`);
});

test('pearsonCorrelation returns ~-1.0 for perfect negative correlation', () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
    assert.ok(Math.abs(r - (-1.0)) < 0.001, `Expected ~-1.0 but got ${r}`);
});

test('pearsonCorrelation returns 0 for constant arrays (zero variance)', () => {
    const r = pearsonCorrelation([3, 3, 3], [3, 3, 3]);
    assert.equal(r, 0);
});

test('pearsonCorrelation handles uncorrelated data', () => {
    const r = pearsonCorrelation([1, 0, -1, 0], [0, 1, 0, -1]);
    assert.ok(Math.abs(r) < 0.1, `Expected ~0 but got ${r}`);
});

// ---------------------------------------------------------------------------
// snapToGrid
// ---------------------------------------------------------------------------

test('snapToGrid snaps 0.3 to 0.25 with grid=0.25', () => {
    assert.equal(snapToGrid(0.3, 0.25), 0.25);
});

test('snapToGrid snaps 0.6 to 0.5 with grid=0.25', () => {
    assert.equal(snapToGrid(0.6, 0.25), 0.5);
});

test('snapToGrid preserves exact grid values', () => {
    assert.equal(snapToGrid(0.5, 0.25), 0.5);
    assert.equal(snapToGrid(1.0, 0.25), 1.0);
});

test('snapToGrid works with grid=0.5', () => {
    assert.equal(snapToGrid(0.3, 0.5), 0.5);
    assert.equal(snapToGrid(0.7, 0.5), 0.5);
    assert.equal(snapToGrid(0.8, 0.5), 1.0);
});
