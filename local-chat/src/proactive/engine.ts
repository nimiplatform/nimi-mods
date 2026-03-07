import { createLocalChatFlowId } from '../logging.js';
import {
  appendTurnsToSession,
  listAllLocalChatSessions,
  loadLocalChatDefaultSettings,
} from '../state/index.js';
import {
  listLocalChatTargets,
  resolveLocalChatTargetDetail,
} from '../data/index.js';
import { emitLocalChatProactiveAuditEvent } from './audit.js';
import {
  generateLocalChatProactiveDecision,
} from './decision.js';
import {
  evaluateLocalChatProactivePolicy,
  recordLocalChatProactiveContact,
  resolveLocalChatWakeStrategy,
} from './policy.js';
import type {
  LocalChatProactiveAuditEvent,
  LocalChatProactiveHeartbeatInput,
} from './types.js';
import { ReasonCode } from '@nimiplatform/sdk/types';
import { assembleLocalChatContextPacket } from '../hooks/turn-send/context-assembler.js';

function toErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

function parseLastUserIdleMs(input: {
  nowMs: number;
  sessionUpdatedAt: string;
  turns: Array<{ role: string; timestamp?: string }>;
}): number | null {
  const turns = input.turns;
  if (!Array.isArray(turns) || turns.length === 0) return null;
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn || lastTurn.role !== 'user') return null;
  const lastUserAtMs = Date.parse(String(lastTurn.timestamp || input.sessionUpdatedAt || ''));
  if (!Number.isFinite(lastUserAtMs)) return null;
  return input.nowMs - lastUserAtMs;
}

function createProactiveTurn(message: string, nowMs: number): {
  id: string;
  role: 'assistant';
  kind: 'text';
  content: string;
  contextText: string;
  semanticSummary: null;
  timestamp: string;
  bundleId: string;
  bundleSeq: number;
} {
  return {
    id: `turn-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'assistant',
    kind: 'text',
    content: message,
    contextText: message,
    semanticSummary: null,
    timestamp: new Date(nowMs).toISOString(),
    bundleId: '',
    bundleSeq: 0,
  };
}

function emitAudit(
  sink: (event: LocalChatProactiveAuditEvent) => void,
  event: LocalChatProactiveAuditEvent,
): void {
  try {
    sink(event);
  } catch {
    // Audit sink failure must not stop proactive flow.
  }
}

export async function runLocalChatProactiveHeartbeatCycle(
  input: LocalChatProactiveHeartbeatInput,
): Promise<void> {
  const flowId = createLocalChatFlowId('local-chat-proactive-heartbeat');
  const nowMsCandidate = input.nowMs ? Number(input.nowMs()) : Date.now();
  const nowMs = Number.isFinite(nowMsCandidate) ? nowMsCandidate : Date.now();
  const auditSink = input.onAuditEvent || emitLocalChatProactiveAuditEvent;

  const settings = loadLocalChatDefaultSettings();
  const context = input.getReadContext();
  const targets = await listLocalChatTargets(context);
  if (targets.length === 0) return;

  const targetsById = new Map(targets.map((target) => [target.id, target]));
  const sessions = (await listAllLocalChatSessions(context.viewerId || undefined))
    .filter((session) => targetsById.has(session.targetId));

  for (const session of sessions) {
    const idleMs = parseLastUserIdleMs({
      nowMs,
      sessionUpdatedAt: String(session.updatedAt || ''),
      turns: Array.isArray(session.turns) ? session.turns : [],
    });
    if (!Number.isFinite(idleMs)) continue;
    const resolvedIdleMs = Number(idleMs);

    const seed = targetsById.get(session.targetId);
    if (!seed) continue;
    const target = (
      await resolveLocalChatTargetDetail(context, seed as unknown as Record<string, unknown>)
    ) || seed;

    const wakeStrategy = resolveLocalChatWakeStrategy(target);
    const policy = evaluateLocalChatProactivePolicy({
      allowProactiveContact: settings.allowProactiveContact,
      wakeStrategy,
      targetId: target.id,
      sessionId: session.id,
      idleMs: resolvedIdleMs,
      nowMs,
    });

    emitAudit(auditSink, {
      flowId,
      source: 'runLocalChatProactiveHeartbeatCycle',
      targetId: target.id,
      sessionId: session.id,
      reasonCode: policy.reasonCode,
      actionHint: policy.actionHint,
      level: policy.allowed ? 'debug' : 'info',
      details: {
        idleMs: resolvedIdleMs,
        wakeStrategy: wakeStrategy || null,
      },
    });

    if (!policy.allowed) continue;

    try {
      const contextPacket = await assembleLocalChatContextPacket({
        text: '',
        viewerId: session.viewerId,
        viewerDisplayName: 'User',
        selectedTarget: target,
        selectedSessionId: session.id,
      });
      const decision = await generateLocalChatProactiveDecision({
        aiClient: input.aiClient,
        target,
        contextPacket,
      });

      if (!decision.shouldContact || !decision.message) {
        emitAudit(auditSink, {
          flowId,
          source: 'runLocalChatProactiveHeartbeatCycle',
          targetId: target.id,
          sessionId: session.id,
          reasonCode: ReasonCode.LOCAL_CHAT_PROACTIVE_ALLOWED,
          actionHint: 'model-decision-no-contact',
          level: 'debug',
          details: {
            decisionReason: decision.reason || '',
          },
        });
        continue;
      }

      await appendTurnsToSession(session.id, [createProactiveTurn(decision.message, nowMs)]);
      recordLocalChatProactiveContact({
        targetId: target.id,
        atMs: nowMs,
      });

      emitAudit(auditSink, {
        flowId,
        source: 'runLocalChatProactiveHeartbeatCycle',
        targetId: target.id,
        sessionId: session.id,
        reasonCode: ReasonCode.LOCAL_CHAT_PROACTIVE_ALLOWED,
        actionHint: 'contact-sent',
        level: 'info',
        details: {
          decisionReason: decision.reason || '',
        },
      });
      break;
    } catch (error) {
      emitAudit(auditSink, {
        flowId,
        source: 'runLocalChatProactiveHeartbeatCycle',
        targetId: target.id,
        sessionId: session.id,
        reasonCode: ReasonCode.LOCAL_CHAT_PROACTIVE_POLICY_UNAVAILABLE,
        actionHint: 'decision-generation-failed',
        level: 'warn',
        details: {
          error: toErrorText(error),
        },
      });
    }
  }
}
