/**
 * Pitch detection service using @spotify/basic-pitch.
 *
 * Converts an AudioBuffer (mono, 22050Hz) into an array of NoteEvent objects
 * representing detected musical notes with pitch, timing, and velocity.
 *
 * If the basic-pitch model fails to load (e.g. offline), falls back to a
 * simple ACF-based monophonic pitch detector.
 */

import {
    BasicPitch,
    outputToNotesPoly,
    addPitchBendsToNoteEvents,
    noteFramesToTime,
} from '@spotify/basic-pitch';

export interface NoteEvent {
    /** MIDI note number (21=A0 to 108=C8 for piano range) */
    pitchMidi: number;
    /** Note start time in seconds */
    startTime: number;
    /** Note end time in seconds */
    endTime: number;
    /** Velocity 0-127 */
    velocity: number;
    /** Detection confidence 0-1 */
    confidence: number;
}

export interface PitchDetectorProgress {
    phase: 'loading-model' | 'detecting';
    progress: number; // 0-100
}

/** CDN-served basic-pitch ONNX model (TensorFlow.js SavedModel format) */
const BASIC_PITCH_MODEL_URL =
    'https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json';

/** Piano range MIDI bounds */
const PIANO_MIN_MIDI = 21;
const PIANO_MAX_MIDI = 108;

function filterPianoRange(notes: NoteEvent[]): NoteEvent[] {
    return notes.filter(
        (n) => n.pitchMidi >= PIANO_MIN_MIDI && n.pitchMidi <= PIANO_MAX_MIDI,
    );
}

/**
 * Detect pitches using @spotify/basic-pitch (ML-based, polyphonic).
 * Falls back to ACF-based monophonic detection on model load failure.
 */
export async function detectPitches(
    audioBuffer: AudioBuffer,
    onProgress?: (p: PitchDetectorProgress) => void,
): Promise<NoteEvent[]> {
    try {
        return await detectWithBasicPitch(audioBuffer, onProgress);
    } catch (e) {
        console.warn(
            '[music-score] basic-pitch ML model unavailable, using monophonic fallback:',
            e,
        );
        return await detectWithFallback(audioBuffer, onProgress);
    }
}

// ---------------------------------------------------------------------------
// @spotify/basic-pitch integration
// ---------------------------------------------------------------------------

async function detectWithBasicPitch(
    audioBuffer: AudioBuffer,
    onProgress?: (p: PitchDetectorProgress) => void,
): Promise<NoteEvent[]> {
    onProgress?.({ phase: 'loading-model', progress: 0 });

    const basicPitch = new BasicPitch(BASIC_PITCH_MODEL_URL);

    // Force model load so we surface errors early (before detection loop)
    await basicPitch.model;

    onProgress?.({ phase: 'loading-model', progress: 100 });
    onProgress?.({ phase: 'detecting', progress: 0 });

    // Accumulate per-window results from evaluateModel callback.
    // The callback fires once per ~2-second audio window, NOT once at the end.
    const allFrames: number[][] = [];
    const allOnsets: number[][] = [];
    const allContours: number[][] = [];

    await basicPitch.evaluateModel(
        audioBuffer,
        (frames: number[][], onsets: number[][], contours: number[][]) => {
            allFrames.push(...frames);
            allOnsets.push(...onsets);
            allContours.push(...contours);
        },
        (percent: number) => {
            onProgress?.({ phase: 'detecting', progress: Math.round(percent * 100) });
        },
    );

    onProgress?.({ phase: 'detecting', progress: 100 });

    // Convert accumulated frames to polyphonic note events
    const noteEvents = outputToNotesPoly(
        allFrames,
        allOnsets,
        0.5,  // onsetThresh
        0.3,  // frameThresh
        11,   // minNoteLen
        true, // inferOnsets
    );

    // Add pitch bend data from contours
    const withBends = addPitchBendsToNoteEvents(allContours, noteEvents);

    // Convert frame indices to absolute time
    const timedNotes = noteFramesToTime(withBends);

    const notes: NoteEvent[] = timedNotes.map((n) => ({
        pitchMidi: n.pitchMidi,
        startTime: n.startTimeSeconds,
        endTime: n.startTimeSeconds + n.durationSeconds,
        velocity: Math.max(1, Math.min(127, Math.round(n.amplitude * 127))),
        confidence: 0.85,
    }));

    return filterPianoRange(notes);
}

