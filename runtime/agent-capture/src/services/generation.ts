import type { HookStorageClient, ModRuntimeClient, RuntimeRouteBinding } from '@nimiplatform/sdk/mod';
import { z } from 'zod';
import type {
  AgentCaptureAgentSummary,
  AgentCaptureDraftGeneration,
  AgentCaptureDraftSnapshot,
  AgentCaptureImageRef,
  AgentCaptureSessionState,
  AgentCaptureTurnResult,
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
    'Do not leave any field out.',
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
      '对话应优先把角色落实到人物主体相关的细节上，例如体态轮廓、服装、材质、配饰、手持道具、发型、色彩和画风，而不是把大篇幅注意力放在环境背景上。',
      '除非用户明确要求，背景只作为辅助氛围存在；不要让背景地点、场景叙事或镜头故事感主导 brief 或生成方向。',
    ];
  }
  return [
    'Prioritize character-facing details such as silhouette, outfit, material, accessories, handheld props, hairstyle, palette, and art style instead of spending most of the turn on environment background.',
    'Unless the user explicitly asks for it, treat background as supporting atmosphere only and do not let scene setting or cinematic storytelling dominate the brief or generation direction.',
  ];
}

function buildIterativeRefinementGuidance(preferredLanguage: string | null | undefined): string[] {
  if (prefersSimplifiedChinese(preferredLanguage)) {
    return [
      '当当前结果已存在时，应把它视为方向反馈而不是不可更改的像素真相；优先承接用户确认的人物主体特征与最新修正。',
      '在没有用户显式附加新参考图时，应通过当前 brief、characterReadout、会话与已确认的视觉特征维持连续性，尽量保住已确认的轮廓、色彩、材质、配饰、道具与画风。',
      '不要机械继承上一版图中的偶发脏污、模糊、噪点、背景残留、面部瑕疵或其他未被用户确认的绘制副作用。',
    ];
  }
  return [
    'When a current result already exists, treat it as directional feedback rather than immutable pixel truth; preserve user-confirmed character-defining traits and the latest corrections first.',
    'When the user has not attached a new explicit reference image, preserve continuity through the current brief, characterReadout, conversation, and previously confirmed visual traits so silhouette, palette, materials, accessories, props, and art style stay coherent.',
    'Do not mechanically inherit incidental dirt, blur, noise, leftover background texture, facial blemishes, or other accidental rendering artifacts from the previous image unless the user explicitly reaffirms them.',
  ];
}

function buildAnchorImagePromptSuffix(preferredLanguage: string | null | undefined): string {
  if (prefersSimplifiedChinese(preferredLanguage)) {
    return '全身角色锚点图，人物从头到脚完整入画，采用稳定统一的标准人物镜头语言，固定焦距人物视角，平视或接近平视，镜头与人物距离稳定，主体居中，姿态稳定，四肢与整体轮廓清楚可见，服装材质、配饰、手持道具与画风明确，背景弱化且不喧宾夺主。';
  }
  return 'Full-body character anchor image, complete figure visible from head to toe, using stable standard character lens language, fixed focal-length character framing, eye-level or near-eye-level view, consistent camera-to-subject distance, centered subject, stable pose, limbs and silhouette clearly readable, outfit material, accessories, handheld props, and art style explicit, background subdued and non-dominant.';
}

function buildAnchorImageNegativeSuffix(preferredLanguage: string | null | undefined): string {
  if (prefersSimplifiedChinese(preferredLanguage)) {
    return '半身像，胸像，特写，头部裁切，脚部裁切，手部缺失，配饰不可见，道具不可见，强透视，广角畸变，夸张动作，电影海报感，背景过重，剧情化场景，俯拍，仰拍，荷兰角，远景，超近景，镜头距离飘忽。';
  }
  return 'half-body portrait, bust shot, close-up, cropped head, cropped feet, missing hands, hidden accessories, hidden props, strong perspective, wide-angle distortion, exaggerated action pose, cinematic poster look, overpowering background, scene-first storytelling, high-angle shot, low-angle shot, dutch angle, long shot, extreme close-up, inconsistent camera distance.';
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
  const images = [snapshot.sourceImage?.url || '']
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  return images;
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

const CaptureTurnSchema = z.object({
  assistantReply: z.string().trim().min(1),
  brief: z.string().trim().min(1),
});

const BriefSchema = z.object({
  brief: z.string().trim().min(1),
});

const DraftGenerationSchema = z.object({
  name: z.string().trim().min(1),
  bio: z.string().trim().min(1),
  personaSeed: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).min(1).max(8),
  characterReadout: z.string().trim().min(1),
  imagePrompt: z.string().trim().min(1),
  negativePrompt: z.string().trim().default(''),
});

