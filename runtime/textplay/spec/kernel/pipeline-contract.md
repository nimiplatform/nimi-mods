# Pipeline Contract

> Owner Domain: `T-PIPE-*`

## T-PIPE-001 Execution Chain

Execution chain is fixed:

`received -> normalize -> filter-visibility -> build-prompt -> generate -> wrap-output -> persist-best-effort`

## T-PIPE-002 Ordered Preconditions

Each state precondition is mandatory and skip paths are forbidden.

## T-PIPE-003 Output Shape

`wrap-output` requires non-empty text and complete meta payload.

## T-PIPE-004 Persistence Semantics

Persistence is best effort and cannot block returned render output.
