# Capability Contract

> Owner Domain: `LC-CAP-*`

## LC-CAP-001 Manifest Capability Source of Truth

Capability registry in `tables/capabilities.yaml` must match manifest and runtime registration surfaces.

## LC-CAP-002 Allowed SDK Surfaces

Local-Chat business paths may use only stable `@nimiplatform/sdk/mod/*` exports.

## LC-CAP-003 Speech Capability Governance

Speech calls must use declared speech capabilities and structured request fields.

## LC-CAP-004 Route Query Boundary

Runtime route options are read-only query capabilities from mod side.

## LC-CAP-005 Core Data Query Boundary

Core social/world/memory reads must use explicit `data.query.data-api.core.*` capability declarations.
