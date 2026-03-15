import {
  type RuntimeCanonicalCapability,
  type RuntimeRouteBinding,
  type RuntimeRouteOptionsSnapshot,
  type RuntimeRouteSource,
} from "@nimiplatform/sdk/mod";
import { getDailyOutfitRuntimeClient } from './runtime-mod.js';
import {
  DAILY_OUTFIT_CATEGORIES,
  DAILY_OUTFIT_SEASONS,
  type DailyOutfitCategory,
  type DailyOutfitSeason,
} from './types.js';
import { resolveImageUrlForRuntime } from './image-storage.js';

export type DailyOutfitGarmentAnalysis = {
  category: DailyOutfitCategory;
  subcategory?: string;
  colors: string[];
  material?: string;
  styleTags: string[];
  seasons: DailyOutfitSeason[];
  formalityLevel: number;
  summary?: string;
  rawText: string;
  traceId?: string;
};

const TEXT_VISION_CAPABILITY_TOKENS = ['vision', 'multimodal', 'text.generate.vision'];
const IMAGE_REFERENCE_CAPABILITY_TOKENS = ['i2i', 'reference_images', 'reference_image', 'image.edit'];
const IMAGE_GENERATE_CAPABILITY_TOKENS = ['image', 't2i', 'i2i', 'image.generate'];
const TEXT_VISION_MODEL_HINTS = [
  /\bgemini-(?!.*image)(?:2\.5|3|3\.1)[\w.-]*/iu,
  /\bgpt-4o\b/iu,
  /\bgpt-4\.1\b/iu,
  /\bclaude-(?:3|4)[\w.-]*/iu,
  /\bqwen[\w.-]*vl[\w.-]*/iu,
  /\bllava[\w.-]*/iu,
  /\binternvl[\w.-]*/iu,
  /\bvision\b/iu,
  /\bmultimodal\b/iu,
  /\bomni\b/iu,
];
const IMAGE_GENERATE_MODEL_HINTS = [
  /\bnano-banana(?:2)?\b/iu,
  /\bbanana(?:2)?\b/iu,
  /\bgemini-[\w.-]*image[\w.-]*/iu,
  /\bgpt-image[\w.-]*/iu,
  /\bflux[\w.-]*/iu,
  /\bideogram[\w.-]*/iu,
  /\bseedream[\w.-]*/iu,
  /\bimage\b/iu,
];
const IMAGE_REFERENCE_MODEL_HINTS = [
  /\bnano-banana(?:2)?\b/iu,
  /\bbanana(?:2)?\b/iu,
  /\bgemini-[\w.-]*image[\w.-]*/iu,
  /\bgpt-image[\w.-]*/iu,
];

function asString(value: unknown): string {
  return String(value || '').trim();
}

function normalizeLocalRuntimeModelRoot(value: unknown): string {
  const trimmed = asString(value);
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('localai/')) return trimmed.slice('localai/'.length).trim();
  if (lower.startsWith('nexa/')) return trimmed.slice('nexa/'.length).trim();
  if (lower.startsWith('local/')) return trimmed.slice('local/'.length).trim();
  return trimmed;
}

function normalizeCapabilityTokens(capabilities: string[] | undefined): string[] {
  return (capabilities || [])
    .map((capability) => asString(capability).toLowerCase())
    .filter(Boolean);
}

function hasAnyCapability(capabilities: string[] | undefined, tokens: string[]): boolean {
  const normalized = normalizeCapabilityTokens(capabilities);
  return tokens.some((token) => normalized.includes(token));
}

function matchesAnyHint(value: string, hints: RegExp[]): boolean {
  return hints.some((hint) => hint.test(value));
}

