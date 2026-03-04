# Mint-You Domain Spec

> Status: Draft
> Date: 2026-03-04
> Scope: Behavioral personality profiling → social-persona agent creation → photo trust-unlock.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`MY-CAP-*`)
- Scenario intake: `kernel/intake-contract.md` (`MY-INT-*`)
- Profile synthesis: `kernel/profile-contract.md` (`MY-PROF-*`)
- Pipeline: `kernel/pipeline-contract.md` (`MY-PIPE-*`)
- Photo trust: `kernel/photo-contract.md` (`MY-PHOTO-*`)
- Error semantics: `kernel/error-model.md` (`MY-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`MY-ACC-*`)

## 1. Domain Invariants

- `MY-DOM-001`: Mint-You creates a `WORLD_OWNED` agent that represents the user's social persona within a target world. The agent serves all social scenarios — dating, friendship, professional networking, casual exploration.
- `MY-DOM-002`: Personality inference relies on behavioral scenario choices, not direct self-assessment questionnaires. Scenarios are the primary intake method.
- `MY-DOM-003`: Every scenario choice must map to at least one AgentDna dimension via `trait_weights`. Unmapped scenarios are forbidden.
- `MY-DOM-004`: Agent creation requires explicit user confirmation after persona card preview. No agent is created without user approval.
- `MY-DOM-005`: Generated DNA must conform to the nimi-realm AgentDna 5-dimensional schema (identity, biological, appearance, personality, communication). Every required field must have a defined provenance — user input, deterministic extraction, LLM synthesis, or hard-coded default.
- `MY-DOM-006`: The persona card is the primary user-facing artifact and must be renderable as a shareable image.
- `MY-DOM-007`: User can modify any inferred trait before agent creation. Modification triggers LLM re-synthesis of dependent fields only.
- `MY-DOM-008`: Agent `worldId` binding is mandatory. User selects target world before agent creation.
- `MY-DOM-009`: The user's real photo is private-by-default. It is stored via `referenceImageUrl` but never exposed to other users or agents without explicit mutual authorization. Agent behavior is never influenced by photo data.

## 2. Domain Increments — Intake & Creation

- `MY-DOM-010`: Intake flow collects data in three phases: basic info (form), interests (tag selection), behavioral scenarios (situational choices).
- `MY-DOM-011`: Basic info phase collects: display name, gender, age range, social intent. These map directly to `identity.name`, `biological.gender`, `biological.visualAge`, `personality.goals[0]`.
- `MY-DOM-012`: Interest tags phase provides a multi-select pool from a predefined tag list (see `tables/scenario-intake.yaml#interest_tag_pool`). Selected tags map to `personality.interests`.
- `MY-DOM-013`: Scenario phase presents 7-10 situational stories covering general social contexts. Each scenario has 3-4 choices, each choice carrying hidden trait weights across one or more dimensions.
- `MY-DOM-014`: Trait extraction aggregates weighted scores from all scenario choices, then resolves `dnaPrimary` (highest-scoring archetype) and `dnaSecondary` (top 2-3 modifying traits).
- `MY-DOM-015`: LLM synthesis takes structured trait scores + basic info + interests and generates all natural-language and inferred fields. Full output scope is defined in `tables/field-provenance.yaml`.
- `MY-DOM-016`: LLM synthesis also generates Identity Card fields: `greeting`, `exampleDialogue`, `systemPromptBase`, `rules`, `scenario`, `description`, `concept`. Note: `handle` is auto-generated programmatically (see `MY-PROF-007`), not LLM-synthesized.
- `MY-DOM-017`: Persona card preview displays: display name, primary archetype, secondary traits, social mode summary, communication style summary, and a sample greeting.
- `MY-DOM-018`: Agent creation payload assembles full `CreateAgentDto` including pre-built `dna` object to skip backend LLM generation.
- `MY-DOM-019`: Appearance and non-behavioral biological fields use hard-coded defaults appropriate for the social-persona context (see `tables/field-provenance.yaml`). These fields exist to satisfy AgentDna schema requirements but do not influence agent behavior.
- `MY-DOM-020`: Scenario content is stored as static data within the mod. No external data dependency for intake scenarios.

## 3. Domain Increments — Photo Trust

- `MY-DOM-021`: User may optionally upload a real photo during or after agent creation. The photo is stored as `referenceImageUrl` on the agent profile and drives platform avatar generation, but the original photo URL is access-controlled by the mod.
- `MY-DOM-022`: Photo visibility requires mutual authorization. User A initiates a photo-reveal request targeting User B's agent. User B must explicitly accept. Only when both directions are authorized does each user gain access to the other's `referenceImageUrl`.
- `MY-DOM-023`: Photo authorization is a user-level social action, not an agent-level action. Agents never reference, mention, or reason about photos in their interactions.
- `MY-DOM-024`: Photo authorization is revocable. Either user may revoke access at any time, immediately hiding their photo from the other party.
- `MY-DOM-025`: No automatic trigger exists for photo reveal. The decision to request or accept is entirely user-driven.

## 4. No Over-Design Guard

- `MY-DOM-030`: No cross-agent matchmaking scoring or compatibility algorithm is built into the mod. Social discovery happens organically through agent-to-agent interaction in worlds.
- `MY-DOM-031`: No cross-mod behavioral observation pipeline. Intake is self-contained within mint-you.
- `MY-DOM-032`: No agent lorebook generation from intake data. Agent knowledge base is empty at creation.
