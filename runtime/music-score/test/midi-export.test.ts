import test from 'node:test';
import assert from 'node:assert/strict';
import {
    encodeVariableLength,
    buildMidiBytes,
    scoreNotesToNoteEvents,
} from '../src/services/export.js';
import type { NoteEvent } from '../src/services/pitch-detector.js';
import type { QuantizedScore } from '../src/services/quantizer.js';

// ---------------------------------------------------------------------------
// encodeVariableLength
// ---------------------------------------------------------------------------

test('encodeVariableLength encodes 0', () => {
    assert.deepEqual(encodeVariableLength(0), [0x00]);
});

test('encodeVariableLength encodes single-byte max (127)', () => {
    assert.deepEqual(encodeVariableLength(127), [0x7f]);
});

test('encodeVariableLength encodes two-byte value (128)', () => {
    assert.deepEqual(encodeVariableLength(128), [0x81, 0x00]);
});

test('encodeVariableLength encodes 16383', () => {
    assert.deepEqual(encodeVariableLength(0x3fff), [0xff, 0x7f]);
});

test('encodeVariableLength clamps negative to 0', () => {
    assert.deepEqual(encodeVariableLength(-5), [0x00]);
});

// ---------------------------------------------------------------------------
// buildMidiBytes — header structure
// ---------------------------------------------------------------------------

function singleNote(): NoteEvent {
    return { pitchMidi: 60, startTime: 0, endTime: 0.5, velocity: 80, confidence: 0.9 };
}

test('buildMidiBytes produces valid MThd header', () => {
    const bytes = buildMidiBytes([], 120);
    // MThd magic
    assert.equal(bytes[0], 0x4d); // M
    assert.equal(bytes[1], 0x54); // T
    assert.equal(bytes[2], 0x68); // h
    assert.equal(bytes[3], 0x64); // d
    // Chunk length = 6
    assert.equal(bytes[4], 0);
    assert.equal(bytes[5], 0);
    assert.equal(bytes[6], 0);
    assert.equal(bytes[7], 6);
    // Format 0
    assert.equal(bytes[8], 0);
    assert.equal(bytes[9], 0);
    // 1 track
    assert.equal(bytes[10], 0);
    assert.equal(bytes[11], 1);
    // 480 ticks/quarter = 0x01E0
    assert.equal(bytes[12], 0x01);
    assert.equal(bytes[13], 0xe0);
});

test('buildMidiBytes produces MTrk header after MThd', () => {
    const bytes = buildMidiBytes([], 120);
    assert.equal(bytes[14], 0x4d); // M
    assert.equal(bytes[15], 0x54); // T
    assert.equal(bytes[16], 0x72); // r
    assert.equal(bytes[17], 0x6b); // k
});

test('buildMidiBytes includes tempo meta event for 120 BPM', () => {
    const bytes = buildMidiBytes([], 120);
    // Tempo meta: FF 51 03 followed by 3-byte us/beat
    // 120 BPM = 500000 us/beat = 0x07A120
    const arr = Array.from(bytes);
    let found = false;
    for (let i = 0; i < arr.length - 5; i++) {
        if (arr[i] === 0xff && arr[i + 1] === 0x51 && arr[i + 2] === 0x03) {
            const us = ((arr[i + 3]!) << 16) | ((arr[i + 4]!) << 8) | (arr[i + 5]!);
            assert.equal(us, 500000);
            found = true;
            break;
        }
    }
    assert.ok(found, 'Tempo meta event not found');
});

test('buildMidiBytes includes note-on and note-off', () => {
    const bytes = buildMidiBytes([singleNote()], 120);
    const arr = Array.from(bytes);
    // Note-on: 0x90 + pitch 60
    let hasNoteOn = false;
    let hasNoteOff = false;
    for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i] === 0x90 && arr[i + 1] === 60) hasNoteOn = true;
        if (arr[i] === 0x80 && arr[i + 1] === 60) hasNoteOff = true;
    }
    assert.ok(hasNoteOn, 'Note-on event not found');
    assert.ok(hasNoteOff, 'Note-off event not found');
});

