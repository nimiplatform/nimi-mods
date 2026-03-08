# Capability Contract

> Owner Domain: `TAI-CAP-*`

## TAI-CAP-001 Capability Registry

Capability registry in `tables/capabilities.yaml` is authoritative. All 19 capabilities must be declared, including:

- sync image diagnostics (`runtime.media.image.generate`)
- async image diagnostics (`runtime.media.jobs.submit|get|cancel|subscribe|get.artifacts`)
- LocalAI companion artifact discovery (`runtime.local.artifacts.list`)

## TAI-CAP-002 Diagnostics Surface

Mod scope is diagnostics and smoke validation for all 8 AI capabilities: text generation, text embedding,
image generation, video generation, audio synthesis, audio transcription, voice cloning, and voice design.

For LocalAI image diagnostics, Test-AI is expected to maximize testability instead of optimizing for a single business workflow:

- layered preset companion selectors cover `vae`, `llm`, `clip`, `controlnet`, `lora`, and `auxiliary`
- custom slot rows remain available for non-standard LocalAI workflow layouts
