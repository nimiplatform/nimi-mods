# Acceptance Contract

> Owner Domain: `T-ACC-*`

## T-ACC-001 Table-Driven Cases

Acceptance behavior is authoritative in `tables/acceptance-cases.yaml`.

## T-ACC-002 Minimum Coverage

Coverage includes render success path, internal visibility filtering, persistence warning, presence idle->away path, locale-aware fallback rendering, route-config modal dialog accessibility, immersive route registration for the desktop host shell, prompt-language UI normalization, world-first story-language resolution, story-language lock, and proof that existing Start/Resume/Restart/Stop flow semantics remain unchanged.

## T-ACC-003 Verification Commands

All checks must pass:

1. kernel docs generation
2. docs drift check
3. consistency check
4. package smoke verification
