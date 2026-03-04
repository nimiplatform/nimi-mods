# Knowledge Base Spec — Authoring Rules

> Scope: all files under `nimi-mods/knowledge-base/spec/**`

## Rule ID Prefixes

| Prefix | Domain | Document |
|--------|--------|----------|
| KB-DOM-* | Core entities | `kernel/domain-contract.md` |
| KB-PIPE-* | Document processing pipeline | `kernel/pipeline-contract.md` |
| KB-RAG-* | RAG retrieval & generation | `kernel/rag-contract.md` |
| KB-CAP-* | Capabilities & integration | `kernel/capability-contract.md` |

## Authoritative Hierarchy

1. **YAML tables** (`kernel/tables/*.yaml`) — single source of truth for enumerations, state machines, entity schemas.
2. **Kernel contracts** (`kernel/*.md`) — rule-driven documents referencing YAML tables. Define business rules with KB-* IDs.
3. **Domain documents** (`*.md` at spec root) — thin navigation guides. Reference kernel Rule IDs, do NOT define new rules.

## Editing Rules

- When entity fields change: edit `tables/entities.yaml` first, then align `kernel/domain-contract.md`.
- When states change: edit `tables/document-states.yaml` first, then align `kernel/pipeline-contract.md`.
- When error codes change: edit `tables/error-codes.yaml` first, then align referencing contracts.
- When capabilities change: edit `tables/capabilities.yaml` first, then align `kernel/capability-contract.md` and `mod.manifest.yaml`.
- Domain docs must NOT define new Rule ID systems or contract-style sections.

## Domain Doc Constraints

Domain documents (`knowledge-base.md`, `frontend.md`) are navigation aids only:

- DO: positioning, module map, reading paths, non-goals
- DO NOT: `领域不变量`, `验收门`, `变更规则` style sections
- DO NOT: define new Rule IDs (only reference existing KB-* IDs)
- DO NOT: duplicate kernel prose

## Source Code Alignment

- `src/types.ts` entity shapes must match `tables/entities.yaml` field definitions.
- `src/contracts.ts` capability keys must match `tables/capabilities.yaml`.
- `mod.manifest.yaml` must match `tables/capabilities.yaml` total count.
