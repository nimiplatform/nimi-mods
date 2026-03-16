import type {
  TextplayEntryDetail,
  TextplayLanguage,
  TextplayPersistRecord,
  TextplayStartupPackage,
} from '../types.js';

type InitiativeDirectorMessage = {
  strategy: 'open-thread' | 'pending-event' | 'pressure' | 'agenda' | 'fallback';
  directive: string;
};

const BRIEFING_COPY = {
  en: {
    unidentifiedVisitor: 'an unidentified visitor',
    playerLabel: 'Player',
    playerBackgroundLabel: 'Player Background',
    currentSituationLabel: 'Current Situation',
    openingInstructionParts: [
      'Start at the threshold before the target event actually happens.',
      'Target-event title, summary, cause, process, result, and time anchor are canonical reference material only; they do not mean those beats have already happened in this turn.',
      'The opening may establish scene, pressure, and action hooks only; it must not reveal the ending in advance.',
    ],
    targetEventLabel: 'Target Event',
    playerFallbackName: 'Player',
    initiativeDirectives: {
      openThread: (thread: string, playerName: string) => `World progression [open thread]: make "${thread}" produce a perceptible change, keep the thread unresolved, and give ${playerName} an immediate opening to respond.`,
      pendingEvent: (event: string, playerName: string) => `World progression [pending event]: use "${event}" as the trigger that advances the situation, avoid announcing any end-state early, and leave ${playerName} room to intervene.`,
      pressure: (pressure: string, playerName: string) => `World progression [pressure]: amplify the practical consequences of "${pressure}", escalate the scene without resolving it, and present ${playerName} with an actionable choice.`,
      agenda: (agenda: string, playerName: string) => `World progression [character agenda]: let a key character act on "${agenda}" to shift the scene and throw ${playerName} a fresh interaction hook.`,
      fallback: (seed: string, playerName: string) => `World progression: use "${seed}" to create a new visible change, do not directly conclude the target event, and give ${playerName} a clear next action.`,
    },
  },
  zh: {
    unidentifiedVisitor: '未明身份的到访者',
    playerLabel: '玩家身份',
    playerBackgroundLabel: '玩家背景',
    currentSituationLabel: '当前处境',
    openingInstructionParts: [
      '从目标事件真正发生前的临界阶段切入。',
      '目标事件标题、摘要、起因、过程、结果与时间锚点仅作为 canonical 素材参考，不等于本轮开场中已经发生。',
      '开场只允许建立现场、处境、压力与可行动钩子，不提前泄露终局。',
    ],
    targetEventLabel: '目标事件',
    playerFallbackName: '玩家',
    initiativeDirectives: {
      openThread: (thread: string, playerName: string) => `【世界推进·未决线索】围绕“${thread}”制造可感知变化，保持线索未完全解决，并给${playerName}一个立即可回应的行动窗口。`,
      pendingEvent: (event: string, playerName: string) => `【世界推进·待发事件】以“${event}”作为触发点推进局势，不提前宣告终局，给${playerName}留出干预空间。`,
      pressure: (pressure: string, playerName: string) => `【世界推进·冲突压力】放大“${pressure}”带来的现实后果，让局势升级但不收束，并给${playerName}一个可执行抉择。`,
      agenda: (agenda: string, playerName: string) => `【世界推进·角色动机】让关键角色按“${agenda}”主动行动，推动场景变化，同时向${playerName}抛出新的互动钩子。`,
      fallback: (seed: string, playerName: string) => `【世界推进】基于“${seed}”制造新的现场变化，不要直接结束目标事件，并给${playerName}一个清晰的下一步行动入口。`,
    },
  },
} satisfies Record<TextplayLanguage, {
  unidentifiedVisitor: string;
  playerLabel: string;
  playerBackgroundLabel: string;
  currentSituationLabel: string;
  openingInstructionParts: string[];
  targetEventLabel: string;
  playerFallbackName: string;
  initiativeDirectives: {
    openThread: (thread: string, playerName: string) => string;
    pendingEvent: (event: string, playerName: string) => string;
    pressure: (pressure: string, playerName: string) => string;
    agenda: (agenda: string, playerName: string) => string;
    fallback: (seed: string, playerName: string) => string;
  };
}>;

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function firstNonEmptyText(values: unknown[]): string {
  for (const value of values) {
    const text = toText(value);
    if (text) {
      return text;
    }
  }
  return '';
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => toText(item)).filter(Boolean)
    : [];
}

