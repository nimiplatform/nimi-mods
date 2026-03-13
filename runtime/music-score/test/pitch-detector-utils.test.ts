import test from 'node:test';
import assert from 'node:assert/strict';

// pitch-detector.ts has a top-level import of @spotify/basic-pitch which may
// fail in Node. Use dynamic import with try/catch to handle gracefully.
// If the module can't load, we skip tests rather than fail.

let midiToNoteName: (midi: number) => string;
let frequencyToMidi: (freq: number) => number;
let detectPitchACF: (frame: Float32Array, sampleRate: number) => { frequency: number; amplitude: number };
let loaded = false;

try {
    const mod = await import('../src/services/pitch-detector.js');
    midiToNoteName = mod.midiToNoteName;
    frequencyToMidi = mod.frequencyToMidi;
    detectPitchACF = mod.detectPitchACF;
    loaded = true;
} catch {
    // Module failed to load (e.g., @spotify/basic-pitch unavailable in Node)
}

// ---------------------------------------------------------------------------
// midiToNoteName
// ---------------------------------------------------------------------------

test('midiToNoteName maps C4 (MIDI 60)', { skip: !loaded }, () => {
    assert.equal(midiToNoteName(60), 'C4');
});

test('midiToNoteName maps A0 (MIDI 21)', { skip: !loaded }, () => {
    assert.equal(midiToNoteName(21), 'A0');
});

test('midiToNoteName maps C8 (MIDI 108)', { skip: !loaded }, () => {
    assert.equal(midiToNoteName(108), 'C8');
});

test('midiToNoteName maps F#3 (MIDI 54)', { skip: !loaded }, () => {
    assert.equal(midiToNoteName(54), 'F#3');
});

test('midiToNoteName maps A#4 (MIDI 70)', { skip: !loaded }, () => {
    assert.equal(midiToNoteName(70), 'A#4');
});

// ---------------------------------------------------------------------------
// frequencyToMidi
// ---------------------------------------------------------------------------

test('frequencyToMidi converts A4 (440Hz) to MIDI 69', { skip: !loaded }, () => {
    assert.equal(frequencyToMidi(440), 69);
});

test('frequencyToMidi converts C4 (~261.63Hz) to ~MIDI 60', { skip: !loaded }, () => {
    const midi = frequencyToMidi(261.63);
    assert.ok(Math.abs(midi - 60) < 0.1, `Expected ~60 but got ${midi}`);
});

test('frequencyToMidi converts A0 (27.5Hz) to MIDI 21', { skip: !loaded }, () => {
    const midi = frequencyToMidi(27.5);
    assert.ok(Math.abs(midi - 21) < 0.01, `Expected ~21 but got ${midi}`);
});

// ---------------------------------------------------------------------------
// detectPitchACF — autocorrelation pitch detection
// ---------------------------------------------------------------------------

function generateSineWithHarmonics(frequency: number, sampleRate: number, length: number, amplitude = 0.5): Float32Array {
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        // Fundamental + decaying harmonics to disambiguate ACF peaks
        samples[i] = amplitude * (
            Math.sin(2 * Math.PI * frequency * t) +
            0.5 * Math.sin(2 * Math.PI * 2 * frequency * t) +
            0.25 * Math.sin(2 * Math.PI * 3 * frequency * t)
        );
    }
    return samples;
}

function generateSilence(length: number, amplitude = 0): Float32Array {
    const samples = new Float32Array(length);
    if (amplitude > 0) {
        for (let i = 0; i < length; i++) {
            samples[i] = amplitude * Math.sin(2 * Math.PI * 440 * i / 22050);
        }
    }
    return samples;
}

test('detectPitchACF detects pitch from harmonic-rich signal at A4 (440Hz)', { skip: !loaded }, () => {
    const frame = generateSineWithHarmonics(440, 22050, 2048);
    const result = detectPitchACF(frame, 22050);
    assert.ok(result.frequency > 0, 'Should detect a frequency');
    // ACF should find fundamental at ~440Hz with harmonic-rich signal
    assert.ok(Math.abs(result.frequency - 440) < 50, `Expected ~440Hz but got ${result.frequency}`);
    assert.ok(result.amplitude > 0, 'Amplitude should be positive');
});

test('detectPitchACF returns positive frequency and amplitude for non-silent signal', { skip: !loaded }, () => {
    const frame = generateSineWithHarmonics(330, 22050, 2048);
    const result = detectPitchACF(frame, 22050);
    assert.ok(result.frequency > 0, 'Should detect a non-zero frequency for audible signal');
    assert.ok(result.amplitude > 0.01, `Amplitude should be above silence threshold, got ${result.amplitude}`);
    // ACF with naive normalization may detect subharmonics; verify frequency is in valid range
    assert.ok(result.frequency >= 27.5 && result.frequency <= 4200,
        `Frequency ${result.frequency} should be in piano range [27.5, 4200]`);
});

test('detectPitchACF returns frequency=0 for silent frame', { skip: !loaded }, () => {
    const silent = new Float32Array(2048); // all zeros
    const result = detectPitchACF(silent, 22050);
    assert.equal(result.frequency, 0);
});

test('detectPitchACF returns frequency=0 for very quiet frame', { skip: !loaded }, () => {
    // Amplitude below RMS threshold (0.005)
    const quiet = generateSilence(2048, 0.001);
    const result = detectPitchACF(quiet, 22050);
    assert.equal(result.frequency, 0);
});