function modelLikelySupportsCapability(input: {
  source: RuntimeRouteSource;
  provider?: string;
  model?: string;
  capabilityTokens: string[];
}): boolean {
  const provider = asString(input.provider).toLowerCase();
  const model = asString(input.model).toLowerCase();
  const fingerprint = `${provider} ${model}`.trim();
  if (!fingerprint) {
    return false;
  }
  if (input.capabilityTokens === TEXT_VISION_CAPABILITY_TOKENS) {
    return matchesAnyHint(fingerprint, TEXT_VISION_MODEL_HINTS);
  }
  if (input.capabilityTokens === IMAGE_REFERENCE_CAPABILITY_TOKENS) {
    return matchesAnyHint(fingerprint, IMAGE_REFERENCE_MODEL_HINTS);
  }
  if (input.capabilityTokens === IMAGE_GENERATE_CAPABILITY_TOKENS) {
    return matchesAnyHint(fingerprint, IMAGE_GENERATE_MODEL_HINTS);
  }
  return false;
}

function localBindingFromOption(option: RuntimeRouteOptionsSnapshot['local']['models'][number]): RuntimeRouteBinding {
  const modelId = asString(option.modelId || option.model);
  return {
    source: 'local',
    connectorId: '',
    model: modelId,
    modelId: modelId || undefined,
    provider: asString(option.provider || option.engine) || undefined,
    localModelId: asString(option.localModelId) || undefined,
    engine: asString(option.engine) || undefined,
    adapter: asString(option.adapter) || undefined,
    endpoint: asString(option.endpoint) || undefined,
    goRuntimeLocalModelId: asString(option.goRuntimeLocalModelId) || undefined,
    goRuntimeStatus: asString(option.goRuntimeStatus) || undefined,
    ...(option.providerHints ? { providerHints: option.providerHints } : {}),
  };
}

function cloudBindingForConnector(
  connector: RuntimeRouteOptionsSnapshot['connectors'][number],
  model: string,
): RuntimeRouteBinding {
  return {
    source: 'cloud',
    connectorId: connector.id,
    provider: asString(connector.provider) || undefined,
    model,
  };
}

function connectorCapabilitiesForModel(
  connector: RuntimeRouteOptionsSnapshot['connectors'][number],
  model: string,
): string[] {
  const modelCapabilities = connector.modelCapabilities || {};
  const direct = modelCapabilities[model];
  if (Array.isArray(direct) && direct.length > 0) {
    return direct;
  }
  const loweredModel = asString(model).toLowerCase();
  if (!loweredModel) {
    return [];
  }
  const entry = Object.entries(modelCapabilities).find(
    ([candidate]) => asString(candidate).toLowerCase() === loweredModel,
  );
  return Array.isArray(entry?.[1]) ? entry[1] : [];
}

function hydrateTokenApiBinding(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  binding: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (!snapshot || !binding || binding.source !== 'cloud') {
    return binding;
  }
  const connector = snapshot.connectors.find((item) => item.id === binding.connectorId) || null;
  if (!connector) {
    return binding;
  }
  return {
    ...binding,
    provider: asString(binding.provider || connector.provider) || undefined,
  };
}

function hydrateLocalRuntimeBinding(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  binding: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (!snapshot || !binding || binding.source !== 'local') {
    return binding;
  }
  const normalizedLocalModelId = asString(binding.localModelId);
  const normalizedModelId = normalizeLocalRuntimeModelRoot(binding.modelId || binding.model);
  const normalizedEngine = asString(binding.engine || binding.provider).toLowerCase();
  const localModel = (snapshot.local?.models || []).find((item) => (
    (normalizedLocalModelId && asString(item.localModelId) === normalizedLocalModelId)
      || (
        normalizeLocalRuntimeModelRoot(item.modelId || item.model) === normalizedModelId
        && (!normalizedEngine || asString(item.engine || item.provider).toLowerCase() === normalizedEngine)
      )
  )) || null;
  if (!localModel) {
    return {
      ...binding,
      model: normalizedModelId || asString(binding.model),
      modelId: normalizedModelId || undefined,
    };
  }
  return {
    ...localBindingFromOption(localModel),
    model: normalizedModelId || asString(localModel.modelId || localModel.model),
    modelId: normalizedModelId || asString(localModel.modelId || localModel.model) || undefined,
    localModelId: asString(binding.localModelId || localModel.localModelId) || undefined,
  };
}

