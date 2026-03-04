// ---------------------------------------------------------------------------
// RAG pipeline — rewrite → embed → search → prompt → stream (SSOT §4)
// ---------------------------------------------------------------------------

import type {
  KBChunk,
  KBDocument,
  KBTurn,
  KBCitation,
  KBSettings,
  LlmClient,
  EmbeddingClient,
} from '../types.js';
import type { VectorStore, VectorSearchResult } from './vector-store.js';
import { rewriteQuery } from './query-rewriter.js';
import { parseCitations } from './citation-parser.js';

const RAG_SYSTEM_PROMPT = `You are a knowledgeable assistant that answers questions based on the provided reference documents. Follow these rules:

1. Answer based ONLY on the provided context. If the context doesn't contain relevant information, say so clearly.
2. Cite your sources using [N] notation where N is the reference number.
3. Be concise and accurate.
4. If multiple references support a point, cite all of them.
5. Preserve the user's language in your response.`;

function buildContextPrompt(
  searchResults: VectorSearchResult[],
  chunks: Map<string, KBChunk>,
  documents: Map<string, KBDocument>,
  maxContextChunks: number,
): string {
  const selected = searchResults.slice(0, maxContextChunks);
  const parts: string[] = [];

  for (let i = 0; i < selected.length; i++) {
    const result = selected[i]!;
    const chunk = chunks.get(result.chunkId);
    const doc = documents.get(result.documentId);
    if (!chunk || !doc) continue;

    parts.push(`[Ref ${i + 1}] (${doc.title})\n${chunk.text}`);
  }

  return parts.join('\n\n---\n\n');
}

function buildHistoryPrompt(recentTurns: KBTurn[]): string {
  if (recentTurns.length === 0) return '';

  // Include last 3 turns for context continuity (SSOT §9.4 rule 3)
  const slice = recentTurns.slice(-3);
  const lines = slice.map((t) =>
    `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`,
  );
  return `\nRecent conversation:\n${lines.join('\n')}\n`;
}

export type RagStreamEvent =
  | { type: 'search_complete'; results: VectorSearchResult[]; rewrittenQuery?: string }
  | { type: 'text_delta'; textDelta: string }
  | { type: 'done'; fullText: string; citations: KBCitation[]; retrievedChunkIds: string[] };

/**
 * Full RAG pipeline: rewrite → embed → search → prompt → stream.
 */
export async function* runRagPipeline(input: {
  query: string;
  recentTurns: KBTurn[];
  settings: KBSettings;
  llmClient: LlmClient;
  embeddingClient: EmbeddingClient;
  vectorStore: VectorStore;
  chunks: Map<string, KBChunk>;
  documents: Map<string, KBDocument>;
  scopeDocumentIds?: string[];
}): AsyncGenerator<RagStreamEvent> {
  const {
    query,
    recentTurns,
    settings,
    llmClient,
    embeddingClient,
    vectorStore,
    chunks,
    documents,
    scopeDocumentIds,
  } = input;

  // 1. Query rewriting (SSOT §4.1)
  let searchQuery = query;
  let rewrittenQuery: string | undefined;

  if (settings.queryRewritingEnabled && recentTurns.length > 0) {
    const rewrite = await rewriteQuery({
      query,
      recentTurns,
      llmClient,
    });
    if (rewrite.didRewrite) {
      searchQuery = rewrite.rewrittenQuery;
      rewrittenQuery = rewrite.rewrittenQuery;
    }
  }

  // 2. Generate query embedding (SSOT §4.2)
  const embedResult = await embeddingClient.generateEmbedding({
    texts: [searchQuery],
  });
  const queryEmbedding = embedResult.embeddings[0];
  if (!queryEmbedding) {
    throw new Error('KB_SEARCH_FAILED');
  }

  // 3. Vector search (SSOT §4.2)
  const searchResults = vectorStore.search(
    queryEmbedding,
    settings.topK,
    settings.similarityThreshold,
    scopeDocumentIds,
  );

  const retrievedChunkIds = searchResults.map((r) => r.chunkId);

  yield {
    type: 'search_complete',
    results: searchResults,
    rewrittenQuery,
  };

  // 4. Build prompt (SSOT §4.3)
  const contextText = buildContextPrompt(searchResults, chunks, documents, settings.maxContextChunks);
  const historyText = buildHistoryPrompt(recentTurns);

  let userPrompt: string;
  if (searchResults.length === 0) {
    userPrompt = `${historyText}\nUser question: ${query}\n\nNote: No relevant documents were found. Please inform the user that no matching content was found in the knowledge base.`;
  } else {
    userPrompt = `Reference documents:\n\n${contextText}\n${historyText}\nUser question: ${query}`;
  }

  // 5. Stream generation (SSOT §4.4)
  let fullText = '';

  for await (const event of llmClient.streamText({
    systemPrompt: RAG_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
  })) {
    if (event.type === 'text_delta') {
      fullText += event.textDelta;
      yield { type: 'text_delta', textDelta: event.textDelta };
    }
  }

  // 6. Parse citations (SSOT §4.5)
  const citations = parseCitations({
    text: fullText,
    searchResults,
    chunks,
    documents,
  });

  yield {
    type: 'done',
    fullText,
    citations,
    retrievedChunkIds,
  };
}
