import { BUDDY_SESSION_VERSION, DEFAULT_BUDDY_MODEL_ID, BUDDY_MODELS, type BuddyModelId, } from '../contracts.js';
import type { ChatMessage } from './dialogue-engine.js';
import { type HookClient, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
import { createModKvStore } from '@nimiplatform/sdk/mod/storage';
const SESSION_KEY = 'buddy:session:default';
export interface BuddySessionState {
    version: number;
    messages: ChatMessage[];
    selectedModelId: BuddyModelId;
    voiceModeEnabled: boolean;
    selectedTtsVoiceId: string;
    textBinding: RuntimeRouteBinding | null;
    ttsBinding: RuntimeRouteBinding | null;
    sttBinding: RuntimeRouteBinding | null;
    updatedAt: number;
}
const BUDDY_MODEL_ID_SET = new Set<string>(BUDDY_MODELS.map((model) => model.id));
function isBuddyModelId(value: unknown): value is BuddyModelId {
    return typeof value === 'string' && BUDDY_MODEL_ID_SET.has(value);
}
function isChatMessage(value: unknown): value is ChatMessage {
    if (!value || typeof value !== 'object')
        return false;
    const record = value as Record<string, unknown>;
    const role = String(record.role || '').trim();
    return ((role === 'user' || role === 'assistant')
        && typeof record.content === 'string'
        && typeof record.id === 'string');
}
function parseBinding(value: unknown): RuntimeRouteBinding | null {
    if (!value || typeof value !== 'object')
        return null;
    const record = value as Record<string, unknown>;
    const source = String(record.source || '').trim() === 'cloud' ? 'cloud' : 'local';
    const model = String(record.model || '').trim();
    if (!model)
        return null;
    return {
        source,
        connectorId: String(record.connectorId || ''),
        model,
        ...(String(record.localModelId || '').trim()
            ? { localModelId: String(record.localModelId || '').trim() }
            : {}),
        ...(String(record.engine || '').trim()
            ? { engine: String(record.engine || '').trim() }
            : {}),
        ...(String(record.modelId || '').trim()
            ? { modelId: String(record.modelId || '').trim() }
            : {}),
        ...(String(record.provider || '').trim()
            ? { provider: String(record.provider || '').trim() }
            : {}),
        ...(String(record.endpoint || '').trim()
            ? { endpoint: String(record.endpoint || '').trim() }
            : {}),
    };
}
function serializeBinding(binding: RuntimeRouteBinding | null): Record<string, unknown> | null {
    if (!binding)
        return null;
    return {
        source: binding.source,
        connectorId: binding.connectorId,
        model: binding.model,
        ...(binding.localModelId ? { localModelId: binding.localModelId } : {}),
        ...(binding.engine ? { engine: binding.engine } : {}),
        ...(binding.modelId ? { modelId: binding.modelId } : {}),
        ...(binding.provider ? { provider: binding.provider } : {}),
        ...(binding.endpoint ? { endpoint: binding.endpoint } : {}),
    };
}
export async function loadBuddySession(hookClient: HookClient | null): Promise<BuddySessionState | null> {
    if (!hookClient)
        return null;
    try {
        const store = createModKvStore({
            storage: hookClient.storage,
            namespace: 'buddy.session',
        });
        const raw = await store.get(SESSION_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (Number(parsed.version || 0) !== BUDDY_SESSION_VERSION) {
            return null;
        }
        const messages = Array.isArray(parsed.messages) ? parsed.messages.filter(isChatMessage) : [];
        const selectedModelId = isBuddyModelId(parsed.selectedModelId)
            ? parsed.selectedModelId
            : DEFAULT_BUDDY_MODEL_ID;
        return {
            version: BUDDY_SESSION_VERSION,
            messages,
            selectedModelId,
            voiceModeEnabled: Boolean(parsed.voiceModeEnabled),
            selectedTtsVoiceId: String(parsed.selectedTtsVoiceId || '').trim(),
            textBinding: parseBinding(parsed.textBinding),
            ttsBinding: parseBinding(parsed.ttsBinding),
            sttBinding: parseBinding(parsed.sttBinding),
            updatedAt: Number(parsed.updatedAt || Date.now()),
        };
    }
    catch {
        return null;
    }
}
export async function saveBuddySession(hookClient: HookClient | null, state: Omit<BuddySessionState, 'version' | 'updatedAt'>): Promise<boolean> {
    if (!hookClient)
        return false;
    try {
        const store = createModKvStore({
            storage: hookClient.storage,
            namespace: 'buddy.session',
        });
        const payload = JSON.stringify({
            version: BUDDY_SESSION_VERSION,
            messages: state.messages.slice(-40),
            selectedModelId: state.selectedModelId,
            voiceModeEnabled: state.voiceModeEnabled,
            selectedTtsVoiceId: String(state.selectedTtsVoiceId || '').trim(),
            textBinding: serializeBinding(state.textBinding),
            ttsBinding: serializeBinding(state.ttsBinding),
            sttBinding: serializeBinding(state.sttBinding),
            updatedAt: Date.now(),
        });
        await store.set(SESSION_KEY, payload);
        return true;
    }
    catch {
        return false;
    }
}