export function ensureRouteOptionsSnapshotShape(
  snapshot: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteOptionsSnapshot | null {
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    local: {
      models: snapshot.local?.models || [],
      defaultEndpoint: snapshot.local?.defaultEndpoint,
    },
    connectors: Array.isArray(snapshot.connectors) ? snapshot.connectors : [],
  };
}

export function resolveEffectiveBinding(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  binding: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (binding?.source === 'cloud') return hydrateTokenApiBinding(snapshot, binding);
  if (binding?.source === 'local') return hydrateLocalRuntimeBinding(snapshot, binding);
  if (!snapshot) return null;
  const fallback = snapshot.selected || snapshot.resolvedDefault || null;
  if (fallback?.source === 'local') {
    return hydrateLocalRuntimeBinding(snapshot, fallback);
  }
  return hydrateTokenApiBinding(snapshot, fallback);
}

export function bindingForSource(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  source: RuntimeRouteSource,
): RuntimeRouteBinding | null {
  if (source === 'cloud') {
    const connector = snapshot?.connectors[0] || null;
    if (!connector) {
      return null;
    }
    return cloudBindingForConnector(connector, connector.models[0] || '');
  }
  const local = snapshot?.local?.models[0] || null;
  if (!local) {
    return null;
  }
  return localBindingFromOption(local);
}

export function bindingForConnector(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  connectorId: string,
  current: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  const connector = snapshot?.connectors.find((item) => item.id === connectorId) || null;
  if (!connector) {
    return null;
  }
  const currentModel = current?.source === 'cloud' ? current.model : '';
  const model = connector.models.includes(currentModel) ? currentModel : (connector.models[0] || '');
  return cloudBindingForConnector(connector, model);
}

export function bindingForModel(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  model: string,
  current: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  const normalizedModel = asString(model);
  if (!normalizedModel) {
    return current;
  }
  const effective = resolveEffectiveBinding(snapshot, current);
  if (!effective) {
    return null;
  }
  if (effective.source === 'cloud') {
    return {
      source: 'cloud',
      connectorId: effective.connectorId,
      provider: asString(effective.provider) || undefined,
      model: normalizedModel,
    };
  }
  const normalizedLocalModel = normalizeLocalRuntimeModelRoot(normalizedModel);
  const localModel = snapshot?.local?.models.find(
    (item) => normalizeLocalRuntimeModelRoot(item.modelId || item.model) === normalizedLocalModel,
  ) || null;
  if (localModel) {
    return localBindingFromOption(localModel);
  }
  return {
    source: 'local',
    connectorId: '',
    model: normalizedLocalModel,
    modelId: normalizedLocalModel || undefined,
    provider: asString(effective.provider) || undefined,
    localModelId: asString(effective.localModelId) || undefined,
    engine: asString(effective.engine) || undefined,
    adapter: asString(effective.adapter) || undefined,
    endpoint: asString(effective.endpoint) || undefined,
    goRuntimeLocalModelId: asString(effective.goRuntimeLocalModelId) || undefined,
    goRuntimeStatus: asString(effective.goRuntimeStatus) || undefined,
    ...(effective.providerHints ? { providerHints: effective.providerHints } : {}),
  };
}

