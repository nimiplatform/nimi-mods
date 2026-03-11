# Error Model

> Owner Domain: `VS-ERR-*`
> Authoritative fact source: `tables/reason-codes.yaml`

## VS-ERR-001 — Reason Code Source

- All user-visible and audit-visible failure codes must be declared in `tables/reason-codes.yaml`.
- Domain documents may reference reason codes but must not introduce undeclared codes.

## VS-ERR-002 — Structured Envelope

- Audio Book errors must preserve `reasonCode`, machine-readable detail, and actionable user message.
- When a runtime call already returns a structured reason code, Audio Book must forward it instead of collapsing it to a generic local error.

## VS-ERR-003 — Fail-Close Boundaries

- Import validation failures, missing castings, invalid route/binding resolution, and provider-hard failures must fail close.
- Audio Book must not fabricate available voices, successful synthesis jobs, or playable audio output.

## VS-ERR-004 — Non-Blocking Degradation

- Chapter-level analysis failures and segment-level synthesis failures may degrade to warning/non-blocking outcomes when the project can continue safely.
- Any degradation must remain explicit in state, progress, and retry surfaces.
