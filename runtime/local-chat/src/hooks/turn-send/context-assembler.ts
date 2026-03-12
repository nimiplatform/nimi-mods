import type { LocalChatMemoryRecallResult, LocalChatTarget } from '../../data/index.js';
import { recallLocalChatMemoryForPrompt } from '../../data/index.js';
import type { LocalChatPromptProfile } from '../../prompt/index.js';
import { pt, type PromptLocale } from '../../prompt/prompt-locale.js';
import { getLocalChatInteractionSnapshot, listLocalChatExactHistoryTurns, listLocalChatRecallIndex, listLocalChatRelationMemorySlots, type DerivedInteractionProfile, type LocalChatContextRecentTurn, type LocalChatContextPacket, type LocalChatReplyPacingPlan, type RelationMemorySlot, type LocalChatTurn, type LocalChatTurnMode, type VoiceConversationMode, } from '../../state/index.js';
import { deriveInteractionProfile } from './interaction-profile.js';
import { getPromptLocale } from "@nimiplatform/sdk/mod";
export type AssembleLocalChatContextPacketInput = {
    text: string;
    viewerId: string;
    viewerDisplayName: string;
    selectedTarget: LocalChatTarget;
    selectedSessionId: string;
    allowMultiReply?: boolean;
    turnMode?: LocalChatTurnMode;
    voiceConversationMode?: VoiceConversationMode;
    profile?: LocalChatPromptProfile;
};
function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}
function asString(value: unknown): string {
    return String(value || '').trim();
}
function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => String(item || '').trim()).filter(Boolean);
}
function lexicalScore(haystack: string, query: string): number {
    const normalizedHaystack = haystack.toLowerCase();
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedHaystack || !normalizedQuery)
        return 0;
    if (normalizedHaystack.includes(normalizedQuery) || normalizedQuery.includes(normalizedHaystack)) {
        return 1;
    }
    const tokens = query
        .toLowerCase()
        .split(/[\s,.;:!?/\\|()[\]{}"'`]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2);
    if (!tokens.length) {
        return normalizedHaystack.includes(query.toLowerCase()) ? 1 : 0;
    }
    let hits = 0;
    for (const token of tokens) {
        if (normalizedHaystack.includes(token))
            hits += 1;
    }
    return hits / tokens.length;
}
function referenceScore(haystack: string, query: string): number {
    const score = lexicalScore(haystack, query);
    return score > 0 ? score : 0;
}
function recencyScore(updatedAt: string): number {
    const updatedMs = new Date(updatedAt).getTime();
    if (!Number.isFinite(updatedMs))
        return 0;
    const diffDays = Math.max(0, (Date.now() - updatedMs) / 86400000);
    if (diffDays <= 1)
        return 0.22;
    if (diffDays <= 7)
        return 0.14;
    if (diffDays <= 30)
        return 0.07;
    return 0;
}
function relationSlotTypeBoost(slotType: string, query: string): number {
    const normalized = query.toLowerCase();
    const emotionalQuery = /累|难过|委屈|安慰|抱抱|想你|孤单|害怕|烦|关系|暧昧|亲密|边界|promise|comfort|miss you/u.test(normalized);
    const relationalQuery = /一起|继续|陪|等零点|今晚|约定|记得|我们|还要|下次|回来|再聊|再见面|陪我|陪你/u.test(normalized);
    const preferenceQuery = /喜欢|偏好|讨厌|不想|想要|习惯|风格|爱吃|不爱|希望|最好|what|which|prefer/u.test(normalized);
    if (emotionalQuery) {
        if (slotType === 'rapport')
            return 0.32;
        if (slotType === 'promise')
            return 0.24;
        if (slotType === 'taboo')
            return 0.18;
        if (slotType === 'boundary')
            return 0.16;
        return 0.04;
    }
    if (relationalQuery) {
        if (slotType === 'rapport')
            return 0.3;
        if (slotType === 'promise')
            return 0.24;
        if (slotType === 'recurringCue')
            return 0.12;
        if (slotType === 'preference')
            return 0.06;
        return 0.03;
    }
    if (preferenceQuery) {
        if (slotType === 'preference')
            return 0.3;
        if (slotType === 'recurringCue')
            return 0.2;
        if (slotType === 'promise')
            return 0.08;
        return 0.03;
    }
    if (slotType === 'preference' || slotType === 'rapport')
        return 0.08;
    return 0;
}
const GREETING_RE = /^(?:hi|hello|hey|yo|你好|嗨|哈喽|在吗|早安|晚安|想你了|在不在|喂)[\s!,.?？！，。~]*$/iu;
const QUESTION_RE = /[?？]|为什么|怎么|如何|能不能|可不可以|是什么|什么意思|怎样|要不要/u;
const EMOTIONAL_RE = /难过|好累|很累|烦|崩溃|想哭|孤单|害怕|抱抱|安慰|委屈|想你/u;
const EXCITED_RE = /(?:[!！]{2,}|哈哈|hh+|lol|好耶|太好了|天啊|卧槽|真的耶|笑死)/iu;
const HIGH_EMOTION_RE = /难过|崩溃|想哭|害怕|焦虑|孤单|委屈|绝望|恐惧|暴怒/u;
const CONTINUATION_RE = /继续|还记得|刚才|说好的|上次|之前那个|那件事|remember|continue|we said|earlier|last time/iu;
const PREFERENCE_QUERY_RE = /喜欢|偏好|风格|节奏|语气|短句|交流|怎么聊|prefer|style|pace|tone|voice|image/iu;
type ApproachPacingHint = {
    energyOverride?: LocalChatReplyPacingPlan['energy'];
    segmentDelta: number;
};
function resolveApproachPacing(suggestedApproach?: string): ApproachPacingHint {
    if (!suggestedApproach)
        return { segmentDelta: 0 };
    const approach = suggestedApproach.toLowerCase();
    // Empathy-first strategies: allow more room for comfort followup
    if (/empathize|be-supportive|comfort|安慰|共情/u.test(approach)) {
        return { energyOverride: 'low', segmentDelta: 1 };
    }
    // Lighten-mood strategies: keep beat count but raise energy
    if (/lighten|playful|humor|逗|轻松/u.test(approach)) {
        return { energyOverride: 'medium', segmentDelta: 0 };
    }
    // Redirect/distract strategies: compact, gentle pivot
    if (/redirect|distract|转移/u.test(approach)) {
        return { energyOverride: 'low', segmentDelta: -1 };
    }
    return { segmentDelta: 0 };
}
export function derivePacingPlan(input: {
    text: string;
    interactionProfile: DerivedInteractionProfile;
    allowMultiReply: boolean;
    turnMode?: LocalChatTurnMode;
    emotionalHint?: string;
    suggestedApproach?: string;
    momentum?: 'accelerating' | 'steady' | 'cooling';
}): LocalChatReplyPacingPlan {
    const text = String(input.text || '').replace(/\s+/g, ' ').trim();
    const isGreeting = GREETING_RE.test(text);
    const isQuestion = QUESTION_RE.test(text);
    const isEmotional = EMOTIONAL_RE.test(text);
    const isExcited = EXCITED_RE.test(text);
    const profile = input.interactionProfile;
    const energetic = profile.expression.pacingBias === 'bursty';
    const intimate = profile.relationship.warmth === 'intimate';
    const gentle = profile.relationship.warmth === 'warm';
    const highEmotion = input.emotionalHint ? HIGH_EMOTION_RE.test(input.emotionalHint) : false;
    const approachHint = resolveApproachPacing(input.suggestedApproach);
    // Combined adjustments from momentum + suggestedApproach
    const momentumDelta = input.momentum === 'accelerating' ? 1
        : input.momentum === 'cooling' ? -1
            : 0;
    const totalDelta = momentumDelta + approachHint.segmentDelta;
    function applyAdjustments(plan: LocalChatReplyPacingPlan): LocalChatReplyPacingPlan {
        const energy = approachHint.energyOverride || plan.energy;
        if (totalDelta === 0 && energy === plan.energy)
            return plan;
        const adjusted = Math.max(1, Math.min(3, plan.maxSegments + totalDelta)) as 1 | 2 | 3;
        const mode: LocalChatReplyPacingPlan['mode'] = adjusted === 1 ? 'single'
            : adjusted === 2 ? (plan.mode === 'answer-followup' ? 'answer-followup' : 'burst-2')
                : 'burst-3';
        return { ...plan, maxSegments: adjusted, mode, energy };
    }
    if (input.turnMode === 'explicit-media') {
        return applyAdjustments({
            mode: 'answer-followup',
            maxSegments: 2,
            energy: 'medium',
            reason: 'explicit-media-needs-setup-and-delivery',
        });
    }
    if (input.turnMode === 'information') {
        return applyAdjustments({
            mode: isQuestion && input.allowMultiReply ? 'answer-followup' : 'single',
            maxSegments: isQuestion && input.allowMultiReply ? 2 : 1,
            energy: 'low',
            reason: 'information-prefers-compact',
        });
    }
    if (isEmotional || highEmotion) {
        return applyAdjustments({
            mode: 'answer-followup',
            maxSegments: highEmotion ? 3 : 2,
            energy: 'low',
            reason: highEmotion ? 'high-emotion-needs-extended-followup' : 'emotional-needs-soft-followup',
        });
    }
    if (isExcited && energetic) {
        return applyAdjustments({
            mode: 'burst-3',
            maxSegments: 3,
            energy: 'high',
            reason: 'playful-high-energy',
        });
    }
    if (isGreeting && (intimate || gentle || energetic)) {
        return applyAdjustments({
            mode: 'burst-2',
            maxSegments: 2,
            energy: gentle ? 'medium' : 'high',
            reason: 'greeting-needs-two-beats',
        });
    }
    if (intimate) {
        return applyAdjustments({
            mode: 'burst-3',
            maxSegments: 3,
            energy: 'medium',
            reason: 'intimate-scene-escalation',
        });
    }
    if (input.allowMultiReply && (gentle || energetic || isQuestion)) {
        return applyAdjustments({
            mode: isQuestion ? 'answer-followup' : 'burst-2',
            maxSegments: 2,
            energy: energetic ? 'medium' : 'low',
            reason: 'natural-delivery-style',
        });
    }
    return applyAdjustments({
        mode: 'single',
        maxSegments: 1,
        energy: energetic ? 'medium' : 'low',
        reason: 'default-single',
    });
}
function summarizeWorld(target: LocalChatTarget): string[] {
    const world = asRecord(target.world);
    const worldview = asRecord(target.worldview);
    const worldName = asString(world.name || world.title);
    const worldSummary = asString(world.summary || world.description);
    const worldviewName = asString(worldview.name || worldview.title);
    const worldviewSummary = asString(worldview.summary || worldview.description);
    const rules = asStringArray(worldview.rules);
    return [
        worldName ? `World: ${worldName}` : '',
        worldSummary ? `World Summary: ${worldSummary}` : '',
        worldviewName ? `Worldview: ${worldviewName}` : '',
        worldviewSummary ? `Worldview Summary: ${worldviewSummary}` : '',
        ...rules.slice(0, 4).map((rule) => `World Rule: ${rule}`),
    ].filter(Boolean);
}
function summarizeIdentity(target: LocalChatTarget, interactionProfile: DerivedInteractionProfile, locale: PromptLocale): {
    identityLines: string[];
    rulesLines: string[];
    replyStyleLines: string[];
    interactionProfileLines: string[];
} {
    const profile = asRecord(target.agentProfile);
    const metadata = asRecord(target.agentMetadata);
    const rules = [
        ...asStringArray(profile.rules),
        ...asStringArray(metadata.rules),
    ].slice(0, 8);
    const systemPromptBase = asString(profile.systemPromptBase || metadata.systemPromptBase);
    const persona = asString(profile.persona || asRecord(profile.dna).persona || metadata.persona);
    return {
        identityLines: [
            `Display Name: ${target.displayName}`,
            `Handle: ${target.handle}`,
            target.bio ? `Bio: ${target.bio}` : '',
            persona ? `Persona: ${persona}` : '',
            systemPromptBase ? `System Base: ${systemPromptBase}` : '',
        ].filter(Boolean),
        rulesLines: rules,
        replyStyleLines: [
            pt(locale, 'assembler.style.distance', { distance: interactionProfile.relationship.defaultDistance, warmth: interactionProfile.relationship.warmth }),
            pt(locale, 'assembler.style.firstBeat', { firstBeatStyle: interactionProfile.expression.firstBeatStyle, infoAnswerStyle: interactionProfile.expression.infoAnswerStyle }),
            pt(locale, 'assembler.style.naturalChat'),
        ],
        interactionProfileLines: [
            `expression=${interactionProfile.expression.responseLength}/${interactionProfile.expression.formality}/${interactionProfile.expression.sentiment}/${interactionProfile.expression.pacingBias}`,
            `relationship=${interactionProfile.relationship.defaultDistance}/${interactionProfile.relationship.warmth}/${interactionProfile.relationship.flirtAffinity}`,
            `voice=${interactionProfile.voice.voiceAffinity}/${interactionProfile.voice.genderGuard}/${interactionProfile.voice.language || 'auto'}`,
            `visual=${interactionProfile.visual.imageAffinity}/${interactionProfile.visual.videoAffinity}/${interactionProfile.visual.nsfwLevel || 'safe'}`,
        ],
    };
}
function buildRecentTurns(turns: LocalChatTurn[]): LocalChatContextRecentTurn[] {
    const grouped = new Map<string, LocalChatContextRecentTurn>();
    for (const turn of turns) {
        const key = `${turn.turnId}:${turn.turnSeq}`;
        const lineSource = String(turn.semanticSummary || '').trim();
        const contextText = String(turn.contextText || '').trim();
        const line = lineSource && lineSource !== contextText
            ? `${contextText} (${lineSource})`
            : contextText;
        const existing = grouped.get(key);
        if (existing) {
            if (line)
                existing.lines.push(line);
            continue;
        }
        grouped.set(key, {
            id: turn.turnId,
            seq: turn.turnSeq,
            role: turn.role,
            lines: line ? [line] : [],
        });
    }
    return [...grouped.values()].sort((left, right) => left.seq - right.seq);
}
function normalizeComparableTurnText(value: string): string {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}
function trimEchoedCurrentUserTurn(input: {
    recentTurns: LocalChatContextRecentTurn[];
    userInput: string;
}): LocalChatContextRecentTurn[] {
    const turns = [...input.recentTurns];
    if (!turns.length)
        return turns;
    const lastTurn = turns[turns.length - 1];
    if (!lastTurn || lastTurn.role !== 'user') {
        return turns;
    }
    const userInput = normalizeComparableTurnText(input.userInput);
    if (!userInput) {
        return turns;
    }
    const lastTurnText = normalizeComparableTurnText(lastTurn.lines.join(' '));
    if (lastTurnText && lastTurnText === userInput) {
        turns.pop();
    }
    return turns;
}
function toFirstBeatRecentTurns(turns: LocalChatContextRecentTurn[]): LocalChatContextRecentTurn[] {
    return turns.slice(-4);
}
function toFirstBeatSnapshot(snapshot: LocalChatContextPacket['interactionSnapshot']): LocalChatContextPacket['interactionSnapshot'] {
    if (!snapshot)
        return snapshot;
    return {
        ...snapshot,
        activeScene: snapshot.activeScene.slice(0, 1),
        assistantCommitments: snapshot.assistantCommitments.slice(0, 1),
        userPrefs: snapshot.userPrefs.slice(0, 1),
        openLoops: snapshot.openLoops.slice(0, 1),
        topicThreads: snapshot.topicThreads.slice(0, 2),
    };
}
function continuityReferenceBoost(input: {
    text: string;
    snapshot: LocalChatContextPacket['interactionSnapshot'];
    continuationLike: boolean;
}): number {
    if (!input.snapshot)
        return 0;
    const openLoopScore = Math.max(0, ...input.snapshot.openLoops.map((value) => referenceScore(input.text, value)));
    const commitmentScore = Math.max(0, ...input.snapshot.assistantCommitments.map((value) => referenceScore(input.text, value)));
    const topicScore = Math.max(0, ...input.snapshot.topicThreads.map((value) => referenceScore(input.text, value)));
    const strongBoost = input.continuationLike ? 0.52 : 0.2;
    const topicBoost = input.continuationLike ? 0.18 : 0.08;
    return (Math.max(openLoopScore, commitmentScore) * strongBoost
        + topicScore * topicBoost);
}
function pushUniqueById<T extends {
    id: string;
}>(target: T[], item: T | null | undefined): void {
    if (!item)
        return;
    if (target.some((entry) => entry.id === item.id))
        return;
    target.push(item);
}
function selectSessionRecall(docs: LocalChatContextPacket['recallIndex'], query: string, snapshot: LocalChatContextPacket['interactionSnapshot']): LocalChatContextPacket['sessionRecall'] {
    const entries = docs || [];
    if (entries.length === 0)
        return [];
    const continuationLike = CONTINUATION_RE.test(query);
    const strongReferences = [
        ...(snapshot?.openLoops || []),
        ...(snapshot?.assistantCommitments || []),
    ];
    const mustCarry = continuationLike
        ? [...entries]
            .map((doc, index) => ({
            doc,
            score: Math.max(...strongReferences.map((value) => referenceScore(doc.text, value)), 0) + ((snapshot?.lastResolvedTurnId && doc.sourceTurnId === snapshot.lastResolvedTurnId) ? 0.25 : 0),
            index,
        }))
            .filter((item) => item.score > 0.12)
            .sort((left, right) => right.score - left.score || right.index - left.index)
            .slice(0, 2)
            .map((item) => item.doc)
        : [];
    const selected: typeof mustCarry = [];
    mustCarry.forEach((doc) => pushUniqueById(selected, doc));
    [...entries]
        .map((doc, index) => ({
        doc,
        score: (lexicalScore(doc.text, query) * 1.45
            + continuityReferenceBoost({
                text: doc.text,
                snapshot,
                continuationLike,
            })
            + ((snapshot?.lastResolvedTurnId && doc.sourceTurnId === snapshot.lastResolvedTurnId) ? 0.28 : 0)
            + ((entries.length - index) / Math.max(1, entries.length)) * 0.18),
        index,
    }))
        .sort((left, right) => right.score - left.score || right.index - left.index)
        .forEach((item) => {
        if (selected.length >= 6)
            return;
        pushUniqueById(selected, item.doc);
    });
    return selected
        .slice(0, 6)
        .map((doc) => ({
        id: doc.id,
        text: doc.text,
        sourceKind: doc.sourceTurnId ? 'turn' as const : 'recall-index' as const,
        sourceTurnId: doc.sourceTurnId,
    }));
}
function selectRelationMemorySlots(slots: LocalChatContextPacket['relationMemorySlots'], query: string, snapshot: LocalChatContextPacket['interactionSnapshot']): LocalChatContextPacket['relationMemorySlots'] {
    const entries = slots || [];
    const continuationLike = CONTINUATION_RE.test(query);
    const preferenceLike = PREFERENCE_QUERY_RE.test(query);
    const mustCarry: RelationMemorySlot[] = [];
    if (continuationLike && snapshot) {
        [...entries]
            .filter((entry) => entry.slotType === 'promise' || entry.slotType === 'rapport' || entry.slotType === 'preference')
            .map((entry) => ({
            entry,
            score: Math.max(...[
                ...snapshot.openLoops,
                ...snapshot.assistantCommitments,
            ].map((value) => referenceScore(`${entry.key} ${entry.value}`, value)), 0),
        }))
            .filter((item) => item.score > 0.12)
            .sort((left, right) => right.score - left.score || right.entry.updatedAt.localeCompare(left.entry.updatedAt))
            .slice(0, 2)
            .forEach((item) => pushUniqueById(mustCarry, item.entry));
    }
    if (preferenceLike) {
        [...entries]
            .filter((entry) => entry.slotType === 'preference')
            .map((entry) => ({
            entry,
            score: (lexicalScore(`${entry.key} ${entry.value}`, query) * 1.4
                + entry.confidence
                + relationSlotTypeBoost(entry.slotType, query)),
        }))
            .sort((left, right) => right.score - left.score || right.entry.updatedAt.localeCompare(left.entry.updatedAt))
            .slice(0, 1)
            .forEach((item) => pushUniqueById(mustCarry, item.entry));
    }
    const ranked = [...entries]
        .map((entry) => ({
        entry,
        score: (lexicalScore(`${entry.key} ${entry.value}`, query) * 1.35
            + entry.confidence
            + recencyScore(entry.updatedAt)
            + relationSlotTypeBoost(entry.slotType, query)
            + continuityReferenceBoost({
                text: `${entry.key} ${entry.value}`,
                snapshot,
                continuationLike,
            })),
    }))
        .sort((left, right) => right.score - left.score || right.entry.updatedAt.localeCompare(left.entry.updatedAt))
        .map((item) => item.entry);
    const selected: RelationMemorySlot[] = [];
    mustCarry.forEach((entry) => pushUniqueById(selected, entry));
    ranked.forEach((entry) => {
        if (selected.length >= 8)
            return;
        pushUniqueById(selected, entry);
    });
    return selected.slice(0, 8);
}
function toWarmStartMemory(result: LocalChatMemoryRecallResult | null): LocalChatContextPacket['platformWarmStart'] {
    if (!result)
        return null;
    if (result.coreMemory.length === 0 && result.e2eMemory.length === 0)
        return null;
    return {
        core: [...result.coreMemory],
        e2e: [...result.e2eMemory],
        recallSource: result.recallSource,
        entityId: result.entityId,
    };
}
export async function assembleLocalChatContextPacket(input: AssembleLocalChatContextPacketInput): Promise<LocalChatContextPacket> {
    const profile = input.profile || 'full-turn';
    const isFirstBeatProfile = profile === 'first-beat';
    const [recentTurnsRaw, interactionSnapshotRaw, relationMemorySlots, recallIndex] = await Promise.all([
        listLocalChatExactHistoryTurns(input.selectedSessionId, input.viewerId),
        getLocalChatInteractionSnapshot(input.selectedSessionId),
        isFirstBeatProfile
            ? Promise.resolve([])
            : listLocalChatRelationMemorySlots({
                targetId: input.selectedTarget.id,
                viewerId: input.viewerId,
            }),
        isFirstBeatProfile
            ? Promise.resolve([])
            : listLocalChatRecallIndex(input.selectedSessionId),
    ]);
    const interactionProfile = deriveInteractionProfile(input.selectedTarget);
    const recentTurns = trimEchoedCurrentUserTurn({
        recentTurns: buildRecentTurns(recentTurnsRaw),
        userInput: input.text,
    });
    const interactionSnapshot = isFirstBeatProfile
        ? toFirstBeatSnapshot(interactionSnapshotRaw)
        : interactionSnapshotRaw;
    const selectedRecentTurns = isFirstBeatProfile
        ? toFirstBeatRecentTurns(recentTurns)
        : recentTurns;
    const warmStart = !isFirstBeatProfile && !interactionSnapshot && recentTurns.length <= 1
        ? await recallLocalChatMemoryForPrompt({
            target: input.selectedTarget,
            viewerId: input.viewerId,
            userInput: input.text,
            topK: 6,
        }).catch(() => null)
        : null;
    const promptLocale = getPromptLocale();
    const identity = summarizeIdentity(input.selectedTarget, interactionProfile, promptLocale);
    const pacingPlan = derivePacingPlan({
        text: input.text,
        interactionProfile,
        allowMultiReply: Boolean(input.allowMultiReply),
        turnMode: input.turnMode,
    });
    const selectedRelationMemory = isFirstBeatProfile
        ? []
        : selectRelationMemorySlots(relationMemorySlots, input.text, interactionSnapshot);
    const selectedSessionRecall = isFirstBeatProfile
        ? []
        : selectSessionRecall(recallIndex, input.text, interactionSnapshot);
    return {
        conversationId: input.selectedSessionId,
        viewer: {
            id: input.viewerId,
            displayName: input.viewerDisplayName,
        },
        target: {
            id: input.selectedTarget.id,
            handle: input.selectedTarget.handle,
            displayName: input.selectedTarget.displayName,
            bio: input.selectedTarget.bio,
            identityLines: identity.identityLines,
            rulesLines: identity.rulesLines,
            replyStyleLines: identity.replyStyleLines,
            interactionProfileLines: identity.interactionProfileLines,
            interactionProfile,
        },
        world: {
            worldId: input.selectedTarget.worldId,
            lines: summarizeWorld(input.selectedTarget),
        },
        platformWarmStart: toWarmStartMemory(warmStart),
        sessionRecall: selectedSessionRecall,
        recentTurns: selectedRecentTurns,
        interactionSnapshot,
        relationMemorySlots: selectedRelationMemory,
        recallIndex: isFirstBeatProfile ? [] : recallIndex,
        turnMode: input.turnMode,
        voiceConversationMode: input.voiceConversationMode,
        pacingPlan,
        promptLocale,
        userInput: input.text,
        diagnostics: {
            selectedTurnSeqs: selectedRecentTurns.map((turn) => turn.seq),
            sessionRecallCount: selectedSessionRecall.length,
        },
    };
}
