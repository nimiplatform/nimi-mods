# MS-ACC: Acceptance Contract

## MS-ACC-001: Build and typecheck

`pnpm run typecheck` and `pnpm run build` must pass without errors.

## MS-ACC-002: Unit tests

`pnpm run test` must pass all tests in `test/*.test.ts`.

## MS-ACC-003: Doctor validation

`pnpm run doctor` must validate manifest alignment.

## MS-ACC-004: MusicXML correctness

Generated MusicXML must:
- Be valid MusicXML 3.1 (XML well-formed, correct DTD reference)
- Include key signature, time signature, and tempo marking
- Use key-aware enharmonic spelling (sharps in sharp keys, flats in flat keys)
- Generate `<tie>` and `<tied>` elements for cross-measure notes

## MS-ACC-005: Export consistency

MIDI export must use quantized note timing (from `QuantizedScore.notes`),
not raw pitch detection output, ensuring consistency with the displayed MusicXML.

See [tables/acceptance-cases.yaml](tables/acceptance-cases.yaml) for test cases.
