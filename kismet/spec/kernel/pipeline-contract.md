# Pipeline Contract

> Owner Domain: `KIS-PIPE-*`

## KIS-PIPE-001 Dual Entry Contract

Kismet has two entries: `prompt-import` and `runtime-ai`, both converging to one unified result contract.

## KIS-PIPE-002 Unified Result Validation

Both entries must pass the same JSON extraction and schema validation pipeline.

## KIS-PIPE-003 Route Failure Fallback

Runtime route unavailable must surface structured error and fallback guidance to prompt-import.

## KIS-PIPE-004 Export Trigger Policy

Exports are explicit user-triggered actions only.
