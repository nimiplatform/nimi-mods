// ---------------------------------------------------------------------------
// Query rewriter — rewrites user query with conversation context (SSOT §4.1)
// ---------------------------------------------------------------------------

import type { LlmClient, KBTurn } from '../types.js';

const SYSTEM_PROMPT = `You are a query rewriting assistant. Given a conversation history and the user's latest question, rewrite the question into a standalone search query that captures the full intent without requiring conversation context.

Rules:
- Output ONLY the rewritten query, nothing else.
- If the latest question is already standalone, return it unchanged.
- Preserve the original language.
- Keep it concise (under 100 words).`;

/**
 * Rewrite a user query incorporating recent conversation history.
 * Uses at most the last 5 turns (SSOT §9.4).
 * On failure, returns the original query (graceful degradation).
 */
export async function rewriteQuery(input: {
  query: string;
  recentTurns: KBTurn[];
  llmClient: LlmClient;
}): Promise<{ rewrittenQuery: string; didRewrite: boolean }> {
  const { query, recentTurns, llmClient } = input;

  // No history → no rewriting needed (SSOT §9.4 rule 4)
  if (recentTurns.length === 0) {
    return { rewrittenQuery: query, didRewrite: false };
  }

  // Build conversation context from last 5 turns
  const historySlice = recentTurns.slice(-5);
  const historyText = historySlice
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n');

  const userPrompt = `Conversation history:\n${historyText}\n\nLatest question: ${query}\n\nRewritten standalone query:`;

  try {
    const result = await llmClient.generateText({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 200,
      temperature: 0.1,
    });

    const rewritten = result.text.trim();
    if (!rewritten) {
      return { rewrittenQuery: query, didRewrite: false };
    }

    return { rewrittenQuery: rewritten, didRewrite: true };
  } catch {
    // Graceful degradation: use original query
    return { rewrittenQuery: query, didRewrite: false };
  }
}
