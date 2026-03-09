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
}): string {
  const lines: string[] = [];
  if (input.userText) {
    lines.push(`用户刚提到: ${compactText(input.userText, 88)}`);
  }
  if (input.assistantText) {
    lines.push(`助手刚说: ${compactText(input.assistantText, 96)}`);
  }
  for (let index = input.messages.length - 1; index >= 0 && lines.length < 5; index -= 1) {
    const message = input.messages[index];
    if (!message) continue;
    if (message.kind === 'image' || message.kind === 'video') {
      const shadow = message.meta?.mediaShadow;
      if (shadow) {
        lines.push(`最近媒体: ${summarizeShadow(shadow)}`);
      }
      continue;
    }
    const content = compactText(message.content, 84);
    if (!content) continue;
    lines.push(`${message.role === 'user' ? '更早用户' : '更早助手'}: ${content}`);
  }
  return joinUnique(lines, ' | ', 420) || '-';
}

function buildContinuitySummary(input: {
  visualAnchor: CharacterVisualAnchor;
  recentMediaShadows: LocalChatMediaArtifactShadow[];
}): string {
  const refs = [
    ...input.visualAnchor.continuityRefs,
    ...input.recentMediaShadows.map((shadow) => `最近${shadow.kind}: ${summarizeShadow(shadow)}`),
  ];
  return joinUnique(refs, ' | ', 360) || '-';
}

function buildWorldHint(target: LocalChatTarget): string {
  const worldName = asString((target.world as Record<string, unknown> | null)?.name);
  const worldviewName = asString((target.worldview as Record<string, unknown> | null)?.name);
  return joinUnique([
    worldName ? `世界: ${worldName}` : '',
    worldviewName ? `世界观: ${worldviewName}` : '',
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
}): string {
  const semanticMood = asString(input.semanticIntent.mood);
  const moods: string[] = [];
  if (isMeaningfulDescriptor(semanticMood)) {
    moods.push(semanticMood);
  }
  if (input.semanticIntent.nsfwIntent === 'suggested' || INTIMATE_RE.test(input.cueSource)) {
    moods.push('亲近、私密、像只发给用户的一条私聊内容');
  } else if (EMOTIONAL_RE.test(input.cueSource)) {
    moods.push('温柔、安抚、带陪伴感');
  } else if (EXCITED_RE.test(input.cueSource)) {
    moods.push('轻快、俏皮、带一点互动感');
  } else if (NIGHT_RE.test(input.cueSource)) {
    moods.push('安静、松弛、带夜聊氛围');
  } else {
    moods.push('自然、放松、像聊天里顺手发来的内容');
  }
  return joinUnique(moods, '，', 140) || '自然、放松、像聊天里顺手发来的内容';
}

function buildSubject(input: {
  kind: MediaIntent['kind'];
  semanticIntent: MediaIntent;
  contextSnapshot: MediaContextSnapshot;
}): string {
  const semanticSubject = asString(input.semanticIntent.subject);
  const fallbackPose = input.kind === 'image'
    ? '当前状态像正在回用户消息时顺手拍下来的她'
    : '当前状态像正在对着镜头自然回应用户的一小段画面';
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
}): string {
  const sceneParts: string[] = [];
  const semanticScene = asString(input.semanticIntent.scene);
  const requestDetail = stripRequestBoilerplate(input.userText);
  if (isMeaningfulDescriptor(semanticScene)) {
    sceneParts.push(semanticScene);
  }
  if (requestDetail) {
    sceneParts.push(`围绕“${compactText(requestDetail, 84)}”展开`);
  }
  if (input.contextSnapshot.recentTurnSummary !== '-') {
    sceneParts.push(`延续最近聊天: ${input.contextSnapshot.recentTurnSummary}`);
  }
  const worldHint = buildWorldHint(input.target);
  if (worldHint) {
    sceneParts.push(worldHint);
  }
  sceneParts.push(
    input.kind === 'image'
      ? '像她顺手发来的一张自然照片'
      : '像她顺手录来的一小段自然短视频',
  );
  return joinUnique(sceneParts, '；', 320);
}