function buildOpeningInstruction(entry: TextplayEntryDetail, promptLanguage: TextplayLanguage): string {
  const copy = BRIEFING_COPY[promptLanguage];
  return [
    ...copy.openingInstructionParts,
    `${copy.targetEventLabel}: ${entry.title}`,
  ].join(' ');
}

function deriveStoryNarrativeContext(startup: TextplayStartupPackage): {
  storyScope: Record<string, unknown>;
  subjectScope: Record<string, unknown>;
  relationScope: Record<string, unknown>;
  playerRole: string;
  playerBackground: string;
  currentSituation: string;
} {
  const storyScope = asRecord(startup.narrativeScopes.STORY);
  const subjectScope = asRecord(startup.narrativeScopes.SUBJECT);
  const relationScope = asRecord(startup.narrativeScopes.RELATION);
  return {
    storyScope,
    subjectScope,
    relationScope,
    playerRole: firstNonEmptyText([
      relationScope.playerRole,
      relationScope.playerIdentity,
      subjectScope.playerRole,
      subjectScope.playerIdentity,
    ]),
    playerBackground: firstNonEmptyText([
      relationScope.playerBackground,
      subjectScope.playerBackground,
      subjectScope.background,
    ]),
    currentSituation: firstNonEmptyText([
      relationScope.currentSituation,
      subjectScope.currentSituation,
      storyScope.currentSituation,
      storyScope.phase,
    ]),
  };
}

export function buildOpeningSystemPayload(input: {
  promptLanguage: TextplayLanguage;
  entry: TextplayEntryDetail;
  startup: TextplayStartupPackage;
  userId: string;
  playerName: string;
  playerIdentity: string;
}): Record<string, unknown> {
  const copy = BRIEFING_COPY[input.promptLanguage];
  const context = deriveStoryNarrativeContext(input.startup);
  const resolvedIdentity = firstNonEmptyText([
    input.playerIdentity,
    context.playerRole,
  ]) || copy.unidentifiedVisitor;

  const openingBackground = [
    input.startup.background.summary || input.entry.entryBackdrop || input.entry.summary,
    input.promptLanguage === 'zh'
      ? `${copy.playerLabel}：${input.playerName || '你'}（${resolvedIdentity}）`
      : `${copy.playerLabel}: ${input.playerName || 'You'} (${resolvedIdentity})`,
    context.playerBackground ? `${copy.playerBackgroundLabel}${input.promptLanguage === 'zh' ? '：' : ': '}${context.playerBackground}` : '',
    context.currentSituation ? `${copy.currentSituationLabel}${input.promptLanguage === 'zh' ? '：' : ': '}${context.currentSituation}` : '',
  ].filter(Boolean).join('\n');

  return {
    opening: {
      mode: 'story-start',
      instruction: buildOpeningInstruction(input.entry, input.promptLanguage),
      userId: input.userId,
      playerName: input.playerName,
      playerIdentity: resolvedIdentity,
      storyLanguage: input.startup.storyLanguage,
      playerRole: context.playerRole,
      playerBackground: context.playerBackground,
      storyId: input.startup.storyId,
      storyTitle: input.entry.title,
      entryMode: input.startup.entry.entryMode,
      entryEventId: input.startup.entryEventId,
      entryEventHorizon: input.startup.entry.eventHorizon,
      targetEventMaterialOnly: true,
      entrySummary: input.startup.entry.summary || input.entry.entryBackdrop || input.entry.summary,
      entryHook: input.startup.entry.entryHook || input.entry.entryHook,
      phase: toText(context.storyScope.phase) || 'opening',
      objective: toText(context.storyScope.objective) || 'advance-story',
      background: openingBackground,
      currentSituation: context.currentSituation,
      recommendedSceneId: input.startup.entry.recommendedSceneId,
      noSpoiler: true,
    },
  };
}

