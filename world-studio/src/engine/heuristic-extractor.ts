import type { ChunkExtraction } from './types.js';
import { extractChunkHeuristic as extractChunkHeuristicImpl } from './heuristic/extract.js';

export function extractChunkHeuristic(input: {
  chunk: string;
  index: number;
  total: number;
}): ChunkExtraction {
  return extractChunkHeuristicImpl(input);
}
