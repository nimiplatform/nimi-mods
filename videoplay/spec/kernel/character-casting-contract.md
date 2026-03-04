# Character Casting Contract

## V-CHAR-001: Character Casting Data Source

Character casting reads agent IDs from `storyPackage.cast.participants` and retrieves agent memory via `data-api.core.agent.memory.recall.for-entity`. No new data API is required.

## V-CHAR-002: Appearance Description Generation

For each participant agent, the pipeline invokes `character-casting-text` route stage (`llm.text.generate`) to produce an appearance description from memory recall data.

## V-CHAR-003: Appearance Candidate Images

For each participant agent, the pipeline invokes `character-casting-visual` route stage (`llm.image.generate`) to generate 1-3 candidate appearance images. The number of candidates is governed by `CHARACTER_CASTING_POLICY.maxCandidateImages`.

## V-CHAR-004: CharacterCastingOutput Schema

The output must conform to `CharacterCastingOutputSchema` (Zod). Each `CharacterBrief` includes:
- `agentId`, `name`, `roleLevel` (S/A/B/C/D)
- `visualKeywords: string[]`
- `appearances: CharacterAppearanceVersion[]` with `imageUrls`, `selectedIndex`, `changeReason`
- `activeAppearanceIndex`, `referenceImageUri`

## V-CHAR-005: Storage Scope

Character casting output is stored at project level (`characterCastingByStoryId`), not per-episode.
