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

## T-PIPE-005 Language Resolution

- `promptLanguage` is resolved from the active UI locale and normalized to `en|zh`.
- `storyLanguage` is resolved exactly once on explicit `Start`.
- Resolution order is fixed:
  `worldPrimaryLanguage ?? agentLanguage ?? promptLanguage`
- `Resume`, `Restart`, and draft switching must reuse the persisted `storyLanguage`.
- Language governance must not insert new user-visible steps or change the existing state-machine order.

## T-PIPE-006 Prompt Shell vs Narrative Output

- Prompt shell copy and briefing templates follow `promptLanguage`.
- Player-facing narrative output must be explicitly locked to `storyLanguage`, even when prompt shell copy uses another language.
