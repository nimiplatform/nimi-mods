import type { InteractionSnapshot, RelationMemorySlot } from '../../state/index.js';
import type { LocalChatTurnAiClient } from './types.js';
import { type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
type GovernanceResult = Pick<RelationMemorySlot, 'portability' | 'sensitivity'>;
function isExplicitMemory(slot: Pick<RelationMemorySlot, 'key' | 'value'>): boolean {
    const text = `${slot.key} ${slot.value}`.toLowerCase();
    return /sex|nude|nsfw|裸体|做爱|胸|私密|情色|explicit|porn|fetish/u.test(text);
}
function fallbackGovernance(slot: RelationMemorySlot): GovernanceResult {
    if (isExplicitMemory(slot)) {
        return {
            portability: 'blocked',
            sensitivity: 'intimate',
        };
    }
    return {
        portability: 'local-only',
        sensitivity: slot.slotType === 'boundary' || slot.slotType === 'taboo'
            ? 'personal'
            : slot.slotType === 'preference'
                ? 'safe'
                : 'personal',
    };
}
function applyGovernance(slot: RelationMemorySlot, governance: GovernanceResult | null | undefined): RelationMemorySlot {
    const fallback = fallbackGovernance(slot);
    const resolvedGovernance = isExplicitMemory(slot)
        ? {
            portability: 'blocked' as const,
            sensitivity: 'intimate' as const,
        }
        : governance || fallback;
    return {
        ...slot,
        portability: resolvedGovernance.portability,
        sensitivity: resolvedGovernance.sensitivity,
    };
}
function parseGovernanceMap(value: unknown): Record<string, GovernanceResult> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const slots = Array.isArray((value as Record<string, unknown>).slots)
        ? (value as Record<string, unknown>).slots as Array<Record<string, unknown>>
        : [];
    const output: Record<string, GovernanceResult> = {};
    for (const slot of slots) {
        const id = String(slot.id || '').trim();
        if (!id)
            continue;
        output[id] = {
            portability: slot.portability === 'portable' || slot.portability === 'blocked'
                ? slot.portability
                : 'local-only',
            sensitivity: slot.sensitivity === 'safe' || slot.sensitivity === 'intimate'
                ? slot.sensitivity
                : 'personal',
        };
    }
    return output;
}
export async function compilePortableMemorySlots(input: {
    aiClient: Pick<LocalChatTurnAiClient, 'generateObject'>;
    relationMemorySlots: RelationMemorySlot[];
    interactionSnapshot: InteractionSnapshot | null;
    recentSummaries?: string[];
    routeBinding?: RuntimeRouteBinding;
}): Promise<RelationMemorySlot[]> {
    if (input.relationMemorySlots.length === 0) {
        return [];
    }
    const fallback = input.relationMemorySlots.map((slot) => applyGovernance(slot, null));
    const summaryText = (input.recentSummaries || []).filter(Boolean).slice(0, 8).join('\n');
    const snapshotText = input.interactionSnapshot
        ? JSON.stringify({
            relationshipState: input.interactionSnapshot.relationshipState,
            emotionalTemperature: input.interactionSnapshot.emotionalTemperature,
            openLoops: input.interactionSnapshot.openLoops,
            userPrefs: input.interactionSnapshot.userPrefs,
        })
        : 'null';
    try {
        const response = await input.aiClient.generateObject({
            prompt: [
                '你是 local-chat 的记忆治理编译器。请只做可迁移性分级，不要改写内容。',
                '目标：为每条关系记忆槽位输出 portability 和 sensitivity。',
                '规则：',
                '- portability 只能是 portable | local-only | blocked',
                '- sensitivity 只能是 safe | personal | intimate',
                '- 明显显式性、第三方隐私、原始媒体细节 => blocked + intimate',
                '- 一般 promise / rapport / boundary 默认 local-only',
                '- 稳定、低风险、长期成立的偏好可以 portable',
                '- 只返回 JSON: {"slots":[{"id":"...","portability":"...","sensitivity":"..."}]}',
                `interactionSnapshot=${snapshotText}`,
                summaryText ? `recentSummaries=${summaryText}` : '',
                `slots=${JSON.stringify(input.relationMemorySlots.map((slot) => ({
                    id: slot.id,
                    slotType: slot.slotType,
                    key: slot.key,
                    value: slot.value,
                })))}`,
            ].filter(Boolean).join('\n'),
            routeBinding: input.routeBinding,
            maxTokens: 500,
            temperature: 0.1,
        });
        const governanceMap = parseGovernanceMap(response.object);
        return input.relationMemorySlots.map((slot) => applyGovernance(slot, governanceMap[slot.id]));
    }
    catch {
        return fallback;
    }
}
