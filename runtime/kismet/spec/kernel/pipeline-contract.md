# Pipeline Contract

> Owner Domain: `KIS-PIPE-*`

## KIS-PIPE-001 Canonical Natal Chain

The canonical natal chain is authoritative in `tables/pipeline-states.yaml` and MUST include:

`birth-intake -> birth-normalize -> pillar-derive -> canonical-profile-validate -> natal-analysis-generate -> city-affinity-score -> render`

## KIS-PIPE-002 Daily Subflow

Daily fortune is a subflow that starts from a canonical profile and local day context.

## KIS-PIPE-003 Compatibility Subflow

Compatibility is a subflow that checks consent, loads local derived profiles, computes a deterministic score, then generates explanatory JSON.

## KIS-PIPE-004 Prompt Import Fallback

If runtime AI generation cannot route, Kismet MUST preserve structured error metadata and present prompt-import fallback for the active generation kind.

## KIS-PIPE-005 Export Trigger Policy

Exports remain explicit user-triggered actions only.