export function resolveRoutePickerState(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  binding: RuntimeRouteBinding | null,
): {
  effectiveBinding: RuntimeRouteBinding | null;
  activeSource: RuntimeRouteSource;
  activeConnectorId: string;
  activeModel: string;
  modelOptions: string[];
} {
  const effectiveBinding = resolveEffectiveBinding(snapshot, binding);
  const activeSource = effectiveBinding?.source || snapshot?.selected?.source || 'local';
  const activeConnectorId = effectiveBinding?.connectorId || snapshot?.selected?.connectorId || '';
  const activeConnector = snapshot?.connectors.find((item) => item.id === activeConnectorId) || null;
  const activeModel = activeSource === 'local'
    ? normalizeLocalRuntimeModelRoot(
      effectiveBinding?.modelId || effectiveBinding?.model || snapshot?.selected?.modelId || snapshot?.selected?.model || '',
    )
    : (effectiveBinding?.model || snapshot?.selected?.model || '');
  const modelOptions = activeSource === 'local'
    ? (snapshot?.local?.models || []).map((item) => normalizeLocalRuntimeModelRoot(item.modelId || item.model))
    : (activeConnector?.models || []);
  return {
    effectiveBinding,
    activeSource,
    activeConnectorId,
    activeModel,
    modelOptions,
  };
}

function findPreferredCloudBinding(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  capabilityTokens: string[],
): RuntimeRouteBinding | null {
  for (const connector of snapshot?.connectors || []) {
    for (const model of connector.models || []) {
      if (
        hasAnyCapability(connectorCapabilitiesForModel(connector, model), capabilityTokens)
        || modelLikelySupportsCapability({
          source: 'cloud',
          provider: connector.provider,
          model,
          capabilityTokens,
        })
      ) {
        return cloudBindingForConnector(connector, model);
      }
    }
  }
  return null;
}

function findPreferredLocalBinding(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  capabilityTokens: string[],
): RuntimeRouteBinding | null {
  for (const model of snapshot?.local?.models || []) {
    if (
      hasAnyCapability(model.capabilities, capabilityTokens)
      || modelLikelySupportsCapability({
        source: 'local',
        provider: model.provider || model.engine,
        model: model.modelId || model.model,
        capabilityTokens,
      })
    ) {
      return localBindingFromOption(model);
    }
  }
  return null;
}

function bindingSupportsCapabilityTokens(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  binding: RuntimeRouteBinding | null,
  capabilityTokens: string[],
): boolean {
  const effective = resolveEffectiveBinding(snapshot, binding);
  if (!effective) {
    return false;
  }
  if (effective.source === 'cloud') {
    const connector = snapshot?.connectors.find((item) => item.id === effective.connectorId) || null;
    if (!connector) {
      return false;
    }
    return hasAnyCapability(connectorCapabilitiesForModel(connector, effective.model), capabilityTokens)
      || modelLikelySupportsCapability({
        source: 'cloud',
        provider: effective.provider || connector.provider,
        model: effective.model,
        capabilityTokens,
      });
  }
  const localModel = (snapshot?.local?.models || []).find((item) => (
    asString(item.localModelId) === asString(effective.localModelId)
      || normalizeLocalRuntimeModelRoot(item.modelId || item.model) === normalizeLocalRuntimeModelRoot(effective.modelId || effective.model)
  )) || null;
  return hasAnyCapability(localModel?.capabilities, capabilityTokens)
    || modelLikelySupportsCapability({
      source: 'local',
      provider: effective.provider || effective.engine || localModel?.provider || localModel?.engine,
      model: effective.modelId || effective.model || localModel?.modelId || localModel?.model,
      capabilityTokens,
    });
}

export function suggestAnalysisBinding(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  current: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (bindingSupportsCapabilityTokens(snapshot, current, TEXT_VISION_CAPABILITY_TOKENS)) {
    return current;
  }
  return findPreferredCloudBinding(snapshot, TEXT_VISION_CAPABILITY_TOKENS)
    || findPreferredLocalBinding(snapshot, TEXT_VISION_CAPABILITY_TOKENS)
    || current;
}

