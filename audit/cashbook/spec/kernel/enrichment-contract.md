# Enrichment Contract

> Owner Domain: `CSB-ENR-*`

## CSB-ENR-001 Retroactive Parsing Capability

When a query requires dimensions not present in structured cache, LLM must be able to batch-load relevant `rawInput` records and extract new structured fields.

## CSB-ENR-002 Progressive Cache Model

Enriched fields are merged into the transaction's `enriched` map with timestamp. Once enriched, the dimension is cached for future queries without re-parsing.

## CSB-ENR-003 Open Dimension Schema

The `enriched` map is open-ended. New dimensions (relatedPerson, location, occasion, sentiment, etc.) can be added at any time without schema migration.

## CSB-ENR-004 Confidence Marking

LLM-inferred enrichment fields that are not explicitly stated in rawInput must carry a confidence indicator (`inferred: true`). Users may confirm or reject inferred values.

## CSB-ENR-005 Batch Enrichment Efficiency

Retroactive enrichment should batch multiple records in a single LLM call where feasible, to minimize round-trips.

## CSB-ENR-006 Enrichment Idempotency

Re-enriching an already-enriched dimension for the same record must produce the same result or update if rawInput context provides new signals. Enrichment must not corrupt existing confirmed fields.
