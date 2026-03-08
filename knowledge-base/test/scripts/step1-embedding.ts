#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Step 1 — Embedding Verification (Knowledge-Base Layer 2 test)
//
// Reads a document, splits into chunks, generates embeddings via Runtime
// Token API, then runs a self-retrieval sanity check.
//
// Usage:
//   npx tsx test/scripts/step1-embedding.ts [path-to-doc.md]
//
// Example (OpenAI):
//   NIMI_API_KEY=sk-xxx \
//   NIMI_PROVIDER_TYPE=openai \
//   NIMI_EMBEDDING_MODEL_ID=text-embedding-3-small \
//     npx tsx test/scripts/step1-embedding.ts
//
// Default input: test/samples/sample-doc.md
//
// Environment:
//   NIMI_RUNTIME_ENDPOINT    — runtime gRPC address (default: 127.0.0.1:46371)
//   NIMI_API_KEY             — cloud provider API key (inline key-source)
//   NIMI_PROVIDER_TYPE       — cloud provider type (default: openai)
//   NIMI_PROVIDER_ENDPOINT   — cloud provider endpoint (optional)
//   NIMI_EMBEDDING_MODEL_ID  — embedding model (default: text-embedding-3-small)
//
// Prerequisites:
//   1. Start nimi runtime:  cd runtime && go run ./cmd/nimi
//   2. Ensure the embedding model is available via cloud
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEmbeddingClient,
  printConfig,
  EMBEDDING_MODEL_ID,
  PROVIDER_TYPE,
  API_KEY,
} from '../lib/runtime-client.js';
import { splitIntoChunks } from '../lib/chunker.js';
import type { KBChunk } from '../lib/chunker.js';
import { InMemoryVectorStore } from '../lib/vector-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Input resolution
// ---------------------------------------------------------------------------

const inputPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(__dirname, '../samples/sample-doc.md');

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== KB Step 1: Embedding Test ===');
  printConfig({
    Embed: EMBEDDING_MODEL_ID,
  });

  // 1. Read document
  if (!API_KEY) {
    console.error(
      'Error: NIMI_API_KEY is not set.\n' +
      'Set it to your cloud provider API key for inline mode, or\n' +
      'start the runtime with NIMI_RUNTIME_CLOUD_* env vars for runtime-config mode.',
    );
    process.exit(1);
  }

  let rawText: string;
  try {
    rawText = readFileSync(inputPath, 'utf-8');
  } catch {
    console.error(`Error: Cannot read file: ${inputPath}`);
    process.exit(1);
  }
  console.log(`Reading: ${inputPath}`);

  // 2. Split into chunks
  const chunks = splitIntoChunks(rawText);
  const avgTokens = Math.round(
    chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length,
  );
  console.log(`Chunks:  ${chunks.length} chunks (avg ${avgTokens} tokens)`);
  console.log('');

  // 3. Embed all chunks via Runtime Token API
  const embedModel = createEmbeddingClient();
  const store = new InMemoryVectorStore();
  const chunkTexts = chunks.map((c) => c.text);

  // Batch embed — doEmbed accepts { values: string[] }
  console.log(`Embedding ${chunks.length} chunks...`);
  const startedAt = performance.now();

  const result = await embedModel.doEmbed({ values: chunkTexts });
  const embeddings = result.embeddings;

  const embedTime = ((performance.now() - startedAt) / 1000).toFixed(1);

  // Print per-chunk summary and store vectors
  for (let i = 0; i < chunks.length; i++) {
    const emb = embeddings[i] as number[];
    const first5 = emb.slice(0, 5).map((v) => v.toFixed(4));
    console.log(
      `  chunk[${i}]  dim=${emb.length}  first5=[${first5.join(', ')}]`,
    );
    store.add(chunks[i].id, emb);
  }

  console.log('');
  console.log(
    `All ${chunks.length} chunks embedded successfully. (${embedTime}s)`,
  );

  // 4. Self-retrieval test: query with chunk[0]'s text
  console.log('');
  console.log('Self-retrieval test (query = chunk[0] text):');

  const queryResult = await embedModel.doEmbed({
    values: [chunks[0].text],
  });
  const queryEmbedding = queryResult.embeddings[0] as number[];
  const searchResults = store.search(queryEmbedding, 5);

  for (let i = 0; i < searchResults.length; i++) {
    const r = searchResults[i];
    const chunk = chunks.find((c) => c.id === r.chunkId)!;
    const preview = chunk.text.slice(0, 60).replace(/\n/g, ' ');
    console.log(
      `  #${i + 1}  ${r.chunkId}  score=${r.score.toFixed(3)}  "${preview}..."`,
    );
  }

  // Verify top result is chunk[0]
  if (searchResults[0]?.chunkId === chunks[0].id) {
    console.log('');
    console.log('Embedding pipeline verified.');
  } else {
    console.log('');
    console.error(
      'WARNING: Self-retrieval did not return chunk[0] as top result.',
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
