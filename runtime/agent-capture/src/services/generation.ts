import type { HookStorageClient, ModRuntimeClient, RuntimeRouteBinding } from '@nimiplatform/sdk/mod';
import { z } from 'zod';
import type {
  AgentCaptureAgentSummary,
  AgentCaptureDraftGeneration,
  AgentCaptureDraftSnapshot,
  AgentCaptureImageRef,
  AgentCaptureResultFacts,
  AgentCaptureSessionState,
  AgentCaptureStableCore,
  AgentCaptureTurnResult,
  AgentCaptureVisualDelta,
  AgentCaptureVisualField,
  AgentCaptureVisualSpec,
} from '../types.js';
import { encodeBytesToDataUrl } from './base64.js';
import { resolveAgentCapturePromptLocale } from './language.js';

const AGENT_CAPTURE_IMAGE_GENERATE_TIMEOUT_MS = 600_000;

function prefersSimplifiedChinese(preferredLanguage: string | null | undefined): boolean {
  return resolveAgentCapturePromptLocale(preferredLanguage) === 'zh';
}

function pickPromptCopy(preferredLanguage: string | null | undefined, zh: string, en: string): string {
  return prefersSimplifiedChinese(preferredLanguage) ? zh : en;
}

function formatPromptSection(
  preferredLanguage: string | null | undefined,
  label: { zh: string; en: string },
  value: string | null | undefined,
  emptyValue?: { zh: string; en: string },
): string {
  const normalized = String(value || '').trim();
  return `${pickPromptCopy(preferredLanguage, label.zh, label.en)}\n${normalized || pickPromptCopy(
    preferredLanguage,
    emptyValue?.zh || '（空）',
    emptyValue?.en || '(empty)',
  )}`;
}

function optionalPromptNote(preferredLanguage: string | null | undefined, enabled: boolean, zh: string, en: string): string {
  if (!enabled) {
    return '';
  }
  return pickPromptCopy(preferredLanguage, zh, en);
}

function makeJsonBlockPrompt(schema: string, requirements: string[]): string {
  return [
    'Return strictly valid JSON only.',
    'Return one compact JSON object with double-quoted keys.',
    'Do not wrap the JSON in markdown fences.',
    'Do not add prose before or after the JSON object.',
    'Do not use comments.',
    'Do not leave any field out unless the schema explicitly allows null.',
    'Do not include explanatory text.',
    `Schema: ${schema}`,
    ...requirements.map((item) => `- ${item}`),
  ].join('\n');
}

function buildLanguageLock(preferredLanguage: string | null | undefined): string {
  if (prefersSimplifiedChinese(preferredLanguage)) {
    return '使用简体中文输出。除非用户明确要求其他语言，所有 JSON 字符串值都必须使用简体中文。';
  }
  return 'Reply in English. All JSON string values must be written in English unless the user explicitly asks for another language.';
}

function buildCharacterFocusGuidance(preferredLanguage: string | null | undefined): string[] {
  if (prefersSimplifiedChinese(preferredLanguage)) {
    return [
      '对话和生成应优先把角色落实到人物主体细节，例如轮廓、服装、材质、配饰、手持道具、发型、色彩和画风，而不是让环境背景主导。',
      '除非用户明确要求，背景只作为辅助氛围存在；不要让背景地点、剧情叙事或镜头戏剧感主导生成方向。',
      '结果要像“可继续创作的角色视觉设定起稿”，而不是随机好看的海报图。',
    ];
  }
  return [
    'Prioritize character-facing decisions such as silhouette, outfit, materials, accessories, handheld props, hairstyle, palette, and art style instead of letting environment dominate.',
    'Unless the user explicitly asks for it, background should stay supporting-only; do not let cinematic scene storytelling take over.',
    'The result should feel like a reusable character visual draft rather than a random pretty poster shot.',
  ];
}

function buildAnchorImagePromptSuffix(preferredLanguage: string | null | undefined): string {
  if (prefersSimplifiedChinese(preferredLanguage)) {
    return '全身角色锚点图，人物从头到脚完整入画，固定焦距倾向，平视或接近平视，主体居中，姿态稳定，轮廓清楚可读，背景弱化。';
  }
  return 'Full-body character anchor image, complete figure visible head-to-toe, fixed-focal-length tendency, eye-level or near-eye-level view, centered subject, stable pose, readable silhouette, subdued background.';
}

function buildAnchorImageNegativeSuffix(preferredLanguage: string | null | undefined): string {
  if (prefersSimplifiedChinese(preferredLanguage)) {
    return '半身像，胸像，特写，头部裁切，脚部裁切，手部缺失，道具缺失，强透视，广角畸变，背景主导阅读，电影海报感，戏剧化剧情镜头。';
  }
  return 'half-body portrait, bust shot, close-up, cropped head, cropped feet, missing hands, missing prop, strong perspective, wide-angle distortion, background-dominant composition, cinematic poster look, dramatic story shot.';
}

function enforceAnchorImagePrompt(prompt: string, preferredLanguage: string | null | undefined): string {
  const normalized = String(prompt || '').trim();
  const suffix = buildAnchorImagePromptSuffix(preferredLanguage);
  return normalized ? `${normalized}\n${suffix}` : suffix;
}

function enforceAnchorNegativePrompt(prompt: string, preferredLanguage: string | null | undefined): string {
  const normalized = String(prompt || '').trim();
  const suffix = buildAnchorImageNegativeSuffix(preferredLanguage);
  return normalized ? `${normalized} ${suffix}` : suffix;
}

