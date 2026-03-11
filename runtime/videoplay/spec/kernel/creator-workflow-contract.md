# Creator Workflow Contract

> Owner Domain: `V-OPS-*`

## V-OPS-001 Operation Dictionary

Creator operation dictionary is authoritative in `tables/creator-operations.yaml`.

## V-OPS-002 Minimal Closed Loop

The minimum creator loop must support insert/update/delete/regenerate/variant/undo/link/first-last-frame/voice/lip-sync/branch-switch.

## V-OPS-003 Continuity Constraints

Continuity constraints are capability rules, not UI-component bindings, and are authoritative in `tables/continuity-constraints.yaml`.

## V-OPS-004 Rebuild Impact Scope

Every creator operation must declare minimum rebuild scope (`shot|adjacent+compose|clip+compose|post-segmentation`).

## V-OPS-005 Operation Audit

Every creator operation must emit auditable operation event with version and branch context.

## V-OPS-006 Generate-Voice-Line Must Be Real TTS

`generate-voice-line` creator operation must execute runtime speech synthesis (`runtime.media.tts.synthesize`) via route contracts and persist real voice audio assets. A synthetic script-only placeholder cannot be treated as completed voice generation.

## V-OPS-007 Stage-Scoped Editing Contract

Creator operations must be available through stage-scoped editing surfaces (`script|storyboard|voice|video`) and must emit rebuild scope preview before rerun.

## V-OPS-008 Explicit Stage Advance Contract

After stage edits, downstream progression must require explicit `advance` action and cannot auto-run subsequent stages without creator confirmation.
