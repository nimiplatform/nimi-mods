import type { LocalChatTarget } from '../../data/index.js';
import type {
  ChatMessage,
  LocalChatMediaArtifactShadow,
  LocalChatMediaHints,
} from '../../types.js';
import type { MediaIntent } from './media-spec.js';
import {
  buildCharacterVisualAnchor,
  type CharacterVisualAnchor,
} from './character-visual-anchor.js';
import { pt, type PromptLocale } from '../../prompt/prompt-locale.js';

export type MediaContextSnapshot = {
  visualAnchor: CharacterVisualAnchor;
  visualAnchorSummary: string;
  recentTurnSummary: string;
  continuitySummary: string;
  recentMediaShadows: LocalChatMediaArtifactShadow[];
};

const GENERIC_MEDIA_DESCRIPTOR_RE = /^(?:当前对话中的主体|贴合当前对话语境|自然、精致、贴合陪伴式对话|贴合当前交流氛围|自然|普通问候场景|generic greeting|scene fits image|visual scene)$/i;
const REQUEST_FILER_RE = /\b(?:send|show|make|create|generate|draw|render|give|can you|could you|please)\b|(?:给我|帮我|替我|发我|来个|来张|来段|发张|发个|做个|做张|整点|生成个|生成张|画张|照片|图片|图|自拍|视频|短视频|短片|影片|动图|看看|一下|一张|一个|一段)/giu;
const INTIMATE_RE = /\b(?:kiss|nude|lingerie|sensual|flirt|bedroom)\b|(?:暧昧|亲密|性感|吻|睡衣|床上|调情|贴贴|诱惑)/iu;
const EMOTIONAL_RE = /难过|好累|很累|委屈|抱抱|安慰|辛苦|孤单|miss you|tired|comfort/iu;
const EXCITED_RE = /哈哈|好耶|太好了|卧槽|真的耶|笑死|wow|omg|excited|yay/iu;
const NIGHT_RE = /夜|深夜|雨夜|窗边|房间|床边|灯光|夜聊|rain|night|window|room|bed|lamp/iu;

type SignalRule = {
  pattern: RegExp;
  hint: string;
};

const IMAGE_COMPOSITION_RULES: SignalRule[] = [
  { pattern: /(?:selfie|自拍|头像|大头照)/iu, hint: '竖构图，半身近景，像私聊里随手发来的自拍' },
  { pattern: /(?:portrait|close-?up|人像|特写|近景)/iu, hint: '主体靠近镜头，表情和眼神清楚' },
  { pattern: /(?:full-?body|全身|站姿)/iu, hint: '保留完整姿态和服装细节' },
  { pattern: /(?:wide(?:\s+shot)?|landscape|远景|全景|海边|街景)/iu, hint: '带出环境和空间氛围，不只拍脸' },
  { pattern: /(?:window|窗边|room|房间|bed|床|sofa|沙发)/iu, hint: '生活感室内场景，像真实聊天中的随手拍' },
];

const VIDEO_COMPOSITION_RULES: SignalRule[] = [
  { pattern: /(?:selfie|自拍)/iu, hint: '竖构图，人物面对镜头，像刚录给用户的一小段自拍视频' },
  { pattern: /(?:tracking|follow|跟拍|跟随)/iu, hint: '镜头轻微跟随人物，不要突兀跳切' },
  { pattern: /(?:push(?:\s|-)?in|zoom(?:\s|-)?in|推进|拉近)/iu, hint: '镜头缓慢推进，动作自然，不要突然冲脸' },
  { pattern: /(?:pan|orbit|横摇|环绕)/iu, hint: '镜头运动轻微克制，保证主体稳定' },
  { pattern: /(?:blink|smile|glance|nod|眨眼|微笑|回眸|点头)/iu, hint: '动作幅度小而连贯，适合短视频节奏' },
];

const STYLE_RULES: SignalRule[] = [
  { pattern: /(?:cinematic|电影感|胶片|film)/iu, hint: '电影感、轻胶片质感、光影明确' },
  { pattern: /(?:photoreal|realistic|写实)/iu, hint: '自然写实，皮肤和材质保持真实' },
  { pattern: /(?:anime|illustration|插画|二次元)/iu, hint: '保留角色设定感，但面部和服装不要失真' },
  { pattern: /(?:rain|雨夜|neon|霓虹|night|夜色)/iu, hint: '夜色和反光要自然，保留环境氛围' },
];

