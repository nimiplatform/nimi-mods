import type { ChunkExtraction } from '../../engine/types.js';

export function mergeChunkExtraction(base: ChunkExtraction | null, fine: ChunkExtraction): ChunkExtraction {
  if (!base) return fine;
  return {
    worldSetting: fine.worldSetting || base.worldSetting,
    timeline: [...base.timeline, ...fine.timeline],
    locations: [...base.locations, ...fine.locations],
    characters: [...base.characters, ...fine.characters],
    events: {
      primary: [...base.events.primary, ...fine.events.primary],
      secondary: [...base.events.secondary, ...fine.events.secondary],
    },
    characterRelations: [...base.characterRelations, ...fine.characterRelations],
  };
}

export function extractionSignal(extraction: ChunkExtraction | null): number {
  if (!extraction) return 0;
  return (
    extraction.characters.length
    + extraction.locations.length
    + extraction.events.primary.length
    + extraction.events.secondary.length
    + extraction.characterRelations.length
  );
}

export function shouldRunFinePass(extraction: ChunkExtraction | null): boolean {
  return extractionSignal(extraction) < 4;
}

export function countSuccessfulChunks(extractions: Array<ChunkExtraction | null>): number {
  return extractions.filter(Boolean).length;
}