function summarizeAgent(agent: AgentCaptureAgentSummary | null): string {
  if (!agent) return 'No selected existing agent.';
  return [
    `Selected agent: ${agent.displayName || agent.handle || agent.id}`,
    agent.bio ? `Bio: ${agent.bio}` : '',
    agent.worldId ? `World: ${agent.worldId}` : '',
    agent.activeWorldId ? `Active world: ${agent.activeWorldId}` : '',
    agent.importance ? `Importance: ${agent.importance}` : '',
    agent.tags.length > 0 ? `Tags: ${agent.tags.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

function summarizeConversation(session: AgentCaptureSessionState): string {
  return session.messages
    .filter((message) => message.kind === 'chat' || message.kind === 'brief-confirm')
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n');
}

export function buildSourcePrompt(snapshot: AgentCaptureDraftSnapshot): string {
  return String(snapshot.sourcePrompt || '').trim();
}

export function buildReferenceImages(snapshot: AgentCaptureDraftSnapshot): string[] {
  const seen = new Set<string>();
  return [snapshot.sourceImage?.url || '']
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

export function extractJsonObject(text: string): Record<string, unknown> {
  function extractJsonFromText(input: string): string {
    const trimmed = String(input || '').trim();
    const fenceMatch = trimmed.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/);
    const fencedJson = fenceMatch?.[1];
    if (fencedJson) return fencedJson.trim();
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }
    if (firstBrace !== -1) {
      return trimmed.slice(firstBrace);
    }
    return trimmed;
  }

  const raw = String(text || '').trim();
  if (!raw) {
    throw new Error('AGENT_CAPTURE_JSON_OBJECT_REQUIRED');
  }

  const extracted = extractJsonFromText(raw);
  try {
    const parsed = JSON.parse(extracted);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('AGENT_CAPTURE_JSON_OBJECT_REQUIRED');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('AGENT_CAPTURE_JSON_OBJECT_REQUIRED');
  }
}

const SignatureHookSchema = z.object({
  kind: z.enum(['prop', 'accessory', 'garment-detail', 'pattern', 'color-pair']),
  value: z.string().trim().min(1),
});

const VisualSpecSchema = z.object({
  roleCore: z.string().trim().min(1),
  silhouette: z.string().trim().min(1),
  outfit: z.string().trim().min(1),
  materials: z.array(z.string().trim().min(1)).max(6).default([]),
  accessories: z.array(z.string().trim().min(1)).max(6).default([]),
  handProp: z.string().trim().min(1).nullable(),
  hairstyle: z.string().trim().min(1),
  palette: z.object({
    primary: z.string().trim().min(1),
    secondary: z.string().trim().min(1).optional(),
    accent: z.string().trim().min(1).optional(),
  }),
  artStyle: z.string().trim().min(1),
  backgroundWeight: z.enum(['minimal', 'supporting', 'requested']),
  signatureHook: SignatureHookSchema.nullable(),
});

const VisualFieldSchema = z.enum([
  'roleCore',
  'silhouette',
  'outfit',
  'materials',
  'accessories',
  'handProp',
  'hairstyle',
  'palette',
  'artStyle',
  'backgroundWeight',
  'signatureHook',
]);

const TurnEnvelopeSchema = z.object({
  assistantReply: z.string().trim().min(1),
  brief: z.string().trim().min(1),
  intentMode: z.string().trim().optional(),
  retain: z.array(z.string().trim().min(1)).optional(),
  adjust: z.array(z.string().trim().min(1)).optional(),
  touchedFields: z.array(z.string().trim().min(1)).optional(),
});

const BriefSchema = z.object({
  brief: z.string().trim().min(1),
});

const DraftTextPackSchema = z.object({
  name: z.string().trim().min(1),
  bio: z.string().trim().min(1),
  personaSeed: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).min(1).max(8),
  characterReadout: z.string().trim().min(1),
});

type StructuredAttempt = {
  maxTokens: number;
  temperature: number;
};

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'UNKNOWN_ERROR');
}

function normalizeIntentMode(value: string | undefined): AgentCaptureVisualDelta['intentMode'] {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'restart') {
    return 'restart';
  }
  return 'refine';
}

function normalizeStringList(values: string[] | undefined, maxItems = 6): string[] {
  const normalized: string[] = [];
  for (const value of values || []) {
    const item = String(value || '').trim();
    if (!item || normalized.includes(item)) {
      continue;
    }
    normalized.push(item);
    if (normalized.length >= maxItems) {
      break;
    }
  }
  return normalized;
}

function normalizeTouchedFields(values: string[] | undefined): AgentCaptureVisualField[] {
  const allowed = new Set<AgentCaptureVisualField>(VisualFieldSchema.options);
  const normalized: AgentCaptureVisualField[] = [];
  for (const value of values || []) {
    const item = String(value || '').trim() as AgentCaptureVisualField;
    if (!allowed.has(item) || normalized.includes(item)) {
      continue;
    }
    normalized.push(item);
    if (normalized.length >= 6) {
      break;
    }
  }
  return normalized;
}

export async function generateStructuredObject<T extends z.ZodType<Record<string, unknown>>>(input: {
  runtimeClient: ModRuntimeClient;
  binding: RuntimeRouteBinding | null;
  resolveCapability: 'text.generate';
  system: string;
  prompt: string;
  attempts: StructuredAttempt[];
  schema: T;
  parseErrorCode: string;
  truncationErrorCode: string;
  contractErrorCode: string;
}): Promise<{ parsed: z.infer<T>; traceId?: string }> {
  let lastError: unknown = null;
  for (const attempt of input.attempts) {
    try {
      const resolvedRoute = await input.runtimeClient.route.resolve({ capability: input.resolveCapability });
      const resolvedModel = String(resolvedRoute.model || '').trim() || undefined;
      const result = await input.runtimeClient.ai.text.generate({
        input: input.prompt,
        system: input.system,
        model: input.binding?.model || resolvedModel,
        binding: input.binding || undefined,
        maxTokens: attempt.maxTokens,
        temperature: attempt.temperature,
      });
      if (String(result.finishReason || '').trim() === 'length') {
        lastError = new Error(input.truncationErrorCode);
        continue;
      }
      const parsedRecord = extractJsonObject(result.text);
      const validated = input.schema.safeParse(parsedRecord);
      if (!validated.success) {
        lastError = new Error(input.contractErrorCode);
        continue;
      }
      return {
        parsed: validated.data,
        traceId: String(result.trace?.traceId || '').trim() || undefined,
      };
    } catch (error) {
      lastError = error;
    }
  }
  const message = normalizeErrorMessage(lastError);
  if (message === 'AGENT_CAPTURE_JSON_OBJECT_REQUIRED' || message === 'LOCAL_CHAT_AI_GENERATE_OBJECT_INVALID_JSON_OBJECT') {
    throw new Error(input.parseErrorCode);
  }
  throw lastError instanceof Error ? lastError : new Error(message);
}

function buildImageGenerateRequestParams(input: {
  prompt: string;
  negativePrompt?: string;
  referenceImages: string[];
  model?: string;
  binding?: RuntimeRouteBinding | null;
}): {
  prompt: string;
  negativePrompt?: string;
  referenceImages?: string[];
  responseFormat: 'url';
  size: string;
  quality: 'medium';
  timeoutMs: number;
  model?: string;
  binding?: RuntimeRouteBinding;
} {
  return {
    prompt: input.prompt,
    ...(String(input.negativePrompt || '').trim() ? { negativePrompt: String(input.negativePrompt || '').trim() } : {}),
    ...(input.referenceImages.length > 0 ? { referenceImages: input.referenceImages } : {}),
    responseFormat: 'url',
    size: '1024x1536',
    quality: 'medium',
    timeoutMs: AGENT_CAPTURE_IMAGE_GENERATE_TIMEOUT_MS,
    ...(String(input.model || '').trim() ? { model: String(input.model || '').trim() } : {}),
    ...(input.binding ? { binding: input.binding } : {}),
  };
}

export function decodeGeneratedArtifact(
  artifact: {
    uri?: string;
    bytes?: Uint8Array;
    mimeType?: string;
  } | null | undefined,
): AgentCaptureImageRef | null {
  if (!artifact) return null;
  const mimeType = String(artifact.mimeType || 'image/png').trim() || 'image/png';
  if (artifact.uri && String(artifact.uri).trim()) {
    return {
      url: String(artifact.uri).trim(),
      mimeType,
    };
  }
  if (artifact.bytes && artifact.bytes.length > 0) {
    return {
      url: encodeBytesToDataUrl({
        bytes: artifact.bytes,
        mimeType,
      }),
      mimeType,
    };
  }
  return null;
}

async function writeArtifactBytes(input: {
  storage: HookStorageClient;
  path: string;
  artifact: {
    uri?: string;
    bytes?: Uint8Array;
    mimeType?: string;
  };
}): Promise<Uint8Array | null> {
  if (input.artifact.bytes && input.artifact.bytes.length > 0) {
    await input.storage.files.writeBytes(input.path, input.artifact.bytes);
    return input.artifact.bytes;
  }
  if (input.artifact.uri && input.artifact.uri.startsWith('data:')) {
    const match = input.artifact.uri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const base64 = String(match[2] || '');
    if (!base64) return null;
    const bytes = typeof Buffer !== 'undefined'
      ? new Uint8Array(Buffer.from(base64, 'base64'))
      : Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    await input.storage.files.writeBytes(input.path, bytes);
    return bytes;
  }
  return null;
}

export async function storeSourceImage(
  storage: HookStorageClient,
  draftId: string,
  file: File,
): Promise<AgentCaptureImageRef> {
  const ext = (() => {
    const fileName = String(file.name || '').trim();
    const fromName = fileName.includes('.') ? fileName.split('.').pop() || '' : '';
    if (fromName) return fromName.toLowerCase();
    const mime = String(file.type || '').trim().toLowerCase();
    if (mime.includes('png')) return 'png';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('webp')) return 'webp';
    return 'bin';
  })();
  const path = `images/${draftId}/source-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await storage.files.writeBytes(path, bytes);
  return {
    path,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    url: encodeBytesToDataUrl({
      bytes,
      mimeType: file.type || 'application/octet-stream',
    }),
  };
}

export async function storeGeneratedArtifact(input: {
  storage: HookStorageClient;
  draftId: string;
  artifact: {
    uri?: string;
    bytes?: Uint8Array;
    mimeType?: string;
  } | null | undefined;
}): Promise<AgentCaptureImageRef | null> {
  if (!input.artifact) return null;
  const mimeType = String(input.artifact.mimeType || 'image/png').trim() || 'image/png';
  const ext = mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
  const path = `images/${input.draftId}/generated-${Date.now()}.${ext}`;
  if (input.artifact.uri && !input.artifact.uri.startsWith('data:')) {
    const response = await fetch(String(input.artifact.uri).trim());
    if (!response.ok) {
      throw new Error(`AGENT_CAPTURE_GENERATED_IMAGE_FETCH_FAILED:${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await input.storage.files.writeBytes(path, bytes);
    return {
      path,
      mimeType: response.headers.get('content-type') || mimeType,
      url: encodeBytesToDataUrl({
        bytes,
        mimeType: response.headers.get('content-type') || mimeType,
      }),
    };
  }
  const bytes = await writeArtifactBytes({
    storage: input.storage,
    path,
    artifact: input.artifact,
  });
  if (bytes && bytes.length > 0) {
    return {
      path,
      mimeType,
      url: encodeBytesToDataUrl({
        bytes,
        mimeType,
      }),
    };
  }
  return decodeGeneratedArtifact(input.artifact);
}

function summarizeVisualSpec(spec: AgentCaptureVisualSpec | null, preferredLanguage?: string): string {
  if (!spec) {
    return pickPromptCopy(preferredLanguage, '尚未形成视觉规格。', 'No visual spec yet.');
  }
  const palette = [spec.palette.primary, spec.palette.secondary, spec.palette.accent].filter(Boolean).join(', ');
  return [
    `roleCore: ${spec.roleCore}`,
    `silhouette: ${spec.silhouette}`,
    `outfit: ${spec.outfit}`,
    `materials: ${spec.materials.join(', ') || '-'}`,
    `accessories: ${spec.accessories.join(', ') || '-'}`,
    `handProp: ${spec.handProp || '-'}`,
    `hairstyle: ${spec.hairstyle}`,
    `palette: ${palette || '-'}`,
    `artStyle: ${spec.artStyle}`,
    `backgroundWeight: ${spec.backgroundWeight}`,
    `signatureHook: ${spec.signatureHook ? `${spec.signatureHook.kind}:${spec.signatureHook.value}` : '-'}`,
  ].join('\n');
}

function summarizeResultFacts(facts: AgentCaptureResultFacts | null, preferredLanguage?: string): string {
  if (!facts) {
    return pickPromptCopy(preferredLanguage, '尚无结果事实。', 'No result facts yet.');
  }
  return [
    `framing: ${facts.framing}`,
    `backgroundWeight: ${facts.backgroundWeight}`,
    `signatureHook: ${facts.signatureHook ? `${facts.signatureHook.kind}:${facts.signatureHook.value}` : '-'}`,
    `usesSourceImage: ${facts.usesSourceImage ? 'yes' : 'no'}`,
  ].join('\n');
}

function summarizeVisualDelta(delta: AgentCaptureVisualDelta | null, preferredLanguage?: string): string {
  if (!delta) {
    return pickPromptCopy(preferredLanguage, '尚无本轮调整摘要。', 'No visual delta yet.');
  }
  return [
    `intentMode: ${delta.intentMode}`,
    `retain: ${delta.retain.join(', ') || '-'}`,
    `adjust: ${delta.adjust.join(', ') || '-'}`,
    `touchedFields: ${delta.touchedFields.join(', ') || '-'}`,
  ].join('\n');
}

const LOCKED_FIELDS_IN_REFINE = new Set<AgentCaptureVisualField>([
  'silhouette',
  'palette',
  'artStyle',
  'signatureHook',
]);

export function deriveStableCore(spec: AgentCaptureVisualSpec): AgentCaptureStableCore {
  return {
    silhouette: spec.silhouette,
    palette: spec.palette,
    artStyle: spec.artStyle,
    signatureHook: spec.signatureHook,
    framing: 'full-body-anchor',
    cameraLanguage: 'stable-eye-level',
  };
}

export function mergeVisualSpec(
  previousSpec: AgentCaptureVisualSpec | null,
  delta: AgentCaptureVisualDelta,
  resolvedNextSpec: AgentCaptureVisualSpec,
): AgentCaptureVisualSpec {
  if (!previousSpec || delta.intentMode === 'restart') {
    return resolvedNextSpec;
  }

  const touched = new Set(delta.touchedFields);
  const merged: AgentCaptureVisualSpec = {
    ...previousSpec,
    ...resolvedNextSpec,
  };

  for (const field of LOCKED_FIELDS_IN_REFINE) {
    if (!touched.has(field)) {
      switch (field) {
        case 'silhouette':
          merged.silhouette = previousSpec.silhouette;
          break;
        case 'palette':
          merged.palette = previousSpec.palette;
          break;
        case 'artStyle':
          merged.artStyle = previousSpec.artStyle;
          break;
        case 'signatureHook':
          merged.signatureHook = previousSpec.signatureHook;
          break;
      }
    }
  }

  return merged;
}

export function buildResultFacts(input: {
  spec: AgentCaptureVisualSpec;
  sourceImage: AgentCaptureDraftSnapshot['sourceImage'];
}): AgentCaptureResultFacts {
  return {
    framing: 'full-body-anchor',
    backgroundWeight: input.spec.backgroundWeight,
    signatureHook: input.spec.signatureHook,
    usesSourceImage: Boolean(input.sourceImage),
  };
}

function buildVisualSpecPrompt(input: {
  draft: AgentCaptureDraftSnapshot;
  session: AgentCaptureSessionState;
  selectedAgent: AgentCaptureAgentSummary | null;
  preferredLanguage?: string;
}): string {
  return [
    formatPromptSection(
      input.preferredLanguage,
      { zh: '当前角色输入：', en: 'Current source prompt:' },
      buildSourcePrompt(input.draft),
    ),
    formatPromptSection(
      input.preferredLanguage,
      { zh: '当前会话：', en: 'Current conversation:' },
      summarizeConversation(input.session),
    ),
    formatPromptSection(
      input.preferredLanguage,
      { zh: '当前 brief：', en: 'Current brief:' },
      input.session.currentBrief,
    ),
    formatPromptSection(
      input.preferredLanguage,
      { zh: '已选已有角色背景：', en: 'Selected agent background:' },
      summarizeAgent(input.selectedAgent),
      {
        zh: '未附加已有角色。',
        en: 'No selected existing agent.',
      },
    ),
    input.draft.visualSpec
      ? formatPromptSection(
          input.preferredLanguage,
          { zh: '当前视觉规格：', en: 'Current visual spec:' },
          summarizeVisualSpec(input.draft.visualSpec, input.preferredLanguage),
        )
      : '',
    input.draft.lastVisualDelta
      ? formatPromptSection(
          input.preferredLanguage,
          { zh: '上一轮调整摘要：', en: 'Previous visual delta:' },
          summarizeVisualDelta(input.draft.lastVisualDelta, input.preferredLanguage),
        )
      : '',
    input.draft.characterReadout
      ? formatPromptSection(
          input.preferredLanguage,
          { zh: '上一版角色读取：', en: 'Previous character readout:' },
          input.draft.characterReadout,
        )
      : '',
    optionalPromptNote(
      input.preferredLanguage,
      Boolean(input.draft.sourceImage),
      '已附加参考图，应纳入视觉规格判断。',
      'A source reference image is attached and should inform the visual spec.',
    ),
  ].filter(Boolean).join('\n\n');
}

export async function generateVisualSpec(input: {
  runtimeClient: ModRuntimeClient;
  draft: AgentCaptureDraftSnapshot;
  session: AgentCaptureSessionState;
  selectedAgent: AgentCaptureAgentSummary | null;
  textBinding: RuntimeRouteBinding | null;
  preferredLanguage?: string;
}): Promise<{ visualSpec: AgentCaptureVisualSpec; traceId?: string }> {
  const system = [
    pickPromptCopy(
      input.preferredLanguage,
      '你要为 Agent-Capture 产出一份稳定的角色视觉规格。',
      'You produce one stable character visual spec for Agent-Capture.',
    ),
    buildLanguageLock(input.preferredLanguage),
    ...buildCharacterFocusGuidance(input.preferredLanguage),
    makeJsonBlockPrompt(
      '{"roleCore":"string","silhouette":"string","outfit":"string","materials":["string"],"accessories":["string"],"handProp":"string|null","hairstyle":"string","palette":{"primary":"string","secondary":"string?","accent":"string?"},"artStyle":"string","backgroundWeight":"minimal|supporting|requested","signatureHook":{"kind":"prop|accessory|garment-detail|pattern|color-pair","value":"string"}|null}',
      prefersSimplifiedChinese(input.preferredLanguage)
        ? [
            '角色视觉规格必须优先服务“可继续创作的角色视觉设定起稿”。',
            'silhouette、outfit、hairstyle、palette.primary、artStyle 都必须明确且非空。',
            'backgroundWeight 默认应偏 minimal 或 supporting；只有用户明确强调环境时才允许 requested。',
            'signatureHook 尽量给出一个最可记忆、最可稳定体现的识别锚点；如果确实不成立，可以为 null。',
            '不要输出解释性文字。',
          ]
        : [
            'The visual spec must serve a reusable character visual draft.',
            'silhouette, outfit, hairstyle, palette.primary, and artStyle must be explicit and non-empty.',
            'backgroundWeight should default to minimal or supporting; only use requested when the user clearly asks for a stronger environment.',
            'Try to provide one memorable, visually stable signature hook; use null only when it truly does not fit.',
            'Do not add explanatory prose.',
          ],
    ),
  ].join('\n\n');
  const { parsed, traceId } = await generateStructuredObject({
    runtimeClient: input.runtimeClient,
    binding: input.textBinding,
    resolveCapability: 'text.generate',
    system,
    prompt: buildVisualSpecPrompt(input),
    attempts: [
      { temperature: 0.2, maxTokens: 2048 },
      { temperature: 0.1, maxTokens: 2560 },
      { temperature: 0, maxTokens: 3072 },
    ],
    schema: VisualSpecSchema,
    parseErrorCode: 'AGENT_CAPTURE_VISUAL_SPEC_JSON_INVALID',
    truncationErrorCode: 'AGENT_CAPTURE_VISUAL_SPEC_TRUNCATED',
    contractErrorCode: 'AGENT_CAPTURE_VISUAL_SPEC_CONTRACT_INVALID',
  });
  return {
    visualSpec: parsed,
    traceId,
  };
}

export async function extractVisualDelta(input: {
  runtimeClient: ModRuntimeClient;
  draft: AgentCaptureDraftSnapshot;
  session: AgentCaptureSessionState;
  selectedAgent: AgentCaptureAgentSummary | null;
  textBinding: RuntimeRouteBinding | null;
  userMessage: string;
  preferredLanguage?: string;
}): Promise<{ assistantReply: string; brief: string; visualDelta: AgentCaptureVisualDelta; traceId?: string }> {
  const system = [
    pickPromptCopy(
      input.preferredLanguage,
      '你是 Agent-Capture 的角色视觉起稿助手。',
      'You are Agent-Capture, a character visual drafting assistant.',
    ),
    buildLanguageLock(input.preferredLanguage),
    ...buildCharacterFocusGuidance(input.preferredLanguage),
    makeJsonBlockPrompt(
      '{"assistantReply":"string","brief":"string","intentMode":"refine|restart","retain":["string"],"adjust":["string"],"touchedFields":["roleCore|silhouette|outfit|materials|accessories|handProp|hairstyle|palette|artStyle|backgroundWeight|signatureHook"]}',
      prefersSimplifiedChinese(input.preferredLanguage)
        ? [
            'assistantReply 必须像自然协作对话，长度不超过 120 个中文字符。',
            'brief 必须是一句自然语言，概括当前角色方向，长度不超过 80 个中文字符。',
            '如需提供 intentMode，只能用 refine 或 restart；除非用户明确要求重来或改向，否则用 refine。',
            '如需提供 touchedFields，只列出本轮确实被用户触碰或明确想改的视觉字段；不确定时可以留空。',
            'retain 和 adjust 不确定时可以给空数组。',
            '不要输出完整视觉规格；这里只做轻量对话理解与调整摘要。',
          ]
        : [
            'assistantReply must sound like a natural collaborative response and stay within 260 English characters.',
            'brief must be one natural-language sentence summarizing the current direction within 180 English characters.',
            'If you provide intentMode, it must be refine or restart; unless the user clearly asks to restart or change direction, use refine.',
            'If you provide touchedFields, only include visual fields the user actually touched or clearly wants changed; leave it empty when unsure.',
            'retain and adjust may be empty arrays when uncertain.',
            'Do not output a full visual spec here; this stage only handles lightweight dialogue understanding and adjustment summary.',
          ],
    ),
  ].join('\n\n');
  const prompt = [
    buildVisualSpecPrompt(input),
    formatPromptSection(
      input.preferredLanguage,
      { zh: '用户最新输入：', en: 'Latest user message:' },
      input.userMessage,
    ),
    input.draft.lastVisualDelta
      ? formatPromptSection(
          input.preferredLanguage,
          { zh: '上一轮调整摘要：', en: 'Previous visual delta:' },
          summarizeVisualDelta(input.draft.lastVisualDelta, input.preferredLanguage),
        )
      : '',
  ].filter(Boolean).join('\n\n');
  const { parsed, traceId } = await generateStructuredObject({
    runtimeClient: input.runtimeClient,
    binding: input.textBinding,
    resolveCapability: 'text.generate',
    system,
    prompt,
    attempts: [
      { temperature: 0.2, maxTokens: 2560 },
      { temperature: 0.1, maxTokens: 3072 },
      { temperature: 0, maxTokens: 3584 },
    ],
    schema: TurnEnvelopeSchema,
    parseErrorCode: 'AGENT_CAPTURE_TURN_JSON_INVALID',
    truncationErrorCode: 'AGENT_CAPTURE_TURN_TRUNCATED',
    contractErrorCode: 'AGENT_CAPTURE_TURN_CONTRACT_INVALID',
  });
  return {
    assistantReply: parsed.assistantReply,
    brief: parsed.brief,
    visualDelta: {
      intentMode: normalizeIntentMode(parsed.intentMode),
      retain: normalizeStringList(parsed.retain),
      adjust: normalizeStringList(parsed.adjust),
      touchedFields: normalizeTouchedFields(parsed.touchedFields),
    },
    traceId,
  };
}

export async function recomputeCurrentBrief(input: {
  runtimeClient: ModRuntimeClient;
  draft: AgentCaptureDraftSnapshot;
  session: AgentCaptureSessionState;
  selectedAgent: AgentCaptureAgentSummary | null;
  textBinding: RuntimeRouteBinding | null;
  preferredLanguage?: string;
}): Promise<{ brief: string; traceId?: string }> {
  const system = [
    pickPromptCopy(
      input.preferredLanguage,
      '你要为当前 Agent-Capture 上下文生成一句自然语言 brief。',
      'You produce one natural-language brief sentence for the current Agent-Capture context.',
    ),
    buildLanguageLock(input.preferredLanguage),
    ...buildCharacterFocusGuidance(input.preferredLanguage),
    makeJsonBlockPrompt(
      '{"brief":"string"}',
      prefersSimplifiedChinese(input.preferredLanguage)
        ? [
            'brief 必须是一句自然语言，长度不超过 80 个中文字符。',
            'brief 必须优先体现人物主体、服装、材质、配饰、道具、色彩与画风。',
            '如果当前结果已存在，可轻量说明延续什么、调整什么。',
          ]
        : [
            'brief must be one natural-language sentence within 180 English characters.',
            'brief should foreground the character body, outfit, materials, accessories, prop, palette, and art style.',
            'If a current result exists, it may briefly mention what is being retained and adjusted.',
          ],
    ),
  ].join('\n\n');
  const prompt = [
    buildVisualSpecPrompt(input),
    formatPromptSection(
      input.preferredLanguage,
      { zh: '结果事实摘要：', en: 'Result facts:' },
      summarizeResultFacts(input.draft.resultFacts, input.preferredLanguage),
    ),
  ].filter(Boolean).join('\n\n');
  const { parsed, traceId } = await generateStructuredObject({
    runtimeClient: input.runtimeClient,
    binding: input.textBinding,
    resolveCapability: 'text.generate',
    system,
    prompt,
    attempts: [
      { temperature: 0.1, maxTokens: 768 },
      { temperature: 0.05, maxTokens: 1024 },
      { temperature: 0, maxTokens: 1280 },
    ],
    schema: BriefSchema,
    parseErrorCode: 'AGENT_CAPTURE_BRIEF_JSON_INVALID',
    truncationErrorCode: 'AGENT_CAPTURE_BRIEF_TRUNCATED',
    contractErrorCode: 'AGENT_CAPTURE_BRIEF_CONTRACT_INVALID',
  });
  return {
    brief: parsed.brief,
    traceId,
  };
}

function compilePaletteText(palette: AgentCaptureVisualSpec['palette']): string {
  return [palette.primary, palette.secondary, palette.accent]
    .filter(Boolean)
    .join(', ');
}

export function compileImagePromptFromSpec(input: {
  spec: AgentCaptureVisualSpec;
  stableCore: AgentCaptureStableCore;
  currentBrief: string;
  visualDelta: AgentCaptureVisualDelta | null;
  preferredLanguage?: string;
}): {
  imagePrompt: string;
  negativePrompt: string;
} {
  const backgroundText = input.spec.backgroundWeight === 'requested'
    ? pickPromptCopy(input.preferredLanguage, '背景可被明确描写，但仍不抢人物主体。', 'Background may be explicit, but should still not overpower the character.')
    : input.spec.backgroundWeight === 'supporting'
      ? pickPromptCopy(input.preferredLanguage, '背景仅作为辅助氛围。', 'Background should stay supporting-only.')
      : pickPromptCopy(input.preferredLanguage, '背景极简、弱化。', 'Background should be minimal and subdued.');

  const promptParts = [
    input.currentBrief,
    pickPromptCopy(input.preferredLanguage, `角色核心感觉：${input.spec.roleCore}`, `Role core: ${input.spec.roleCore}`),
    pickPromptCopy(input.preferredLanguage, `轮廓体态：${input.stableCore.silhouette}`, `Silhouette: ${input.stableCore.silhouette}`),
    pickPromptCopy(input.preferredLanguage, `发型：${input.spec.hairstyle}`, `Hairstyle: ${input.spec.hairstyle}`),
    pickPromptCopy(input.preferredLanguage, `服装主体：${input.spec.outfit}`, `Primary outfit: ${input.spec.outfit}`),
    input.spec.materials.length > 0
      ? pickPromptCopy(input.preferredLanguage, `材质：${input.spec.materials.join('、')}`, `Materials: ${input.spec.materials.join(', ')}`)
      : '',
    input.spec.accessories.length > 0
      ? pickPromptCopy(input.preferredLanguage, `配饰：${input.spec.accessories.join('、')}`, `Accessories: ${input.spec.accessories.join(', ')}`)
      : '',
    input.spec.handProp
      ? pickPromptCopy(input.preferredLanguage, `手持道具：${input.spec.handProp}`, `Handheld prop: ${input.spec.handProp}`)
      : '',
    pickPromptCopy(
      input.preferredLanguage,
      `色彩关系：${compilePaletteText(input.stableCore.palette)}`,
      `Palette: ${compilePaletteText(input.stableCore.palette)}`,
    ),
    pickPromptCopy(input.preferredLanguage, `画风：${input.stableCore.artStyle}`, `Art style: ${input.stableCore.artStyle}`),
    input.stableCore.signatureHook
      ? pickPromptCopy(
          input.preferredLanguage,
          `识别锚点：${input.stableCore.signatureHook.value}`,
          `Signature hook: ${input.stableCore.signatureHook.value}`,
        )
      : '',
    backgroundText,
    input.visualDelta?.retain.length
      ? pickPromptCopy(input.preferredLanguage, `必须保留：${input.visualDelta.retain.join('、')}`, `Must retain: ${input.visualDelta.retain.join(', ')}`)
      : '',
    input.visualDelta?.adjust.length
      ? pickPromptCopy(input.preferredLanguage, `本轮微调：${input.visualDelta.adjust.join('、')}`, `Adjust this round: ${input.visualDelta.adjust.join(', ')}`)
      : '',
  ].filter(Boolean).join('\n');

  const negativeParts = [
    pickPromptCopy(
      input.preferredLanguage,
      '不要改变已确认的核心人物轮廓、主色关系、画风与识别锚点。',
      'Do not change the confirmed core silhouette, palette relationship, art style, or signature hook.',
    ),
    input.visualDelta?.adjust.length
      ? pickPromptCopy(
          input.preferredLanguage,
          `除了这些明确调整点，不要大改：${input.visualDelta.adjust.join('、')}`,
          `Do not make large changes outside these explicit adjustments: ${input.visualDelta.adjust.join(', ')}`,
        )
      : '',
  ].filter(Boolean).join(' ');

  return {
    imagePrompt: enforceAnchorImagePrompt(promptParts, input.preferredLanguage),
    negativePrompt: enforceAnchorNegativePrompt(negativeParts, input.preferredLanguage),
  };
}

export async function generateDraftTextPack(input: {
  runtimeClient: ModRuntimeClient;
  textBinding: RuntimeRouteBinding | null;
  spec: AgentCaptureVisualSpec;
  currentBrief: string;
  resultFacts: AgentCaptureResultFacts;
  preferredLanguage?: string;
}): Promise<{ draft: AgentCaptureDraftGeneration; traceId?: string }> {
  const system = [
    pickPromptCopy(
      input.preferredLanguage,
      '你要为 Agent-Capture 的当前角色结果补全文案包。',
      'You are producing the text pack for the current Agent-Capture result.',
    ),
    buildLanguageLock(input.preferredLanguage),
    makeJsonBlockPrompt(
      '{"name":"string","bio":"string","personaSeed":"string","tags":["string"],"characterReadout":"string"}',
      prefersSimplifiedChinese(input.preferredLanguage)
        ? [
            'name 应简洁且有识别感；长度不超过 24 个中文字符。',
            'bio 应为 1-2 句短句；长度不超过 120 个中文字符。',
            'personaSeed 应为紧凑的人设种子段落；长度不超过 160 个中文字符。',
            'tags 应为 3-6 个简洁标签。',
            'characterReadout 必须像“对当前结果的解释”，而不是机械复述规格；长度不超过 100 个中文字符。',
          ]
        : [
            'name should be concise and evocative, within 48 English characters.',
            'bio should be 1-2 short sentences, within 240 English characters.',
            'personaSeed should be a compact role seed paragraph, within 320 English characters.',
            'tags should be 3-6 concise tags.',
            'characterReadout must read like an explanation of the current result rather than a mechanical spec restatement, within 220 English characters.',
          ],
    ),
  ].join('\n\n');
  const prompt = [
    formatPromptSection(
      input.preferredLanguage,
      { zh: '当前 brief：', en: 'Current brief:' },
      input.currentBrief,
    ),
    formatPromptSection(
      input.preferredLanguage,
      { zh: '当前视觉规格：', en: 'Current visual spec:' },
      summarizeVisualSpec(input.spec, input.preferredLanguage),
    ),
    formatPromptSection(
      input.preferredLanguage,
      { zh: '结果事实摘要：', en: 'Result facts:' },
      summarizeResultFacts(input.resultFacts, input.preferredLanguage),
    ),
  ].join('\n\n');
  const { parsed, traceId } = await generateStructuredObject({
    runtimeClient: input.runtimeClient,
    binding: input.textBinding,
    resolveCapability: 'text.generate',
    system,
    prompt,
    attempts: [
      { temperature: 0.25, maxTokens: 2048 },
      { temperature: 0.1, maxTokens: 2560 },
      { temperature: 0, maxTokens: 3072 },
    ],
    schema: DraftTextPackSchema,
    parseErrorCode: 'AGENT_CAPTURE_DRAFT_JSON_INVALID',
    truncationErrorCode: 'AGENT_CAPTURE_DRAFT_TRUNCATED',
    contractErrorCode: 'AGENT_CAPTURE_GENERATION_TEXT_CONTRACT_INVALID',
  });
  return {
    draft: parsed,
    traceId,
  };
}

export async function runCaptureTurn(input: {
  runtimeClient: ModRuntimeClient;
  draft: AgentCaptureDraftSnapshot;
  session: AgentCaptureSessionState;
  selectedAgent: AgentCaptureAgentSummary | null;
  textBinding: RuntimeRouteBinding | null;
  userMessage: string;
  preferredLanguage?: string;
}): Promise<AgentCaptureTurnResult & { traceId?: string }> {
  const { assistantReply, brief, visualDelta, traceId } = await extractVisualDelta(input);
  return {
    assistantReply,
    brief,
    visualDelta,
    traceId,
  };
}

export async function generateAgentDraft(input: {
  storage: HookStorageClient;
  runtimeClient: ModRuntimeClient;
  draft: AgentCaptureDraftSnapshot;
  session: AgentCaptureSessionState;
  selectedAgent: AgentCaptureAgentSummary | null;
  textBinding: RuntimeRouteBinding | null;
  imageBinding: RuntimeRouteBinding | null;
  preferredLanguage?: string;
}): Promise<{
  draft: AgentCaptureDraftGeneration;
  image: AgentCaptureImageRef;
  visualSpec: AgentCaptureVisualSpec;
  resultFacts: AgentCaptureResultFacts;
  textTraceId?: string;
  imageTraceId?: string;
}> {
  const currentBrief = String(input.session.currentBrief || '').trim();
  if (!currentBrief) {
    throw new Error('AGENT_CAPTURE_BRIEF_REQUIRED');
  }

  const generatedVisualSpec = (await generateVisualSpec({
    runtimeClient: input.runtimeClient,
    draft: input.draft,
    session: input.session,
    selectedAgent: input.selectedAgent,
    textBinding: input.textBinding,
    preferredLanguage: input.preferredLanguage,
  })).visualSpec;
  const visualSpec = mergeVisualSpec(
    input.draft.visualSpec,
    input.draft.lastVisualDelta || {
      intentMode: 'restart',
      retain: [],
      adjust: [],
      touchedFields: [],
    },
    generatedVisualSpec,
  );
  const stableCore = deriveStableCore(visualSpec);
  const compiledPrompt = compileImagePromptFromSpec({
    spec: visualSpec,
    stableCore,
    currentBrief,
    visualDelta: input.draft.lastVisualDelta,
    preferredLanguage: input.preferredLanguage,
  });
  const resolvedImageRoute = await input.runtimeClient.route.resolve({ capability: 'image.generate' });
  const imageResult = await input.runtimeClient.media.image.generate(buildImageGenerateRequestParams({
    prompt: compiledPrompt.imagePrompt,
    negativePrompt: compiledPrompt.negativePrompt,
    referenceImages: buildReferenceImages(input.draft),
    model: input.imageBinding?.model || String(resolvedImageRoute.model || '').trim() || undefined,
    binding: input.imageBinding,
  }));
  const image = await storeGeneratedArtifact({
    storage: input.storage,
    draftId: input.draft.id,
    artifact: imageResult.artifacts[0],
  });
  if (!image) {
    throw new Error('AGENT_CAPTURE_GENERATED_IMAGE_EMPTY');
  }

  const resultFacts = buildResultFacts({
    spec: visualSpec,
    sourceImage: input.draft.sourceImage,
  });
  const textPack = await generateDraftTextPack({
    runtimeClient: input.runtimeClient,
    textBinding: input.textBinding,
    spec: visualSpec,
    currentBrief,
    resultFacts,
    preferredLanguage: input.preferredLanguage,
  });

  return {
    draft: textPack.draft,
    image,
    visualSpec,
    resultFacts,
    textTraceId: textPack.traceId,
    imageTraceId: String(imageResult.trace?.traceId || '').trim() || undefined,
  };
}
