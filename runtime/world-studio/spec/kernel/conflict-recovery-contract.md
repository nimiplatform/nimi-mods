# Conflict Recovery Contract

> Owner Domain: `WS-CONFLICT-*`

## WS-CONFLICT-001 Optimistic Concurrency

Maintenance save and event sync use snapshot version checks by default.

## WS-CONFLICT-002 Conflict Error Mapping

Version conflicts must map to `WORLD_STUDIO_MAINTENANCE_CONFLICT` for UI handling.

## WS-CONFLICT-003 Reload Remote Behavior

Reload-remote refetches authoritative resources and replaces local unsaved snapshot state.

## WS-CONFLICT-004 Task Reload Recovery

Reloaded live tasks recover deterministically according to resumable capability.

## WS-CONFLICT-005 Recover Event Emission

Recovered paused task must emit one recover task event for audit visibility.
