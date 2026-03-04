// ---------------------------------------------------------------------------
// Embedding adapter — bridges ModAiClient → service-layer EmbeddingClient
// ---------------------------------------------------------------------------

import type { ModAiClient } from '@nimiplatform/sdk/mod/ai';
import type { EmbeddingClient } from '../types.js';
import { createKBFlowId, emitKBLog } from '../logging.js';

type EmbeddingRouteSource = 'auto' | 'local-runtime' | 'token-api';
type EffectiveRouteOverride = {
  source: 'local-runtime' | 'token-api';
  connectorId?: string;
  model?: string;
  localModelId?: string;
};
type TokenApiRouteOverride = {
  source: 'token-api';
  connectorId?: string;
  model?: string;
};

function isConnectorIdRequiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('AI_CONNECTOR_ID_REQUIRED');
}

/**
 * Wrap a ModAiClient into the service-layer EmbeddingClient abstraction.
 *
 * Mapping:
 *   EmbeddingClient.generateEmbedding({ texts }) → ModAiClient.generateEmbedding({ input })
 *   routeHint defaults to 'embedding/default'
 */
export function createEmbeddingClientAdapter(
  aiClient: ModAiClient,
  routeSource: EmbeddingRouteSource = 'auto',
  options?: {
    preferredRouteOverride?: EffectiveRouteOverride;
    resolveTokenApiRouteOverride?: () => Promise<TokenApiRouteOverride | undefined>;
  },
): EmbeddingClient {
  let tokenApiRouteOverrideCache: TokenApiRouteOverride | null = null;
  let routeProbeLogged = false;

  return {
    async generateEmbedding(input) {
      const flowId = createKBFlowId('embed-adapter');
      const routeHint = (input.routeHint as 'embedding/default') ?? 'embedding/default';
      let routeOverride: EffectiveRouteOverride | undefined =
        options?.preferredRouteOverride
        || (
          routeSource === 'auto'
            ? undefined
            : { source: routeSource }
        );

      if (routeOverride?.source === 'token-api') {
        if (!tokenApiRouteOverrideCache && options?.resolveTokenApiRouteOverride) {
          tokenApiRouteOverrideCache = await options.resolveTokenApiRouteOverride() ?? null;
        }
        if (tokenApiRouteOverrideCache) {
          routeOverride = {
            ...routeOverride,
            source: 'token-api',
            connectorId: routeOverride.connectorId || tokenApiRouteOverrideCache.connectorId,
            model: routeOverride.model || tokenApiRouteOverrideCache.model,
          };
        }
      }

      if (!routeProbeLogged) {
        routeProbeLogged = true;
        emitKBLog({
          level: 'info',
          message: 'embedding:adapter:route-override',
          flowId,
          source: 'createEmbeddingClientAdapter.generateEmbedding',
          details: {
            routeSource,
            routeHint,
            routeOverride: routeOverride || null,
          },
        });
      }

      const tryResolveTokenApiRouteOverride = async (): Promise<TokenApiRouteOverride | null> => {
        if (tokenApiRouteOverrideCache) return tokenApiRouteOverrideCache;
        if (!options?.resolveTokenApiRouteOverride) return null;
        tokenApiRouteOverrideCache = await options.resolveTokenApiRouteOverride() ?? null;
        return tokenApiRouteOverrideCache;
      };

      try {
        const result = await aiClient.generateEmbedding({
          input: input.texts,
          routeHint,
          routeOverride,
        });
        emitKBLog({
          level: 'debug',
          message: 'embedding:adapter:invoke:done',
          flowId,
          source: 'createEmbeddingClientAdapter.generateEmbedding',
          details: {
            resolvedSource: result.route?.source || null,
            resolvedConnectorId: result.route?.connectorId || null,
            resolvedModel: result.route?.model || null,
            batchSize: input.texts.length,
            embeddings: result.embeddings.length,
          },
        });
        return { embeddings: result.embeddings };
      } catch (error) {
        // Auto mode: cloud-first, but if connector is missing, retry local-runtime once.
        if (routeSource === 'auto' && isConnectorIdRequiredError(error)) {
          const resolvedTokenApiRoute = await tryResolveTokenApiRouteOverride();
          if (resolvedTokenApiRoute?.connectorId) {
            emitKBLog({
              level: 'warn',
              message: 'embedding:adapter:auto-retry-token-api-with-connector',
              flowId,
              source: 'createEmbeddingClientAdapter.generateEmbedding',
              details: {
                error: error instanceof Error ? error.message : String(error || ''),
                connectorId: resolvedTokenApiRoute.connectorId,
                model: resolvedTokenApiRoute.model || null,
              },
            });
            try {
              const retryResult = await aiClient.generateEmbedding({
                input: input.texts,
                routeHint,
                routeOverride: resolvedTokenApiRoute,
              });
              return { embeddings: retryResult.embeddings };
            } catch (retryError) {
              emitKBLog({
                level: 'warn',
                message: 'embedding:adapter:auto-retry-token-api:error',
                flowId,
                source: 'createEmbeddingClientAdapter.generateEmbedding',
                details: {
                  error: retryError instanceof Error ? retryError.message : String(retryError || ''),
                  connectorId: resolvedTokenApiRoute.connectorId,
                  model: resolvedTokenApiRoute.model || null,
                },
              });
            }
          }

          emitKBLog({
            level: 'warn',
            message: 'embedding:adapter:auto-fallback-local-runtime',
            flowId,
            source: 'createEmbeddingClientAdapter.generateEmbedding',
            details: {
              error: error instanceof Error ? error.message : String(error || ''),
              previousRouteOverride: routeOverride || null,
              resolvedTokenApiRoute: resolvedTokenApiRoute || null,
            },
          });
          const fallback = await aiClient.generateEmbedding({
            input: input.texts,
            routeHint,
            routeOverride: { source: 'local-runtime' },
          });
          return { embeddings: fallback.embeddings };
        }
        emitKBLog({
          level: 'error',
          message: 'embedding:adapter:invoke:error',
          flowId,
          source: 'createEmbeddingClientAdapter.generateEmbedding',
          details: {
            error: error instanceof Error ? error.message : String(error || ''),
            routeSource,
            routeOverride: routeOverride || null,
          },
        });
        throw error;
      }
    },
  };
}
