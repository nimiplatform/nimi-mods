# Acceptance Contract

> Owner Domain: `VS-ACC-*`
> Authoritative fact source: `tables/acceptance-cases.yaml`

## VS-ACC-001 — Table-Driven Acceptance

- Acceptance cases must be declared in `tables/acceptance-cases.yaml`.
- Verification commands in that table are normative and must stay executable in the repo.

## VS-ACC-002 — Required Coverage

- Acceptance must cover:
  - import and chapter splitting
  - analysis chunking / retry behavior
  - character tiering and voice casting readiness
  - synthesis queue retry / non-blocking completion semantics
  - route-scoped voice listing and TTS synthesis
