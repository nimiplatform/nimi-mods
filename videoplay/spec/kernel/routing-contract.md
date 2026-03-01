# Routing Contract

> Owner Domain: `V-ROUTE-*`

## V-ROUTE-001 Route Sources

Preferred route source is `local-runtime`, fallback is `token-api`.

## V-ROUTE-002 Stage Capability Mapping

Each production stage maps to explicit runtime capability.

## V-ROUTE-003 Dual-Unavailable Failure

When both preferred and fallback routes are unavailable, stage fails with declared reason code.

## V-ROUTE-004 Fallback Audit

Fallback events must emit auditable trace fields.

## V-ROUTE-005 Vendor Access Ban

Mod direct vendor API calls are forbidden.