test('buildMidiBytes ends with end-of-track meta event', () => {
    const bytes = buildMidiBytes([], 120);
    const arr = Array.from(bytes);
    // End of track: FF 2F 00 (the last 3 non-delta bytes in the track)
    // Find the last occurrence of FF 2F 00
    let found = false;
    for (let i = arr.length - 3; i >= 0; i--) {
        if (arr[i] === 0xff && arr[i + 1] === 0x2f && arr[i + 2] === 0x00) {
            found = true;
            break;
        }
    }
    assert.ok(found, 'End-of-track meta event not found');
});

// ---------------------------------------------------------------------------
// scoreNotesToNoteEvents — quantized beat → seconds conversion
// ---------------------------------------------------------------------------

test('scoreNotesToNoteEvents converts beats to seconds at 60 BPM', () => {
    const score: QuantizedScore = {
        config: { bpm: 60, timeSignature: [4, 4], keySignature: 0, quantizePrecision: 0.25 },
        notes: [
            { pitchMidi: 60, startBeat: 2, durationBeats: 1, velocity: 80, measure: 0, beatInMeasure: 2 },
        ],
        totalMeasures: 1,
    };
    const events = scoreNotesToNoteEvents(score);
    assert.equal(events.length, 1);
    // At 60 BPM: 1 beat = 1 second
    assert.equal(events[0]!.startTime, 2.0);
    assert.equal(events[0]!.endTime, 3.0);
    assert.equal(events[0]!.pitchMidi, 60);
    assert.equal(events[0]!.velocity, 80);
    assert.equal(events[0]!.confidence, 1);
});

test('scoreNotesToNoteEvents converts beats to seconds at 120 BPM', () => {
    const score: QuantizedScore = {
        config: { bpm: 120, timeSignature: [4, 4], keySignature: 0, quantizePrecision: 0.25 },
        notes: [
            { pitchMidi: 64, startBeat: 4, durationBeats: 2, velocity: 100, measure: 1, beatInMeasure: 0 },
        ],
        totalMeasures: 2,
    };
    const events = scoreNotesToNoteEvents(score);
    // At 120 BPM: 1 beat = 0.5 seconds
    assert.equal(events[0]!.startTime, 2.0);
    assert.equal(events[0]!.endTime, 3.0);
});

// ---------------------------------------------------------------------------
// buildMidiBytes — multi-note scenarios
// ---------------------------------------------------------------------------

test('buildMidiBytes produces ordered events for multiple sequential notes', () => {
    const notes: NoteEvent[] = [
        { pitchMidi: 60, startTime: 0, endTime: 0.5, velocity: 80, confidence: 0.9 },
        { pitchMidi: 62, startTime: 0.5, endTime: 1.0, velocity: 80, confidence: 0.9 },
        { pitchMidi: 64, startTime: 1.0, endTime: 1.5, velocity: 80, confidence: 0.9 },
    ];
    const bytes = buildMidiBytes(notes, 120);
    const arr = Array.from(bytes);

    // Verify all 3 note-on events exist with correct pitches
    let noteOns: number[] = [];
    for (let i = 0; i < arr.length - 2; i++) {
        if (arr[i] === 0x90) noteOns.push(arr[i + 1]!);
    }
    assert.ok(noteOns.includes(60), 'Should have note-on for pitch 60');
    assert.ok(noteOns.includes(62), 'Should have note-on for pitch 62');
    assert.ok(noteOns.includes(64), 'Should have note-on for pitch 64');
});

test('buildMidiBytes handles simultaneous chord notes', () => {
    // Two notes with the same start time (chord)
    const notes: NoteEvent[] = [
        { pitchMidi: 60, startTime: 0, endTime: 0.5, velocity: 80, confidence: 0.9 },
        { pitchMidi: 64, startTime: 0, endTime: 0.5, velocity: 80, confidence: 0.9 },
    ];
    const bytes = buildMidiBytes(notes, 120);
    const arr = Array.from(bytes);

    // Both note-on events should exist
    let noteOns: number[] = [];
    for (let i = 0; i < arr.length - 2; i++) {
        if (arr[i] === 0x90) noteOns.push(arr[i + 1]!);
    }
    assert.ok(noteOns.includes(60), 'Should have note-on for pitch 60');
    assert.ok(noteOns.includes(64), 'Should have note-on for pitch 64');
    assert.equal(noteOns.length, 2, 'Should have exactly 2 note-on events');
});
