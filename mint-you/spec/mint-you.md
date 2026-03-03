# Mint-You Domain Spec

> Status: Draft
> Date: 2026-03-03
> Scope: Behavioral personality profiling and dating-persona agent creation.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`MY-CAP-*`)
- Scenario intake: `kernel/intake-contract.md` (`MY-INT-*`)
- Profile synthesis: `kernel/profile-contract.md` (`MY-PROF-*`)
- Pipeline: `kernel/pipeline-contract.md` (`MY-PIPE-*`)
- Error semantics: `kernel/error-model.md` (`MY-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`MY-ACC-*`)

## 1. Domain Invariants

- `MY-DOM-001`: Mint-You creates a `WORLD_OWNED` agent that represents the user's dating persona within a target world.
- `MY-DOM-002`: Personality inference relies on behavioral scenario choices, not direct self-assessment questionnaires. Scenarios are the primary intake method.
- `MY-DOM-003`: Every scenario choice must map to at least one AgentDna dimension. Unmapped scenarios are forbidden.
- `MY-DOM-004`: Agent creation requires explicit user confirmation after persona card preview. No agent is created without user approval.
- `MY-DOM-005`: Generated DNA must conform to the nimi-realm AgentDna 5-dimensional schema (identity, biological, appearance, personality, communication).
- `MY-DOM-006`: The persona card is the primary user-facing artifact and must be renderable as a shareable image.
- `MY-DOM-007`: User can modify any inferred trait before agent creation. Modification triggers LLM re-synthesis of dependent fields only.
- `MY-DOM-008`: Agent `worldId` binding is mandatory. User selects target world before agent creation.

## 2. Domain Increments

- `MY-DOM-010`: Intake flow collects data in three phases: basic info (form), interests (tag selection), behavioral scenarios (situational choices).
- `MY-DOM-011`: Basic info phase collects: display name, gender, age range, relationship intent. These map directly to `identity.name`, `biological.gender`, `biological.visualAge`.
- `MY-DOM-012`: Interest tags phase provides a multi-select pool. Selected tags map to `personality.interests`.
- `MY-DOM-013`: Scenario phase presents 7-10 situational stories. Each scenario has 3-4 choices, each choice carrying hidden trait weights across one or more dimensions.
- `MY-DOM-014`: Trait extraction aggregates weighted scores from all scenario choices, then resolves `dnaPrimary` (highest-scoring archetype) and `dnaSecondary` (top 2-3 modifying traits).
- `MY-DOM-015`: LLM synthesis takes structured trait scores + basic info + interests and generates: `identity.summary`, `identity.role`, `identity.worldview`, `personality.summary`, `personality.relationshipMode`, `personality.goals`, `communication.summary`, `communication.responseLength`, `communication.formality`, `communication.sentiment`.
- `MY-DOM-016`: LLM synthesis also generates Identity Card fields: `greeting`, `exampleDialogue`, `systemPromptBase`, `rules`, `scenario`, `description`.
- `MY-DOM-017`: Persona card preview displays: display name, dnaPrimary label, dnaSecondary labels, relationship mode summary, communication style summary, and a sample greeting.
- `MY-DOM-018`: Agent creation payload assembles full `CreateAgentDto` including pre-built `dna` object to skip backend LLM generation.
- `MY-DOM-019`: Biological and appearance dimensions use sensible defaults when not explicitly provided. User may override in the preview phase.
- `MY-DOM-020`: Scenario content is stored as static data within the mod. No external data dependency for intake scenarios.

## 3. No Over-Design Guard

- `MY-DOM-030`: No cross-agent matchmaking or compatibility scoring is introduced in v1. Agent creation is the terminal output.
- `MY-DOM-031`: No real-time agent-to-agent conversation simulation is introduced in v1.
- `MY-DOM-032`: No cross-mod behavioral observation pipeline is introduced in v1. Intake is self-contained.
- `MY-DOM-033`: No agent lorebook generation from intake data is introduced in v1. Agent knowledge is empty at creation.
- `MY-DOM-034`: No visual/avatar generation pipeline is introduced. `referenceImageUrl` is optional user-provided.
