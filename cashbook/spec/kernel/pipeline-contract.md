# Pipeline Contract

> Owner Domain: `CSB-PIPE-*`

## CSB-PIPE-001 Dual Input Contract

Cashbook accepts two input modes: `text` (typed natural language) and `voice` (audio → STT → text). Both converge to the same parsing pipeline after transcription.

## CSB-PIPE-002 Raw Preservation Invariant

Every transaction must store the original `rawInput` text immutably. Structured fields are derived caches, never the authoritative source.

## CSB-PIPE-003 Multi-Transaction Extraction

A single user input may describe multiple transactions. Parser must extract all transactions from one input and present them for confirmation.

## CSB-PIPE-004 Structured Output Validation

LLM-parsed transactions must pass Zod schema validation before persistence. Invalid outputs must fail-close and prompt retry.

## CSB-PIPE-005 User Confirmation Gate

Parsed transactions are presented to the user for confirmation before storage. Ambiguous fields (inferred category, uncertain amount) must be visually flagged.

## CSB-PIPE-006 Query Pipeline

Query mode injects relevant raw records into LLM context. LLM answers in natural language with cited amounts and categories. Query must not mutate stored data.

## CSB-PIPE-007 Voice Transcription Pipeline

Voice input → STT transcription → rawInput text → standard parsing pipeline. The transcribed text becomes the `rawInput` with `source: 'voice'`.
