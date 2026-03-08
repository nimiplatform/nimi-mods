import type {
  LocalChatCompiledMediaExecution,
  LocalChatMediaArtifactShadow,
  LocalChatMediaGenerationSpec,
  LocalChatMediaHints,
  LocalChatMediaIntentSource,
  LocalChatMediaKind,
  LocalChatMediaPlannerTrigger,
  LocalChatMediaRouteSource,
  LocalChatResolvedMediaRoute,
} from '../../types.js';

export const LOCAL_CHAT_MEDIA_COMPILER_REVISION = 'media-compiler.2026-03-07.runtime-payload-v2';

export type MediaIntent = {
  kind: LocalChatMediaKind;
  intentSource: LocalChatMediaIntentSource;
  plannerTrigger: LocalChatMediaPlannerTrigger;
  confidence: number | null;
  nsfwIntent: 'none' | 'suggested';
  subject: string;
  scene: string;
  styleIntent: string;
  mood: string;
  hints?: LocalChatMediaHints;
};

type CanonicalMediaSpec = {
  kind: LocalChatMediaGenerationSpec['kind'];
  intentSource: LocalChatMediaGenerationSpec['intentSource'];
  plannerTrigger: LocalChatMediaGenerationSpec['plannerTrigger'];
  confidence?: number;
  nsfwIntent: LocalChatMediaGenerationSpec['nsfwIntent'];
  targetId: string;
  worldId?: string;
  subject: string;
  scene: string;
  styleIntent: string;
  mood: string;
  requestedSize?: string;
  requestedCount?: number;
  requestedDurationSeconds?: number;
  hints?: {
    composition?: string;
    negativeCues?: string[];
    continuityRefs?: string[];
  };
};

type CanonicalExecution = {
  specHash: string;
  compilerRevision: string;
  compiledPromptText: string;
  kind: LocalChatMediaGenerationSpec['kind'];
  negativePrompt?: string;
  requestedSize?: string;
  requestedAspectRatio?: string;
  requestedStyle?: string;
  requestedCount?: number;
  requestedDurationSeconds?: number;
  requestedCameraMotion?: string;
  routeSource: LocalChatResolvedMediaRoute['source'];
  connectorId?: string;
  model?: string;
  nsfwPolicy: 'disabled' | 'local-only' | 'allowed';
};

function trimAndCollapseWhitespace(value: string): string {
  return String(value || '')
    .normalize('NFC')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIdLike(value: string): string {
  return trimAndCollapseWhitespace(value).toLowerCase();
}

function normalizeOptionalString(value: string | undefined | null): string | undefined {
  const normalized = trimAndCollapseWhitespace(String(value || ''));
  return normalized || undefined;
}

function normalizeOptionalNumber(value: number | undefined | null): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const normalized = Math.round(Number(value));
  return normalized > 0 ? normalized : undefined;
}

function normalizeConfidence(value: number | null | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, Number(value)));
}

function normalizeSortedStringList(values: string[] | undefined): string[] | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  const normalized = Array.from(new Set(
    values
      .map((value) => trimAndCollapseWhitespace(String(value || '')))
      .filter(Boolean),
  )).sort((left, right) => left.localeCompare(right));
  return normalized.length > 0 ? normalized : undefined;
}

function serializeCanonicalRecord(record: Record<string, unknown>): string {
  return JSON.stringify(record);
}

async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('LOCAL_CHAT_MEDIA_SHA256_UNAVAILABLE');
  }
  const payload = new TextEncoder().encode(input);
  const digest = await subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function summarizeHints(hints: LocalChatMediaHints | undefined): string[] {
  if (!hints) return [];
  const lines: string[] = [];
  const composition = normalizeOptionalString(hints.composition);
  const negativeCues = normalizeSortedStringList(hints.negativeCues);
  const continuityRefs = normalizeSortedStringList(hints.continuityRefs);
  if (composition) {
    lines.push(`构图提示: ${composition}`);
  }
  if (negativeCues && negativeCues.length > 0) {
    lines.push(`避免元素: ${negativeCues.join('、')}`);
  }
  if (continuityRefs && continuityRefs.length > 0) {
    lines.push(`连续性参考: ${continuityRefs.join('、')}`);
  }
  return lines;
}

