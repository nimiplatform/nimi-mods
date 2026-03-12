import { LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL, LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST, } from '../contracts.js';
import { configureLocalChatCoreQueryBridge, listLocalChatTargets, resolveLocalChatTargetDetail, type LocalChatReadContext, } from '../data/index.js';
import { createLocalChatFlowId, emitLocalChatLog } from '../logging.js';
import { decodeJwtSubject } from '../utils/jwt.js';
import { registerLocalChatSessionCapabilities } from './sessions.js';
import { type HookClient } from "@nimiplatform/sdk/mod";
type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
function toReadContext(input: {
    realmBaseUrl: string;
    accessToken?: string;
    fetchImpl?: FetchImpl;
}): LocalChatReadContext {
    return {
        realmBaseUrl: String(input.realmBaseUrl || ''),
        accessToken: input.accessToken || undefined,
        fetchImpl: input.fetchImpl || undefined,
        viewerId: decodeJwtSubject(input.accessToken),
    };
}
function readTargetInput(query: unknown): Record<string, unknown> {
    if (!query || typeof query !== 'object')
        return {};
    const target = (query as Record<string, unknown>).target;
    return target && typeof target === 'object' ? (target as Record<string, unknown>) : {};
}
export function createLocalChatReadContextResolver(input: {
    getHttpContext: () => {
        realmBaseUrl: string;
        accessToken?: string;
        fetchImpl?: FetchImpl;
    };
}): () => LocalChatReadContext {
    return () => toReadContext(input.getHttpContext());
}
export async function registerLocalChatDataCapabilities(input: {
    hookClient: HookClient;
    getHttpContext: () => {
        realmBaseUrl: string;
        accessToken?: string;
        fetchImpl?: FetchImpl;
    };
}): Promise<void> {
    const { hookClient, getHttpContext } = input;
    const flowId = createLocalChatFlowId('local-chat-data-registrar');
    const resolveReadContext = createLocalChatReadContextResolver({ getHttpContext });
    configureLocalChatCoreQueryBridge({
        query: async (capability, query) => hookClient.data.query({
            capability,
            query: query || {},
        }),
    });
    await hookClient.data.register({
        capability: LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST,
        handler: async () => {
            emitLocalChatLog({
                level: 'debug',
                message: 'action:data-capability:invoke',
                flowId,
                source: LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST,
            });
            return listLocalChatTargets(resolveReadContext());
        },
    });
    await hookClient.data.register({
        capability: LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL,
        handler: async (query) => {
            emitLocalChatLog({
                level: 'debug',
                message: 'action:data-capability:invoke',
                flowId,
                source: LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL,
            });
            return resolveLocalChatTargetDetail(resolveReadContext(), readTargetInput(query));
        },
    });
    await registerLocalChatSessionCapabilities({ hookClient });
}
