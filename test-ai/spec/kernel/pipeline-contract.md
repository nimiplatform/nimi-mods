# Pipeline Contract

> Owner Domain: `TAI-PIPE-*`

## TAI-PIPE-001 Text Generate Diagnostics Flow

Text generation diagnostics flow must include route query and one-shot generation result validation.

## TAI-PIPE-002 Text Embed Diagnostics Flow

Text embedding flow must include route query, embedding generation, and dimension/preview validation.

## TAI-PIPE-003 Image Generate Diagnostics Flow

Image diagnostics flow must support both:

- sync text-to-image request: normalize inputs, execute `runtime.media.image.generate`, render generated image preview and structured raw response.
- async image job request: normalize inputs, execute `runtime.media.jobs.submit`, subscribe/watch the job lifecycle, fetch artifacts on terminal completion, and render generated image preview plus structured diagnostics.

For LocalAI dynamic image workflows, the UI must fail-close before submit when no explicit companion artifact selections are present.
Test-AI must expose the full LocalAI companion test surface in layers: preset selectors for `vae` / `llm` / `clip` / `controlnet` / `lora` / `auxiliary`, plus custom slot rows for non-standard workflow shapes.
Companion artifact selections and `profile_overrides` must flow through the sync and async image paths unchanged once the user has selected them.
If a terminal image job completes but artifact fetch fails, the UI must surface an explicit artifact-fetch error instead of silently rendering an empty success state.

## TAI-PIPE-004 Video Generate Diagnostics Flow

Video diagnostics flow must support t2v and i2v modes: normalize inputs, execute
`runtime.media.video.generate`, render job ID and video URL output.

## TAI-PIPE-005 Audio Synthesize Diagnostics Flow

TTS diagnostics flow must include voice list, synthesize, and audio playback verification.

## TAI-PIPE-006 Audio Transcribe Diagnostics Flow

STT diagnostics flow must include route query, audio URL input, transcription execution, and text output.

## TAI-PIPE-007 Voice Clone Diagnostics Flow

Voice clone diagnostics flow captures input shape (ref audio URL, target model) for future SDK integration.

## TAI-PIPE-008 Voice Design Diagnostics Flow

Voice design diagnostics flow captures input shape (instruction text) for future SDK integration.
