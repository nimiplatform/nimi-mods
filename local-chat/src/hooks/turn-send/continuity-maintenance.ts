import { z } from 'zod';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatTarget } from '../../data/index.js';
import {
  getLocalChatRunningSummary,
  listLocalChatDurableMemoryEntries,
  listLocalChatTurnBundles,
  type LocalChatDurableMemoryEntry,
  type LocalChatMemoryType,
  type LocalChatRunningSummary,
  type LocalChatTurnBundle,
  upsertLocalChatDurableMemoryEntries,
  upsertLocalChatRunningSummary,
} from '../../state/index.js';
import { createUlid } from '../../utils/ulid.js';
import type { LocalChatTurnAiClient } from './types.js';

const CONTINUITY_TIMEOUT_MS = 1_500;
const RECENT_EXACT_WINDOW = 8;
const SUMMARY_ASSISTANT_INTERVAL = 4;

const summarySchema = z.object({
  relationshipState: z.array(z.string().min(1).max(240)).max(6).default([]),
  userFactsEstablished: z.array(z.string().min(1).max(240)).max(10).default([]),
  assistantCommitments: z.array(z.string().min(1).max(240)).max(8).default([]),
  openLoops: z.array(z.string().min(1).max(240)).max(8).default([]),
  sceneState: z.array(z.string().min(1).max(240)).max(6).default([]),
});

const memoryCandidateSchema = z.object({
  slotKey: z.string().min(1).max(120),
  content: z.string().min(1).max(240),
  confidence: z.number().min(0).max(1).default(0.7),
  importance: z.number().min(0).max(1).default(0.5),
  status: z.enum(['active', 'resolved']).default('active'),
});

const memoryWriterSchema = z.object({
  relationshipState: z.array(memoryCandidateSchema).max(4).default([]),
  userFacts: z.array(memoryCandidateSchema).max(6).default([]),
  preferences: z.array(memoryCandidateSchema).max(6).default([]),
  boundaries: z.array(memoryCandidateSchema).max(4).default([]),
  assistantCommitments: z.array(memoryCandidateSchema).max(6).default([]),
  openLoops: z.array(memoryCandidateSchema).max(6).default([]),
});

function visibleSegments(bundle: LocalChatTurnBundle): LocalChatTurnBundle['segments'] {
  return bundle.segments.filter((segment) => Boolean(segment.contextText || segment.semanticSummary || segment.content));
}

function visibleBundles(bundles: LocalChatTurnBundle[]): LocalChatTurnBundle[] {
  return bundles.filter((bundle) => visibleSegments(bundle).length > 0);
}

function bundleText(bundle: LocalChatTurnBundle): string {
  return visibleSegments(bundle)
    .map((segment) => {
      const summary = String(segment.semanticSummary || '').trim();
      const context = String(segment.contextText || '').trim();
      return summary && summary !== context ? `${context} (${summary})` : context;
    })
    .filter(Boolean)
    .join('\n');
}

function stringifySummary(summary: LocalChatRunningSummary | null): string {
  if (!summary) return '(empty)';
  return [
    ...summary.relationshipState.map((line) => `relationship: ${line}`),
    ...summary.userFactsEstablished.map((line) => `user-fact: ${line}`),
    ...summary.assistantCommitments.map((line) => `assistant-commitment: ${line}`),
    ...summary.openLoops.map((line) => `open-loop: ${line}`),
    ...summary.sceneState.map((line) => `scene: ${line}`),
  ].join('\n') || '(empty)';
}

function parseStrictJsonObject(text: string): Record<string, unknown> {
  const normalized = String(text || '').trim();
  if (!normalized.startsWith('{') || !normalized.endsWith('}')) {
    throw new Error('LOCAL_CHAT_CONTINUITY_INVALID_JSON');
  }
  const parsed = JSON.parse(normalized);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LOCAL_CHAT_CONTINUITY_INVALID_OBJECT');
  }
  return parsed as Record<string, unknown>;
}

function parseSummaryObject(text: string): Record<string, unknown> {
  const parsed = parseStrictJsonObject(text);
  const result = summarySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('LOCAL_CHAT_RUNNING_SUMMARY_SCHEMA_INVALID');
  }
  return result.data;
}

function parseMemoryObject(text: string): Record<string, unknown> {
  const parsed = parseStrictJsonObject(text);
  const result = memoryWriterSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('LOCAL_CHAT_DURABLE_MEMORY_SCHEMA_INVALID');
  }
  return result.data;
}

