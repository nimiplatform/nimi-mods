# Acceptance Contract

> Owner Domain: `V-ACC-*`

## V-ACC-001 Table-Driven Cases

Acceptance behavior is authoritative in `tables/acceptance-cases.yaml`.

## V-ACC-002 Minimum Coverage

Coverage includes segmentation determinism, route fallback audit, asset-analysis + batch/queue orchestration visibility, voice-first render subflow ordering, creator-side real-TTS voice generation, voice coverage reject paths, idempotent replay, AV drift reject, visual attraction reject, story catalog primary-only filtering, story package readiness fail-close paths, and checkpointed stepwise execution semantics (`run/continue/rerun/cancel`).

## V-ACC-003 Verification Commands

All checks must pass:

1. kernel docs generation
2. docs drift check
3. consistency check
