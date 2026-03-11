# Intake Contract

> Owner Domain: `MY-INT-*`

## MY-INT-001 Three-Phase Intake

Intake flow is fixed: `basic-info -> interest-tags -> interview`. Phases execute sequentially; earlier phases provide context for later ones. The `interest-tags` phase is a lightweight social-profile step: selected interests plus optional MBTI/current-focus hints. The interview phase replaces the former scenario-based intake with a conversational AI interview.

## MY-INT-002 Conversational Interview Structure

The interview is a multi-turn conversation between the user and an AI interviewer. Each turn produces structured output via `generateObject`: an assistant reply, trait signals, turn control metadata, and a memory digest. The interview runs for 7-12 turns (7 minimum valid turns required, 12 hard maximum).

## MY-INT-003 Trait Signal Key Format

Each turn may produce trait signals using dot-notation keys:

- `primary.<DnaPrimaryType>` — maps to `dnaPrimary` group (e.g. `primary.CARING`)
- `relationship.<Mode>` — maps to `relationshipMode` group (e.g. `relationship.SECURE`)
- `communication.formality.<Value>` — maps to `communicationFormality` group (e.g. `communication.formality.casual`)
- `communication.sentiment.<Value>` — maps to `communicationSentiment` group (e.g. `communication.sentiment.positive`)
- `secondary.<DnaSecondaryTrait>` — maps to `dnaSecondary` group (e.g. `secondary.HUMOROUS`)

Weights are integers from {-2, -1, 1, 2} and are additive across all turns. The final score per dimension is the sum of all signal weights for that dimension.

## MY-INT-004 Interview Coverage Policy

The AI interviewer is guided by a dynamic coverage note that softly steers follow-up questions towards uncovered trait dimensions, but only when natural within the current topic. Hard topic switches for coverage purposes are forbidden.

## MY-INT-005 Interview Neutrality

The AI interviewer must not ask direct personality meta-questions (e.g. "what kind of personality do you think you have?"). Trait signals are inferred from conversational content, not from self-assessment. This restriction applies to interview turns; explicit pre-interview social-profile fields are allowed.

## MY-INT-006 Interest Tag Pool

The predefined interest tag pool is defined in `tables/scenario-intake.yaml#interest_tag_pool`. Tags are grouped by category for UI presentation. The pool is a static dataset within the mod. Interest tags are also used to seed the opening interview topic.

## MY-INT-007 Lightweight Opener Context

The second intake phase may collect one lightweight opener field alongside interest tags: a current focus topic the user is likely to talk about right now. This field is used to shape interview openings and final persona synthesis, but does not replace trait extraction from interview turns.

## MY-INT-008 Self-Reported MBTI

Self-reported MBTI is optional and is collected in the second intake phase. When provided, the final persona must preserve that exact MBTI value. When omitted, MBTI falls back to synthesis from the interview-derived trait profile.
