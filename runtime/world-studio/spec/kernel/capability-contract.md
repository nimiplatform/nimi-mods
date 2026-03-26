# Capability Contract

> Owner Domain: `WS-CAP-*`

## WS-CAP-001 Manifest Identity Is Fixed

`modId`, `entry`, `styles`, `tabId`, and UI slots are fixed by table and must match runtime registration.

## WS-CAP-002 Capability List Is Explicit

World-Studio capabilities are explicit string keys from table source only. Wildcard grants are forbidden.

## WS-CAP-003 AI Dependencies Are Declared

`ai.consume` and required/optional AI dependencies are declared in manifest contract and must remain consistent with runtime usage.

## WS-CAP-004 Data Query Boundary Is Stable

World-Studio reads/writes world data only through declared `data.query.*` capabilities.

## WS-CAP-005 Manifest Validation Is Mandatory

Manifest shape validation must pass before runtime exposure. Because World-Studio is a UI runtime mod, `styles[]` is required.

## WS-CAP-006 Maintain Data Surfaces Are Fixed

World-Studio maintain reads and writes world data only through the current canonical surfaces:

- `state.get / state.commit`
- `core.world.by-id.get / core.worldview.by-id.get`
- `history.list / history.append`
- `bindings.list / bindings.batch-upsert / bindings.delete`

Legacy `maintenance.*`, `events.*`, `resource-bindings.*`, and `mutations.*` query faces are not part of the V2 contract.

## WS-CAP-007 Maintain Write Identity Is Stable

World-Studio maintain state/history writes use fixed mod-owned identity values:

- world state `targetPath = world-studio.workspace.world`
- world state `schemaId = world-studio.workspace.state`
- world state `schemaVersion = 1`
- world history `eventType = WORLD_EVENT`
- world history `schemaId = world-studio.history.append`
- world history `schemaVersion = 1`

Implementations must keep runtime constants, manifest capability declarations, and spec wording aligned.
