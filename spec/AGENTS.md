# Mods Spec AGENTS.md

> Conventions for AI agents working under `nimi-mods/spec/**` and `nimi-mods/*/spec/**`.

## Scope

Applies to:

- `spec/mod/**` (cross-mod contracts)
- `*/spec/**` (single-mod specs)

## Authoritative Structure

- `kernel/*.md`: cross-domain rule contracts.
- `kernel/tables/*.yaml`: structured fact sources (authoritative data layer).
- `kernel/generated/*.md`: generated views from YAML tables.
- Domain docs (`spec/<mod>.md`, `spec/mod/*.md`): domain increments only, with rule references. Do not duplicate kernel prose.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- When behavior/contract facts change, edit YAML tables first, then align kernel/domain references in the same change.
- Keep runtime/sdk/desktop boundaries explicit; do not define host internals inside mod specs.
- Cross-mod chain contracts belong to `spec/mod/**`; single-mod specs must reference them instead of redefining shared protocol fields.

## Mandatory Verification Commands

Run commands based on changed scope.

If `<mod>/spec/kernel/tables/*.yaml` changed:

1. `pnpm -C nimi-mods run generate:spec:<mod>-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:<mod>-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:<mod>-kernel-consistency`

If multiple mods changed, run all affected commands.

For full repo spec verification:

1. `pnpm -C nimi-mods run generate:spec`
2. `pnpm -C nimi-mods run check:spec`

## PR/Report Expectation

- Include exact verification commands executed.
- Include pass/fail result for each command.
- If a command is not run, state why.
