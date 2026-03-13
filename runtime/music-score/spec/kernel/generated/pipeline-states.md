# Pipeline States (generated)

> Auto-generated from [tables/pipeline-states.yaml](../tables/pipeline-states.yaml). Do not edit manually.

| State | Description | Transitions |
|-------|-------------|-------------|
| `idle` | No file loaded, awaiting upload | → decoding |
| `decoding` | Decoding audio to AudioBuffer | → loading-model, error |
| `loading-model` | Loading BasicPitch ML model | → detecting, error |
| `detecting` | Running pitch detection | → quantizing, error |
| `quantizing` | Quantizing to musical grid | → rendering, error |
| `rendering` | Building MusicXML + OSMD render | → complete, error |
| `complete` | Score rendered | → quantizing (re-quantize) |
| `error` | Pipeline failed | → idle |

## Notes

- `quantizing` is re-entrant (MS-PIPE-003): users can adjust BPM/key/time and re-quantize without re-detecting.
- `loading-model` has ACF fallback on failure (MS-PIPE-002).