function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONTINUITY_TIMEOUT_MS);
  return task(controller.signal).finally(() => {
    clearTimeout(timeout);
  });
}

function buildSummaryPrompt(input: {
  target: LocalChatTarget;
  currentSummary: LocalChatRunningSummary | null;
  evictedBundles: LocalChatTurnBundle[];
}): string {
  return [
    `你在为 ${input.target.displayName} 的 local-chat 会话更新 continuity summary。`,
    '只总结已经被 recent exact window 淘汰的历史，不要重复 recent window 内的内容。',
    '严格输出 JSON，不要输出解释。',
    'JSON 格式：',
    '{"relationshipState":[],"userFactsEstablished":[],"assistantCommitments":[],"openLoops":[],"sceneState":[]}',
    '',
    '当前已有 summary：',
    stringifySummary(input.currentSummary),
    '',
    '需要并入 summary 的淘汰历史：',
    ...input.evictedBundles.map((bundle) => `${bundle.role === 'assistant' ? 'Assistant' : 'User'} #${bundle.seq}\n${bundleText(bundle)}`),
  ].join('\n');
}

function buildMemoryPrompt(input: {
  target: LocalChatTarget;
  currentSummary: LocalChatRunningSummary | null;
  durableMemory: LocalChatDurableMemoryEntry[];
  recentUserBundle: LocalChatTurnBundle | null;
  latestAssistantBundle: LocalChatTurnBundle;
}): string {
  const durableLines = input.durableMemory
    .filter((entry) => entry.status === 'active')
    .map((entry) => `[${entry.type}/${entry.slotKey}] ${entry.content}`)
    .join('\n') || '(empty)';
  return [
    `你在为 ${input.target.displayName} 的 local-chat 会话提炼 typed durable memory。`,
    '只提炼稳定、值得跨 session 保留的一致性信息。',
    '如果没有足够稳定的信息，对应数组返回空。',
    'assistant-commitment 和 open-loop 可以标记为 active 或 resolved。',
    '严格输出 JSON，不要输出解释。',
    'JSON 格式：',
    '{"relationshipState":[{"slotKey":"","content":"","confidence":0.0,"importance":0.0,"status":"active"}],"userFacts":[],"preferences":[],"boundaries":[],"assistantCommitments":[],"openLoops":[]}',
    '',
    '当前 running summary：',
    stringifySummary(input.currentSummary),
    '',
    '当前 active durable memory：',
    durableLines,
    '',
    '最近用户 bundle：',
    input.recentUserBundle ? bundleText(input.recentUserBundle) : '(none)',
    '',
    '最新 assistant bundle：',
    bundleText(input.latestAssistantBundle) || '(empty)',
  ].join('\n');
}

function shouldRefreshRunningSummary(bundles: LocalChatTurnBundle[], currentSummary: LocalChatRunningSummary | null): {
  shouldRun: boolean;
  evictedBundles: LocalChatTurnBundle[];
  nextWatermark: number;
} {
  const visible = visibleBundles(bundles);
  if (visible.length <= RECENT_EXACT_WINDOW) {
    return {
      shouldRun: false,
      evictedBundles: [],
      nextWatermark: currentSummary?.lastSummarizedBundleSeq || 0,
    };
  }
  const recent = visible.slice(-RECENT_EXACT_WINDOW);
  const recentStartSeq = recent[0]?.seq || 0;
  const lastWatermark = currentSummary?.lastSummarizedBundleSeq || 0;
  const evictedBundles = visible.filter((bundle) => bundle.seq < recentStartSeq && bundle.seq > lastWatermark);
  if (evictedBundles.length === 0) {
    return {
      shouldRun: false,
      evictedBundles: [],
      nextWatermark: lastWatermark,
    };
  }
  const assistantSinceWatermark = visible.filter((bundle) => bundle.role === 'assistant' && bundle.seq > lastWatermark).length;
  return {
    shouldRun: assistantSinceWatermark >= SUMMARY_ASSISTANT_INTERVAL || lastWatermark === 0,
    evictedBundles,
    nextWatermark: evictedBundles[evictedBundles.length - 1]?.seq || lastWatermark,
  };
}

function normalizeMemoryType(group: keyof z.infer<typeof memoryWriterSchema>): LocalChatMemoryType {
  switch (group) {
    case 'relationshipState':
      return 'relationship-state';
    case 'userFacts':
      return 'user-fact';
    case 'preferences':
      return 'preference';
    case 'boundaries':
      return 'boundary';
    case 'assistantCommitments':
      return 'assistant-commitment';
    case 'openLoops':
      return 'open-loop';
    default:
      return 'user-fact';
  }
}

