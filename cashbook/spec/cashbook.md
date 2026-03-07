# Cashbook Domain Spec

> Status: Draft
> Date: 2026-03-04
> Scope: Cashbook business increments only.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`CSB-CAP-*`)
- Transaction parsing pipeline: `kernel/pipeline-contract.md` (`CSB-PIPE-*`)
- Enrichment contract: `kernel/enrichment-contract.md` (`CSB-ENR-*`)
- Error semantics: `kernel/error-model.md` (`CSB-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`CSB-ACC-*`)

## 1. Domain Invariants

- `CSB-DOM-001`: Cashbook provides conversational expense tracking and asset analysis inside desktop mod runtime.
- `CSB-DOM-002`: Every transaction preserves immutable `rawInput` (original text or voice transcription) as authoritative data source.
- `CSB-DOM-003`: Structured fields are a progressive cache derived from `rawInput`; never the primary source of truth.
- `CSB-DOM-004`: LLM parsing must produce confirmed structured output before persisting; user confirmation is required for ambiguous entries.
- `CSB-DOM-005`: All AI interactions must use `@nimiplatform/sdk/mod/ai` surfaces.
- `CSB-DOM-006`: Voice input flows through STT transcription first, then enters the same text parsing pipeline.
- `CSB-DOM-007`: Query mode injects relevant transaction raw data into LLM context for natural language answers.

## 2. Domain Increments

- `CSB-DOM-010`: Parser supports single-input multi-transaction extraction ("吃麦当劳 45，打车回家 30" → 2 records).
- `CSB-DOM-011`: Category system is hierarchical: top-level category + freeform subcategory. LLM may create new subcategories.
- `CSB-DOM-012`: Multi-currency support with explicit currency detection from natural language context.
- `CSB-DOM-013`: Subscription detection: recurring transactions with similar description/amount are flagged as potential subscriptions.
- `CSB-DOM-014`: Budget system supports per-category monthly limits with threshold alerts.
- `CSB-DOM-015`: Retroactive enrichment can extract any dimension from raw records on demand, caching results for future queries.
- `CSB-DOM-016`: Related person extraction supports both explicit mention and LLM inference with confidence marking.
- `CSB-DOM-017`: Analytics aggregation supports arbitrary time ranges and grouping dimensions.
- `CSB-DOM-018`: User-facing strings require zh/en i18n coverage.
- `CSB-DOM-019`: Asset snapshots track account balances over time for net worth trend analysis.

## 3. No Over-Design Guard

- `CSB-DOM-020`: No direct vendor `/chat/completions` URL contract is introduced.
- `CSB-DOM-021`: No cloud sync/telemetry auto-upload contract is introduced.
- `CSB-DOM-022`: No bank API integration or automatic transaction import is introduced.
- `CSB-DOM-023`: No multi-user / shared household accounting is introduced.
- `CSB-DOM-024`: No tax calculation or regulatory compliance features are introduced.
