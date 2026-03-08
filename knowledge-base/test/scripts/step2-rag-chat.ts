#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Step 2 — RAG Multi-turn Chat REPL (Knowledge-Base Layer 2 test)
//
// Loads a document, chunks + embeds it, then enters an interactive REPL
// where the user can ask questions with RAG-augmented answers.
//
// Features:
//   - Multi-turn conversation with history
//   - Query rewriting using chat LLM (after first turn)
//   - Cosine similarity retrieval from in-memory vector store
//   - Citation references in assistant responses
//
// Usage:
//   npx tsx test/scripts/step2-rag-chat.ts [path-to-doc.md]
//
// Example:
//   NIMI_API_KEY=sk-xxx \
//   NIMI_PROVIDER_TYPE=openai \
//   NIMI_CHAT_MODEL_ID=cloud/default \
//   NIMI_EMBEDDING_MODEL_ID=text-embedding-3-small \
//     npx tsx test/scripts/step2-rag-chat.ts
//
// Special commands:
//   /quit, /exit  — exit the REPL
//   /docs         — show loaded document chunk stats
//   /history      — print conversation history
//   /clear        — clear conversation history
//   /add <path>   — load and embed an additional document
//
// Environment:
//   NIMI_RUNTIME_ENDPOINT    — runtime gRPC address (default: 127.0.0.1:46371)
//   NIMI_API_KEY             — cloud provider API key (inline key-source)
//   NIMI_PROVIDER_TYPE       — cloud provider type (default: openai)
//   NIMI_PROVIDER_ENDPOINT   — cloud provider endpoint (optional)
//   NIMI_EMBEDDING_MODEL_ID  — embedding model (default: text-embedding-3-small)
//   NIMI_CHAT_MODEL_ID       — chat model (default: cloud/default)
//
// Prerequisites:
//   1. Start nimi runtime:  cd runtime && go run ./cmd/nimi
//   2. Ensure embedding + chat models are available via cloud
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import {
  createEmbeddingClient,
  createTextClient,
  printConfig,
  EMBEDDING_MODEL_ID,
  CHAT_MODEL_ID,
  API_KEY,
} from '../lib/runtime-client.js';
import { splitIntoChunks } from '../lib/chunker.js';
import type { KBChunk } from '../lib/chunker.js';
import { InMemoryVectorStore } from '../lib/vector-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.3;
const QUERY_REWRITING_ENABLED = true;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const allChunks: KBChunk[] = [];
const store = new InMemoryVectorStore();
const history: Turn[] = [];
const loadedDocs: { name: string; chunkCount: number }[] = [];

// ---------------------------------------------------------------------------
// Document loading
// ---------------------------------------------------------------------------

async function loadDocument(
  filePath: string,
  embedModel: ReturnType<typeof createEmbeddingClient>,
): Promise<void> {
  let rawText: string;
  try {
    rawText = readFileSync(filePath, 'utf-8');
  } catch {
    console.error(`Error: Cannot read file: ${filePath}`);
    return;
  }

  const docName = basename(filePath);
  console.log(`Loading: ${filePath}`);

  const chunks = splitIntoChunks(rawText);
  // Re-index chunk IDs to be globally unique
  const offset = allChunks.length;
  for (let i = 0; i < chunks.length; i++) {
    chunks[i].id = `chunk-${offset + i}`;
    chunks[i].chunkIndex = offset + i;
  }

  console.log(`Parsed ${chunks.length} chunks, embedding...`);
  const startedAt = performance.now();

  const result = await embedModel.doEmbed({
    values: chunks.map((c) => c.text),
  });

  for (let i = 0; i < chunks.length; i++) {
    store.add(chunks[i].id, result.embeddings[i] as number[]);
    allChunks.push(chunks[i]);
  }

  const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`done (${elapsed}s)`);

  loadedDocs.push({ name: docName, chunkCount: chunks.length });
}

// ---------------------------------------------------------------------------
// Query rewriting (multi-turn context compression)
// ---------------------------------------------------------------------------

async function rewriteQuery(
  query: string,
  textModel: ReturnType<typeof createTextClient>,
): Promise<string> {
  if (!QUERY_REWRITING_ENABLED || history.length === 0) return query;

  // Build recent history context (last 6 turns max)
  const recentHistory = history.slice(-6);
  const historyText = recentHistory
    .map((t) => `${t.role}: ${t.content}`)
    .join('\n');

  const generated = await textModel.doGenerate({
    prompt: [
      {
        role: 'system',
        content:
          'You are a query rewriting assistant. Given a conversation history and the latest user query, ' +
          'rewrite the query to be self-contained and specific, resolving any pronouns or references ' +
          'from the conversation context. Output ONLY the rewritten query, nothing else.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Conversation history:\n${historyText}\n\nLatest query: ${query}\n\nRewritten query:`,
          },
        ],
      },
    ],
    temperature: 0.3,
    maxOutputTokens: 256,
    providerOptions: {},
  });

  const rewritten = generated.content
    .filter((item) => item.type === 'text')
    .map((item) => (item as { type: 'text'; text: string }).text)
    .join('')
    .trim();

  return rewritten || query;
}

// ---------------------------------------------------------------------------
// RAG retrieval + generation
// ---------------------------------------------------------------------------

