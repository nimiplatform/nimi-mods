import { buildLocalChatCompiledPrompt, type LocalChatTarget, } from '../../data/index.js';
import type { LocalChatCompiledPrompt, LocalChatPromptProfile } from '../../prompt/index.js';
import type { LocalChatContextPacket, LocalChatTurnMode, VoiceConversationMode } from '../../state/index.js';
import { assembleLocalChatContextPacket } from './context-assembler.js';
import { type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
const MAX_SEGMENT_TOKENS = 2048;
type BuildTurnRequestInput = {
    text: string;
    viewerId: string;
    viewerDisplayName: string;
    selectedTarget: LocalChatTarget;
    selectedSessionId: string;
    runtimeMode: 'STORY' | 'SCENE_TURN' | undefined;
    routeBinding: RuntimeRouteBinding | null;
    allowMultiReply: boolean;
    turnMode?: LocalChatTurnMode;
    voiceConversationMode?: VoiceConversationMode;
    profile?: LocalChatPromptProfile;
};
export type TurnInvokeInput = {
    capability: 'text.generate';
    prompt: string;
    maxTokens?: number;
    mode: 'STORY' | 'SCENE_TURN';
    worldId?: string;
    agentId: string;
    routeBinding?: RuntimeRouteBinding;
};
function normalizeTurnMode(mode: BuildTurnRequestInput['runtimeMode']): 'STORY' | 'SCENE_TURN' {
    return mode === 'SCENE_TURN' ? 'SCENE_TURN' : 'STORY';
}
export async function buildTurnRequestInput(input: BuildTurnRequestInput): Promise<{
    prompt: string;
    contextPacket: LocalChatContextPacket;
    compiledPrompt: LocalChatCompiledPrompt;
    invokeInput: TurnInvokeInput;
}> {
    const contextPacket = await assembleLocalChatContextPacket(input);
    const compiledPrompt = buildLocalChatCompiledPrompt({
        contextPacket,
        profile: input.profile,
    });
    const prompt = compiledPrompt.prompt;
    const invokeInput: TurnInvokeInput = {
        capability: 'text.generate',
        prompt,
        maxTokens: MAX_SEGMENT_TOKENS,
        mode: normalizeTurnMode(input.runtimeMode),
        worldId: input.selectedTarget.worldId || undefined,
        agentId: input.selectedTarget.id,
        routeBinding: input.routeBinding || undefined,
    };
    return {
        prompt,
        contextPacket,
        compiledPrompt,
        invokeInput,
    };
}
