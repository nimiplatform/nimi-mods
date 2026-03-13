# Music Score Mod Specification

## Overview

The music-score mod transcribes uploaded audio (MP3, WAV, OGG, FLAC) into
standard sheet music notation displayed as an interactive score.

## Architecture

```
User Upload → WebAudioAPI decode → basic-pitch detection → Quantizer → MusicXML → OSMD render
```

All processing runs client-side in the browser. No runtime AI capabilities are used.

## Core Services

| Service | Input | Output |
|---------|-------|--------|
| audio-decoder | File | AudioBuffer (mono, 22050Hz) |
| pitch-detector | AudioBuffer | NoteEvent[] |
| quantizer | NoteEvent[] | QuantizedScore |
| musicxml-builder | QuantizedScore | MusicXML string |
| export | Various | File download (MusicXML / MIDI / PDF) |

## Detection Strategy

- Primary: `@nicktomlin/basic-pitch` (ML-based, polyphonic, best for piano)
- Fallback: Autocorrelation-based monophonic pitch detection (WebAudioAPI)

## Quantization

- Auto BPM detection from inter-onset interval histogram
- Key signature detection via Krumhansl-Schmuckler algorithm
- Configurable: BPM, time signature, key signature, quantize precision
- Default: 4/4 time, 16th note precision

## Export Formats

- MusicXML 3.1 (standard notation interchange)
- MIDI (Standard MIDI File format 0)
- PDF (via browser print of OSMD SVG output)
