# Prompt Governance Contract

> Owner Domain: `V-PROMPT-*`

## V-PROMPT-001 Prompt Registry

All production prompts must be registered by stable `PromptID` and mapped to explicit template scope.

## V-PROMPT-002 Variable Schema Validation

Prompt template variables must pass schema validation before rendering.

## V-PROMPT-003 Structured Output Contract

Prompt outputs that require structure must bind to JSON shape contract with required fields.

## V-PROMPT-004 Multi-Locale Placeholder Consistency

Different locale templates must keep placeholder parity.

## V-PROMPT-005 Canary Baseline

Prompt canary coverage is authoritative in `tables/prompt-canary-cases.yaml` and must run in regression gate.

## V-PROMPT-006 Catalog/Template Drift Guard

Prompt registry IDs, template scopes, and placeholder sets must stay in sync under automated drift checks.
