import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMusicXml } from '../src/services/musicxml-builder.js';
import type { QuantizedScore } from '../src/services/quantizer.js';

function makeScore(notes: QuantizedScore['notes'], overrides?: Partial<QuantizedScore['config']>): QuantizedScore {
    const config = {
        bpm: 120,
        timeSignature: [4, 4] as [number, number],
        keySignature: 0,
        quantizePrecision: 0.25,
        ...overrides,
    };
    const beatsPerMeasure = config.timeSignature[0] * (4 / config.timeSignature[1]);
    const lastNote = notes[notes.length - 1];
    const lastBeat = lastNote ? lastNote.startBeat + lastNote.durationBeats : 0;
    const totalMeasures = Math.max(1, Math.ceil(lastBeat / beatsPerMeasure));
    return { config, notes, totalMeasures };
}

test('buildMusicXml produces valid XML header', () => {
    const xml = buildMusicXml(makeScore([]));
    assert.ok(xml.startsWith('<?xml version="1.0"'));
    assert.ok(xml.includes('<score-partwise version="3.1">'));
    assert.ok(xml.includes('</score-partwise>'));
});

test('buildMusicXml includes key signature and time signature', () => {
    const xml = buildMusicXml(makeScore([], { keySignature: -2, timeSignature: [3, 4] }));
    assert.ok(xml.includes('<fifths>-2</fifths>'));
    assert.ok(xml.includes('<beats>3</beats>'));
    assert.ok(xml.includes('<beat-type>4</beat-type>'));
});

test('buildMusicXml includes tempo marking', () => {
    const xml = buildMusicXml(makeScore([], { bpm: 90 }));
    assert.ok(xml.includes('<per-minute>90</per-minute>'));
    assert.ok(xml.includes('tempo="90"'));
});

test('buildMusicXml renders single note with pitch', () => {
    const xml = buildMusicXml(makeScore([
        { pitchMidi: 60, startBeat: 0, durationBeats: 1, velocity: 80, measure: 0, beatInMeasure: 0 },
    ]));
    assert.ok(xml.includes('<step>C</step>'));
    assert.ok(xml.includes('<octave>4</octave>'));
    assert.ok(xml.includes('<duration>'));
});

test('buildMusicXml renders rest for gap', () => {
    // Note at beat 1 leaves a gap at beat 0
    const xml = buildMusicXml(makeScore([
        { pitchMidi: 62, startBeat: 1, durationBeats: 1, velocity: 80, measure: 0, beatInMeasure: 1 },
    ]));
    assert.ok(xml.includes('<rest/>'));
});

test('buildMusicXml renders chord with <chord/> element', () => {
    const xml = buildMusicXml(makeScore([
        { pitchMidi: 60, startBeat: 0, durationBeats: 1, velocity: 80, measure: 0, beatInMeasure: 0 },
        { pitchMidi: 64, startBeat: 0, durationBeats: 1, velocity: 80, measure: 0, beatInMeasure: 0 },
    ]));
    assert.ok(xml.includes('<chord/>'));
});

test('buildMusicXml uses flat spelling in flat keys', () => {
    // Bb major (fifths = -2), note Bb (MIDI 70)
    const xml = buildMusicXml(makeScore([
        { pitchMidi: 70, startBeat: 0, durationBeats: 1, velocity: 80, measure: 0, beatInMeasure: 0 },
    ], { keySignature: -2 }));
    // Bb should be spelled as B with alter -1
    assert.ok(xml.includes('<step>B</step>'));
    assert.ok(xml.includes('<alter>-1</alter>'));
});

test('buildMusicXml uses sharp spelling in sharp keys', () => {
    // G major (fifths = 1), note F# (MIDI 66)
    const xml = buildMusicXml(makeScore([
        { pitchMidi: 66, startBeat: 0, durationBeats: 1, velocity: 80, measure: 0, beatInMeasure: 0 },
    ], { keySignature: 1 }));
    assert.ok(xml.includes('<step>F</step>'));
    assert.ok(xml.includes('<alter>1</alter>'));
});

test('buildMusicXml generates tie for cross-measure note', () => {
    // Note at beat 3, duration 2 beats in 4/4 → should cross measure boundary
    const xml = buildMusicXml(makeScore([
        { pitchMidi: 60, startBeat: 3, durationBeats: 2, velocity: 80, measure: 0, beatInMeasure: 3 },
    ]));
    assert.ok(xml.includes('<tie type="start"/>'));
    assert.ok(xml.includes('<tie type="stop"/>'));
    assert.ok(xml.includes('<tied type="start"/>'));
    assert.ok(xml.includes('<tied type="stop"/>'));
    // Should produce 2 measures
    assert.ok(xml.includes('measure number="2"'));
});
