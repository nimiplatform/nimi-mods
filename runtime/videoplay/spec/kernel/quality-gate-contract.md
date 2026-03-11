# Quality Gate Contract

> Owner Domain: `V-QC-*`

## V-QC-001 Mandatory Gates

Grounded ratio, asset coverage, voice coverage, duration, AV drift, and visual attraction are mandatory quality gates.

## V-QC-002 Fail-Close

Any failed quality gate blocks release package creation.

## V-QC-003 Visual Attraction Formula

Weighted components must sum to 1 and each component has minimum score gate.

## V-QC-004 Voice Coverage Gate

When asset analysis plans voice modality, rendered voice coverage ratio must satisfy the mandatory threshold before release.

## V-QC-005 Character Consistency Gate

Character visual consistency score across shots must satisfy the mandatory threshold. Measures how well character appearances remain stable across the episode.

## V-QC-006 Photography Compliance Gate

Photography compliance score must satisfy the mandatory threshold. Measures adherence to cinematography rules (composition, lighting, color palette) specified in storyboard.

## V-QC-007 Acting Quality Gate

Acting quality score must satisfy the mandatory threshold. Measures how well character acting directions are reflected in rendered assets.

## V-QC-008 Audio Completeness Gate

Audio completeness ratio must satisfy the mandatory threshold. Measures BGM and SFX layer coverage relative to the episode timeline.

## V-QC-009 Selection Coverage Gate

Selection coverage ratio must satisfy the mandatory threshold. Measures selected timeline segment count versus rendered video segment count.

## V-QC-010 Selection Rationality Gate

Selection rationality score must satisfy the mandatory threshold. Measures selection order/trim validity and overlap-free timeline construction. The gate does not evaluate per-shot variant correctness.
