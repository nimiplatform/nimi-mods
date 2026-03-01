# Pipeline Contract

> Owner Domain: `N-PIPE-*`

## N-PIPE-001 Execution Chain

Execution chain is fixed:

`step0(intent) -> step1(assembly) -> step2(generate) -> step3(guard) -> write-spine`

## N-PIPE-002 Ordered Preconditions

Each stage has explicit preconditions and must execute in order. No stage skip is allowed.

## N-PIPE-003 Guard Outcomes

Guard outcomes are fixed to `APPROVED|ADJUSTED|REJECTED`.

## N-PIPE-004 Reject Semantics

`REJECTED` is terminal and must never write spine.

## N-PIPE-005 Adjusted Semantics

`ADJUSTED` must write adjusted output and keep adjustment reason in check result.

## N-PIPE-006 Auditable Completion

Every completion path must be auditable with request ID and checker trace.
