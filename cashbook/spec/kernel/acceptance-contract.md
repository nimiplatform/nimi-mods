# Acceptance Contract

> Owner Domain: `CSB-ACC-*`

## CSB-ACC-001 Table-Driven Acceptance

Acceptance matrix is authoritative in `tables/acceptance-cases.yaml`.

## CSB-ACC-002 Required Coverage

Minimum acceptance coverage must include:

1. Text input → single transaction parse success
2. Text input → multi-transaction parse success
3. Voice input → STT → parse success
4. Query mode → natural language answer with correct aggregation
5. Retroactive enrichment → new dimension extracted from raw records
6. Invalid input fail-close (no amount, gibberish)
7. STT failure isolation (voice fails, text still works)
8. Budget alert threshold trigger
9. Subscription detection from recurring patterns
10. Asset snapshot recording and net worth calculation
11. Multi-currency transaction handling
12. Export data to CSV
