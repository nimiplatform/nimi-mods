/**
 * MusicXML 3.1 builder: converts a QuantizedScore into a MusicXML string.
 *
 * Handles cross-measure tie splitting, key-aware enharmonic spelling,
 * chord grouping, and rest insertion.
 */

import type { QuantizedNote, QuantizedScore } from './quantizer.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** MusicXML divisions per quarter note */
const DIVISIONS = 16;

// Duration types mapped from division counts
const DURATION_TYPE_MAP: Array<[number, string, boolean]> = [
    // [divs, type, dotted]
    [DIVISIONS * 4, 'whole', false],
    [DIVISIONS * 3, 'half', true],
    [DIVISIONS * 2, 'half', false],
    [DIVISIONS * 1.5, 'quarter', true],
    [DIVISIONS, 'quarter', false],
    [DIVISIONS * 0.75, 'eighth', true],
    [DIVISIONS / 2, 'eighth', false],
    [DIVISIONS / 4, '16th', false],
    [DIVISIONS / 8, '32nd', false],
];

// ---------------------------------------------------------------------------
// Enharmonic spelling tables
// ---------------------------------------------------------------------------

interface PitchSpelling {
    step: string;
    alter: number;
}

// Sharp-biased spelling (for fifths >= 0): C C# D D# E F F# G G# A A# B
const SHARP_SPELLING: PitchSpelling[] = [
    { step: 'C', alter: 0 },
    { step: 'C', alter: 1 },
    { step: 'D', alter: 0 },
    { step: 'D', alter: 1 },
    { step: 'E', alter: 0 },
    { step: 'F', alter: 0 },
    { step: 'F', alter: 1 },
    { step: 'G', alter: 0 },
    { step: 'G', alter: 1 },
    { step: 'A', alter: 0 },
    { step: 'A', alter: 1 },
    { step: 'B', alter: 0 },
];

// Flat-biased spelling (for fifths < 0): C Db D Eb E F Gb G Ab A Bb B
const FLAT_SPELLING: PitchSpelling[] = [
    { step: 'C', alter: 0 },
    { step: 'D', alter: -1 },
    { step: 'D', alter: 0 },
    { step: 'E', alter: -1 },
    { step: 'E', alter: 0 },
    { step: 'F', alter: 0 },
    { step: 'G', alter: -1 },
    { step: 'G', alter: 0 },
    { step: 'A', alter: -1 },
    { step: 'A', alter: 0 },
    { step: 'B', alter: -1 },
    { step: 'B', alter: 0 },
];

function getSpellingTable(fifths: number): PitchSpelling[] {
    return fifths >= 0 ? SHARP_SPELLING : FLAT_SPELLING;
}

// ---------------------------------------------------------------------------
// Tie-split internal types
// ---------------------------------------------------------------------------

interface BuildableNote {
    pitchMidi: number;
    measure: number;
    beatInMeasure: number;
    durationBeats: number;
    velocity: number;
    tieStart: boolean;
    tieStop: boolean;
}

/**
 * Split notes that cross measure boundaries into tied segments.
 */
