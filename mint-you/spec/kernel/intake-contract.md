# Intake Contract

> Owner Domain: `MY-INT-*`

## MY-INT-001 Three-Phase Intake

Intake flow is fixed: `basic-info -> interest-tags -> scenarios`. Phases execute sequentially; earlier phases provide context for later ones.

## MY-INT-002 Scenario Structure

Each scenario must declare: a situational narrative, 3-4 mutually exclusive choices, and per-choice trait weight mappings. Scenarios without trait mappings are forbidden.

## MY-INT-003 Trait Weight Schema

Each choice carries a weight map: `Record<TraitDimensionKey, number>`. Weights are additive across all scenarios. The final score per dimension is the sum of all selected choice weights for that dimension.

## MY-INT-004 Minimum Scenario Coverage

The scenario set must collectively cover all five resolvable trait groups: `dnaPrimary`, `relationshipMode`, `communicationFormality`, `communicationSentiment`, `dnaSecondary`. Each group must be targeted by at least two scenarios.

## MY-INT-005 Scenario Neutrality

Scenario narratives and choice labels must not reveal which trait they map to. Transparent trait labeling in user-facing text is forbidden.