// ---------------------------------------------------------------------------
// ACF-based fallback (monophonic, for when basic-pitch model is unavailable)
// ---------------------------------------------------------------------------

async function detectWithFallback(
    audioBuffer: AudioBuffer,
    onProgress?: (p: PitchDetectorProgress) => void,
): Promise<NoteEvent[]> {
    onProgress?.({ phase: 'loading-model', progress: 100 }); // no model to load
    onProgress?.({ phase: 'detecting', progress: 0 });

    const samples = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    const frameSize = 2048;
    const hopSize = 512;
    const notes: NoteEvent[] = [];

    let currentNote: { pitchMidi: number; startTime: number; amplitude: number } | null = null;
    const totalFrames = Math.floor((samples.length - frameSize) / hopSize);

    for (let i = 0; i < totalFrames; i++) {
        const offset = i * hopSize;
        const frame = samples.slice(offset, offset + frameSize);

        const { frequency, amplitude } = detectPitchACF(frame, sampleRate);
        const midi = frequency > 0 ? frequencyToMidi(frequency) : -1;
        const roundedMidi = midi >= 0 ? Math.round(midi) : -1;
        const time = offset / sampleRate;

        if (roundedMidi >= PIANO_MIN_MIDI && roundedMidi <= PIANO_MAX_MIDI && amplitude > 0.01) {
            if (currentNote == null || Math.abs(currentNote.pitchMidi - roundedMidi) > 1) {
                if (currentNote != null) {
                    notes.push({
                        pitchMidi: currentNote.pitchMidi,
                        startTime: currentNote.startTime,
                        endTime: time,
                        velocity: Math.min(127, Math.round(currentNote.amplitude * 800)),
                        confidence: 0.6,
                    });
                }
                currentNote = { pitchMidi: roundedMidi, startTime: time, amplitude };
            } else {
                currentNote.amplitude = Math.max(currentNote.amplitude, amplitude);
            }
        } else if (currentNote != null) {
            notes.push({
                pitchMidi: currentNote.pitchMidi,
                startTime: currentNote.startTime,
                endTime: time,
                velocity: Math.min(127, Math.round(currentNote.amplitude * 800)),
                confidence: 0.6,
            });
            currentNote = null;
        }

        if (i % 100 === 0) {
            onProgress?.({ phase: 'detecting', progress: Math.round((i / totalFrames) * 100) });
        }
    }

    if (currentNote != null) {
        notes.push({
            pitchMidi: currentNote.pitchMidi,
            startTime: currentNote.startTime,
            endTime: samples.length / sampleRate,
            velocity: Math.min(127, Math.round(currentNote.amplitude * 800)),
            confidence: 0.6,
        });
    }

    const filtered = notes.filter((n) => n.endTime - n.startTime >= 0.05);

    onProgress?.({ phase: 'detecting', progress: 100 });
    return filtered;
}

/**
 * Autocorrelation-based pitch detection for a single frame.
 */
function detectPitchACF(
    frame: Float32Array,
    sampleRate: number,
): { frequency: number; amplitude: number } {
    const n = frame.length;

    let sumSq = 0;
    for (let i = 0; i < n; i++) {
        const v = frame[i] ?? 0;
        sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / n);

    if (rms < 0.005) return { frequency: 0, amplitude: rms };

    const minLag = Math.floor(sampleRate / 4200); // ~C8
    const maxLag = Math.floor(sampleRate / 27.5); // ~A0

    let bestLag = 0;
    let bestCorr = 0;

    for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
        let corr = 0;
        for (let i = 0; i < n - lag; i++) {
            corr += (frame[i] ?? 0) * (frame[i + lag] ?? 0);
        }
        corr /= n - lag;

        if (corr > bestCorr) {
            bestCorr = corr;
            bestLag = lag;
        }
    }

    if (bestLag === 0 || bestCorr < 0.01) return { frequency: 0, amplitude: rms };

    const frequency = sampleRate / bestLag;
    return { frequency, amplitude: rms };
}

function frequencyToMidi(freq: number): number {
    return 69 + 12 * Math.log2(freq / 440);
}

export function midiToNoteName(midi: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = names[midi % 12];
    return `${note}${octave}`;
}
