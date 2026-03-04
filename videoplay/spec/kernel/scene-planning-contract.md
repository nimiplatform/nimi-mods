# Scene Planning Contract

## V-SCENE-001: Scene Data Source

Scene planning reads scene records from `storyPackage.materials.scenes`. Each scene provides `id`, `name`, and `description`.

## V-SCENE-002: Environment Description Generation

For each scene, the pipeline invokes `scene-planning-text` route stage (`llm.text.generate`) to produce an enriched environment description.

## V-SCENE-003: Scene Reference Images

For each scene, the pipeline invokes `scene-planning-visual` route stage (`llm.image.generate`) to generate 1-3 candidate reference images. The number of candidates is governed by `SCENE_PLANNING_POLICY.maxCandidateImages`.

## V-SCENE-004: ScenePlanningOutput Schema

The output must conform to `ScenePlanningOutputSchema` (Zod). Each `SceneEnvironmentBrief` includes:
- `sceneId`, `name`, `environmentDescription`
- `referenceImageUrls: string[]`
- `selectedIndex: number`

Storage scope: project level (`scenePlanningByStoryId`).
