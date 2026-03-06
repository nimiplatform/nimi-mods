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

export const LOCAL_CHAT_MEDIA_COMPILER_REVISION = 'media-compiler.2026-03-06';

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
  requestedSize?: string;
  requestedCount?: number;
  requestedDurationSeconds?: number;
  routeSource: LocalChatResolvedMediaRoute['source'];
  connectorId?: string;
  model?: string;
  nsfwPolicy: 'disabled' | 'local-runtime-only' | 'allowed';
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

export function buildMediaGenerationSpec(input: {
  intent: MediaIntent;
  targetId: string;
  worldId?: string | null;
}): LocalChatMediaGenerationSpec {
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
    ...(input.intent.kind === 'image' ? { requestedCount: 1 } : {}),
    ...(input.intent.kind === 'video' ? { requestedDurationSeconds: 5 } : {}),
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
  return {
    compiledPromptText,
    runtimePayload: {
      prompt: compiledPromptText,
      ...(spec.kind === 'image' && spec.requestedSize ? { size: spec.requestedSize } : {}),
      ...(spec.kind === 'image' && spec.requestedCount ? { n: spec.requestedCount } : {}),
      ...(spec.kind === 'video' && spec.requestedDurationSeconds ? { durationSeconds: spec.requestedDurationSeconds } : {}),
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
  nsfwPolicy: 'disabled' | 'local-runtime-only' | 'allowed';
}): CanonicalExecution {
  return {
    specHash: input.specHash,
    compilerRevision: normalizeOptionalString(input.compiled.compilerRevision) || LOCAL_CHAT_MEDIA_COMPILER_REVISION,
    compiledPromptText: normalizeOptionalString(input.compiled.compiledPromptText) || '',
    kind: input.spec.kind,
    ...(normalizeOptionalString(input.spec.requestedSize) ? { requestedSize: normalizeOptionalString(input.spec.requestedSize)! } : {}),
    ...(normalizeOptionalNumber(input.spec.requestedCount) ? { requestedCount: normalizeOptionalNumber(input.spec.requestedCount)! } : {}),
    ...(normalizeOptionalNumber(input.spec.requestedDurationSeconds)
      ? { requestedDurationSeconds: normalizeOptionalNumber(input.spec.requestedDurationSeconds)! }
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
  nsfwPolicy: 'disabled' | 'local-runtime-only' | 'allowed';
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
