/**
 * Export utilities: MusicXML download, MIDI file generation, PDF export.
 */

import type { NoteEvent } from './pitch-detector.js';
import type { QuantizedScore } from './quantizer.js';

// ---------------------------------------------------------------------------
// MusicXML export
// ---------------------------------------------------------------------------

export function downloadMusicXml(xml: string, filename = 'score.musicxml'): void {
    downloadBlob(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }), filename);
}

// ---------------------------------------------------------------------------
// MIDI export (Standard MIDI File, format 0)
// ---------------------------------------------------------------------------

function buildMidiBlob(notes: NoteEvent[], bpm: number): Blob {
    const bytes = buildMidiBytes(notes, bpm);
    return new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' });
}

function downloadMidi(notes: NoteEvent[], bpm: number, filename = 'score.mid'): void {
    downloadBlob(buildMidiBlob(notes, bpm), filename);
}

/**
 * Convert quantized score notes to NoteEvent[] with correct timing.
 * Exported for testability (MS-ACC-005).
 */
export function scoreNotesToNoteEvents(score: QuantizedScore): NoteEvent[] {
    const secondsPerBeat = 60 / score.config.bpm;
    return score.notes.map((n) => ({
        pitchMidi: n.pitchMidi,
        startTime: n.startBeat * secondsPerBeat,
        endTime: (n.startBeat + n.durationBeats) * secondsPerBeat,
        velocity: n.velocity,
        confidence: 1,
    }));
}

/**
 * Build MIDI from quantized score — consistent with displayed MusicXML.
 */
export function downloadMidiFromScore(score: QuantizedScore, filename = 'score.mid'): void {
    const noteEvents = scoreNotesToNoteEvents(score);
    downloadMidi(noteEvents, score.config.bpm, filename);
}

export function buildMidiBytes(notes: NoteEvent[], bpm: number): Uint8Array {
    const ticksPerQuarter = 480;
    const usPerBeat = Math.round(60_000_000 / bpm);

    // Sort notes by start time
    const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);

    // Build track events
    const events: Array<{ tick: number; data: number[] }> = [];

    // Tempo meta event at tick 0
    events.push({
        tick: 0,
        data: [0xff, 0x51, 0x03, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff],
    });

    // Note on/off events
    for (const note of sorted) {
        const startTick = Math.round((note.startTime / 60) * bpm * ticksPerQuarter);
        const endTick = Math.round((note.endTime / 60) * bpm * ticksPerQuarter);
        const vel = Math.max(1, Math.min(127, note.velocity));

        events.push({ tick: startTick, data: [0x90, note.pitchMidi, vel] });
        events.push({ tick: endTick, data: [0x80, note.pitchMidi, 0] });
    }

    // End of track
    events.push({ tick: events[events.length - 1]?.tick ?? 0, data: [0xff, 0x2f, 0x00] });

    // Sort by tick
    events.sort((a, b) => a.tick - b.tick);

    // Convert to delta-time encoded byte stream
    const trackBytes: number[] = [];
    let prevTick = 0;
    for (const ev of events) {
        const delta = ev.tick - prevTick;
        prevTick = ev.tick;
        trackBytes.push(...encodeVariableLength(delta));
        trackBytes.push(...ev.data);
    }

    // Build the full MIDI file
    const result: number[] = [];

    // Header chunk: MThd
    result.push(0x4d, 0x54, 0x68, 0x64); // "MThd"
    result.push(0x00, 0x00, 0x00, 0x06); // chunk length = 6
    result.push(0x00, 0x00);             // format 0
    result.push(0x00, 0x01);             // 1 track
    result.push((ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff);

    // Track chunk: MTrk
    result.push(0x4d, 0x54, 0x72, 0x6b); // "MTrk"
    const trackLen = trackBytes.length;
    result.push(
        (trackLen >> 24) & 0xff,
        (trackLen >> 16) & 0xff,
        (trackLen >> 8) & 0xff,
        trackLen & 0xff,
    );
    result.push(...trackBytes);

    return new Uint8Array(result);
}

export function encodeVariableLength(value: number): number[] {
    if (value < 0) value = 0;
    const bytes: number[] = [];
    bytes.push(value & 0x7f);
    let v = value >> 7;
    while (v > 0) {
        bytes.push((v & 0x7f) | 0x80);
        v >>= 7;
    }
    return bytes.reverse();
}

// ---------------------------------------------------------------------------
// PDF export (via OSMD SVG → browser print)
// ---------------------------------------------------------------------------

export function exportPdf(): void {
    // Use browser's built-in print dialog targeting the score container.
    // The OSMD renders to SVG which prints well.
    window.print();
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

/**
 * Generate a default filename from the source audio file name.
 */
export function deriveFilename(sourceFilename: string, ext: string): string {
    const base = sourceFilename.replace(/\.[^.]+$/, '');
    return `${base}.${ext}`;
}

/**
 * Check if the quantized score is non-empty and exportable.
 */
export function isExportable(score: QuantizedScore | null): score is QuantizedScore {
    return score != null && score.notes.length > 0;
}
