# Capability Contract

> Owner Domain: `CSB-CAP-*`

## CSB-CAP-001 Mod Identity Stability

`modId`, entry path, and manifest capability semantics must remain stable once released.

## CSB-CAP-002 Capability Source of Truth

Capability registry is authoritative in `tables/capabilities.yaml` and must match manifest/runtime registration.

## CSB-CAP-003 Allowed SDK Surfaces

Cashbook AI path must use `@nimiplatform/sdk/mod/ai` surfaces.

## CSB-CAP-004 Forbidden Direct Vendor Calls

Do not encode direct vendor HTTP endpoints in mod business flow.

## CSB-CAP-005 Voice Input via STT Capability

Voice input requires `llm.speech.transcribe` capability; transcription feeds into the standard text parsing pipeline.

## CSB-CAP-006 Data Provider Registration

Cashbook must register data providers for transaction CRUD and analytics queries, enabling cross-mod data access.
