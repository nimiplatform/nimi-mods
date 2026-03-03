import type { TextplayShellProps } from '../components/textplay-shell.js';
import type { NarrativeTurnWindowResponse, TextplayRenderRequest } from '../data/schemas.js';
import type { TextplayPersistRecord, TextplayStoryDetail } from '../types.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstNonEmptyText(values: unknown[]): string {
  for (const value of values) {
    const text = toTrimmedString(value);
    if (text) {
      return text;
    }
  }
  return '';
}

function truncateForPrompt(value: string, maxChars: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}...`;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => toTrimmedString(item))
      .filter((item) => item.length > 0);
  }
  const text = toTrimmedString(value);
  if (!text) {
    return [];
  }
  return text
    .split(/[\n;；|]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter((item) => item.length > 0))];
}

type StoryNarrativeContext = {
  sceneLabel: string;
  playerRole: string;
  playerBackground: string;
  currentSituation: string;
  storyScope: Record<string, unknown>;
  subjectScope: Record<string, unknown>;
  relationScope: Record<string, unknown>;
};

export function deriveStoryNarrativeContext(input: {
  story: TextplayStoryDetail;
  startup: NonNullable<TextplayShellProps['startupPackage']>;
}): StoryNarrativeContext {
  const storyScope = asRecord(input.startup.narrativeScopes.STORY) || {};
  const subjectScope = asRecord(input.startup.narrativeScopes.SUBJECT) || {};
  const relationScope = asRecord(input.startup.narrativeScopes.RELATION) || {};
  const selectedScene = input.startup.materials.scenes.find((scene) => scene.id === input.startup.entry.recommendedSceneId)
    || input.startup.materials.scenes[0]
    || null;
  const sceneLabel = firstNonEmptyText([
    selectedScene?.name,
    selectedScene?.id,
    input.startup.entry.locationRefs[0],
  ]) || '未知地点';

  const playerRole = firstNonEmptyText([
    relationScope.playerRole,
    relationScope.playerIdentity,
    relationScope.relationType,
    relationScope.role,
    subjectScope.playerRole,
    subjectScope.identity,
    subjectScope.role,
  ]) || '未明身份的到访者';

  const playerBackground = firstNonEmptyText([
    relationScope.playerBackground,
    relationScope.background,
    relationScope.summary,
    subjectScope.playerBackground,
    subjectScope.background,
    subjectScope.summary,
    input.story.summary,
  ]);

  const currentSituation = [
    input.startup.entry.summary,
    input.startup.entry.cause ? `缘起：${input.startup.entry.cause}` : '',
    input.startup.entry.process ? `局势：${input.startup.entry.process}` : '',
    input.startup.entry.timeRef ? `时点：${input.startup.entry.timeRef}` : '',
    `地点：${sceneLabel}`,
  ].filter((line) => line.trim().length > 0).join('；');

  return {
    sceneLabel,
    playerRole,
    playerBackground,
    currentSituation,
    storyScope,
    subjectScope,
    relationScope,
  };
}

function buildRecapTimelineFromTurnWindow(
  turns: NarrativeTurnWindowResponse['turns'],
): string {
  if (!Array.isArray(turns) || turns.length === 0) {
    return '';
  }

  const ordered = [...turns]
    .sort((left, right) => {
      const leftIndex = Number.isFinite(left.turnIndex) ? Number(left.turnIndex) : Number.MAX_SAFE_INTEGER;
      const rightIndex = Number.isFinite(right.turnIndex) ? Number(right.turnIndex) : Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return toTrimmedString(left.createdAt).localeCompare(toTrimmedString(right.createdAt));
    })
    .slice(-8);

  const lines: string[] = [];
  let idx = 0;
  for (const turn of ordered) {
    const source = toTrimmedString(turn.triggerSource);
    const userAction = truncateForPrompt(toTrimmedString(turn.userMessage), 120);
    const visibleEvents = (Array.isArray(turn.spineEvents) ? turn.spineEvents : [])
      .filter((event) => event.visibility !== 'internal')
      .map((event) => truncateForPrompt(toTrimmedString(event.summary), 180))
      .filter((item) => item.length > 0)
      .slice(0, 2);

    const eventSummary = visibleEvents.length > 0 ? visibleEvents.join(' / ') : '（无可见事件）';
    idx += 1;
    if (source === 'UserTurn') {
      lines.push(`${idx}. 玩家行动：${userAction || '（未记录）'}；公开结果：${eventSummary}`);
      continue;
    }
    if (source === 'AgentInitiative') {
      lines.push(`${idx}. 世界推进：${eventSummary}`);
      continue;
    }
    lines.push(`${idx}. 系统推进：${eventSummary}`);
  }

  return lines.join('\n');
}

function buildRecapTimelineFromPersistRecords(records: TextplayPersistRecord[]): string {
  const recent = [...records]
    .filter((record) => String(record.text || '').trim().length > 0)
    .slice(0, 8)
    .reverse();
  if (recent.length === 0) {
    return '(暂无历史事件)';
  }
  return recent.map((record, index) => {
    const userAction = truncateForPrompt(record.userMessage, 120);
    const narrative = truncateForPrompt(record.text, 180);
    if (record.triggerSource === 'UserTurn') {
      return `${index + 1}. 玩家行动：${userAction || '（未记录）'}\n   结果：${narrative || '（未记录）'}`;
    }
    if (record.triggerSource === 'AgentInitiative') {
      return `${index + 1}. 世界推进：${narrative || '（未记录）'}`;
    }
    return `${index + 1}. 系统推进：${narrative || '（未记录）'}`;
  }).join('\n');
}

export function buildStoryRecapPrompt(input: {
  story: TextplayStoryDetail;
  startup: NonNullable<TextplayShellProps['startupPackage']>;
  playerName: string;
  playerIdentity: string;
  records: TextplayPersistRecord[];
  canonicalTurns: NarrativeTurnWindowResponse['turns'];
}): string {
  const context = deriveStoryNarrativeContext({
    story: input.story,
    startup: input.startup,
  });
  const resolvedIdentity = firstNonEmptyText([
    input.playerIdentity,
    context.playerRole,
  ]) || '未明身份';
  const canonicalTimeline = buildRecapTimelineFromTurnWindow(input.canonicalTurns);
  const timeline = canonicalTimeline || buildRecapTimelineFromPersistRecords(input.records);

  const lines = [
    '你是 TextPlay 的前情提要生成器。',
    '任务：根据已发生内容生成“前情提要”，帮助玩家续玩。',
    '硬性要求：',
    '- 只允许复述材料中已经发生的内容，不得新增剧情，不得剧透未来结果。',
    '- 第三人称有限视角，贴近玩家可感知信息。',
    '- 3-6句，约150-280字，中文。',
    '- 最后一句必须给出可行动的下一步钩子。',
    '',
    `故事：${input.story.title}`,
    `目标事件：${input.story.summary}`,
    `玩家称呼：${input.playerName || '你'}`,
    `玩家身份：${resolvedIdentity}`,
    `背景：${truncateForPrompt(input.startup.background.summary || input.story.summary, 260) || '(暂无)'}`,
    `当前局势：${truncateForPrompt(context.currentSituation, 260) || '(暂无)'}`,
    `当前位置：${context.sceneLabel}`,
    '',
    `已发生片段（按时间顺序，来源：${canonicalTimeline ? 'canonical narrative turn window' : 'persisted records fallback'}）：`,
    timeline,
    '',
    '输出：仅输出前情提要正文，不要标题，不要列表符号。',
  ];
  return lines.join('\n');
}

export function buildOpeningSystemPayload(input: {
  story: TextplayStoryDetail;
  startup: NonNullable<TextplayShellProps['startupPackage']>;
  playerId: string;
  playerName: string;
  playerIdentity: string;
}): Record<string, unknown> {
  const context = deriveStoryNarrativeContext({
    story: input.story,
    startup: input.startup,
  });
  const resolvedIdentity = firstNonEmptyText([
    input.playerIdentity,
    context.playerRole,
  ]) || '未明身份的到访者';

  const openingBackground = [
    input.startup.background.summary || input.story.summary,
    `玩家身份：${input.playerName || '你'}（${resolvedIdentity}）`,
    context.playerBackground ? `玩家背景：${context.playerBackground}` : '',
    context.currentSituation ? `当前处境：${context.currentSituation}` : '',
  ].filter((line) => line.trim().length > 0).join('\n');

  return {
    opening: {
      mode: 'story-start',
      instruction: [
        '你正在生成故事开场段落。',
        '当前处于目标事件发生前的临界阶段，禁止把目标事件写成已完成事实。',
        '只允许描述已发生事实与当下可见信息，严禁剧透未来走向或提前揭示最终结果。',
        '必须自然交代玩家是谁、为何在场、当前处境，并给出一个可行动的起手钩子。',
      ].join(''),
      playerId: input.playerId,
      playerName: input.playerName,
      playerIdentity: resolvedIdentity,
      playerRole: context.playerRole,
      playerBackground: context.playerBackground,
      storyId: input.story.storyId,
      storyTitle: input.story.title,
      entryEventId: input.story.entryEventId,
      entrySummary: input.story.summary,
      phase: context.storyScope.phase || 'opening',
      objective: context.storyScope.objective || 'advance-story',
      background: openingBackground,
      currentSituation: context.currentSituation,
      recommendedSceneId: input.startup.entry.recommendedSceneId,
      noSpoiler: true,
    },
  };
}

type InitiativeDirectorMessage = {
  strategy: 'open-thread' | 'pending-event' | 'pressure' | 'agenda' | 'fallback';
  directive: string;
};

function collectInitiativeHooks(startup: NonNullable<TextplayShellProps['startupPackage']>): {
  openThreads: string[];
  pendingEvents: string[];
  pressures: string[];
  agendas: string[];
} {
  const storyScope = asRecord(startup.narrativeScopes.STORY) || {};
  const storyNarrativeState = asRecord(storyScope.narrativeState) || {};
  const storyContextRows = startup.materials.contexts
    .filter((context) => context.scope === 'STORY');

  const fromStoryScope = (key: string): string[] => uniqueStrings([
    ...toStringArray(storyScope[key]),
    ...toStringArray(storyNarrativeState[key]),
  ]);
  const fromStoryContexts = (key: string): string[] => uniqueStrings(
    storyContextRows.flatMap((row) => {
      const rowState = asRecord(row.narrativeState) || {};
      const rowSetting = asRecord(row.narrativeSetting) || {};
      return [
        ...toStringArray(rowState[key]),
        ...toStringArray(rowSetting[key]),
      ];
    }),
  );

  const openThreads = uniqueStrings([
    ...fromStoryScope('openThreads'),
    ...fromStoryContexts('openThreads'),
  ]);
  const pendingEvents = uniqueStrings([
    ...fromStoryScope('pendingEvents'),
    ...fromStoryContexts('pendingEvents'),
  ]);
  const pressures = uniqueStrings([
    ...fromStoryScope('conflicts'),
    ...fromStoryScope('threats'),
    ...fromStoryContexts('conflicts'),
    ...fromStoryContexts('threats'),
  ]);
  const agendas = uniqueStrings([
    ...fromStoryScope('npcsWithAgenda'),
    ...fromStoryContexts('npcsWithAgenda'),
  ]);

  return {
    openThreads,
    pendingEvents,
    pressures,
    agendas,
  };
}

function appearsInRecentHistory(input: {
  candidate: string;
  records: TextplayPersistRecord[];
}): boolean {
  const token = toTrimmedString(input.candidate).toLowerCase().slice(0, 18);
  if (!token) {
    return false;
  }
  const recent = input.records.slice(0, 6);
  for (const record of recent) {
    const combined = `${record.userMessage || ''}\n${record.text || ''}`.toLowerCase();
    if (combined.includes(token)) {
      return true;
    }
  }
  return false;
}

export function buildInitiativeDirectorMessage(input: {
  startup: NonNullable<TextplayShellProps['startupPackage']>;
  records: TextplayPersistRecord[];
  playerName: string;
}): InitiativeDirectorMessage {
  const hooks = collectInitiativeHooks(input.startup);
  const playerName = toTrimmedString(input.playerName) || '玩家';
  const pickFresh = (items: string[]): string => {
    for (const item of items) {
      if (!appearsInRecentHistory({ candidate: item, records: input.records })) {
        return item;
      }
    }
    return items[0] || '';
  };

  const openThread = pickFresh(hooks.openThreads);
  if (openThread) {
    return {
      strategy: 'open-thread',
      directive: `【世界推进·未决线索】围绕“${openThread}”制造可感知变化，保持线索未完全解决，并给${playerName}一个立即可回应的行动窗口。`,
    };
  }

  const pendingEvent = pickFresh(hooks.pendingEvents);
  if (pendingEvent) {
    return {
      strategy: 'pending-event',
      directive: `【世界推进·待发事件】以“${pendingEvent}”作为触发点推进局势，不提前宣告终局，给${playerName}留出干预空间。`,
    };
  }

  const pressure = pickFresh(hooks.pressures);
  if (pressure) {
    return {
      strategy: 'pressure',
      directive: `【世界推进·冲突压力】放大“${pressure}”带来的现实后果，让局势升级但不收束，并给${playerName}一个可执行抉择。`,
    };
  }

  const agenda = pickFresh(hooks.agendas);
  if (agenda) {
    return {
      strategy: 'agenda',
      directive: `【世界推进·角色动机】让关键角色按“${agenda}”主动行动，推动场景变化，同时向${playerName}抛出新的互动钩子。`,
    };
  }

  const fallbackSeed = firstNonEmptyText([
    input.startup.entry.process,
    input.startup.entry.cause,
    input.startup.entry.summary,
  ]) || '局势暗流正在积聚';
  return {
    strategy: 'fallback',
    directive: `【世界推进】基于“${fallbackSeed}”制造新的现场变化，不要直接结束目标事件，并给${playerName}一个清晰的下一步行动入口。`,
  };
}

export function buildContextualUserMessage(input: {
  playerName: string;
  playerIdentity: string;
  userMessage: string;
}): string {
  const userMessage = toTrimmedString(input.userMessage);
  if (!userMessage) {
    return '';
  }
  const playerName = toTrimmedString(input.playerName);
  const playerIdentity = toTrimmedString(input.playerIdentity);
  if (!playerName && !playerIdentity) {
    return userMessage;
  }
  const role = playerIdentity ? `（${playerIdentity}）` : '';
  const speaker = playerName || '玩家';
  return `[${speaker}${role}]: ${userMessage}`;
}

export function withPlayerContextSystemPayload(input: {
  basePayload?: Record<string, unknown>;
  playerId: string;
  playerName: string;
  playerIdentity: string;
}): TextplayRenderRequest['systemPayload'] {
  const playerId = toTrimmedString(input.playerId);
  if (!playerId) {
    return input.basePayload;
  }
  const merged: Record<string, unknown> = {
    ...(input.basePayload || {}),
    playerContext: {
      playerId,
      playerName: toTrimmedString(input.playerName) || undefined,
      playerIdentity: toTrimmedString(input.playerIdentity) || undefined,
    },
  };
  return merged;
}