async function ragAnswer(
  query: string,
  embedModel: ReturnType<typeof createEmbeddingClient>,
  textModel: ReturnType<typeof createTextClient>,
): Promise<void> {
  // 1. Query rewriting
  let searchQuery = query;
  if (QUERY_REWRITING_ENABLED && history.length > 0) {
    searchQuery = await rewriteQuery(query, textModel);
    console.log(`[rewrite: "${searchQuery}"]`);
  } else {
    console.log('[rewrite: n/a (first turn)]');
  }

  // 2. Embed query
  const queryResult = await embedModel.doEmbed({ values: [searchQuery] });
  const queryEmbedding = queryResult.embeddings[0] as number[];

  // 3. Search
  const searchResults = store.search(
    queryEmbedding,
    TOP_K,
    SIMILARITY_THRESHOLD,
  );
  if (searchResults.length > 0) {
    console.log(
      `[search: ${searchResults.length} chunks, best=${searchResults[0].score.toFixed(2)}]`,
    );
  } else {
    console.log('[search: no relevant chunks found]');
  }

  // 4. Build RAG prompt
  const contextChunks = searchResults
    .map((r, i) => {
      const chunk = allChunks.find((c) => c.id === r.chunkId)!;
      return `[${i + 1}] ${chunk.text}`;
    })
    .join('\n\n');

  const systemPrompt =
    'You are a helpful assistant that answers questions based on the provided document context. ' +
    'Use the context below to answer the user\'s question. ' +
    'When referencing information from the context, cite it using [N] notation where N is the chunk number. ' +
    'If the context does not contain relevant information, say so honestly.\n\n' +
    '--- Context ---\n' +
    contextChunks +
    '\n--- End Context ---';

  // 5. Generate answer
  const generated = await textModel.doGenerate({
    prompt: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [{ type: 'text', text: query }],
      },
    ],
    temperature: 0.7,
    maxOutputTokens: 2048,
    providerOptions: {},
  });

  const answer = generated.content
    .filter((item) => item.type === 'text')
    .map((item) => (item as { type: 'text'; text: string }).text)
    .join('')
    .trim();

  console.log('');
  console.log(answer);

  // 6. Print references
  if (searchResults.length > 0) {
    console.log('');
    console.log('References:');
    for (let i = 0; i < searchResults.length; i++) {
      const r = searchResults[i];
      const chunk = allChunks.find((c) => c.id === r.chunkId)!;
      const preview = chunk.text.slice(0, 80).replace(/\n/g, ' ');
      console.log(
        `  [${i + 1}] ${r.chunkId} (score=${r.score.toFixed(2)}): "${preview}..."`,
      );
    }
  }

  // 7. Record history
  history.push({ role: 'user', content: query });
  history.push({ role: 'assistant', content: answer });
}

// ---------------------------------------------------------------------------
// REPL commands
// ---------------------------------------------------------------------------

function handleCommand(
  line: string,
  embedModel: ReturnType<typeof createEmbeddingClient>,
): boolean {
  const trimmed = line.trim();

  if (trimmed === '/quit' || trimmed === '/exit') {
    console.log('Goodbye.');
    process.exit(0);
  }

  if (trimmed === '/docs') {
    console.log(`Loaded documents: ${loadedDocs.length}`);
    for (const doc of loadedDocs) {
      console.log(`  ${doc.name}: ${doc.chunkCount} chunks`);
    }
    console.log(`Total chunks in store: ${store.size}`);
    return true;
  }

  if (trimmed === '/history') {
    if (history.length === 0) {
      console.log('(no conversation history)');
    } else {
      for (const turn of history) {
        const prefix = turn.role === 'user' ? 'You' : 'AI';
        const preview =
          turn.content.length > 120
            ? turn.content.slice(0, 120) + '...'
            : turn.content;
        console.log(`  ${prefix}: ${preview}`);
      }
    }
    return true;
  }

  if (trimmed === '/clear') {
    history.length = 0;
    console.log('Conversation history cleared.');
    return true;
  }

  if (trimmed.startsWith('/add ')) {
    const addPath = resolve(trimmed.slice(5).trim());
    loadDocument(addPath, embedModel).catch((err) => {
      console.error(`Error loading document: ${err}`);
    });
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== KB Step 2: RAG Multi-turn Chat ===');
  printConfig({
    Chat: CHAT_MODEL_ID,
    Embed: EMBEDDING_MODEL_ID,
  });

  if (!API_KEY) {
    console.error(
      'Error: NIMI_API_KEY is not set.\n' +
      'Set it to your cloud provider API key for inline mode, or\n' +
      'start the runtime with NIMI_RUNTIME_CLOUD_* env vars for runtime-config mode.',
    );
    process.exit(1);
  }

  const inputPath = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(__dirname, '../samples/sample-doc.md');

  // Create clients
  const embedModel = createEmbeddingClient();
  const textModel = createTextClient();

  // Load initial document
  await loadDocument(inputPath, embedModel);
  console.log('');

  // Start REPL
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    // Handle slash commands
    if (trimmed.startsWith('/')) {
      const handled = handleCommand(trimmed, embedModel);
      if (handled) {
        console.log('');
        rl.prompt();
        return;
      }
    }

    // RAG answer
    try {
      await ragAnswer(trimmed, embedModel, textModel);
    } catch (err) {
      console.error('Error:', err);
    }
    console.log('');
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Goodbye.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
