---
title: Nimi World-Studio Mod SSOT
status: ACTIVE
version: 2026-03-02-v2
updated_at: 2026-03-02
rules:
  - This file defines World-Studio boundary and invariants only; executable contracts live in `spec/kernel/*`.
  - World-Studio is event-centric: `events.primary/events.secondary` are first-class objects; chapter text is only source input.
  - World-Studio pipeline is fixed to CREATE + MAINTAIN with single-flight task control.
  - Distill stage chain is fixed: `INGEST -> COARSE -> FINE -> MERGE -> CHECKPOINTS -> SYNTHESIZE -> DRAFT -> PUBLISH`.
  - Route override scope is local to World-Studio and persisted per-user; no global runtime route mutation.
  - Quality gate is fail-close: BLOCK must stop synthesize progression.
  - Project is pre-launch: no legacy compatibility layer, no dual-write, no transition shell.
---

# Nimi World-Studio SSOT

## 1. Goal and Positioning

World-Studio is the world-asset creation and maintenance studio in mods runtime.

It owns:

1. Landing and split flow: `NO_ACCESS | CREATE | MAINTAIN`.
2. Structured extraction from source into event-centric draft graph.
3. Draft synthesize/publish and maintenance updates through world APIs.
4. Task governance: single-flight, pause/resume/cancel, conflict reload recovery.

It does not own:

1. Narrative/TextPlay/VideoPlay rendering behavior.
2. Runtime route engine internals.
3. Realm domain storage implementation details.

## 2. Fact Boundary (Frozen)

1. `realm`: base world/agent data APIs.
2. `world-studio`: world draft and maintenance producer.
3. downstream mods (`narrative/textplay/videoplay`): consumers of published world projection.

## 3. SSOT -> Spec -> Code Mapping

### 3.1 Layers

1. SSOT: boundary, principles, invariants (this file).
2. Spec Kernel: executable contracts + fact tables (`spec/kernel/*.md`, `spec/kernel/tables/*.yaml`).
3. Spec Domain: business increments only (`spec/world-studio.md`).
4. Code: implementation/tests under `src/` and `test/`.

### 3.2 Single Spec Entry

1. [spec/INDEX.md](./spec/INDEX.md)

All implementation/review changes must start from `spec/INDEX.md`.

### 3.3 Verification Commands

1. `pnpm -C nimi-mods run generate:spec:world-studio-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:world-studio-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:world-studio-kernel-consistency`

## 4. Acceptance Gates

1. `WS-CAP-*`: manifest/capabilities/AI dependency contract must match code constants.
2. `WS-TASK-*`: task lifecycle and single-flight behavior must remain deterministic.
3. `WS-PIPE-*`: create/distill/maintain/publish chains must remain ordered and non-skippable.
4. `WS-ROUTE-*`: route readiness and embedding readiness reason codes must remain stable.
5. `WS-QG-*`: quality gate thresholds and issue catalog must remain fail-close.
6. `WS-CONFLICT-*`: optimistic concurrency, reload replacement, and reload recovery must stay deterministic.
7. `WS-ERR-*` and `WS-ACC-*`: reason-code registry and acceptance coverage must remain table-driven.

## 5. Contract Relations

1. cross-mod chain: `ssot/mod/worldstudio-narrative-rendering.md`
2. mod governance: `ssot/mod/governance.md`
3. realm world boundary: `ssot/boundaries/world.md`
4. runtime routing boundary: `ssot/runtime/local-runtime.md`
5. narrative mod: `nimi-mods/narrative/SSOT.md`
6. textplay mod: `nimi-mods/textplay/SSOT.md`
7. videoplay mod: `nimi-mods/videoplay/SSOT.md`
