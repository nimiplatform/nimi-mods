#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Step 2 Regex Benchmark — compare regex pre-analysis vs previous LLM results
//
// Reads a .txt file, runs regex pre-analysis, and compares speed + quality
// against the existing LLM analysis output (if available).
//
// Usage:
//   npx tsx test/scripts/step2-regex-benchmark.ts [path-to-novel.txt]
//
// Default input: test/test-novel/sant-2.txt
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitTextIntoChapters, computeTextStats } from '../../src/services/chapter-splitter.js';
import { regexPreAnalyze } from '../../src/services/regex-pre-analyzer.js';
import { splitLongSegments } from '../../src/services/segment-post-processor.js';
import type { ScriptSegment } from '../../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(__dirname, '../test-novel/sant-2.txt');

const llmResultPath = resolve(
  __dirname,
  '../output',
  `step2-result-${basename(inputPath, '.txt')}.json`,
);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== Step 2 Regex Pre-Analysis Benchmark ===\n');
  console.log(`Input: ${inputPath}\n`);

  const rawText = readFileSync(inputPath, 'utf-8');
  const chapters = splitTextIntoChapters(rawText);
  const stats = computeTextStats(chapters);

  console.log(`Text: ${stats.totalChars} chars, ${stats.totalChapters} chapters\n`);

  // -----------------------------------------------------------------------
  // Run regex pre-analysis
  // -----------------------------------------------------------------------

  const regexStart = performance.now();
  let totalSegments = 0;
  const allCharacterNames = new Set<string>();
  let bypassCount = 0;

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]!;
    const chStart = performance.now();
    const result = regexPreAnalyze(chapter.rawText);
    const chTime = (performance.now() - chStart).toFixed(2);

    // Simulate the post-processing that the pipeline would do
    const rawSegments: ScriptSegment[] = result.segments.map((seg, idx) => ({
      id: `seg-${i}-${idx}`,
      chapterIndex: i,
      index: idx,
      type: seg.type,
      speaker: seg.speaker,
      text: seg.text,
      startOffset: seg.startOffset,
      endOffset: seg.endOffset,
    }));
    const finalSegments = splitLongSegments(rawSegments);

    totalSegments += finalSegments.length;
    for (const name of result.characterNames) allCharacterNames.add(name);
    if (result.canBypassLlm) bypassCount++;

    const speakers = new Set(finalSegments.map(s => s.speaker));
    const types = {
      dialogue: finalSegments.filter(s => s.type === 'dialogue').length,
      narration: finalSegments.filter(s => s.type === 'narration').length,
      inner_thought: finalSegments.filter(s => s.type === 'inner_thought').length,
    };

    console.log(`Chapter ${i}: "${chapter.title}" (${chapter.rawText.length} chars)`);
    console.log(`  Regex time:  ${chTime}ms`);
    console.log(`  Bypass LLM:  ${result.canBypassLlm ? 'YES ✓' : 'NO → needs LLM'}`);
    console.log(`  Segments:    ${finalSegments.length} (dialogue:${types.dialogue} narration:${types.narration} thought:${types.inner_thought})`);
    console.log(`  Speakers:    ${Array.from(speakers).join(', ')}`);
    console.log(`  Confidence:  high:${result.stats.highConfidence} medium:${result.stats.mediumConfidence} low:${result.stats.lowConfidence} (ratio:${(result.stats.highConfidenceRatio * 100).toFixed(0)}%)`);
    console.log('');
  }

  const regexTotal = (performance.now() - regexStart).toFixed(2);

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------

  console.log('=== Summary ===\n');
  console.log(`Regex analysis:   ${regexTotal}ms total`);
  console.log(`Chapters bypass:  ${bypassCount}/${chapters.length}`);
  console.log(`Total segments:   ${totalSegments}`);
  console.log(`Characters found: ${Array.from(allCharacterNames).join(', ')}`);

  // -----------------------------------------------------------------------
  // Compare with previous LLM result
  // -----------------------------------------------------------------------

  if (existsSync(llmResultPath)) {
    console.log(`\n=== LLM Comparison (${basename(llmResultPath)}) ===\n`);
    const llmResult = JSON.parse(readFileSync(llmResultPath, 'utf-8'));

    const llmTime = llmResult.meta?.totalTimeSeconds ?? '?';
    const llmSegments = llmResult.segments?.length ?? 0;
    const llmChars = (llmResult.characters ?? [])
      .map((c: { name: string }) => c.name)
      .filter((n: string) => n !== 'narrator');

    console.log(`LLM time:         ${llmTime}s`);
    console.log(`LLM segments:     ${llmSegments}`);
    console.log(`LLM characters:   ${llmChars.join(', ')}`);

    const speedup = typeof llmTime === 'number'
      ? (llmTime * 1000 / Number(regexTotal)).toFixed(0)
      : '?';
    console.log(`\nSpeedup:          ${speedup}x faster (regex ${regexTotal}ms vs LLM ${llmTime}s)`);
    console.log(`Segment diff:     regex ${totalSegments} vs LLM ${llmSegments} (${totalSegments - llmSegments >= 0 ? '+' : ''}${totalSegments - llmSegments})`);

    // Character overlap
    const llmCharSet = new Set(llmChars);
    const overlap = Array.from(allCharacterNames).filter(n => llmCharSet.has(n));
    const missed = Array.from(llmCharSet).filter(n => !allCharacterNames.has(n as string));
    console.log(`\nCharacter overlap: ${overlap.length}/${llmCharSet.size}`);
    if (overlap.length > 0) console.log(`  Matched:  ${overlap.join(', ')}`);
    if (missed.length > 0) console.log(`  Missed:   ${missed.join(', ')}`);
  } else {
    console.log(`\n(No previous LLM result at ${llmResultPath} for comparison)`);
  }
}

main();
