# Acceptance Contract

> Owner Domain: `KB-ACC-*`

## KB-ACC-001 Table-Driven Acceptance

Acceptance matrix is authoritative in `tables/acceptance-cases.yaml`.

## KB-ACC-002 Required Coverage

Minimum acceptance coverage must include:

1. document import and full pipeline completion
2. unsupported format fail-close behavior
3. embedding route unavailable fail-close behavior
4. RAG end-to-end with citation parsing
5. query rewriting degradation (non-blocking fallback)
6. empty search result handling
7. document delete cascade cleanup