function asString(value: unknown): string {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value: string, maxLength: number): string {
  const normalized = asString(value);
  if (!normalized || normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function joinUnique(values: Array<string | undefined | null>, separator: string, maxLength: number): string {
  const normalized = Array.from(new Set(
    values
      .map((value) => asString(value))
      .filter(Boolean),
  ));
  const joined = normalized.join(separator).trim();
  return compactText(joined, maxLength);
}

function normalizeStringList(values: string[] | undefined, maxItems: number): string[] {
  return Array.from(new Set(
    (values || [])
      .map((value) => asString(value))
      .filter(Boolean),
  )).slice(0, maxItems);
}

function isMeaningfulDescriptor(value: string | undefined | null): boolean {
  const normalized = asString(value);
  if (!normalized || GENERIC_MEDIA_DESCRIPTOR_RE.test(normalized)) {
    return false;
  }
  const stripped = stripRequestBoilerplate(normalized);
  return stripped.length >= 4 || stripped === normalized;
}

function stripRequestBoilerplate(value: string): string {
  return asString(value)
    .replace(REQUEST_FILER_RE, ' ')
    .replace(/[!,.?？！，。~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeShadow(shadow: LocalChatMediaArtifactShadow): string {
  return compactText([
    shadow.subject,
    shadow.scene,
    shadow.styleIntent,
  ].map((value) => asString(value)).filter(Boolean).join(' / '), 110);
}

function collectRecentMediaShadows(messages: ChatMessage[]): LocalChatMediaArtifactShadow[] {
  const collected: LocalChatMediaArtifactShadow[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const shadow = messages[index]?.meta?.mediaShadow;
    if (!shadow) continue;
    collected.push(shadow);
    if (collected.length >= 2) break;
  }
  return collected;
}

function buildRecentTurnSummary(input: {
  messages: ChatMessage[];
  userText: string;
  assistantText: string;
  promptLocale?: PromptLocale;
}): string {
  const locale = input.promptLocale || 'en';
  const lines: string[] = [];
  if (input.userText) {
    lines.push(pt(locale, 'enricher.userMention', { text: compactText(input.userText, 88) }));
  }
  if (input.assistantText) {
    lines.push(pt(locale, 'enricher.assistantSaid', { text: compactText(input.assistantText, 96) }));
  }
  for (let index = input.messages.length - 1; index >= 0 && lines.length < 5; index -= 1) {
    const message = input.messages[index];
    if (!message) continue;
    if (message.kind === 'image' || message.kind === 'video') {
      const shadow = message.meta?.mediaShadow;
      if (shadow) {
        lines.push(pt(locale, 'enricher.recentMedia', { text: summarizeShadow(shadow) }));
      }
      continue;
    }
    const content = compactText(message.content, 84);
    if (!content) continue;
    const roleLabel = message.role === 'user' ? pt(locale, 'enricher.earlierUser') : pt(locale, 'enricher.earlierAssistant');
    lines.push(`${roleLabel}: ${content}`);
  }
  return joinUnique(lines, ' | ', 420) || '-';
}

function buildContinuitySummary(input: {
  visualAnchor: CharacterVisualAnchor;
  recentMediaShadows: LocalChatMediaArtifactShadow[];
  promptLocale?: PromptLocale;
}): string {
  const locale = input.promptLocale || 'en';
  const refs = [
    ...input.visualAnchor.continuityRefs,
    ...input.recentMediaShadows.map((shadow) => pt(locale, 'enricher.recentMediaContinuity', { kind: shadow.kind, summary: summarizeShadow(shadow) })),
  ];
  return joinUnique(refs, ' | ', 360) || '-';
}

function buildWorldHint(target: LocalChatTarget, locale: PromptLocale): string {
  const worldName = asString((target.world as Record<string, unknown> | null)?.name);
  const worldviewName = asString((target.worldview as Record<string, unknown> | null)?.name);
  return joinUnique([
    worldName ? pt(locale, 'enricher.worldLabel', { name: worldName }) : '',
    worldviewName ? pt(locale, 'enricher.worldviewLabel', { name: worldviewName }) : '',
  ], '，', 80);
}

function collectRuleHints(rules: SignalRule[], source: string): string[] {
  return rules
    .filter((rule) => rule.pattern.test(source))
    .map((rule) => rule.hint);
}

function inferMood(input: {
  semanticIntent: MediaIntent;
  cueSource: string;
  promptLocale?: PromptLocale;
}): string {
  const locale = input.promptLocale || 'en';
  const semanticMood = asString(input.semanticIntent.mood);
  const moods: string[] = [];
  if (isMeaningfulDescriptor(semanticMood)) {
    moods.push(semanticMood);
  }
  if (input.semanticIntent.nsfwIntent === 'suggested' || INTIMATE_RE.test(input.cueSource)) {
    moods.push(pt(locale, 'enricher.intimateMood'));
  } else if (EMOTIONAL_RE.test(input.cueSource)) {
    moods.push(pt(locale, 'enricher.emotionalMood'));
  } else if (EXCITED_RE.test(input.cueSource)) {
    moods.push(pt(locale, 'enricher.excitedMood'));
  } else if (NIGHT_RE.test(input.cueSource)) {
    moods.push(pt(locale, 'enricher.nightMood'));
  } else {
    moods.push(pt(locale, 'enricher.defaultMood'));
  }
  return joinUnique(moods, '，', 140) || pt(locale, 'enricher.defaultMood');
}

function buildSubject(input: {
  kind: MediaIntent['kind'];
  semanticIntent: MediaIntent;
  contextSnapshot: MediaContextSnapshot;
  promptLocale?: PromptLocale;
}): string {
  const locale = input.promptLocale || 'en';
  const semanticSubject = asString(input.semanticIntent.subject);
  const fallbackPose = input.kind === 'image'
    ? pt(locale, 'enricher.imageFallbackPose')
    : pt(locale, 'enricher.videoFallbackPose');
  return joinUnique([
    input.contextSnapshot.visualAnchor.subject,
    isMeaningfulDescriptor(semanticSubject) ? `当前状态: ${semanticSubject}` : fallbackPose,
  ], '；', 260);
}

function buildScene(input: {
  kind: MediaIntent['kind'];
  semanticIntent: MediaIntent;
  target: LocalChatTarget;
  userText: string;
  assistantText: string;
  contextSnapshot: MediaContextSnapshot;
  promptLocale?: PromptLocale;
}): string {
  const locale = input.promptLocale || 'en';
  const sceneParts: string[] = [];
  const semanticScene = asString(input.semanticIntent.scene);
  const requestDetail = stripRequestBoilerplate(input.userText);
  if (isMeaningfulDescriptor(semanticScene)) {
    sceneParts.push(semanticScene);
  }
  if (requestDetail) {
    sceneParts.push(pt(locale, 'enricher.expandAround', { detail: compactText(requestDetail, 84) }));
  }
  if (input.contextSnapshot.recentTurnSummary !== '-') {
    sceneParts.push(pt(locale, 'enricher.continuityLine', { summary: input.contextSnapshot.recentTurnSummary }));
  }
  const worldHint = buildWorldHint(input.target, locale);
  if (worldHint) {
    sceneParts.push(worldHint);
  }
  sceneParts.push(
    input.kind === 'image'
      ? pt(locale, 'enricher.imageSceneFallback')
      : pt(locale, 'enricher.videoSceneFallback'),
  );
  return joinUnique(sceneParts, '；', 320);
}

function buildStyleIntent(input: {
  kind: MediaIntent['kind'];
  semanticIntent: MediaIntent;
  cueSource: string;
  contextSnapshot: MediaContextSnapshot;
  promptLocale?: PromptLocale;
}): string {
  const locale = input.promptLocale || 'en';
  const styleParts: string[] = [];
  const semanticStyle = asString(input.semanticIntent.styleIntent);
  if (isMeaningfulDescriptor(semanticStyle)) {
    styleParts.push(semanticStyle);
  }
  styleParts.push(...input.contextSnapshot.visualAnchor.styleHints);
  styleParts.push(...collectRuleHints(STYLE_RULES, input.cueSource));
  styleParts.push(
    input.kind === 'image'
      ? pt(locale, 'enricher.imageStyleFallback')
      : pt(locale, 'enricher.videoStyleFallback'),
  );
  return joinUnique(styleParts, '，', 260);
}

function buildComposition(input: {
  kind: MediaIntent['kind'];
  cueSource: string;
  currentComposition?: string;
  promptLocale?: PromptLocale;
}): string {
  const locale = input.promptLocale || 'en';
  const rules = input.kind === 'image' ? IMAGE_COMPOSITION_RULES : VIDEO_COMPOSITION_RULES;
  const ruleHints = collectRuleHints(rules, input.cueSource);
  const fallback = input.kind === 'image'
    ? pt(locale, 'enricher.imageCompositionFallback')
    : pt(locale, 'enricher.videoCompositionFallback');
  return joinUnique([
    input.currentComposition,
    ...ruleHints,
    fallback,
  ], '；', 240);
}

function buildNegativeCues(input: {
  kind: MediaIntent['kind'];
  hints?: LocalChatMediaHints;
  promptLocale?: PromptLocale;
}): string[] {
  const locale = input.promptLocale || 'en';
  const rawDefaults = input.kind === 'image'
    ? pt(locale, 'enricher.imageNegCues')
    : pt(locale, 'enricher.videoNegCues');
  const defaults = rawDefaults.split('|');
  return normalizeStringList([
    ...(input.hints?.negativeCues || []),
    ...defaults,
  ], 8);
}

function buildContinuityRefs(input: {
  hints?: LocalChatMediaHints;
  contextSnapshot: MediaContextSnapshot;
  promptLocale?: PromptLocale;
}): string[] {
  const locale = input.promptLocale || 'en';
  return normalizeStringList([
    ...(input.hints?.continuityRefs || []),
    ...input.contextSnapshot.visualAnchor.continuityRefs,
    ...input.contextSnapshot.recentMediaShadows.map((shadow) => pt(locale, 'enricher.continuityMediaPrefix', { summary: summarizeShadow(shadow) })),
  ], 6);
}

export function collectMediaContextSnapshot(input: {
  target: LocalChatTarget;
  messages: ChatMessage[];
  userText: string;
  assistantText: string;
  promptLocale?: PromptLocale;
}): MediaContextSnapshot {
  const visualAnchor = buildCharacterVisualAnchor(input.target);
  const recentMediaShadows = collectRecentMediaShadows(input.messages);
  return {
    visualAnchor,
    visualAnchorSummary: visualAnchor.plannerSummary,
    recentTurnSummary: buildRecentTurnSummary({ ...input, promptLocale: input.promptLocale }),
    continuitySummary: buildContinuitySummary({
      visualAnchor,
      recentMediaShadows,
      promptLocale: input.promptLocale,
    }),
    recentMediaShadows,
  };
}

export function enrichMediaIntent(input: {
  semanticIntent: MediaIntent;
  target: LocalChatTarget;
  userText: string;
  assistantText: string;
  contextSnapshot: MediaContextSnapshot;
  promptLocale?: PromptLocale;
}): MediaIntent {
  const locale = input.promptLocale || 'en';
  const cueSource = [
    input.userText,
    input.assistantText,
    input.semanticIntent.subject,
    input.semanticIntent.scene,
    input.semanticIntent.styleIntent,
    input.semanticIntent.mood,
    input.contextSnapshot.recentTurnSummary,
    input.contextSnapshot.continuitySummary,
  ].map((value) => asString(value)).filter(Boolean).join('\n');

  return {
    ...input.semanticIntent,
    subject: buildSubject({
      kind: input.semanticIntent.kind,
      semanticIntent: input.semanticIntent,
      contextSnapshot: input.contextSnapshot,
      promptLocale: locale,
    }),
    scene: buildScene({
      kind: input.semanticIntent.kind,
      semanticIntent: input.semanticIntent,
      target: input.target,
      userText: input.userText,
      assistantText: input.assistantText,
      contextSnapshot: input.contextSnapshot,
      promptLocale: locale,
    }),
    styleIntent: buildStyleIntent({
      kind: input.semanticIntent.kind,
      semanticIntent: input.semanticIntent,
      cueSource,
      contextSnapshot: input.contextSnapshot,
      promptLocale: locale,
    }),
    mood: inferMood({
      semanticIntent: input.semanticIntent,
      cueSource,
      promptLocale: locale,
    }),
    hints: {
      composition: buildComposition({
        kind: input.semanticIntent.kind,
        cueSource,
        currentComposition: input.semanticIntent.hints?.composition,
        promptLocale: locale,
      }),
      negativeCues: buildNegativeCues({
        kind: input.semanticIntent.kind,
        hints: input.semanticIntent.hints,
        promptLocale: locale,
      }),
      continuityRefs: buildContinuityRefs({
        hints: input.semanticIntent.hints,
        contextSnapshot: input.contextSnapshot,
        promptLocale: locale,
      }),
    },
  };
}