function collectInitiativeHooks(startup: TextplayStartupPackage): {
  openThreads: string[];
  pendingEvents: string[];
  pressures: string[];
  agendas: string[];
} {
  const storyScope = asRecord(startup.narrativeScopes.STORY);
  const storyContexts = startup.materials.contexts.filter((item) => item.scope === 'STORY');

  const fromScope = (key: string): string[] => uniqueStrings(toStringArray(storyScope[key]));
  const fromContexts = (key: string): string[] => uniqueStrings(
    storyContexts.flatMap((item) => [
      ...toStringArray(asRecord(item.narrativeState)[key]),
      ...toStringArray(asRecord(item.narrativeSetting)[key]),
    ]),
  );

  return {
    openThreads: uniqueStrings([
      ...fromScope('openThreads'),
      ...fromContexts('openThreads'),
    ]),
    pendingEvents: uniqueStrings([
      ...fromScope('pendingEvents'),
      ...fromContexts('pendingEvents'),
    ]),
    pressures: uniqueStrings([
      ...fromScope('conflicts'),
      ...fromScope('threats'),
      ...fromContexts('conflicts'),
      ...fromContexts('threats'),
    ]),
    agendas: uniqueStrings([
      ...fromScope('npcsWithAgenda'),
      ...fromContexts('npcsWithAgenda'),
    ]),
  };
}

function appearsInRecentHistory(input: {
  candidate: string;
  records: TextplayPersistRecord[];
}): boolean {
  const token = toText(input.candidate).toLowerCase().slice(0, 18);
  if (!token) {
    return false;
  }
  const recent = input.records.slice(-6);
  return recent.some((record) => (
    `${record.userMessage || ''}\n${record.text || ''}`.toLowerCase().includes(token)
  ));
}

export function buildInitiativeDirectorMessage(input: {
  promptLanguage: TextplayLanguage;
  startup: TextplayStartupPackage;
  records: TextplayPersistRecord[];
  playerName: string;
}): InitiativeDirectorMessage {
  const copy = BRIEFING_COPY[input.promptLanguage];
  const hooks = collectInitiativeHooks(input.startup);
  const playerName = toText(input.playerName) || copy.playerFallbackName;

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
      directive: copy.initiativeDirectives.openThread(openThread, playerName),
    };
  }

  const pendingEvent = pickFresh(hooks.pendingEvents);
  if (pendingEvent) {
    return {
      strategy: 'pending-event',
      directive: copy.initiativeDirectives.pendingEvent(pendingEvent, playerName),
    };
  }

  const pressure = pickFresh(hooks.pressures);
  if (pressure) {
    return {
      strategy: 'pressure',
      directive: copy.initiativeDirectives.pressure(pressure, playerName),
    };
  }

  const agenda = pickFresh(hooks.agendas);
  if (agenda) {
    return {
      strategy: 'agenda',
      directive: copy.initiativeDirectives.agenda(agenda, playerName),
    };
  }

  const fallbackSeed = firstNonEmptyText([
    input.startup.entry.process,
    input.startup.entry.cause,
    input.startup.entry.summary,
  ]) || '局势暗流正在积聚';

  return {
    strategy: 'fallback',
    directive: copy.initiativeDirectives.fallback(fallbackSeed, playerName),
  };
}

export function buildInitiativeSystemPayload(input: {
  promptLanguage: TextplayLanguage;
  startup: TextplayStartupPackage;
  records: TextplayPersistRecord[];
  playerName: string;
  triggerSource: 'AgentInitiative' | 'SystemEvent';
  presence: string;
}): Record<string, unknown> {
  const directive = buildInitiativeDirectorMessage({
    promptLanguage: input.promptLanguage,
    startup: input.startup,
    records: input.records,
    playerName: input.playerName,
  });
  return {
    initiative: {
      triggerSource: input.triggerSource,
      presence: input.presence,
      strategy: directive.strategy,
      directive: directive.directive,
      storyLanguage: input.startup.storyLanguage,
      storyId: input.startup.storyId,
      entryEventId: input.startup.entryEventId,
      primaryAgentId: input.startup.cast.primaryAgentId,
      entrySummary: input.startup.entry.entryBackdrop || input.startup.entry.summary,
      entryHook: input.startup.entry.entryHook,
      background: input.startup.background.summary,
    },
  };
}

export function buildContextualUserMessage(input: {
  promptLanguage: TextplayLanguage;
  playerName: string;
  playerIdentity: string;
  userMessage: string;
}): string {
  const userMessage = toText(input.userMessage);
  if (!userMessage) {
    return '';
  }
  const playerName = toText(input.playerName);
  const playerIdentity = toText(input.playerIdentity);
  if (!playerName && !playerIdentity) {
    return userMessage;
  }
  const isZh = input.promptLanguage === 'zh';
  const role = playerIdentity
    ? (isZh ? `（${playerIdentity}）` : ` (${playerIdentity})`)
    : '';
  const speaker = playerName || (isZh ? '玩家' : 'Player');
  return `[${speaker}${role}]: ${userMessage}`;
}
