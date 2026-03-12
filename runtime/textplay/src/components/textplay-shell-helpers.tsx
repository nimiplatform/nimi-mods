import React from 'react';
import type { TextplayHistorySession, TextplayPersistRecord, TextplayRunEvent, TextplayStoryBrief, TextplayStoryDetail, } from '../types.js';
import type { TextplayShellProps } from './textplay-shell.js';
export function rightPanelSectionHeader(input: {
    title: string;
    open: boolean;
    onToggle: () => void;
}): React.ReactElement {
    return (<button type="button" onClick={input.onToggle} aria-expanded={input.open} className="flex w-full items-center justify-between text-left text-gray-700">
      <span className="text-sm font-semibold">{input.title}</span>
      <span className="text-sm font-semibold">{input.open ? '-' : '+'}</span>
    </button>);
}
export function formatRunEvent(event: TextplayRunEvent): string {
    const parts = [
        `#${event.seq}`,
        event.eventType,
        event.step,
    ];
    if (event.reasonCode) {
        parts.push(event.reasonCode);
    }
    return parts.join(' · ');
}
export function formatRecordTitle(record: TextplayPersistRecord): string {
    const message = String(record.userMessage || '').trim();
    if (message.length === 0) {
        return `${record.turnId} (${record.runId})`;
    }
    if (message.length <= 40) {
        return message;
    }
    return `${message.slice(0, 40)}...`;
}
export function formatTriggerSourceLabel(triggerSource: TextplayPersistRecord['triggerSource']): string {
    if (triggerSource === 'AgentInitiative') {
        return 'World Event';
    }
    if (triggerSource === 'SystemEvent') {
        return 'Opening / System';
    }
    return 'Player Turn';
}
export function triggerSourceBadgeClass(triggerSource: TextplayPersistRecord['triggerSource']): string {
    if (triggerSource === 'AgentInitiative') {
        return 'bg-violet-50 text-violet-700';
    }
    if (triggerSource === 'SystemEvent') {
        return 'bg-emerald-50 text-emerald-700';
    }
    return 'bg-blue-50 text-blue-700';
}
export function formatRouteLabelFromRecord(record: TextplayPersistRecord): string {
    const route = record.meta?.route;
    if (!route) {
        return 'unknown';
    }
    return `${route.source || 'unknown'}/${route.connectorId || 'default'}:${route.model || 'unknown'}`;
}
export function formatHistorySessionTitle(session: TextplayHistorySession): string {
    const storyLabel = session.storyTitle.trim() || session.storyId;
    const runLabel = session.runId.length > 12 ? `...${session.runId.slice(-12)}` : session.runId;
    return `${storyLabel} · ${runLabel}`;
}
export function formatHistorySessionUpdatedAt(updatedAt: string): string {
    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) {
        return updatedAt || '-';
    }
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}
export function findLastStepError(events: TextplayRunEvent[]): TextplayRunEvent | null {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.eventType === 'step.error') {
            return event;
        }
    }
    return null;
}
export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}
export function firstNonEmptyText(values: unknown[]): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}
export function resolveRecordStoryBrief(record: TextplayPersistRecord): TextplayStoryBrief | null {
    if (record.triggerSource !== 'SystemEvent') {
        return null;
    }
    const openingPayload = asRecord(asRecord(record.systemPayload)?.opening);
    const mode = String(openingPayload?.mode || '').trim();
    if (mode !== 'story-start' && mode !== 'story-recap') {
        return null;
    }
    const text = String(record.text || '').trim();
    if (!text) {
        return null;
    }
    return {
        mode: mode === 'story-recap' ? 'recap' : 'opening',
        text,
        generatedAt: record.updatedAt,
    };
}
export function resolveStoryBrief(props: TextplayShellProps): TextplayStoryBrief | null {
    if (props.storyBrief && props.storyBrief.text.trim()) {
        return props.storyBrief;
    }
    for (const record of props.records) {
        const brief = resolveRecordStoryBrief(record);
        if (brief) {
            return brief;
        }
    }
    if (props.records.length <= 1) {
        const fallback = String(props.lastRenderedText || '').trim();
        if (fallback) {
            return {
                mode: 'opening',
                text: fallback,
                generatedAt: '',
            };
        }
    }
    return null;
}
export function resolveOpeningMode(record: TextplayPersistRecord): string {
    const openingPayload = asRecord(asRecord(record.systemPayload)?.opening);
    return String(openingPayload?.mode || '').trim();
}
export function normalizeUserTurnMessage(message: string): string {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return '';
    }
    const stripped = trimmed.replace(/^\[[^\]]+\]\s*[:：]\s*/, '').trim();
    return stripped || trimmed;
}
export function formatTimelineStageLabel(record: TextplayPersistRecord): string {
    if (record.triggerSource === 'UserTurn') {
        return 'Player Turn';
    }
    if (record.triggerSource === 'AgentInitiative') {
        return 'World Event';
    }
    const openingMode = resolveOpeningMode(record);
    if (openingMode === 'story-start') {
        return 'Opening';
    }
    if (openingMode === 'story-recap') {
        return 'Story Recap';
    }
    return 'System';
}
export function formatTimelineResponseLabel(record: TextplayPersistRecord): string {
    if (record.triggerSource === 'UserTurn') {
        return 'Narrative Response';
    }
    if (record.triggerSource === 'AgentInitiative') {
        return 'World Event';
    }
    const openingMode = resolveOpeningMode(record);
    if (openingMode === 'story-start') {
        return 'Opening Narration';
    }
    if (openingMode === 'story-recap') {
        return 'Story Recap';
    }
    return 'System Narration';
}
export function responsePanelClass(record: TextplayPersistRecord): string {
    if (record.triggerSource === 'AgentInitiative') {
        return 'border-violet-200 bg-violet-50';
    }
    if (record.triggerSource === 'SystemEvent') {
        return 'border-emerald-200 bg-emerald-50';
    }
    return 'border-slate-200 bg-slate-50';
}
export function renderOpeningCard(props: TextplayShellProps): React.ReactNode {
    const startup = props.startupPackage;
    const story = props.selectedStory;
    const storyBrief = resolveStoryBrief(props);
    const briefText = storyBrief?.text || '';
    const briefMode = storyBrief?.mode || 'opening';
    if (!props.selectedStoryId) {
        return null;
    }
    if (!props.storyStarted && !props.startupLoading && !props.startupPackage && !props.startupError) {
        return null;
    }
    if (props.startupLoading) {
        return (<div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        Loading opening brief...
      </div>);
    }
    if (props.startupError) {
        return (<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        {props.startupError}
      </div>);
    }
    if (!startup || !story) {
        if (!briefText) {
            return (<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Startup package is required before showing opening brief.
        </div>);
        }
        return (<section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-emerald-900">Opening Brief</div>
          <div className="text-[11px] text-emerald-700">
            recovered from persisted run
          </div>
        </div>
        <div className="mt-2 rounded-lg border border-emerald-200 bg-white p-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
            {briefMode === 'recap' ? 'Story Recap' : 'Opening Narration'}
          </div>
          <div className="mt-1 whitespace-pre-line text-sm leading-6 text-emerald-900">
            {briefText}
          </div>
        </div>
      </section>);
    }
    const storyScope = asRecord(startup.narrativeScopes.STORY) || {};
    const subjectScope = asRecord(startup.narrativeScopes.SUBJECT) || {};
    const relationScope = asRecord(startup.narrativeScopes.RELATION) || {};
    const phase = firstNonEmptyText([storyScope.phase]) || 'opening';
    const objective = firstNonEmptyText([storyScope.objective]) || 'advance-story';
    const playerRole = firstNonEmptyText([
        relationScope.playerRole,
        relationScope.playerIdentity,
        relationScope.relationType,
        relationScope.role,
        subjectScope.playerRole,
        subjectScope.identity,
        subjectScope.role,
    ]) || '未声明';
    const selectedScene = startup.materials.scenes.find((scene) => scene.id === startup.entry.recommendedSceneId)
        || startup.materials.scenes[0]
        || null;
    const sceneLabel = firstNonEmptyText([
        selectedScene?.name,
        selectedScene?.id,
        startup.entry.locationRefs[0],
    ]) || '未知';
    const playerBackground = firstNonEmptyText([
        relationScope.playerBackground,
        relationScope.background,
        relationScope.summary,
        subjectScope.playerBackground,
        subjectScope.background,
        subjectScope.summary,
        startup.entry.summary,
        story.materialSummary,
        story.summary,
    ]);
    const currentSituation = [
        startup.entry.summary,
        startup.entry.cause ? `缘起：${startup.entry.cause}` : '',
        startup.entry.process ? `局势：${startup.entry.process}` : '',
        startup.entry.timeRef ? `时间：${startup.entry.timeRef}` : '',
        `地点：${sceneLabel}`,
    ].filter((line) => line.trim().length > 0).join('；');
    const backgroundLines = [
        startup.background.summary || story.materialSummary || story.summary || '暂无背景信息。',
        `玩家身份：${props.playerName || '你'}（${props.playerIdentity || playerRole}）`,
        playerBackground ? `玩家背景：${playerBackground}` : '',
        currentSituation ? `当前处境：${currentSituation}` : '',
    ].filter((line) => line.trim().length > 0);
    return (<section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-emerald-900">
          {briefMode === 'recap' ? 'Story Recap' : 'Opening Brief'}
        </div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          <span className="rounded-full bg-white px-2 py-0.5 text-emerald-700">phase: {phase}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-emerald-700">objective: {objective}</span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-emerald-900 md:grid-cols-2">
        <div className="rounded bg-white px-2 py-1">玩家称呼: {props.playerName || '(未设置)'}</div>
        <div className="rounded bg-white px-2 py-1">
          玩家身份设定: {props.playerIdentity || '(未设置，将使用剧情默认身份)'}
        </div>
        <div className="rounded bg-white px-2 py-1">主视角角色: {startup.cast.primaryAgentId || '(missing)'}</div>
        <div className="rounded bg-white px-2 py-1">玩家角色: {playerRole}</div>
        <div className="rounded bg-white px-2 py-1">当前地点: {sceneLabel}</div>
        <div className="rounded bg-white px-2 py-1">玩家实体ID: {props.playerId || '(missing)'}</div>
      </div>

      <div className="mt-2 rounded-lg border border-emerald-200 bg-white p-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Background</div>
        <div className="mt-1 space-y-1 text-sm leading-6 text-emerald-900">
          {backgroundLines.map((line, index) => (<div key={`background-line-${index}`}>{line}</div>))}
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-emerald-200 bg-white p-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
          {briefMode === 'recap' ? 'Story Recap' : 'Opening Narration'}
        </div>
        <div className="mt-1 whitespace-pre-line text-sm leading-6 text-emerald-900">
          {briefText || (briefMode === 'recap'
            ? 'Click Recap in Current Session to generate story recap.'
            : 'Click Start in Session Entry to generate opening narration.')}
        </div>
      </div>
    </section>);
}
export function renderStorySummary(story: TextplayStoryDetail | null) {
    if (!story) {
        return <div className="text-xs text-gray-500">Select a playable story to load context.</div>;
    }
    return (<div className="space-y-2 text-xs text-gray-600">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium leading-5 text-gray-900">{story.title}</div>
        <div className="flex flex-wrap justify-end gap-1">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            entry: {story.entryMode}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            canon: {story.eventHorizon}
          </span>
        </div>
      </div>
      <div className="leading-5 text-gray-600">{story.summary}</div>
      <div className="flex flex-wrap gap-1">
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
          agent: {story.primaryAgentId || '(missing)'}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
          participants: {story.participants.length}
        </span>
      </div>
      <div className="break-all text-[10px] text-gray-400">storyId: {story.storyId}</div>
    </div>);
}
