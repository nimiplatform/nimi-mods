# Compatibility Contract

> Owner Domain: `KIS-COMP-*`

## KIS-COMP-001 Local-Only Match Profiles

Compatibility uses local share profiles only.
These profiles contain derived fields and MUST exclude raw birth time, raw birth place text, and full pillar strings.

## KIS-COMP-002 Deterministic Base Score

Compatibility score MUST be computed before prompt execution from deterministic profile features.
LLM output is explanatory only.

## KIS-COMP-003 Input Modes

Compatibility MUST support:

1. manual second birth intake
2. local saved derived profile selection

## KIS-COMP-004 No Platform Match Path

Platform-user matching is explicitly out of scope for this version and MUST NOT be simulated through non-standard SDK calls.
