// ---------------------------------------------------------------------------
// Shared Runtime Client for Knowledge-Base test scripts
//
// Provides:
//   - buildMetadata()        — inline key-source gRPC metadata
//   - createEmbeddingClient()— returns AI SDK EmbeddingModelV3
//   - createTextClient()     — returns AI SDK LanguageModelV3
//
// Environment Variables:
//   NIMI_RUNTIME_ENDPOINT    — runtime gRPC address (default: 127.0.0.1:46371)
//   NIMI_API_KEY             — cloud provider API key (inline mode)
//   NIMI_PROVIDER_TYPE       — cloud provider type (default: openai)
//   NIMI_PROVIDER_ENDPOINT   — custom provider endpoint (optional)
//   NIMI_EMBEDDING_MODEL_ID  — embedding model (default: text-embedding-3-small)
//   NIMI_CHAT_MODEL_ID       — chat model (default: cloud/default)
// ---------------------------------------------------------------------------

import { Runtime } from '../../../../sdk/src/runtime/index.js';
import { createNimiAiProvider } from '../../../../sdk/src/ai-provider/index.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const RUNTIME_ENDPOINT =
  process.env.NIMI_RUNTIME_ENDPOINT ?? '127.0.0.1:46371';
export const API_KEY = process.env.NIMI_API_KEY ?? '';
export const PROVIDER_TYPE = process.env.NIMI_PROVIDER_TYPE ?? 'openai';
export const PROVIDER_ENDPOINT = process.env.NIMI_PROVIDER_ENDPOINT ?? '';
export const EMBEDDING_MODEL_ID =
  process.env.NIMI_EMBEDDING_MODEL_ID ?? 'text-embedding-3-small';
export const CHAT_MODEL_ID =
  process.env.NIMI_CHAT_MODEL_ID ?? 'cloud/default';

const APP_ID = 'nimi.knowledge-base.layer2-test';
const SUBJECT_USER_ID = 'user-knowledge-base-test';

// ---------------------------------------------------------------------------
// Build gRPC metadata for inline key-source
// ---------------------------------------------------------------------------

export function buildMetadata(): Record<string, string> | undefined {
  if (!API_KEY) return undefined;
  const md: Record<string, string> = {
    'x-nimi-key-source': 'inline',
    'x-nimi-provider-type': PROVIDER_TYPE,
    'x-nimi-provider-api-key': API_KEY,
  };
  if (PROVIDER_ENDPOINT) {
    md['x-nimi-provider-endpoint'] = PROVIDER_ENDPOINT;
  }
  return md;
}

// ---------------------------------------------------------------------------
// Shared Runtime + Provider factory
// ---------------------------------------------------------------------------

function createProvider(callerId: string) {
  const runtime = new Runtime({
    appId: APP_ID,
    transport: {
      type: 'node-grpc',
      endpoint: RUNTIME_ENDPOINT,
    },
    defaults: {
      callerKind: 'desktop-core',
      callerId,
    },
  });

  return createNimiAiProvider({
    runtime,
    appId: APP_ID,
    subjectUserId: SUBJECT_USER_ID,
    routePolicy: 'token-api',
    fallback: 'deny',
    timeoutMs: 300_000,
    metadata: buildMetadata(),
  });
}

// ---------------------------------------------------------------------------
// Public: create typed clients
// ---------------------------------------------------------------------------

/**
 * Create an embedding model client.
 * Returns an AI SDK EmbeddingModelV3 instance.
 */
export function createEmbeddingClient(modelId?: string) {
  const provider = createProvider('kb-embedding');
  return provider.embedding(modelId ?? EMBEDDING_MODEL_ID);
}

/**
 * Create a text/chat model client.
 * Returns an AI SDK LanguageModelV3 instance.
 */
export function createTextClient(modelId?: string) {
  const provider = createProvider('kb-chat');
  return provider.text(modelId ?? CHAT_MODEL_ID);
}

/**
 * Print common config banner.
 */
export function printConfig(extras?: Record<string, string>) {
  console.log(`Runtime:  ${RUNTIME_ENDPOINT}`);
  console.log(`Provider: ${PROVIDER_TYPE}`);
  console.log(`KeyMode:  ${API_KEY ? 'inline' : 'runtime-config'}`);
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      console.log(`${k}:${' '.repeat(Math.max(1, 10 - k.length))}${v}`);
    }
  }
  console.log('');
}
