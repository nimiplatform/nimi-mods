# Candidate Selection Contract

## V-CAND-001: Segment-Pool Input

Candidate selection consumes rendered video segments from `asset-render` (`RenderedAsset.assetType = video`). The stage does not select per-shot variant versions.

## V-CAND-002: Auto-Selection Mode

In automatic mode, the pipeline pre-selects all rendered video segments (`CANDIDATE_SELECTION_POLICY.autoSelectAllRenderedVideo = true`) and generates an initial timeline order.

## V-CAND-003: CandidateSelectionOutput Schema

The output must conform to `CandidateSelectionOutputSchema` (Zod) and includes:
- `selectedAssetIds: string[]` (segment IDs selected for composition)
- `timelineSegments[]` with `assetId`, `shotId`, `order`, optional `trimInMs`, optional `trimOutMs`

## V-CAND-004: Storage Scope

Candidate selection output is stored per-episode (`candidateSelectionByEpisodeId`).
