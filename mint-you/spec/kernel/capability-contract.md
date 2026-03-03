# Capability Contract

> Owner Domain: `MY-CAP-*`

## MY-CAP-001 Manifest Identity Is Fixed

`modId`, `entry`, and UI registration identity are fixed by `tables/capabilities.yaml` and must match runtime registration.

## MY-CAP-002 Minimal Permission Policy

Mint-You must declare explicit minimum capability keys only. Wildcards and undeclared grants are forbidden.

## MY-CAP-003 LLM Boundary

Mint-You uses `llm.object.generate` for structured DNA synthesis. No streaming or free-text generation is required for v1.

## MY-CAP-004 Agent Creation Boundary

Mint-You creates agents through `data-api.creator.agents.create`. The mod must supply a complete `CreateAgentDto` payload including pre-built `dna` object.

## MY-CAP-005 Capability Drift Gate

Capability changes must update table source and pass kernel consistency checks in the same change.