export function suggestCutoutBinding(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  current: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (bindingSupportsCapabilityTokens(snapshot, current, IMAGE_REFERENCE_CAPABILITY_TOKENS)) {
    return current;
  }
  return findPreferredCloudBinding(snapshot, IMAGE_REFERENCE_CAPABILITY_TOKENS)
    || findPreferredLocalBinding(snapshot, IMAGE_REFERENCE_CAPABILITY_TOKENS)
    || findPreferredCloudBinding(snapshot, IMAGE_GENERATE_CAPABILITY_TOKENS)
    || findPreferredLocalBinding(snapshot, IMAGE_GENERATE_CAPABILITY_TOKENS)
    || current;
}

export function explainModalityError(input: {
  capability: 'analysis' | 'cutout';
  snapshot: RuntimeRouteOptionsSnapshot | null;
  binding: RuntimeRouteBinding | null;
}): string {
  if (input.capability === 'analysis') {
    const suggested = suggestAnalysisBinding(input.snapshot, input.binding);
    if (suggested && suggested !== input.binding) {
      return 'Current analysis model does not support image understanding. Switch to a vision or multimodal model.';
    }
    return 'Current analysis model does not support image understanding.';
  }
  const suggested = suggestCutoutBinding(input.snapshot, input.binding);
  if (suggested && suggested !== input.binding) {
    return 'Current cutout model does not support reference-image generation. Switch to a model with i2i or reference-image support.';
  }
  return 'Current cutout model does not support reference-image generation.';
}

function extractJsonObject(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return text.trim();
}

function normalizeCategory(value: unknown): DailyOutfitCategory {
  const normalized = asString(value).toLowerCase();
  if (DAILY_OUTFIT_CATEGORIES.includes(normalized as DailyOutfitCategory)) {
    return normalized as DailyOutfitCategory;
  }
  if (/(上|top|shirt|tee|blouse|knit|sweater|hoodie)/u.test(normalized)) return 'top';
  if (/(下|bottom|pants|trouser|skirt|shorts|jean)/u.test(normalized)) return 'bottom';
  if (/(鞋|shoe|sneaker|loafer|heel|boot|sandal)/u.test(normalized)) return 'shoes';
  if (/(外|outer|coat|jacket|blazer|cardigan)/u.test(normalized)) return 'outerwear';
  if (/(配|accessory|bag|belt|hat|scarf|jewel)/u.test(normalized)) return 'accessory';
  return 'top';
}

function normalizeSeasons(value: unknown): DailyOutfitSeason[] {
  const values = Array.isArray(value) ? value : [value];
  const seasons = new Set<DailyOutfitSeason>();
  for (const item of values) {
    const normalized = asString(item).toLowerCase();
    if (!normalized) {
      continue;
    }
    if (normalized === 'spring' || normalized === '春') seasons.add('spring');
    if (normalized === 'summer' || normalized === '夏') seasons.add('summer');
    if (normalized === 'autumn' || normalized === 'fall' || normalized === '秋') seasons.add('autumn');
    if (normalized === 'winter' || normalized === '冬') seasons.add('winter');
  }
  return seasons.size > 0 ? [...seasons] : ['spring', 'summer'];
}

function normalizeTextArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const normalized = value.map((item) => asString(item)).filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function clampFormalityLevel(value: unknown): number {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) {
    return 3;
  }
  return Math.min(5, Math.max(1, numeric));
}

function normalizeAnalysis(raw: Record<string, unknown>, rawText: string, traceId?: string): DailyOutfitGarmentAnalysis {
  return {
    category: normalizeCategory(raw.category),
    subcategory: asString(raw.subcategory) || undefined,
    colors: normalizeTextArray(raw.colors, ['white']),
    material: asString(raw.material) || undefined,
    styleTags: normalizeTextArray(raw.styleTags, ['minimal']),
    seasons: normalizeSeasons(raw.seasons),
    formalityLevel: clampFormalityLevel(raw.formalityLevel),
    summary: asString(raw.summary) || undefined,
    rawText,
    traceId: asString(traceId) || undefined,
  };
}