type StructuredAttempt = {
  maxTokens: number;
  temperature: number;
};

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'UNKNOWN_ERROR');
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
    size: '1024x1024',
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
  if (input.artifact.uri && !input.artifact.uri.startsWith('data:')) {
    return {
      mimeType,
      url: String(input.artifact.uri).trim(),
    };
  }
  const ext = mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
  const path = `images/${input.draftId}/generated-${Date.now()}.${ext}`;
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

export async function runCaptureTurn(input: {
  runtimeClient: ModRuntimeClient;
  draft: AgentCaptureDraftSnapshot;
  session: AgentCaptureSessionState;
  selectedAgent: AgentCaptureAgentSummary | null;
  textBinding: RuntimeRouteBinding | null;
  userMessage: string;
  preferredLanguage?: string;
}): Promise<AgentCaptureTurnResult & { traceId?: string }> {
  const system = [
    pickPromptCopy(
      input.preferredLanguage,
      '你是 Agent-Capture 的角色形象捕捉助手。',
      'You are Agent-Capture, a role-visual exploration assistant.',
    ),
    pickPromptCopy(
      input.preferredLanguage,
      '帮助用户把角色感觉逐步落实成可见的形象决策，而不是收集一份僵硬的问卷。',
      'Help the user turn an emerging role feeling into visible character decisions instead of collecting a rigid questionnaire.',
    ),
    buildLanguageLock(input.preferredLanguage),
    ...buildCharacterFocusGuidance(input.preferredLanguage),
    ...buildIterativeRefinementGuidance(input.preferredLanguage),
    makeJsonBlockPrompt(
      '{"assistantReply":"string","brief":"string"}',
      prefersSimplifiedChinese(input.preferredLanguage)
        ? [
            'assistantReply 必须像自然协作对话，而不是控制台指令；长度不超过 120 个中文字符。',
            'assistantReply 应尽量把讨论往服装、材质、配饰、手持道具、轮廓、色彩与画风这些角色可见决策上推进。',
            'assistantReply 默认不要把大段篇幅用于铺陈背景场景；只有用户明确要求时才提升背景优先级。',
            'brief 必须是一句自然语言，总结当前角色感觉和关键视觉特征；长度不超过 80 个中文字符。',
            'brief 必须优先概括轮廓、服装、材质、配饰、手持道具、色彩与画风；背景除非明确被要求，否则保持次要。',
            '除非用户明确要求重来，否则默认把最新修正视为对当前方向的增量调整。',
            '每个字段都必须存在且非空。',
          ]
        : [
            'assistantReply should sound like a natural collaborative response rather than a control panel, within 260 English characters.',
            'assistantReply should steer toward concrete character decisions like outfit, materials, accessories, handheld props, silhouette, palette, and art style whenever useful.',
            'assistantReply should not spend most of its space on background scene-building unless the user explicitly asks for that.',
            'brief must be one natural-language sentence summarizing the current role feel and key visual traits, within 180 English characters.',
            'brief should prioritize silhouette, outfit, materials, accessories, handheld props, palette, and art style; background stays secondary unless explicitly requested.',
            'use the latest user correction as a delta on the current direction by default unless the user clearly asks to restart.',
            'every field must be present and non-empty.',
          ],
    ),
  ].join('\n\n');
  const prompt = [
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
      { zh: '已选已有角色背景：', en: 'Selected agent background:' },
      summarizeAgent(input.selectedAgent),
      {
        zh: '未附加已有角色。',
        en: 'No selected existing agent.',
      },
    ),
    input.session.currentBrief
      ? formatPromptSection(input.preferredLanguage, { zh: '当前 brief：', en: 'Current brief:' }, input.session.currentBrief)
      : '',
    input.draft.characterReadout
      ? formatPromptSection(input.preferredLanguage, { zh: '当前角色读取：', en: 'Current character readout:' }, input.draft.characterReadout)
      : '',
    optionalPromptNote(
      input.preferredLanguage,
      Boolean(input.draft.generatedImage),
      '当前已经存在一张生成图，应把它视为方向反馈：保留已确认的人物主体特征与最新修正，但不要机械继承偶发瑕疵。',
      'A current generated image already exists and should be treated as directional feedback: preserve confirmed character traits and latest corrections, but do not mechanically inherit incidental artifacts.',
    ),
    optionalPromptNote(
      input.preferredLanguage,
      Boolean(input.draft.sourceImage),
      '已附加一张参考图，应纳入当前方向判断。',
      'A source reference image is attached and should inform the current direction.',
    ),
    formatPromptSection(input.preferredLanguage, { zh: '用户最新输入：', en: 'Latest user message:' }, input.userMessage),
  ].filter(Boolean).join('\n\n');
  const { parsed, traceId } = await generateStructuredObject({
    runtimeClient: input.runtimeClient,
    binding: input.textBinding,
    resolveCapability: 'text.generate',
    system,
    prompt,
    attempts: [
      { temperature: 0.25, maxTokens: 1536 },
      { temperature: 0.15, maxTokens: 2048 },
      { temperature: 0.05, maxTokens: 2560 },
    ],
    schema: CaptureTurnSchema,
    parseErrorCode: 'AGENT_CAPTURE_TURN_JSON_INVALID',
    truncationErrorCode: 'AGENT_CAPTURE_TURN_TRUNCATED',
    contractErrorCode: 'AGENT_CAPTURE_TURN_CONTRACT_INVALID',
  });
  return {
    assistantReply: parsed.assistantReply,
    brief: parsed.brief,
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
    ...buildIterativeRefinementGuidance(input.preferredLanguage),
    makeJsonBlockPrompt(
      '{"brief":"string"}',
      prefersSimplifiedChinese(input.preferredLanguage)
        ? [
            'brief 必须是一句自然语言，概括当前角色感觉和关键视觉特征；长度不超过 80 个中文字符。',
            'brief 必须优先概括人物主体相关的轮廓、服装、材质、配饰、手持道具与画风；背景除非明确被要求，否则只作辅助。',
            '如果当前结果已存在，brief 需要轻量说明本轮保留什么、调整什么。',
            '不要输出标签、数组或解释文字。',
            'brief 必须存在且非空。',
          ]
        : [
            'brief must describe the current role feel and key visual traits in one sentence, within 180 English characters.',
            'brief should prioritize silhouette, outfit, materials, accessories, handheld props, and art style; background should be supporting-only unless explicitly requested.',
            'if a current result exists, briefly reflect what is being retained and what is being adjusted.',
            'do not output labels or arrays.',
            'brief must be present and non-empty.',
          ],
    ),
  ].join('\n\n');
  const prompt = [
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
      { zh: '已选已有角色背景：', en: 'Selected agent background:' },
      summarizeAgent(input.selectedAgent),
      {
        zh: '未附加已有角色。',
        en: 'No selected existing agent.',
      },
    ),
    input.draft.characterReadout
      ? formatPromptSection(input.preferredLanguage, { zh: '当前角色读取：', en: 'Current character readout:' }, input.draft.characterReadout)
      : '',
    optionalPromptNote(
      input.preferredLanguage,
      Boolean(input.draft.generatedImage),
      '当前方向里已经存在一张生成图；它提供方向反馈，但不等于所有视觉细节都必须被继承。',
      'There is already a current generated image in this direction; it provides directional feedback, but not every visual artifact should be inherited.',
    ),
    optionalPromptNote(
      input.preferredLanguage,
      Boolean(input.draft.sourceImage),
      '已附加一张参考图，应纳入当前方向判断。',
      'A source reference image is attached and should inform the current direction.',
    ),
  ].filter(Boolean).join('\n\n');
  const { parsed, traceId } = await generateStructuredObject({
    runtimeClient: input.runtimeClient,
    binding: input.textBinding,
    resolveCapability: 'text.generate',
    system,
    prompt,
    attempts: [
      { temperature: 0.15, maxTokens: 512 },
      { temperature: 0.05, maxTokens: 768 },
      { temperature: 0, maxTokens: 1024 },
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
  textTraceId?: string;
  imageTraceId?: string;
}> {
  const currentBrief = String(input.session.currentBrief || '').trim();
  if (!currentBrief) {
    throw new Error('AGENT_CAPTURE_BRIEF_REQUIRED');
  }
  const system = [
    pickPromptCopy(
      input.preferredLanguage,
      '你正在为 Agent-Capture 准备一份角色首图与文本草稿包。',
      'You are preparing one role-image draft package for Agent-Capture.',
    ),
    pickPromptCopy(
      input.preferredLanguage,
      '输出应让用户清楚感到角色形象正在变得更明确、更可继续使用。',
      'The output should help the user feel the role is becoming clearer and more reusable.',
    ),
    buildLanguageLock(input.preferredLanguage),
    ...buildCharacterFocusGuidance(input.preferredLanguage),
    ...buildIterativeRefinementGuidance(input.preferredLanguage),
    makeJsonBlockPrompt(
      '{"name":"string","bio":"string","personaSeed":"string","tags":["string"],"characterReadout":"string","imagePrompt":"string","negativePrompt":"string"}',
      prefersSimplifiedChinese(input.preferredLanguage)
        ? [
            'name 应简洁且有识别感；长度不超过 24 个中文字符。',
            'bio 应为 1-2 句短句；长度不超过 120 个中文字符。',
            'personaSeed 应为紧凑的角色种子段落；长度不超过 160 个中文字符。',
            'tags 应为 3-6 个简洁标签。',
            'characterReadout 应简短说明这个角色现在像谁、这轮落实了什么；长度不超过 100 个中文字符。',
            'characterReadout 应先提人物主体上的服装、配饰、道具、材质、轮廓或画风变化，再提背景氛围。',
            'imagePrompt 必须面向一张稳定的全身角色锚点图，而不是戏剧化海报镜头。',
            'imagePrompt 必须明确：人物全身、头到脚完整可见、主体居中、姿态稳定、标准人物镜头语言、固定焦距人物视角、平视或接近平视、镜头距离稳定。',
            'imagePrompt 必须把服装、材质、配饰、手持道具、色彩与画风尽量写具体。',
            'imagePrompt 必须避免夸张广角、强透视、明显近大远小、极近特写、半身像、动作大片感和重剧情场景叙事。',
            'imagePrompt 必须让背景退后、弱化、低细节；除非用户明确要求，不要让背景成为视觉主体。',
            '如果当前结果已存在，imagePrompt 必须保留用户确认的人物主体特征与最新修正，但不要机械继承上一版图中的脏污、模糊、噪点、背景残留或未被确认的瑕疵。',
            'negativePrompt 应简洁，并在相关时规避现代感、跑偏气质或不匹配设定。',
            'negativePrompt 必须明确压制半身裁切、脚部缺失、手部遮挡、道具缺失、镜头角度漂移和背景主导阅读。',
            '每个字段都必须存在。',
          ]
        : [
            'name should be concise and evocative, within 48 English characters.',
            'bio should be 1-2 short sentences, within 240 English characters.',
            'personaSeed should be a compact role-seed paragraph, within 320 English characters.',
            'tags should be 3-6 concise tags.',
            'characterReadout should briefly describe who this role now feels like and what changed this round, within 220 English characters.',
            'characterReadout should mention character-facing changes such as outfit, accessories, props, materials, silhouette, or art style before background atmosphere.',
            'imagePrompt should be optimized for one stable full-body character anchor image rather than a dramatic poster shot.',
            'imagePrompt must explicitly lock the subject to full-body, head-to-toe visible, centered framing, stable pose, standard character lens language, fixed focal-length character framing, eye-level or near-eye-level view, and consistent camera distance.',
            'imagePrompt should make outfit, materials, accessories, handheld props, palette, and art style concrete whenever the context supports them.',
            'imagePrompt should avoid exaggerated wide-angle perspective, strong foreshortening, extreme close-up framing, half-body portrait framing, action-poster energy, and scene-first storytelling.',
            'imagePrompt should keep background subordinate and low-detail unless the user explicitly wants a strong environment treatment.',
            'if a current result exists, imagePrompt must preserve user-confirmed character-defining traits and the latest corrections without mechanically inheriting dirt, blur, noise, leftover background texture, or other unconfirmed artifacts from the previous render.',
            'negativePrompt should be concise and avoid modern, off-tone, or mismatched traits when relevant.',
            'negativePrompt should explicitly discourage half-body crops, missing feet, hidden hands, missing props, drifting camera angle, and background-dominant cinematic framing.',
            'every field must be present.',
          ],
    ),
  ].join('\n\n');
  const prompt = [
    formatPromptSection(
      input.preferredLanguage,
      { zh: '当前角色输入：', en: 'Current source prompt:' },
      buildSourcePrompt(input.draft),
    ),
    formatPromptSection(input.preferredLanguage, { zh: '当前 brief：', en: 'Current brief:' }, currentBrief),
    formatPromptSection(
      input.preferredLanguage,
      { zh: '当前会话：', en: 'Current conversation:' },
      summarizeConversation(input.session),
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
    input.draft.characterReadout
      ? formatPromptSection(input.preferredLanguage, { zh: '上一版角色读取：', en: 'Previous character readout:' }, input.draft.characterReadout)
      : '',
    optionalPromptNote(
      input.preferredLanguage,
      Boolean(input.draft.generatedImage),
      '当前已经存在一张生成图，应被视为本轮方向反馈的一部分：保留已确认主体特征与最新修正，但不要机械继承其中的偶发瑕疵。',
      'A current generated image already exists and should be treated as directional feedback for this round: preserve confirmed character traits and latest corrections, but do not mechanically inherit incidental artifacts from it.',
    ),
    optionalPromptNote(
      input.preferredLanguage,
      Boolean(input.draft.sourceImage),
      '已附加一张参考图，应影响本轮新结果。',
      'A source reference image is attached and should inform the new result.',
    ),
  ].filter(Boolean).join('\n\n');
  const { parsed, traceId: textTraceId } = await generateStructuredObject({
    runtimeClient: input.runtimeClient,
    binding: input.textBinding,
    resolveCapability: 'text.generate',
    system,
    prompt,
    attempts: [
      { temperature: 0.2, maxTokens: 2048 },
      { temperature: 0.1, maxTokens: 2560 },
      { temperature: 0, maxTokens: 3072 },
    ],
    schema: DraftGenerationSchema,
    parseErrorCode: 'AGENT_CAPTURE_DRAFT_JSON_INVALID',
    truncationErrorCode: 'AGENT_CAPTURE_DRAFT_TRUNCATED',
    contractErrorCode: 'AGENT_CAPTURE_GENERATION_TEXT_CONTRACT_INVALID',
  });
  const draft: AgentCaptureDraftGeneration = {
    name: parsed.name,
    bio: parsed.bio,
    personaSeed: parsed.personaSeed,
    tags: parsed.tags,
    characterReadout: parsed.characterReadout,
    imagePrompt: enforceAnchorImagePrompt(parsed.imagePrompt, input.preferredLanguage),
    negativePrompt: enforceAnchorNegativePrompt(parsed.negativePrompt, input.preferredLanguage),
  };
  const resolvedImageRoute = await input.runtimeClient.route.resolve({ capability: 'image.generate' });
  const imageResult = await input.runtimeClient.media.image.generate(buildImageGenerateRequestParams({
    prompt: draft.imagePrompt,
    negativePrompt: draft.negativePrompt,
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
  return {
    draft,
    image,
    textTraceId,
    imageTraceId: String(imageResult.trace?.traceId || '').trim() || undefined,
  };
}
