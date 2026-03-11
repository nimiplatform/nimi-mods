# Visibility POV Contract

> Owner Domain: `T-VIS-*`

## T-VIS-001 Visibility Enum Gate

Only `public|internal|sensory` are valid visibility values.

## T-VIS-002 Internal Visibility Rule

Internal events are kept only when actor equals player according to actor field priority.

## T-VIS-003 Dual Constraint

Visibility filter and POV filter are both mandatory. Disabling either is protocol violation.

## T-VIS-004 Invalid Visibility Behavior

Invalid visibility rejects render request.
