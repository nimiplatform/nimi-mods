# MS-PIPE: Pipeline Contract

## MS-PIPE-001: Transcription pipeline states

The audio-to-score pipeline proceeds through a fixed sequence of states:

```
idle → decoding → loading-model → detecting → quantizing → rendering → complete
                                                                      ↘ error
```

Each state is observable via the progress bar component. Transitions are
forward-only except for `error`, which can occur from any active state.

## MS-PIPE-002: ML detection with fallback

Pitch detection attempts `@spotify/basic-pitch` (polyphonic ML model) first.
On model load failure (network, etc.), it falls back to autocorrelation-based
monophonic detection with a `console.warn` diagnostic.

## MS-PIPE-003: Quantization is re-entrant

Users can adjust BPM, time signature, key signature, and quantize precision,
then re-trigger quantization + rendering without re-running pitch detection.

See [tables/pipeline-states.yaml](tables/pipeline-states.yaml) for the state table.
