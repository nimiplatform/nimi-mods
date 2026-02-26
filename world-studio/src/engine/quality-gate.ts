import type {
  ExtractionCoverageMetrics,
  QualityGateResult,
  WorldStudioQualityIssue,
  WorldStudioKnowledgeGraphDraft,
} from './types.js';
import {
  computePrimaryEvidenceCoverage,
  PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD,
} from './primary-evidence.js';

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function countEventsWithCharacterRefs(events: Array<{ characterRefs?: string[] }>): number {
  return events.filter((event) => Array.isArray(event.characterRefs) && event.characterRefs.length > 0).length;
}

function countEventsWithLocationRefs(events: Array<{ locationRefs?: string[] }>): number {
  return events.filter((event) => Array.isArray(event.locationRefs) && event.locationRefs.length > 0).length;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function computePrimaryNarrativeCompleteness(events: Array<{ cause?: string; process?: string; result?: string }>): number {
  if (events.length === 0) return 0;
  const filled = events.map((event) => {
    const cause = String(event.cause || '').trim();
    const process = String(event.process || '').trim();
    const result = String(event.result || '').trim();
    return (
      (cause ? 1 : 0)
      + (process ? 1 : 0)
      + (result ? 1 : 0)
    ) / 3;
  });
  return clamp01(filled.reduce((sum, score) => sum + score, 0) / events.length);
}

function computeStoryArcCompleteness(graph: WorldStudioKnowledgeGraphDraft): number {
  const arc = graph.narrativeArc;
  if (!arc) return 0;
  const fields = [arc.summary, arc.opening, arc.development, arc.climax, arc.resolution];
  const filled = fields.filter((field) => String(field || '').trim().length > 0).length;
  return clamp01(filled / fields.length);
}

function computeCharacterNamePurity(graph: WorldStudioKnowledgeGraphDraft, hint?: number): number {
  if (Number.isFinite(hint)) return clamp01(Number(hint));
  const aliasMap = graph.characterAliasMap || {};
  const aliasCount = Object.keys(aliasMap).length;
  if (aliasCount > 0) {
    const canonicalCount = new Set(Object.values(aliasMap)).size;
    if (canonicalCount > 0) return clamp01(canonicalCount / aliasCount);
  }
  const names = graph.characters
    .map((item) => String((item as { name?: unknown }).name || '').trim())
    .filter(Boolean);
  if (names.length === 0) return 1;
  const pollutedCount = names.filter((name) => /(说|道|问|将|称|表示)$/.test(name)).length;
  return clamp01(1 - (pollutedCount / names.length));
}

function computeCharacterProfileCoverage(graph: WorldStudioKnowledgeGraphDraft, hint?: number): number {
  if (Number.isFinite(hint)) return clamp01(Number(hint));
  const profiles = graph.characterProfiles || [];
  if (profiles.length === 0) return 0;
  const complete = profiles.filter((profile) => {
    return Boolean(String(profile.background || '').trim())
      && Boolean(String(profile.motivation || '').trim())
      && Array.isArray(profile.relationships)
      && profile.relationships.length > 0;
  }).length;
  return clamp01(complete / profiles.length);
}

function isPrimaryEventStructureValid(events: Array<{
  title?: string;
  summary?: string;
  cause?: string;
  process?: string;
  result?: string;
}>): boolean {
  return events.every((event) => {
    const title = String(event.title || '').trim();
    const summary = String(event.summary || '').trim();
    const cause = String(event.cause || '').trim();
    const process = String(event.process || '').trim();
    const result = String(event.result || '').trim();
    if (!title) return false;
    if (!summary && !cause && !process && !result) return false;
    return true;
  });
}

export function evaluateQualityGate(input: {
  graph: WorldStudioKnowledgeGraphDraft;
  totalChunks: number;
  successChunks: number;
  refinementMetrics?: {
    characterNamePurity?: number;
    characterProfileCoverage?: number;
  };
}): QualityGateResult {
  const totalChunks = Math.max(1, input.totalChunks);
  const successChunks = Math.max(0, Math.min(totalChunks, input.successChunks));
  const failedChunks = Math.max(0, totalChunks - successChunks);
  const chunkSuccessRatio = successChunks / totalChunks;

  const primaryEvents = input.graph.events.primary || [];
  const secondaryEvents = input.graph.events.secondary || [];
  const allEvents = [...primaryEvents, ...secondaryEvents];

  const primaryEvidenceCoverage = computePrimaryEvidenceCoverage(primaryEvents);
  const eventCharacterCoverage = ratio(countEventsWithCharacterRefs(allEvents), Math.max(1, allEvents.length));
  const eventLocationCoverage = ratio(countEventsWithLocationRefs(allEvents), Math.max(1, allEvents.length));
  const primaryNarrativeCompleteness = computePrimaryNarrativeCompleteness(primaryEvents);
  const storyArcCompleteness = computeStoryArcCompleteness(input.graph);
  const characterNamePurity = computeCharacterNamePurity(input.graph, input.refinementMetrics?.characterNamePurity);
  const characterProfileCoverage = computeCharacterProfileCoverage(input.graph, input.refinementMetrics?.characterProfileCoverage);

  const metrics: ExtractionCoverageMetrics = {
    totalChunks,
    successChunks,
    failedChunks,
    chunkSuccessRatio,
    primaryCount: primaryEvents.length,
    secondaryCount: secondaryEvents.length,
    worldSettingCount: input.graph.worldSetting.trim() ? 1 : 0,
    timelineCount: input.graph.timeline.length,
    locationsCount: input.graph.locations.length,
    charactersCount: input.graph.characters.length,
    characterRelationsCount: input.graph.characterRelations.length,
    futureEventsCount: input.graph.futureHistoricalEvents.length,
    primaryEvidenceCoverage,
    eventCharacterCoverage,
    eventLocationCoverage,
    primaryNarrativeCompleteness,
    storyArcCompleteness,
    characterNamePurity,
    characterProfileCoverage,
  };

  const issues: WorldStudioQualityIssue[] = [];
  const pushIssue = (
    code: string,
    severity: 'BLOCK' | 'WARN',
    message: string,
    detail?: string,
  ) => {
    issues.push({
      code,
      severity,
      message,
      ...(detail ? { detail } : {}),
    });
  };

  if (metrics.primaryCount === 0) {
    pushIssue(
      'WORLD_STUDIO_PRIMARY_EVENTS_MISSING',
      'BLOCK',
      '主线事件为空，无法生成可用叙事。',
    );
  }

  if (!isPrimaryEventStructureValid(primaryEvents)) {
    pushIssue(
      'WORLD_STUDIO_PRIMARY_STRUCTURE_INVALID',
      'BLOCK',
      '主线事件结构不完整（标题或核心叙事字段缺失）。',
    );
  }

  if (primaryEvents.length > 0 && primaryEvidenceCoverage < PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD) {
    pushIssue(
      'WORLD_STUDIO_PRIMARY_EVIDENCE_MISSING',
      'BLOCK',
      '存在主线事件缺少证据引用。',
      `primaryEvidenceCoverage=${Math.round(primaryEvidenceCoverage * 100)}%, threshold=${Math.round(PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD * 100)}%`,
    );
  }

  if (chunkSuccessRatio < 0.4) {
    pushIssue(
      'WORLD_STUDIO_CHUNK_SUCCESS_TOO_LOW',
      'BLOCK',
      '分块提取成功率过低，结果不可靠。',
      `chunkSuccessRatio=${Math.round(chunkSuccessRatio * 100)}%`,
    );
  } else if (chunkSuccessRatio < 0.7) {
    pushIssue(
      'WORLD_STUDIO_CHUNK_SUCCESS_WARN',
      'WARN',
      '分块提取成功率偏低，建议重试失败分块。',
      `chunkSuccessRatio=${Math.round(chunkSuccessRatio * 100)}%`,
    );
  }

  if (primaryNarrativeCompleteness < 0.75) {
    pushIssue(
      'WORLD_STUDIO_NARRATIVE_COMPLETENESS_LOW',
      'WARN',
      '主线叙事起因/经过/结果不完整。',
      `primaryNarrativeCompleteness=${Math.round(primaryNarrativeCompleteness * 100)}%`,
    );
  }

  if (storyArcCompleteness < 0.85) {
    pushIssue(
      'WORLD_STUDIO_STORY_ARC_INCOMPLETE',
      'WARN',
      '叙事弧（开端-发展-高潮-收束）不完整。',
      `storyArcCompleteness=${Math.round(storyArcCompleteness * 100)}%`,
    );
  }

  if (characterNamePurity < 0.95) {
    pushIssue(
      'WORLD_STUDIO_CHARACTER_NAME_POLLUTION',
      'WARN',
      '角色名称可能包含脏词或未归一别名。',
      `characterNamePurity=${Math.round(characterNamePurity * 100)}%`,
    );
  }

  if (characterProfileCoverage < 0.8) {
    pushIssue(
      'WORLD_STUDIO_CHARACTER_PROFILE_INCOMPLETE',
      'WARN',
      '角色档案覆盖不足（背景/动机/关系未补齐）。',
      `characterProfileCoverage=${Math.round(characterProfileCoverage * 100)}%`,
    );
  }

  if (metrics.worldSettingCount === 0) {
    pushIssue(
      'WORLD_STUDIO_WORLD_SETTING_MISSING',
      'WARN',
      '世界设定摘要缺失。',
    );
  }

  const hasBlock = issues.some((issue) => issue.severity === 'BLOCK');
  const status: QualityGateResult['status'] = hasBlock
    ? 'BLOCK'
    : (issues.length > 0 ? 'WARN' : 'PASS');
  const reasons = issues.map((issue) => `${issue.code}: ${issue.message}`);

  return {
    status,
    issues,
    pass: status !== 'BLOCK',
    reasons,
    metrics,
  };
}