function parseAnalysisResponse(text: string, traceId?: string): DailyOutfitGarmentAnalysis {
  const payload = extractJsonObject(text);
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  return normalizeAnalysis(parsed, text, traceId);
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  if (bytes.length === 0) {
    return '';
  }
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] || 0);
  }
  return `data:${mimeType || 'application/octet-stream'};base64,${globalThis.btoa(binary)}`;
}

function firstArtifactUrl(artifacts: Array<{ uri?: string; bytes?: Uint8Array; mimeType?: string }>): string {
  for (const artifact of artifacts) {
    const uri = asString(artifact.uri);
    if (uri) {
      return uri;
    }
    if (artifact.bytes && artifact.bytes.length > 0) {
      return bytesToDataUrl(artifact.bytes, asString(artifact.mimeType) || 'image/png');
    }
  }
  return '';
}

const GARMENT_ANALYSIS_PROMPT = [
  'Analyze the garment in the provided image.',
  'Return strict JSON only, without markdown fences or extra commentary.',
  'Use this schema:',
  '{"category":"top|bottom|shoes|outerwear|accessory","subcategory":"string","colors":["string"],"material":"string","styleTags":["string"],"seasons":["spring|summer|autumn|winter"],"formalityLevel":1,"summary":"string"}',
  'Rules:',
  '- Use English lowercase for category and seasons.',
  '- Keep colors and styleTags concise.',
  '- Estimate material conservatively if uncertain.',
  '- formalityLevel must be an integer from 1 to 5.',
  '- summary should be one short sentence about the garment itself, not styling advice.',
].join('\n');

function buildCutoutPrompt(input: {
  category: DailyOutfitCategory;
  subcategory?: string;
  material?: string;
  colors: string[];
  styleTags: string[];
}): string {
  const descriptor = [
    input.subcategory,
    input.category,
    input.material ? `${input.material} fabric` : '',
    input.colors.length > 0 ? `${input.colors.join(', ')} colors` : '',
    input.styleTags.length > 0 ? `${input.styleTags.join(', ')} style` : '',
  ].filter(Boolean).join(', ');
  return [
    'Using the reference garment image, create a clean single-item product cutout.',
    'Keep the exact garment silhouette, texture, knit pattern, buttons, seams, and proportions from the original item.',
    'Remove the background, bed, body parts, shadows from other objects, and all clutter.',
    'Return a transparent background PNG with preserved alpha whenever the model supports transparency.',
    'If transparent output is unavailable, use a flat very light neutral background with no props or scene elements.',
    'Show the full garment clearly in frame with generous margins so sleeves, hem, collar, and silhouette are not cropped.',
    'Center the garment in a portrait-oriented product frame.',
    'Do not redesign, restyle, or replace the garment.',
    descriptor ? `Garment descriptor: ${descriptor}.` : '',
  ].filter(Boolean).join(' ');
}

export async function listDailyOutfitRouteOptions(
  capability: RuntimeCanonicalCapability,
): Promise<RuntimeRouteOptionsSnapshot> {
  const runtimeClient = getDailyOutfitRuntimeClient();
  const snapshot = await runtimeClient.route.listOptions({ capability });
  return ensureRouteOptionsSnapshotShape(snapshot) || snapshot;
}

export async function analyzeGarmentPhoto(input: {
  imageUrl: string;
  binding?: RuntimeRouteBinding | null;
}): Promise<DailyOutfitGarmentAnalysis> {
  const runtimeClient = getDailyOutfitRuntimeClient();
  const resolvedImageUrl = await resolveImageUrlForRuntime(input.imageUrl);
  const route = await runtimeClient.route.resolve({
    capability: 'text.generate',
    ...(input.binding ? { binding: input.binding } : {}),
  });
  const result = await runtimeClient.ai.text.generate({
    input: [{
      role: 'user',
      content: [
        { type: 'text', text: GARMENT_ANALYSIS_PROMPT },
        { type: 'image_url', imageUrl: resolvedImageUrl, detail: 'high' },
      ],
    }],
    model: route.model || undefined,
    ...(input.binding ? { binding: input.binding } : {}),
    temperature: 0.1,
    maxTokens: 500,
  });
  return parseAnalysisResponse(String(result.text || ''), result.trace?.traceId);
}