const SQUARE_IMAGE_CUE_RE = /(?:avatar|profile|selfie|icon|头像|大头照|自拍|证件照)/i;
const LANDSCAPE_IMAGE_CUE_RE = /(?:landscape|wide(?:\s+shot)?|panorama|wallpaper|establishing\s+shot|horizon|横构图|横向|全景|远景|宽幅|壁纸|海边|街景|天际线)/i;
const PORTRAIT_IMAGE_CUE_RE = /(?:portrait|close-?up|half-?body|full-?body|vertical|fashion\s+shot|竖构图|纵向|人像|特写|半身|全身|站姿|近景)/i;
const LONG_VIDEO_CUE_RE = /(?:walk|turn(?:\s+around)?|spin|dance|approach|reach|camera|tracking|follow|pan|zoom|sequence|转身|走向|走到|走过|迈步|舞动|抬手|镜头|跟拍|推进|拉远|片段|过程)/i;
const SHORT_VIDEO_CUE_RE = /(?:blink|glance|smile|nod|breath|loop|idle|一瞬|眨眼|回眸|微笑|点头|轻轻一笑|短循环|轻晃)/i;
const TRACKING_VIDEO_CUE_RE = /(?:tracking|follow|跟拍|追拍|跟随|随着)/i;
const PAN_VIDEO_CUE_RE = /(?:pan|横摇|扫过|摇镜)/i;
const PUSH_IN_VIDEO_CUE_RE = /(?:push(?:\s|-)?in|zoom(?:\s|-)?in|推进|拉近|逼近)/i;
const ORBIT_VIDEO_CUE_RE = /(?:orbit|circle(?:\s+around)?|环绕|绕着)/i;
const CINEMATIC_STYLE_CUE_RE = /(?:cinematic|电影感|胶片|film(?:ic)?)/i;
const PHOTOREAL_STYLE_CUE_RE = /(?:photoreal|realistic|写实|自然写实)/i;
const ILLUSTRATION_STYLE_CUE_RE = /(?:illustration|anime|插画|二次元|绘本)/i;

function collectMediaIntentDescriptors(input: {
  subject: string;
  scene: string;
  styleIntent: string;
  mood: string;
  hints?: LocalChatMediaHints;
}): string {
  return [
    normalizeOptionalString(input.subject),
    normalizeOptionalString(input.scene),
    normalizeOptionalString(input.styleIntent),
    normalizeOptionalString(input.mood),
    normalizeOptionalString(input.hints?.composition),
    ...(normalizeSortedStringList(input.hints?.negativeCues) || []),
    ...(normalizeSortedStringList(input.hints?.continuityRefs) || []),
  ].filter(Boolean).join('\n');
}

function inferRequestedImageSize(input: {
  subject: string;
  scene: string;
  styleIntent: string;
  mood: string;
  hints?: LocalChatMediaHints;
}): string | undefined {
  const descriptors = collectMediaIntentDescriptors(input);
  if (!descriptors) return undefined;
  if (SQUARE_IMAGE_CUE_RE.test(descriptors)) {
    return '1024x1024';
  }
  if (LANDSCAPE_IMAGE_CUE_RE.test(descriptors)) {
    return '1536x1024';
  }
  if (PORTRAIT_IMAGE_CUE_RE.test(descriptors)) {
    return '1024x1536';
  }
  return undefined;
}

