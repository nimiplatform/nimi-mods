# Version Lineage Contract

> Owner Domain: `V-LINEAGE-*`

## V-LINEAGE-001 Version Event Shape

Version event required fields are authoritative in `tables/version-lineage-policy.yaml`.

## V-LINEAGE-002 Branch Scope

Undo and redo are branch-scoped and cannot cross branch boundaries.

## V-LINEAGE-003 Merge Audit

Branch merge must emit conflict records and merge resolution audit.

## V-LINEAGE-004 Immutable History

Version lineage is append-only. Existing lineage nodes must not be rewritten.
