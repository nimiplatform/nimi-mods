import type { InteractionBeat, RelationMemorySlot } from '../../state/index.js';
import { getLocalChatInteractionSnapshot, getLocalChatSession, listLocalChatMediaArtifacts, listLocalChatRelationMemorySlots, mergeLocalChatRelationMemorySlots, replaceLocalChatRecallIndex, upsertLocalChatInteractionSnapshot, } from '../../state/index.js';
import { createUlid } from '../../utils/ulid.js';
import { compileInteractionState } from './interaction-state-compiler.js';
import { compilePortableMemorySlots } from './portable-memory-compiler.js';
import { extractRelationMemoryCandidates } from './relation-memory-extractor.js';
import type { LocalChatTurnAiClient } from './types.js';
import { stripTrailingEndMarkerFragment } from './stream-end-marker.js';
import { type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
function normalizeBeatText(content: string): string {
    return stripTrailingEndMarkerFragment(content.replace(/\s+/g, ' ').trim());
}
function candidateToRelationMemorySlot(input: {
    targetId: string;
    viewerId: string;
    updatedAt: string;
    candidate: {
        slotType: RelationMemorySlot['slotType'];
        key: string;
        value: string;
        confidence: number;
    };
}): RelationMemorySlot {
    return {
        id: `slot_${createUlid()}`,
        targetId: input.targetId,
        viewerId: input.viewerId,
        slotType: input.candidate.slotType,
        key: input.candidate.key,
        value: input.candidate.value,
        confidence: input.candidate.confidence,
        portability: 'local-only',
        sensitivity: 'personal',
        userOverride: 'inherit',
        updatedAt: input.updatedAt,
    };
}
export async function persistLocalChatInteractionArtifacts(input: {
    aiClient: Pick<LocalChatTurnAiClient, 'generateObject'>;
    sessionId: string;
    targetId: string;
    viewerId: string;
    assistantTurnId: string;
    deliveredBeats: InteractionBeat[];
    routeBinding?: RuntimeRouteBinding | null;
    conversationDirective?: string | null;
    userText?: string | null;
}): Promise<void> {
    const [session, mediaArtifacts, previousSnapshot, existingSlots] = await Promise.all([
        getLocalChatSession(input.sessionId, input.viewerId),
        listLocalChatMediaArtifacts({ conversationId: input.sessionId, turnId: input.assistantTurnId }),
        getLocalChatInteractionSnapshot(input.sessionId),
        listLocalChatRelationMemorySlots({
            targetId: input.targetId,
            viewerId: input.viewerId,
        }),
    ]);
    const compiled = compileInteractionState({
        conversationId: input.sessionId,
        targetId: input.targetId,
        viewerId: input.viewerId,
        session,
        deliveredBeats: input.deliveredBeats,
        mediaArtifacts,
        conversationDirective: input.conversationDirective,
        previousSnapshot,
    });
    const extractedCandidates = await extractRelationMemoryCandidates({
        aiClient: input.aiClient,
        routeBinding: input.routeBinding,
        userText: input.userText,
        deliveredBeats: input.deliveredBeats,
        session,
        interactionSnapshot: compiled.snapshot,
        existingSlots,
        fallbackSlots: compiled.relationMemorySlots,
        limit: 3,
    });
    const governedCandidates = await compilePortableMemorySlots({
        aiClient: input.aiClient,
        relationMemorySlots: extractedCandidates.map((candidate) => candidateToRelationMemorySlot({
            targetId: input.targetId,
            viewerId: input.viewerId,
            updatedAt: compiled.snapshot.updatedAt,
            candidate,
        })),
        interactionSnapshot: compiled.snapshot,
        routeBinding: input.routeBinding || undefined,
        recentSummaries: [
            ...input.deliveredBeats.map((beat) => normalizeBeatText(beat.text)),
            ...mediaArtifacts.map((artifact) => normalizeBeatText(`${artifact.kind} ${artifact.model || ''} ${artifact.renderUri || ''}`)),
        ].filter(Boolean),
    });
    await Promise.all([
        upsertLocalChatInteractionSnapshot(compiled.snapshot),
        mergeLocalChatRelationMemorySlots({
            targetId: input.targetId,
            viewerId: input.viewerId,
            entries: governedCandidates,
            resolutionTexts: [
                input.userText || '',
                ...input.deliveredBeats.map((beat) => beat.text),
            ].filter(Boolean),
            maxEntries: 50,
        }),
        replaceLocalChatRecallIndex({
            conversationId: input.sessionId,
            docs: compiled.recallDocs,
        }),
    ]);
}
