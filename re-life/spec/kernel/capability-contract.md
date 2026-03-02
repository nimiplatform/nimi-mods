# Capability Contract

> Owner Domain: `RL-CAP-*`

## RL-CAP-001 Manifest Capability Source of Truth

Capability registry in `tables/capabilities.yaml` must match manifest and runtime registration.

## RL-CAP-002 Structured Generation Surfaces

Re-Life must use `llm.object.generate` for structured graph/tree generation.

## RL-CAP-003 Share and Metrics Data Boundary

Share and metrics data APIs are explicit capability contracts and must remain table-driven.

## RL-CAP-004 Allowed SDK Surfaces

Business code must use stable `@nimiplatform/sdk/mod/*` surfaces only.