function splitNotesAtMeasureBoundaries(
    notes: QuantizedNote[],
    beatsPerMeasure: number,
): BuildableNote[] {
    const result: BuildableNote[] = [];

    for (const n of notes) {
        const remaining = beatsPerMeasure - n.beatInMeasure;

        if (n.durationBeats <= remaining + 0.001) {
            // Fits within current measure
            result.push({
                pitchMidi: n.pitchMidi,
                measure: n.measure,
                beatInMeasure: n.beatInMeasure,
                durationBeats: n.durationBeats,
                velocity: n.velocity,
                tieStart: false,
                tieStop: false,
            });
        } else {
            // Split across measures
            let leftover = n.durationBeats;
            let currentMeasure = n.measure;
            let currentBeat = n.beatInMeasure;
            let isFirst = true;

            while (leftover > 0.001) {
                const spaceInMeasure = beatsPerMeasure - currentBeat;
                const segmentDuration = Math.min(leftover, spaceInMeasure);
                const isLast = leftover - segmentDuration < 0.001;

                result.push({
                    pitchMidi: n.pitchMidi,
                    measure: currentMeasure,
                    beatInMeasure: currentBeat,
                    durationBeats: segmentDuration,
                    velocity: n.velocity,
                    tieStart: !isLast,
                    tieStop: !isFirst,
                });

                leftover -= segmentDuration;
                currentMeasure++;
                currentBeat = 0;
                isFirst = false;
            }
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildMusicXml(score: QuantizedScore): string {
    const { config, notes, totalMeasures } = score;
    const [tsBeats, tsBeatType] = config.timeSignature;
    const beatsPerMeasure = tsBeats * (4 / tsBeatType);
    const measureDivisions = beatsPerMeasure * DIVISIONS;
    const spelling = getSpellingTable(config.keySignature);

    // Split cross-measure notes into tied segments
    const buildableNotes = splitNotesAtMeasureBoundaries(notes, beatsPerMeasure);

    // Compute actual total measures (may increase due to tie splitting)
    let actualTotalMeasures = totalMeasures;
    for (const bn of buildableNotes) {
        if (bn.measure >= actualTotalMeasures) {
            actualTotalMeasures = bn.measure + 1;
        }
    }

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"');
    lines.push('  "http://www.musicxml.org/dtds/partwise.dtd">');
    lines.push('<score-partwise version="3.1">');
    lines.push('  <work>');
    lines.push('    <work-title>Transcribed Score</work-title>');
    lines.push('  </work>');
    lines.push('  <identification>');
    lines.push('    <creator type="composer">Music Score Mod</creator>');
    lines.push('    <encoding>');
    lines.push('      <software>nimi Music Score</software>');
    lines.push('    </encoding>');
    lines.push('  </identification>');
    lines.push('  <part-list>');
    lines.push('    <score-part id="P1">');
    lines.push('      <part-name>Piano</part-name>');
    lines.push('    </score-part>');
    lines.push('  </part-list>');
    lines.push('  <part id="P1">');

    // Group notes by measure
    const measureNoteMap = new Map<number, BuildableNote[]>();
    for (const n of buildableNotes) {
        const list = measureNoteMap.get(n.measure) ?? [];
        list.push(n);
        measureNoteMap.set(n.measure, list);
    }

    for (let m = 0; m < actualTotalMeasures; m++) {
        lines.push(`    <measure number="${m + 1}">`);

        // First measure gets attributes
        if (m === 0) {
            lines.push('      <attributes>');
            lines.push(`        <divisions>${DIVISIONS}</divisions>`);
            lines.push('        <key>');
            lines.push(`          <fifths>${config.keySignature}</fifths>`);
            lines.push('        </key>');
            lines.push('        <time>');
            lines.push(`          <beats>${tsBeats}</beats>`);
            lines.push(`          <beat-type>${tsBeatType}</beat-type>`);
            lines.push('        </time>');
            lines.push('        <clef>');
            lines.push('          <sign>G</sign>');
            lines.push('          <line>2</line>');
            lines.push('        </clef>');
            lines.push('      </attributes>');

            lines.push('      <direction placement="above">');
            lines.push('        <direction-type>');
            lines.push('          <metronome>');
            lines.push('            <beat-unit>quarter</beat-unit>');
            lines.push(`            <per-minute>${config.bpm}</per-minute>`);
            lines.push('          </metronome>');
            lines.push('        </direction-type>');
            lines.push(`        <sound tempo="${config.bpm}"/>`);
            lines.push('      </direction>');
        }

        const mNotes = (measureNoteMap.get(m) ?? []).sort(
            (a, b) => a.beatInMeasure - b.beatInMeasure || a.pitchMidi - b.pitchMidi,
        );

        let cursor = 0;
        let noteIdx = 0;

        while (cursor < measureDivisions && noteIdx <= mNotes.length) {
            const note = mNotes[noteIdx];
            if (note == null) {
                const restDur = measureDivisions - cursor;
                if (restDur > 0) {
                    lines.push(...emitRest(restDur));
                }
                break;
            }

            const noteDivStart = Math.round(note.beatInMeasure * DIVISIONS);

            if (noteDivStart > cursor) {
                lines.push(...emitRest(noteDivStart - cursor));
                cursor = noteDivStart;
            }

            // Collect chord notes (same beat position)
            const chordNotes = [note];
            let j = noteIdx + 1;
            while (j < mNotes.length) {
                const next = mNotes[j]!;
                if (Math.abs(next.beatInMeasure - note.beatInMeasure) < 0.001) {
                    chordNotes.push(next);
                    j++;
                } else {
                    break;
                }
            }

            const maxDur = measureDivisions - cursor;

            for (const cn of chordNotes) {
                let dur = Math.round(cn.durationBeats * DIVISIONS);
                dur = Math.min(dur, maxDur);
                dur = Math.max(dur, 1);

                lines.push(...emitNote(cn, dur, cn !== chordNotes[0], spelling));
            }

            const noteDur = Math.min(Math.round(note.durationBeats * DIVISIONS), maxDur);
            cursor = noteDivStart + Math.max(noteDur, 1);
            noteIdx = j;
        }

        lines.push('    </measure>');
    }

    lines.push('  </part>');
    lines.push('</score-partwise>');

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Note & rest emitters
// ---------------------------------------------------------------------------

function emitNote(
    note: BuildableNote,
    durationDivs: number,
    isChord: boolean,
    spelling: PitchSpelling[],
): string[] {
    const octave = Math.floor(note.pitchMidi / 12) - 1;
    const pc = note.pitchMidi % 12;
    const sp = spelling[pc] ?? SHARP_SPELLING[pc]!;
    const { type, dot } = durationToType(durationDivs);

    const lines: string[] = [];
    lines.push('      <note>');
    if (isChord) lines.push('        <chord/>');
    lines.push('        <pitch>');
    lines.push(`          <step>${sp.step}</step>`);
    if (sp.alter !== 0) lines.push(`          <alter>${sp.alter}</alter>`);
    lines.push(`          <octave>${octave}</octave>`);
    lines.push('        </pitch>');
    lines.push(`        <duration>${durationDivs}</duration>`);

    // Tie elements (before <type>)
    if (note.tieStop) lines.push('        <tie type="stop"/>');
    if (note.tieStart) lines.push('        <tie type="start"/>');

    lines.push(`        <type>${type}</type>`);
    if (dot) lines.push('        <dot/>');

    // Tied notations
    if (note.tieStart || note.tieStop) {
        lines.push('        <notations>');
        if (note.tieStop) lines.push('          <tied type="stop"/>');
        if (note.tieStart) lines.push('          <tied type="start"/>');
        lines.push('        </notations>');
    }

    lines.push('      </note>');
    return lines;
}

function emitRest(durationDivs: number): string[] {
    const { type, dot } = durationToType(durationDivs);

    const lines: string[] = [];
    lines.push('      <note>');
    lines.push('        <rest/>');
    lines.push(`        <duration>${durationDivs}</duration>`);
    lines.push(`        <type>${type}</type>`);
    if (dot) lines.push('        <dot/>');
    lines.push('      </note>');
    return lines;
}

function durationToType(divs: number): { type: string; dot: boolean } {
    for (const [d, t, isDotted] of DURATION_TYPE_MAP) {
        if (Math.abs(divs - d) < 0.5) {
            return { type: t, dot: isDotted };
        }
    }

    // Fallback: closest match
    let bestType = 'quarter';
    let bestDist = Infinity;
    for (const [d, t] of DURATION_TYPE_MAP) {
        const dist = Math.abs(divs - d);
        if (dist < bestDist) {
            bestDist = dist;
            bestType = t;
        }
    }
    return { type: bestType, dot: false };
}
