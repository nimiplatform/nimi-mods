import { clamp01 } from '@nimiplatform/sdk/mod/utils';
import { toCharacterCandidates } from '../../engine/merge.js';
import { canonicalizeCharacterNames } from '../../engine/character/normalize-zh.js';
import type { Phase1Character, Phase1Option, WorldStudioKnowledgeGraphDraft } from '../../engine/types.js';

const HEURISTIC_SOURCE_LIMIT = 200_000;
const CHINESE_STOPWORDS = new Set([
  // Generic nouns
  '世界', '时间', '地点', '人物', '事件', '关系', '历史', '文明',
  '科技', '中国', '系统', '项目', '计划', '任务', '东西', '地方',
  '情况', '问题', '方法', '样子', '时候', '功夫', '消息',
  // Pronouns & demonstratives
  '我们', '他们', '自己', '这个', '那个', '这些', '那些', '什么',
  '怎么', '大家', '对方', '别人',
  // Conjunctions & adverbs
  '因为', '所以', '然后', '已经', '没有', '可以', '不是', '以及',
  '但是', '如果', '为了', '虽然', '不过', '只是', '而且', '或者',
  '于是', '因此', '即使',
  // Common verb fragments
  '发现', '知道', '觉得', '看到', '听到', '想到', '感到', '认为',
  '开始', '继续', '终于', '突然', '居然', '竟然', '果然',
  // Descriptive fragments
  '一个', '一位', '一名', '一声', '一下', '此人', '那人',
  '心中', '身上', '之中', '之后', '之前', '其中',
  // State words
  '皮肤', '黑黑', '身材', '修长', '魁梧', '瘦弱', '年轻', '苍老',
]);

function extractHeuristicCharacterNames(sourceText: string): string[] {
  const text = String(sourceText || '').slice(0, HEURISTIC_SOURCE_LIMIT);
  const frequencies = new Map<string, number>();
  const chinese = text.match(/[\u4e00-\u9fff]{2,4}/g) || [];
  chinese.forEach((token) => {
    const name = token.trim();
    if (!name || CHINESE_STOPWORDS.has(name)) return;
    frequencies.set(name, (frequencies.get(name) || 0) + 1);
  });
  const latin = text.match(/\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\b/g) || [];
  latin.forEach((token) => {
    const name = token.trim();
    if (!name) return;
    frequencies.set(name, (frequencies.get(name) || 0) + 1);
  });
  // Require at least 2 occurrences to filter out noise
  return Array.from(frequencies.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 24);
}

function toUniqueStringArray(values: string[]): string[] {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

export function fallbackCharacterCandidates(
  graph: WorldStudioKnowledgeGraphDraft,
  sourceText: string,
): Phase1Character[] {
  const graphCandidates = toCharacterCandidates(graph.characters);
  if (graphCandidates.length > 0) {
    const canonicalized = canonicalizeCharacterNames(graphCandidates.map((item) => item.name));
    const byName = new Map(graphCandidates.map((item) => [item.name, item]));
    return canonicalized.canonicalNames.map((name) => {
      const matched = byName.get(name)
        || graphCandidates.find((item) => canonicalized.aliasToCanonical[item.name] === name)
        || null;
      return {
        name,
        summary: matched?.summary || 'Recovered from graph.',
        significance: clamp01(matched?.significance || 0.5),
      };
    }).slice(0, 24);
  }
  const eventNames = [
    ...graph.events.primary.flatMap((item) => item.characterRefs),
    ...graph.events.secondary.flatMap((item) => item.characterRefs),
  ].map((item) => String(item || '').trim()).filter(Boolean);
  const fallbackPool = eventNames.length > 0 ? eventNames : extractHeuristicCharacterNames(sourceText);
  const fallbackNames = canonicalizeCharacterNames(fallbackPool).canonicalNames;
  if (fallbackNames.length === 0) {
    fallbackNames.push('叙事锚点');
  }
  return fallbackNames.slice(0, 24).map((name) => ({
    name,
    summary: 'Recovered from source text/event graph fallback (heuristic).',
    significance: clamp01(0.2),
  }));
}

export function fallbackStartTimeOptions(
  graph: WorldStudioKnowledgeGraphDraft,
): Phase1Option[] {
  const eventTimeRefs = [
    ...graph.events.primary.map((item) => String(item.timeRef || '').trim()),
    ...graph.events.secondary.map((item) => String(item.timeRef || '').trim()),
  ].filter(Boolean);
  const uniqueTimeRefs = toUniqueStringArray(eventTimeRefs).slice(0, 12);
  if (uniqueTimeRefs.length === 0) {
    return [{
      id: 'time-anchor-now',
      label: 'Current Narrative Anchor',
      description: 'Auto-generated fallback when timeline extraction is sparse.',
      weight: 0.4,
    }];
  }
  return uniqueTimeRefs.map((timeRef, index) => ({
    id: `time-anchor-${index + 1}`,
    label: timeRef,
    description: 'Recovered from event graph time references.',
    weight: 0.5,
  }));
}