function normalizeMemorySubject(type: LocalChatMemoryType): LocalChatDurableMemoryEntry['subject'] {
  if (type === 'relationship-state') return 'relationship';
  if (type === 'assistant-commitment') return 'agent';
  return 'viewer';
}

function applySlotUpsert(input: {
  existing: LocalChatDurableMemoryEntry[];
  targetId: string;
  viewerId: string;
  type: LocalChatMemoryType;
  candidate: z.infer<typeof memoryCandidateSchema>;
  sourceBundleSeqs: number[];
}): LocalChatDurableMemoryEntry[] {
  const active = input.existing.find((entry) => (
    entry.type === input.type
    && entry.slotKey === input.candidate.slotKey
    && entry.status === 'active'
  )) || null;
  if (active && active.content === input.candidate.content) {
    return [{
      ...active,
      confidence: Math.max(active.confidence, input.candidate.confidence),
      importance: Math.max(active.importance, input.candidate.importance),
      updatedAt: new Date().toISOString(),
      sourceBundleSeqs: Array.from(new Set([...active.sourceBundleSeqs, ...input.sourceBundleSeqs])),
    }];
  }
  const next: LocalChatDurableMemoryEntry[] = [];
  if (active) {
    next.push({
      ...active,
      status: 'superseded',
      updatedAt: new Date().toISOString(),
    });
  }
  next.push({
    id: `mem_${createUlid()}`,
    targetId: input.targetId,
    viewerId: input.viewerId,
    type: input.type,
    subject: normalizeMemorySubject(input.type),
    slotKey: input.candidate.slotKey,
    content: input.candidate.content,
    confidence: input.candidate.confidence,
    importance: input.candidate.importance,
    status: 'active',
    sourceBundleSeqs: input.sourceBundleSeqs,
    supersedesIds: active ? [active.id] : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return next;
}

function applyAppendOrResolve(input: {
  existing: LocalChatDurableMemoryEntry[];
  targetId: string;
  viewerId: string;
  type: LocalChatMemoryType;
  candidate: z.infer<typeof memoryCandidateSchema>;
  sourceBundleSeqs: number[];
}): LocalChatDurableMemoryEntry[] {
  const active = input.existing.find((entry) => (
    entry.type === input.type
    && entry.slotKey === input.candidate.slotKey
    && entry.status === 'active'
  )) || null;
  if (input.candidate.status === 'resolved') {
    if (!active) return [];
    return [{
      ...active,
      status: 'resolved',
      updatedAt: new Date().toISOString(),
      sourceBundleSeqs: Array.from(new Set([...active.sourceBundleSeqs, ...input.sourceBundleSeqs])),
    }];
  }
  if (active && active.content === input.candidate.content) {
    return [{
      ...active,
      confidence: Math.max(active.confidence, input.candidate.confidence),
      importance: Math.max(active.importance, input.candidate.importance),
      updatedAt: new Date().toISOString(),
      sourceBundleSeqs: Array.from(new Set([...active.sourceBundleSeqs, ...input.sourceBundleSeqs])),
    }];
  }
  return [{
    id: `mem_${createUlid()}`,
    targetId: input.targetId,
    viewerId: input.viewerId,
    type: input.type,
    subject: normalizeMemorySubject(input.type),
    slotKey: input.candidate.slotKey,
    content: input.candidate.content,
    confidence: input.candidate.confidence,
    importance: input.candidate.importance,
    status: 'active',
    sourceBundleSeqs: input.sourceBundleSeqs,
    supersedesIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }];
}

async function refreshRunningSummary(input: {
  aiClient: Pick<LocalChatTurnAiClient, 'generateObject'>;
  routeOverride: RuntimeRouteBinding | null;
  target: LocalChatTarget;
  conversationId: string;
  bundles: LocalChatTurnBundle[];
}): Promise<LocalChatRunningSummary | null> {
  const currentSummary = await getLocalChatRunningSummary(input.conversationId);
  const refresh = shouldRefreshRunningSummary(input.bundles, currentSummary);
  if (!refresh.shouldRun || refresh.evictedBundles.length === 0) {
    return currentSummary;
  }
  try {
    const result = await withTimeout((abortSignal) => input.aiClient.generateObject({
      routeHint: 'chat/default',
      routeOverride: input.routeOverride || undefined,
      mode: 'STORY',
      worldId: input.target.worldId || undefined,
      agentId: input.target.id,
      prompt: buildSummaryPrompt({
        target: input.target,
        currentSummary,
        evictedBundles: refresh.evictedBundles,
      }),
      maxTokens: 320,
      temperature: 0.1,
      abortSignal,
      parse: parseSummaryObject,
    }));
    const parsed = summarySchema.safeParse(result.object);
    if (!parsed.success) {
      return currentSummary;
    }
    return await upsertLocalChatRunningSummary({
      conversationId: input.conversationId,
      relationshipState: parsed.data.relationshipState,
      userFactsEstablished: parsed.data.userFactsEstablished,
      assistantCommitments: parsed.data.assistantCommitments,
      openLoops: parsed.data.openLoops,
      sceneState: parsed.data.sceneState,
      updatedAt: new Date().toISOString(),
      lastSummarizedBundleSeq: refresh.nextWatermark,
    });
  } catch {
    return currentSummary;
  }
}

async function writeDurableMemory(input: {
  aiClient: Pick<LocalChatTurnAiClient, 'generateObject'>;
  routeOverride: RuntimeRouteBinding | null;
  target: LocalChatTarget;
  viewerId: string;
  conversationId: string;
  bundles: LocalChatTurnBundle[];
  runningSummary: LocalChatRunningSummary | null;
}): Promise<void> {
  const visible = visibleBundles(input.bundles);
  const latestAssistantBundle = [...visible].reverse().find((bundle) => bundle.role === 'assistant') || null;
  if (!latestAssistantBundle) return;
  const recentUserBundle = [...visible]
    .reverse()
    .find((bundle) => bundle.role === 'user' && bundle.seq < latestAssistantBundle.seq) || null;
  const existing = await listLocalChatDurableMemoryEntries({
    targetId: input.target.id,
    viewerId: input.viewerId,
    includeResolved: true,
  });
  try {
    const result = await withTimeout((abortSignal) => input.aiClient.generateObject({
      routeHint: 'chat/default',
      routeOverride: input.routeOverride || undefined,
      mode: 'STORY',
      worldId: input.target.worldId || undefined,
      agentId: input.target.id,
      prompt: buildMemoryPrompt({
        target: input.target,
        currentSummary: input.runningSummary,
        durableMemory: existing,
        recentUserBundle,
        latestAssistantBundle,
      }),
      maxTokens: 360,
      temperature: 0.1,
      abortSignal,
      parse: parseMemoryObject,
    }));
    const parsed = memoryWriterSchema.safeParse(result.object);
    if (!parsed.success) return;
    const sourceBundleSeqs = [latestAssistantBundle.seq, recentUserBundle?.seq || 0].filter((value) => value > 0);
    const pendingWrites: LocalChatDurableMemoryEntry[] = [];
    (Object.keys(parsed.data) as Array<keyof typeof parsed.data>).forEach((group) => {
      parsed.data[group].forEach((candidate) => {
        const type = normalizeMemoryType(group);
        const groupWrites = group === 'assistantCommitments' || group === 'openLoops'
          ? applyAppendOrResolve({
            existing,
            targetId: input.target.id,
            viewerId: input.viewerId,
            type,
            candidate,
            sourceBundleSeqs,
          })
          : applySlotUpsert({
            existing,
            targetId: input.target.id,
            viewerId: input.viewerId,
            type,
            candidate,
            sourceBundleSeqs,
          });
        pendingWrites.push(...groupWrites);
      });
    });
    if (pendingWrites.length === 0) return;
    await upsertLocalChatDurableMemoryEntries(pendingWrites);
  } catch {
    // Silent degrade by design.
  }
}

export async function runLocalChatContinuityMaintenance(input: {
  aiClient: Pick<LocalChatTurnAiClient, 'generateObject'>;
  routeOverride: RuntimeRouteBinding | null;
  conversationId: string;
  viewerId: string;
  target: LocalChatTarget;
}): Promise<void> {
  const bundles = await listLocalChatTurnBundles(input.conversationId);
  if (bundles.length === 0) return;
  const runningSummary = await refreshRunningSummary({
    aiClient: input.aiClient,
    routeOverride: input.routeOverride,
    target: input.target,
    conversationId: input.conversationId,
    bundles,
  });
  await writeDurableMemory({
    aiClient: input.aiClient,
    routeOverride: input.routeOverride,
    target: input.target,
    viewerId: input.viewerId,
    conversationId: input.conversationId,
    bundles,
    runningSummary,
  });
}
