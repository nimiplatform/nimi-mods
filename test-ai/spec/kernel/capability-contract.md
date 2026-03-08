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