function buildStyleIntent(input: {
  kind: MediaIntent['kind'];
  semanticIntent: MediaIntent;
  cueSource: string;
  contextSnapshot: MediaContextSnapshot;
}): string {
  const styleParts: string[] = [];
  const semanticStyle = asString(input.semanticIntent.styleIntent);
  if (isMeaningfulDescriptor(semanticStyle)) {
    styleParts.push(semanticStyle);
  }
  styleParts.push(...input.contextSnapshot.visualAnchor.styleHints);
  styleParts.push(...collectRuleHints(STYLE_RULES, input.cueSource));
  styleParts.push(
    input.kind === 'image'
      ? '自然写实、生活流、高质量私聊照片质感'
      : '自然写实、生活流、短视频质感，动作和表情要连贯',
  );
  return joinUnique(styleParts, '，', 260);
}

function buildComposition(input: {
  kind: MediaIntent['kind'];
  cueSource: string;
  currentComposition?: string;
}): string {
  const rules = input.kind === 'image' ? IMAGE_COMPOSITION_RULES : VIDEO_COMPOSITION_RULES;
  const ruleHints = collectRuleHints(rules, input.cueSource);
  const fallback = input.kind === 'image'
    ? '主体清楚，镜头自然，像高质量但不摆拍的聊天照片'
    : '人物为主，动作自然，镜头稳定，像聊天里顺手录的一小段';
  return joinUnique([
    input.currentComposition,
    ...ruleHints,
    fallback,
  ], '；', 240);
}

function buildNegativeCues(input: {
  kind: MediaIntent['kind'];
  hints?: LocalChatMediaHints;
}): string[] {
  const defaults = input.kind === 'image'
    ? ['多余人物', '手部崩坏', '过度磨皮', '服装漂移', '脸部失真']
    : ['多余人物', '动作突变', '镜头乱晃', '人物漂移', '表情抽动'];
  return normalizeStringList([
    ...(input.hints?.negativeCues || []),
    ...defaults,
  ], 8);
}

function buildContinuityRefs(input: {
  hints?: LocalChatMediaHints;
  contextSnapshot: MediaContextSnapshot;
}): string[] {
  return normalizeStringList([
    ...(input.hints?.continuityRefs || []),
    ...input.contextSnapshot.visualAnchor.continuityRefs,
    ...input.contextSnapshot.recentMediaShadows.map((shadow) => `延续最近媒体: ${summarizeShadow(shadow)}`),
  ], 6);
}

export function collectMediaContextSnapshot(input: {
  target: LocalChatTarget;
  messages: ChatMessage[];
  userText: string;
  assistantText: string;
}): MediaContextSnapshot {
  const visualAnchor = buildCharacterVisualAnchor(input.target);
  const recentMediaShadows = collectRecentMediaShadows(input.messages);
  return {
    visualAnchor,
    visualAnchorSummary: visualAnchor.plannerSummary,
    recentTurnSummary: buildRecentTurnSummary(input),
    continuitySummary: buildContinuitySummary({
      visualAnchor,
      recentMediaShadows,
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
}): MediaIntent {
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
    }),
    scene: buildScene({
      kind: input.semanticIntent.kind,
      semanticIntent: input.semanticIntent,
      target: input.target,
      userText: input.userText,
      assistantText: input.assistantText,
      contextSnapshot: input.contextSnapshot,
    }),
    styleIntent: buildStyleIntent({
      kind: input.semanticIntent.kind,
      semanticIntent: input.semanticIntent,
      cueSource,
      contextSnapshot: input.contextSnapshot,
    }),
    mood: inferMood({
      semanticIntent: input.semanticIntent,
      cueSource,
    }),
    hints: {
      composition: buildComposition({
        kind: input.semanticIntent.kind,
        cueSource,
        currentComposition: input.semanticIntent.hints?.composition,
      }),
      negativeCues: buildNegativeCues({
        kind: input.semanticIntent.kind,
        hints: input.semanticIntent.hints,
      }),
      continuityRefs: buildContinuityRefs({
        hints: input.semanticIntent.hints,
        contextSnapshot: input.contextSnapshot,
      }),
    },
  };
}
