# Acceptance Cases (generated)

> Auto-generated from [tables/acceptance-cases.yaml](../tables/acceptance-cases.yaml). Do not edit manually.

| ID | Gate | Criteria |
|----|------|----------|
| MS-ACC-001 | Build and typecheck | `pnpm run typecheck && pnpm run build` exits 0 |
| MS-ACC-002 | Unit tests | All `test/*.test.ts` pass |
| MS-ACC-003 | Doctor validation | Manifest alignment validated |
| MS-ACC-004 | MusicXML correctness | Valid 3.1, key/time/tempo, enharmonic spelling, tie elements |
| MS-ACC-005 | Export consistency | MIDI uses quantized timing, matches displayed MusicXML |