export async function generateGarmentCutout(input: {
  imageUrl: string;
  category: DailyOutfitCategory;
  subcategory?: string;
  material?: string;
  colors: string[];
  styleTags: string[];
  binding?: RuntimeRouteBinding | null;
}): Promise<{ imageUrl: string; traceId?: string }> {
  const runtimeClient = getDailyOutfitRuntimeClient();
  const resolvedImageUrl = await resolveImageUrlForRuntime(input.imageUrl);
  const route = await runtimeClient.route.resolve({
    capability: 'image.generate',
    ...(input.binding ? { binding: input.binding } : {}),
  });
  const result = await runtimeClient.media.image.generate({
    prompt: buildCutoutPrompt(input),
    referenceImages: [resolvedImageUrl],
    responseFormat: 'base64',
    size: '1024x1024',
    quality: 'high',
    model: route.model || undefined,
    ...(input.binding ? { binding: input.binding } : {}),
  });
  const imageUrl = firstArtifactUrl(result.artifacts);
  if (!imageUrl) {
    throw new Error('DAILY_OUTFIT_CUTOUT_EMPTY');
  }
  return {
    imageUrl,
    traceId: asString(result.trace?.traceId) || undefined,
  };
}

function buildTryOnPrompt(input: {
  occasion: string;
  reasoning?: string;
}): string {
  return [
    'Create a realistic virtual try-on image using the provided reference images.',
    'Reference image 1 is the user selfie.',
    'Reference image 2 is the selected outfit board and garment composition.',
    'Dress the same person from the selfie in the exact outfit shown in the outfit board.',
    'Preserve the person identity, face, pose direction, body proportions, and overall scene realism.',
    'Match garment colors, layering order, silhouette, and styling cues from the outfit board.',
    'Do not add extra garments, props, jewelry, or accessories that are not clearly present in the outfit board.',
    'Generate a polished editorial try-on result with natural lighting and clean composition.',
    input.occasion ? `Occasion: ${input.occasion}.` : '',
    input.reasoning ? `Styling guidance: ${input.reasoning}.` : '',
  ].filter(Boolean).join(' ');
}

export async function generateOutfitTryOn(input: {
  selfieUrl: string;
  collageImageUrl: string;
  occasion: string;
  reasoning?: string;
  binding?: RuntimeRouteBinding | null;
}): Promise<{ imageUrl: string; traceId?: string }> {
  const runtimeClient = getDailyOutfitRuntimeClient();
  const selfieUrl = await resolveImageUrlForRuntime(input.selfieUrl);
  const collageImageUrl = await resolveImageUrlForRuntime(input.collageImageUrl);
  const route = await runtimeClient.route.resolve({
    capability: 'image.generate',
    ...(input.binding ? { binding: input.binding } : {}),
  });
  const result = await runtimeClient.media.image.generate({
    prompt: buildTryOnPrompt({
      occasion: input.occasion,
      reasoning: input.reasoning,
    }),
    referenceImages: [selfieUrl, collageImageUrl],
    responseFormat: 'base64',
    size: '1024x1024',
    quality: 'high',
    model: route.model || undefined,
    ...(input.binding ? { binding: input.binding } : {}),
  });
  const imageUrl = firstArtifactUrl(result.artifacts);
  if (!imageUrl) {
    throw new Error('DAILY_OUTFIT_TRYON_EMPTY');
  }
  return {
    imageUrl,
    traceId: asString(result.trace?.traceId) || undefined,
  };
}
