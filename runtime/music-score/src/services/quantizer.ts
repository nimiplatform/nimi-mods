/**
 * Quantization engine: converts continuous-time NoteEvents into
 * measure-aligned musical notation suitable for MusicXML generation.
 */

import type { NoteEvent } from './pitch-detector.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreConfig {
    bpm: number;
    /** [beats per measure, beat unit denominator] e.g. [4, 4] */
    timeSignature: [number, number];
    /** Fifths circle position: -7..+7 (negative = flats, positive = sharps) */
    keySignature: number;
    /** Smallest note value in beats (0.25 = 16th note at quarter = 1 beat) */
    quantizePrecision: number;
}

export interface QuantizedNote {
    pitchMidi: number;
    /** Beat position from the start of the piece */
    startBeat: number;
    /** Duration in beats */
    durationBeats: number;
    velocity: number;
    /** 0-based measure index */
    measure: number;
    /** Beat position within the measure */
    beatInMeasure: number;
}

export interface QuantizedScore {
    config: ScoreConfig;
    notes: QuantizedNote[];
    totalMeasures: number;
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export function defaultScoreConfig(): ScoreConfig {
    return {
        bpm: 120,
        timeSignature: [4, 4],
        keySignature: 0,
        quantizePrecision: 0.25,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function quantize(notes: NoteEvent[], overrides?: Partial<ScoreConfig>): QuantizedScore {
    if (notes.length === 0) {
        const config = { ...defaultScoreConfig(), ...overrides };
        return { config, notes: [], totalMeasures: 0 };
    }

    const detectedBpm = overrides?.bpm ?? detectBpm(notes);
    const detectedKey = overrides?.keySignature ?? detectKeySignature(notes);

    const config: ScoreConfig = {
        ...defaultScoreConfig(),
        bpm: detectedBpm,
        keySignature: detectedKey,
        ...overrides,
    };

    const beatsPerMeasure = config.timeSignature[0] * (4 / config.timeSignature[1]);
    const secondsPerBeat = 60 / config.bpm;

    const quantized: QuantizedNote[] = notes.map((n) => {
        const rawStart = n.startTime / secondsPerBeat;
        const rawDuration = (n.endTime - n.startTime) / secondsPerBeat;

        const startBeat = snapToGrid(rawStart, config.quantizePrecision);
        let durationBeats = snapToGrid(rawDuration, config.quantizePrecision);
        if (durationBeats < config.quantizePrecision) {
            durationBeats = config.quantizePrecision;
        }

        const measure = Math.floor(startBeat / beatsPerMeasure);
        const beatInMeasure = startBeat - measure * beatsPerMeasure;

        return {
            pitchMidi: n.pitchMidi,
            startBeat,
            durationBeats,
            velocity: n.velocity,
            measure,
            beatInMeasure,
        };
    });

    // Remove duplicates that quantized to the same grid position and pitch
    const deduped = deduplicateNotes(quantized);

    const lastNote = deduped[deduped.length - 1];
    const lastBeat = lastNote ? lastNote.startBeat + lastNote.durationBeats : 0;
    const totalMeasures = Math.ceil(lastBeat / beatsPerMeasure) || 1;

    return { config, notes: deduped, totalMeasures };
}

// ---------------------------------------------------------------------------
// BPM detection
// ---------------------------------------------------------------------------

function detectBpm(notes: NoteEvent[]): number {
    if (notes.length < 2) return 120;

    // Collect inter-onset intervals
    const onsets = notes.map((n) => n.startTime).sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < onsets.length; i++) {
        const gap = (onsets[i] ?? 0) - (onsets[i - 1] ?? 0);
        if (gap > 0.05 && gap < 2.0) {
            intervals.push(gap);
        }
    }

    if (intervals.length === 0) return 120;

    // Find the most common interval using histogram with 10ms bins
    const binSize = 0.01;
    const bins = new Map<number, number>();
    for (const iv of intervals) {
        const key = Math.round(iv / binSize);
        bins.set(key, (bins.get(key) ?? 0) + 1);
    }

    // Smooth the histogram and pick the peak
    let bestBin = 0;
    let bestCount = 0;
    for (const [bin, count] of bins) {
        // Add neighboring bins for smoothing
        const smoothed = count + (bins.get(bin - 1) ?? 0) + (bins.get(bin + 1) ?? 0);
        if (smoothed > bestCount) {
            bestCount = smoothed;
            bestBin = bin;
        }
    }

    const beatInterval = bestBin * binSize;
    if (beatInterval <= 0) return 120;

    let bpm = 60 / beatInterval;

    // Normalize to a reasonable range (60-200)
    while (bpm < 60) bpm *= 2;
    while (bpm > 200) bpm /= 2;

    return Math.round(bpm);
}

// ---------------------------------------------------------------------------
// Key signature detection (Krumhansl-Schmuckler algorithm)
// ---------------------------------------------------------------------------

// Major key profile (Krumhansl)
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
// Minor key profile (Krumhansl)
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Maps tonic pitch class to fifths-circle position (for major keys) */
const TONIC_TO_FIFTHS: Record<number, number> = {
    0: 0,   // C
    7: 1,   // G
    2: 2,   // D
    9: 3,   // A
    4: 4,   // E
    11: 5,  // B
    6: 6,   // F# / Gb = -6
    1: -5,  // Db
    8: -4,  // Ab
    3: -3,  // Eb
    10: -2, // Bb
    5: -1,  // F
};

function detectKeySignature(notes: NoteEvent[]): number {
    if (notes.length === 0) return 0;

    // Build pitch class histogram, weighted by duration
    const histogram: Record<number, number> = {};
    for (let i = 0; i < 12; i++) histogram[i] = 0;
    for (const n of notes) {
        const pc = n.pitchMidi % 12;
        const weight = n.endTime - n.startTime;
        histogram[pc] = (histogram[pc] ?? 0) + weight;
    }

    // Normalize
    let total = 0;
    for (let i = 0; i < 12; i++) total += histogram[i] ?? 0;
    if (total === 0) return 0;
    for (let i = 0; i < 12; i++) histogram[i] = (histogram[i] ?? 0) / total;

    let bestCorrelation = -Infinity;
    let bestFifths = 0;

    for (let tonic = 0; tonic < 12; tonic++) {
        // Rotate histogram so tonic is at index 0
        const rotated = new Array<number>(12).fill(0);
        for (let i = 0; i < 12; i++) {
            rotated[i] = (histogram as Record<number, number>)[(i + tonic) % 12] ?? 0;
        }

        // Correlation with major profile
        const majorCorr = pearsonCorrelation(rotated, MAJOR_PROFILE);
        if (majorCorr > bestCorrelation) {
            bestCorrelation = majorCorr;
            bestFifths = TONIC_TO_FIFTHS[tonic] ?? 0;
        }

        // Correlation with minor profile (relative minor is tonic + 9 semitones)
        const minorCorr = pearsonCorrelation(rotated, MINOR_PROFILE);
        if (minorCorr > bestCorrelation) {
            bestCorrelation = minorCorr;
            // Minor key shares the same key signature as its relative major
            const relativeMajorTonic = (tonic + 3) % 12;
            bestFifths = TONIC_TO_FIFTHS[relativeMajorTonic] ?? 0;
        }
    }

    return bestFifths;
}

function pearsonCorrelation(a: readonly number[], b: readonly number[]): number {
    const n = a.length;
    let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0;
    for (let i = 0; i < n; i++) {
        const ai = a[i] ?? 0;
        const bi = b[i] ?? 0;
        sumA += ai;
        sumB += bi;
        sumA2 += ai * ai;
        sumB2 += bi * bi;
        sumAB += ai * bi;
    }
    const num = n * sumAB - sumA * sumB;
    const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
    return den === 0 ? 0 : num / den;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
}

function deduplicateNotes(notes: QuantizedNote[]): QuantizedNote[] {
    const seen = new Set<string>();
    const result: QuantizedNote[] = [];
    for (const n of notes) {
        const key = `${n.pitchMidi}:${n.startBeat.toFixed(4)}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(n);
        }
    }
    return result.sort((a, b) => a.startBeat - b.startBeat || a.pitchMidi - b.pitchMidi);
}

/** Convert fifths position to human-readable key name. */
export function fifthsToKeyName(fifths: number): string {
    const names: Record<number, string> = {
        '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb',
        '-2': 'Bb', '-1': 'F', '0': 'C', '1': 'G', '2': 'D',
        '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#',
    };
    return names[String(fifths) as unknown as number] ?? 'C';
}
