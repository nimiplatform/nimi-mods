# Mint-You Spec AGENTS

> Conventions for AI agents working under `nimi-mods/runtime/mint-you/spec/`.

## Authoritative Structure

- `kernel/*.md`: Mint-You cross-domain contracts (`MY-*`).
- `kernel/tables/*.yaml`: authoritative fact sources.
- `kernel/generated/*.md`: generated views from YAML.
- `mint-you.md`: domain increments only.

## Key Fact Tables

- `field-provenance.yaml`: **Start here.** Maps every AgentDna/CreateAgentDto field to its data source.
- `scenario-intake.yaml`: Intake phases, interest tag pool, trait weight key format, scenario bank.
- `trait-dimensions.yaml`: Primary archetypes, secondary traits, relationship modes, resolvable groups.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- Update `kernel/tables/*.yaml` first, then align kernel/domain docs in the same change.
- Keep no-legacy mode and no compatibility shim.
- When adding a new field to CreateAgentDto or AgentDna, add its provenance entry to `field-provenance.yaml` in the same change.

## Mandatory Verification

1. `pnpm -C nimi-mods run generate:spec:mint-you-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:mint-you-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:mint-you-kernel-consistency`
4. `pnpm -C nimi-mods run check`
