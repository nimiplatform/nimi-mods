# Audio Design Contract

## V-AUDIO-001: Beat Analysis Input

Audio design analyzes storyboard beats and emotional arc from `screenplay.beats` to determine BGM and SFX recommendations.

## V-AUDIO-002: BGM Recommendation

The pipeline invokes `audio-design-bgm` route stage (`runtime.ai.text.generate`) to recommend a BGM track. The output includes `BgmTrack` with `trackId`, `uri`, `durationMs`, `fadeInMs`, `fadeOutMs`, `volume`, `startOffsetMs`. Default values are governed by `AUDIO_DESIGN_POLICY`.

## V-AUDIO-003: SFX Layer Planning

The LLM response may include SFX plan entries. Each `SfxLayer` includes `sfxId`, `uri`, `startMs`, `endMs`, `volume`.

## V-AUDIO-004: AudioDesignOutput Schema

The output must conform to `AudioDesignOutputSchema` (Zod). Structure:
- `episodeId: string`
- `bgmTrack: BgmTrack | null`
- `sfxLayers: SfxLayer[]`

## V-AUDIO-005: Edit Compose Integration

The edit-compose stage injects `audioDesign.bgmTrack` and `audioDesign.sfxLayers` into the compose output. QC gate evaluates `audioCompletenessRatio` based on BGM presence.
