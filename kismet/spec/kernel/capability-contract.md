# Capability Contract

> Owner Domain: `KIS-CAP-*`

## KIS-CAP-001 Mod Identity Stability

`modId`, entry path, and manifest capability semantics must remain stable once released.

## KIS-CAP-002 Capability Source of Truth

Capability registry is authoritative in `tables/capabilities.yaml` and must match manifest/runtime registration.

## KIS-CAP-003 Allowed SDK Surfaces

Kismet AI path must use `@nimiplatform/sdk/mod/ai` surfaces.

## KIS-CAP-004 Forbidden Direct Vendor Calls

Do not encode direct vendor HTTP endpoints in mod business flow.