function inferRequestedVideoDurationSeconds(input: {
  subject: string;
  scene: string;
  styleIntent: string;
  mood: string;
  hints?: LocalChatMediaHints;
}): number {
  const descriptors = collectMediaIntentDescriptors(input);
  if (LONG_VIDEO_CUE_RE.test(descriptors)) {
    return 6;
  }
  if (SHORT_VIDEO_CUE_RE.test(descriptors)) {
    return 4;
  }
  return 5;
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b > 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function inferAspectRatioFromSize(size: string | undefined): string | undefined {
  const normalized = normalizeOptionalString(size);
  if (!normalized) return undefined;
  const matched = normalized.match(/^(\d{2,5})x(\d{2,5})$/i);
  if (!matched) return undefined;
  const width = Number(matched[1]);
  const height = Number(matched[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function buildNegativePrompt(hints: LocalChatMediaHints | undefined): string | undefined {
  const negativeCues = normalizeSortedStringList(hints?.negativeCues);
  if (!negativeCues || negativeCues.length === 0) {
    return undefined;
  }
  return negativeCues.join(', ');
}

function inferImageStyle(styleIntent: string): string | undefined {
  const normalized = normalizeOptionalString(styleIntent);
  if (!normalized) return undefined;
  if (CINEMATIC_STYLE_CUE_RE.test(normalized)) {
    return 'cinematic';
  }
  if (PHOTOREAL_STYLE_CUE_RE.test(normalized)) {
    return 'photorealistic';
  }
  if (ILLUSTRATION_STYLE_CUE_RE.test(normalized)) {
    return 'illustration';
  }
  return undefined;
}

function inferVideoAspectRatio(input: {
  subject: string;
  scene: string;
  styleIntent: string;
  mood: string;
  hints?: LocalChatMediaHints;
}): string | undefined {
  const descriptors = collectMediaIntentDescriptors(input);
  if (!descriptors) return undefined;
  if (PORTRAIT_IMAGE_CUE_RE.test(descriptors) || SQUARE_IMAGE_CUE_RE.test(descriptors)) {
    return '9:16';
  }
  if (LANDSCAPE_IMAGE_CUE_RE.test(descriptors) || LONG_VIDEO_CUE_RE.test(descriptors)) {
    return '16:9';
  }
  return undefined;
}

function inferCameraMotion(input: {
  subject: string;
  scene: string;
  styleIntent: string;
  mood: string;
  hints?: LocalChatMediaHints;
}): string | undefined {
  const descriptors = collectMediaIntentDescriptors(input);
  if (!descriptors) return undefined;
  if (TRACKING_VIDEO_CUE_RE.test(descriptors)) {
    return 'tracking';
  }
  if (PAN_VIDEO_CUE_RE.test(descriptors)) {
    return 'pan';
  }
  if (PUSH_IN_VIDEO_CUE_RE.test(descriptors)) {
    return 'push-in';
  }
  if (ORBIT_VIDEO_CUE_RE.test(descriptors)) {
    return 'orbit';
  }
  return undefined;
}

export function buildMediaGenerationSpec(input: {
  intent: MediaIntent;
  targetId: string;
  worldId?: string | null;
}): LocalChatMediaGenerationSpec {
  const requestedSize = input.intent.kind === 'image'
    ? inferRequestedImageSize(input.intent)
    : undefined;
  const requestedDurationSeconds = input.intent.kind === 'video'
    ? inferRequestedVideoDurationSeconds(input.intent)
    : undefined;
  return {
    kind: input.intent.kind,
    intentSource: input.intent.intentSource,
    plannerTrigger: input.intent.plannerTrigger,
    confidence: input.intent.confidence,
    nsfwIntent: input.intent.nsfwIntent,
    targetId: normalizeOptionalString(input.targetId) || 'unknown-target',
    worldId: normalizeOptionalString(input.worldId || '') || null,
    subject: normalizeOptionalString(input.intent.subject) || '当前对话中的主体',
    scene: normalizeOptionalString(input.intent.scene) || '贴合当前对话语境',
    styleIntent: normalizeOptionalString(input.intent.styleIntent) || '自然、精致、贴合陪伴式对话',
    mood: normalizeOptionalString(input.intent.mood) || '贴合当前交流氛围',
    ...(requestedSize ? { requestedSize } : {}),
    ...(input.intent.kind === 'image' ? { requestedCount: 1 } : {}),
    ...(input.intent.kind === 'video' ? { requestedDurationSeconds } : {}),
    ...(input.intent.hints ? { hints: input.intent.hints } : {}),
  };
}

export function compileMediaExecution(
  spec: LocalChatMediaGenerationSpec,
): LocalChatCompiledMediaExecution {
  const lines = [
    spec.kind === 'image'
      ? '请生成一张贴合当前对话氛围的图像。'
      : '请生成一段贴合当前对话氛围的短视频。',
    `主体: ${spec.subject}`,
    `场景: ${spec.scene}`,
    `风格: ${spec.styleIntent}`,
    `情绪: ${spec.mood}`,
    ...summarizeHints(spec.hints),
  ].filter(Boolean);
  const compiledPromptText = lines.join('\n').trim();
  const negativePrompt = buildNegativePrompt(spec.hints);
  const imageAspectRatio = inferAspectRatioFromSize(spec.requestedSize);
  const imageStyle = inferImageStyle(spec.styleIntent);
  const videoAspectRatio = inferVideoAspectRatio(spec);
  const videoCameraMotion = inferCameraMotion(spec);
  return {
    compiledPromptText,
    runtimePayload: {
      prompt: compiledPromptText,
      ...(negativePrompt ? { negativePrompt } : {}),
      ...(spec.kind === 'image' && spec.requestedSize ? { size: spec.requestedSize } : {}),
      ...(spec.kind === 'image' && imageAspectRatio ? { aspectRatio: imageAspectRatio } : {}),
      ...(spec.kind === 'image' && imageStyle ? { style: imageStyle } : {}),
      ...(spec.kind === 'image' && spec.requestedCount ? { n: spec.requestedCount } : {}),
      ...(spec.kind === 'video' && spec.requestedDurationSeconds ? { durationSeconds: spec.requestedDurationSeconds } : {}),
      ...(spec.kind === 'video' && videoAspectRatio ? { aspectRatio: videoAspectRatio } : {}),
      ...(spec.kind === 'video' && videoCameraMotion ? { cameraMotion: videoCameraMotion } : {}),
    },
    compilerRevision: LOCAL_CHAT_MEDIA_COMPILER_REVISION,
  };
}

function toCanonicalSpec(spec: LocalChatMediaGenerationSpec): CanonicalMediaSpec {
  const hints = spec.hints || undefined;
  return {
    kind: spec.kind,
    intentSource: spec.intentSource,
    plannerTrigger: spec.plannerTrigger,
    ...(normalizeConfidence(spec.confidence) !== undefined ? { confidence: normalizeConfidence(spec.confidence) } : {}),
    nsfwIntent: spec.nsfwIntent,
    targetId: normalizeIdLike(spec.targetId),
    ...(normalizeOptionalString(spec.worldId || '') ? { worldId: normalizeIdLike(spec.worldId || '') } : {}),
    subject: normalizeOptionalString(spec.subject) || '当前对话中的主体',
    scene: normalizeOptionalString(spec.scene) || '贴合当前对话语境',
    styleIntent: normalizeOptionalString(spec.styleIntent) || '自然、精致、贴合陪伴式对话',
    mood: normalizeOptionalString(spec.mood) || '贴合当前交流氛围',
    ...(normalizeOptionalString(spec.requestedSize) ? { requestedSize: normalizeOptionalString(spec.requestedSize)! } : {}),
    ...(normalizeOptionalNumber(spec.requestedCount) ? { requestedCount: normalizeOptionalNumber(spec.requestedCount)! } : {}),
    ...(normalizeOptionalNumber(spec.requestedDurationSeconds)
      ? { requestedDurationSeconds: normalizeOptionalNumber(spec.requestedDurationSeconds)! }
      : {}),
    ...(hints ? {
      hints: {
        ...(normalizeOptionalString(hints.composition) ? { composition: normalizeOptionalString(hints.composition)! } : {}),
        ...(normalizeSortedStringList(hints.negativeCues) ? { negativeCues: normalizeSortedStringList(hints.negativeCues)! } : {}),
        ...(normalizeSortedStringList(hints.continuityRefs) ? { continuityRefs: normalizeSortedStringList(hints.continuityRefs)! } : {}),
      },
    } : {}),
  };
}

export async function createMediaSpecHash(spec: LocalChatMediaGenerationSpec): Promise<string> {
  return sha256Hex(serializeCanonicalRecord(toCanonicalSpec(spec)));
}

function toCanonicalExecution(input: {
  specHash: string;
  compiled: LocalChatCompiledMediaExecution;
  spec: LocalChatMediaGenerationSpec;
  resolvedRoute: LocalChatResolvedMediaRoute;
  nsfwPolicy: 'disabled' | 'local-only' | 'allowed';
}): CanonicalExecution {
  return {
    specHash: input.specHash,
    compilerRevision: normalizeOptionalString(input.compiled.compilerRevision) || LOCAL_CHAT_MEDIA_COMPILER_REVISION,
    compiledPromptText: normalizeOptionalString(input.compiled.compiledPromptText) || '',
    kind: input.spec.kind,
    ...(normalizeOptionalString(input.compiled.runtimePayload.negativePrompt)
      ? { negativePrompt: normalizeOptionalString(input.compiled.runtimePayload.negativePrompt)! }
      : {}),
    ...(normalizeOptionalString(input.spec.requestedSize) ? { requestedSize: normalizeOptionalString(input.spec.requestedSize)! } : {}),
    ...(normalizeOptionalString(input.compiled.runtimePayload.aspectRatio)
      ? { requestedAspectRatio: normalizeOptionalString(input.compiled.runtimePayload.aspectRatio)! }
      : {}),
    ...(normalizeOptionalString(input.compiled.runtimePayload.style)
      ? { requestedStyle: normalizeOptionalString(input.compiled.runtimePayload.style)! }
      : {}),
    ...(normalizeOptionalNumber(input.spec.requestedCount) ? { requestedCount: normalizeOptionalNumber(input.spec.requestedCount)! } : {}),
    ...(normalizeOptionalNumber(input.spec.requestedDurationSeconds)
      ? { requestedDurationSeconds: normalizeOptionalNumber(input.spec.requestedDurationSeconds)! }
      : {}),
    ...(normalizeOptionalString(input.compiled.runtimePayload.cameraMotion)
      ? { requestedCameraMotion: normalizeOptionalString(input.compiled.runtimePayload.cameraMotion)! }
      : {}),
    routeSource: input.resolvedRoute.source,
    ...(normalizeOptionalString(input.resolvedRoute.connectorId) ? { connectorId: normalizeIdLike(input.resolvedRoute.connectorId || '') } : {}),
    ...(normalizeOptionalString(input.resolvedRoute.model) ? { model: normalizeOptionalString(input.resolvedRoute.model)! } : {}),
    nsfwPolicy: input.nsfwPolicy,
  };
}

export async function createMediaExecutionCacheKey(input: {
  specHash: string;
  compiled: LocalChatCompiledMediaExecution;
  spec: LocalChatMediaGenerationSpec;
  resolvedRoute: LocalChatResolvedMediaRoute;
  nsfwPolicy: 'disabled' | 'local-only' | 'allowed';
}): Promise<string> {
  return sha256Hex(serializeCanonicalRecord(toCanonicalExecution(input)));
}

function buildShadowPrefix(input: {
  kind: LocalChatMediaGenerationSpec['kind'];
  status: LocalChatMediaArtifactShadow['status'];
}): string {
  return `[media:${input.kind}:${input.status}]`;
}

export function buildMediaArtifactShadow(input: {
  spec: LocalChatMediaGenerationSpec;
  status: LocalChatMediaArtifactShadow['status'];
  routeSource: LocalChatMediaRouteSource;
  routeModel?: string | null;
  assetOrigin: LocalChatMediaArtifactShadow['assetOrigin'];
  reason?: string | null;
}): LocalChatMediaArtifactShadow {
  const prefix = buildShadowPrefix({
    kind: input.spec.kind,
    status: input.status,
  });
  const requestedSummary = [
    `subject=${input.spec.subject}`,
    `scene=${input.spec.scene}`,
    `style=${input.spec.styleIntent}`,
    `mood=${input.spec.mood}`,
  ].join('; ');
  const shadowText = input.status === 'ready'
    ? `${prefix} ${requestedSummary}`
    : `${prefix} reason=${normalizeOptionalString(input.reason || '') || 'unknown'}; requested=${requestedSummary}`;
  return {
    kind: input.spec.kind,
    status: input.status,
    subject: input.spec.subject,
    scene: input.spec.scene,
    styleIntent: input.spec.styleIntent,
    mood: input.spec.mood,
    routeSource: input.routeSource,
    routeModel: normalizeOptionalString(input.routeModel || '') || null,
    assetOrigin: input.assetOrigin,
    shadowText,
  };
}

export function buildMediaDisplayPrompt(spec: LocalChatMediaGenerationSpec): string {
  const scene = normalizeOptionalString(spec.scene);
  return [spec.subject, scene].filter(Boolean).join(' · ') || spec.subject;
}
