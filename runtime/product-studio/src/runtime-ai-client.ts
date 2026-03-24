import { createProductStudioId } from './state/store.js';
import { persistArtifactImage, resolveImageUrlForRuntime } from './image-storage.js';
import { getProductStudioRuntimeClient } from './runtime-mod.js';
import { PRODUCT_STUDIO_MOD_ID } from './contracts.js';
import type {
  ProductStudioBatchJob,
  ProductStudioErrorEnvelope,
  ProductStudioGeneratedImage,
  ProductStudioPreviewGenerationInput,
  ProductStudioPromptConfig,
  ProductStudioPromptInputImageRef,
  ProductStudioSellingPoint,
} from './types.js';

function asString(value: unknown): string {
  return String(value || '').trim();
}

function sanitizeFileName(value: string): string {
  const normalized = asString(value)
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'generated-image';
}

function extensionFromMimeType(mimeType: string): string {
  const lower = asString(mimeType).toLowerCase();
  if (lower.startsWith('image/jpeg')) return 'jpg';
  if (lower.startsWith('image/webp')) return 'webp';
  if (lower.startsWith('image/gif')) return 'gif';
  if (lower.startsWith('image/svg+xml')) return 'svg';
  return 'png';
}

function buildGeneratedOutputPathLabel(subfolder?: string): string {
  const normalized = asString(subfolder).replace(/^\/+|\/+$/g, '');
  const base = `~/.nimi/data/mod-data/${PRODUCT_STUDIO_MOD_ID}/files/images/generated`;
  return normalized ? `${base}/${normalized}/` : `${base}/`;
}

function isTimeoutMessage(value: string): boolean {
  return /\btimeout\b|\btimed out\b/iu.test(value);
}

function createErrorEnvelope(input: {
  reasonCode: string;
  actionHint: string;
  stage: string;
  message: string;
  traceId?: string;
}): ProductStudioErrorEnvelope {
  return {
    reasonCode: input.reasonCode,
    actionHint: input.actionHint,
    stage: input.stage,
    message: input.message,
    ...(input.traceId ? { traceId: input.traceId } : {}),
  };
}

function wrapAsEnvelope(
  error: unknown,
  fallback: {
    reasonCode: string;
    actionHint: string;
    stage: string;
  },
): ProductStudioErrorEnvelope {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const reasonCode = asString(record.reasonCode);
    const actionHint = asString(record.actionHint);
    const trace = record.trace && typeof record.trace === 'object' ? record.trace as Record<string, unknown> : null;
    const traceId = asString(record.traceId || record.trace_id || trace?.traceId);
    const message = error instanceof Error ? error.message : asString(record.message) || String(error);
    if (reasonCode || actionHint || traceId) {
      return createErrorEnvelope({
        reasonCode: reasonCode || fallback.reasonCode,
        actionHint: actionHint || fallback.actionHint,
        stage: fallback.stage,
        message,
        traceId: traceId || undefined,
      });
    }
  }
  const message = error instanceof Error ? error.message : String(error || fallback.reasonCode);
  return createErrorEnvelope({
    reasonCode: isTimeoutMessage(message) ? 'PS_IMAGE_GENERATE_TIMEOUT' : fallback.reasonCode,
    actionHint: fallback.actionHint,
    stage: fallback.stage,
    message,
  });
}

function buildRefinementRequest(input: {
  promptConfig: ProductStudioPromptConfig;
  sellingPoints: ProductStudioSellingPoint[];
  inputImages: ProductStudioPromptInputImageRef[];
}): { system: string; input: string } {
  const selectedSellingPoints = input.sellingPoints
    .filter((item) => item.isActive)
    .map((item) => item.text.trim())
    .filter(Boolean);
  return {
    system: [
      '把用户原话改写成一段更清楚、更完整、可直接用于生图的中文 prompt。',
      '只优化语言结构和任务表达，不要分析图片，不要补充用户没有明确提出的细节。',
      '如果用户提到图1、图2、图3或卖点数量，原样保留这些关系和数量要求。',
      '如果当前选中了卖点，只需要让最终 prompt 明确保留“需要把这些卖点自然加入画面”的要求，不要逐条扩写卖点正文。',
      '只输出 prompt 本身，必须是一段完整的话，不要解释，不要标题，不要 JSON。',
    ].join('\n'),
    input: [
      input.promptConfig.userIntent,
      selectedSellingPoints.length > 0 ? `当前已选卖点：${selectedSellingPoints.join('；')}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function normalizeRefinedPrompt(raw: string): string {
  const normalized = asString(raw)
    .replace(/^```(?:text|markdown)?/iu, '')
    .replace(/```$/u, '')
    .replace(/^<final_prompt>/iu, '')
    .replace(/<\/final_prompt>$/iu, '')
    .trim();
  return normalized;
}

function isLikelyIncompleteRefinedPrompt(value: string): boolean {
  const normalized = normalizeRefinedPrompt(value);
  if (!normalized) {
    return true;
  }
  if (/[，,、:：;；\-]\s*$/u.test(normalized)) {
    return true;
  }
  if (!/[。！？.!?）)]$/u.test(normalized)) {
    return true;
  }
  if (/保持图$/u.test(normalized) || /替换到图\d+的?$/u.test(normalized) || /加入\d+个?$/u.test(normalized)) {
    return true;
  }
  return false;
}

async function resolveRuntimeInputImages(inputImages: ProductStudioPromptInputImageRef[]): Promise<ProductStudioPromptInputImageRef[]> {
  return await Promise.all(inputImages.map(async (image) => ({
    ...image,
    fileUrl: await resolveImageUrlForRuntime(image.fileUrl),
  })));
}

function buildExecutionPrompt(actualPrompt: string, appliedSellingPoints: string[]): string {
  const prompt = asString(actualPrompt);
  const selectedSellingPoints = appliedSellingPoints
    .map((item) => asString(item))
    .filter(Boolean);
  if (selectedSellingPoints.length === 0) {
    return prompt;
  }
  return [
    prompt,
    '',
    '请将以下卖点自然整合进画面中的文案或版式表达：',
    ...selectedSellingPoints.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n');
}

export async function refineProductStudioPrompt(input: {
  promptConfig: ProductStudioPromptConfig;
  sellingPoints: ProductStudioSellingPoint[];
  inputImages: ProductStudioPromptInputImageRef[];
}): Promise<{ refinedPrompt: string; traceId?: string }> {
  const runtimeClient = getProductStudioRuntimeClient();
  try {
    const route = await runtimeClient.route.resolve({ capability: 'text.generate' });
    const refinementRequest = buildRefinementRequest({
      promptConfig: input.promptConfig,
      sellingPoints: input.sellingPoints,
      inputImages: input.inputImages,
    });
    const result = await runtimeClient.ai.text.generate({
      input: refinementRequest.input,
      system: refinementRequest.system,
      model: asString(input.promptConfig.promptOptimizeModel) || route.model || undefined,
      temperature: 0,
      maxTokens: 1200,
    });
    let refinedPrompt = normalizeRefinedPrompt(result.text);
    const traceId = asString(result.trace?.traceId) || undefined;
    if (result.finishReason === 'length' || isLikelyIncompleteRefinedPrompt(refinedPrompt)) {
      const preview = refinedPrompt.slice(0, 160);
      throw createErrorEnvelope({
        reasonCode: 'PS_PROMPT_REFINE_FAILED',
        actionHint: 'retry_with_shorter_or_clearer_intent',
        stage: 'prompt-ai-refine',
        message: `Prompt refinement returned an incomplete result${result.finishReason ? ` (${result.finishReason})` : ''}${preview ? `: ${preview}` : ''}.`,
        traceId,
      });
    }
    if (!refinedPrompt) {
      throw new Error('PRODUCT_STUDIO_PROMPT_EMPTY');
    }
    return {
      refinedPrompt,
      traceId,
    };
  } catch (error) {
    throw wrapAsEnvelope(error, {
      reasonCode: 'PS_PROMPT_REFINE_FAILED',
      actionHint: 'edit_prompt_manually',
      stage: 'prompt-ai-refine',
    });
  }
}

async function generateProductStudioImageArtifact(input: {
  actualPrompt: string;
  generationMode: ProductStudioPreviewGenerationInput['generationMode'];
  imageGenerateModel?: string;
  inputImages: ProductStudioPromptInputImageRef[];
  appliedSellingPoints: string[];
  outputSubfolder?: string;
}) {
  const runtimeClient = getProductStudioRuntimeClient();
  let resolvedInputImages: ProductStudioPromptInputImageRef[] = [];
  try {
    resolvedInputImages = await resolveRuntimeInputImages(input.inputImages);
  } catch (error) {
    throw wrapAsEnvelope(error, {
      reasonCode: 'PS_SCENE_IMAGE_LOAD_FAILED',
      actionHint: 'reselect_or_reupload_input_images',
      stage: 'gen-confirm-params',
    });
  }

  if (input.generationMode === 'multimodal' && resolvedInputImages.length === 0) {
    throw createErrorEnvelope({
      reasonCode: 'PS_NO_IMAGES_FOR_MULTIMODAL',
      actionHint: 'attach_at_least_one_image',
      stage: 'gen-confirm-params',
      message: 'Multimodal execution requires at least one input image.',
    });
  }

  let route;
  try {
    route = await runtimeClient.route.resolve({ capability: 'image.generate' });
  } catch (error) {
    throw wrapAsEnvelope(error, {
      reasonCode: 'PS_ROUTE_NO_IMAGE_PROVIDER',
      actionHint: 'configure_image_provider_route',
      stage: 'gen-execute',
    });
  }

  try {
    const startedAt = Date.now();
    const executionPrompt = buildExecutionPrompt(input.actualPrompt, input.appliedSellingPoints);
    const result = await runtimeClient.media.image.generate({
      prompt: executionPrompt,
      ...(input.generationMode === 'multimodal' ? { referenceImages: resolvedInputImages.map((image) => image.fileUrl) } : {}),
      responseFormat: 'base64',
      size: '1536x1536',
      quality: 'high',
      model: asString(input.imageGenerateModel) || route.model || undefined,
    });
    const artifact = result.artifacts[0];
    if (!artifact) {
      throw new Error('PRODUCT_STUDIO_IMAGE_ARTIFACT_EMPTY');
    }
    return {
      fileUrl: await persistArtifactImage({ artifact, bucket: 'generated', subfolder: input.outputSubfolder }),
      generationTimeMs: Date.now() - startedAt,
      traceId: asString(result.trace?.traceId) || undefined,
    };
  } catch (error) {
    throw wrapAsEnvelope(error, {
      reasonCode: 'PS_IMAGE_GENERATE_FAILED',
      actionHint: 'retry_image_generation',
      stage: 'gen-execute',
    });
  }
}

export async function generateProductStudioPreview(input: ProductStudioPreviewGenerationInput): Promise<ProductStudioGeneratedImage> {
  const executionPrompt = buildExecutionPrompt(input.actualPrompt, input.appliedSellingPoints);
  const generated = await generateProductStudioImageArtifact({
    actualPrompt: input.actualPrompt,
    generationMode: input.generationMode,
    imageGenerateModel: input.imageGenerateModel,
    inputImages: input.inputImages,
    appliedSellingPoints: input.appliedSellingPoints,
    outputSubfolder: input.outputSubfolder,
  });

  return {
    id: createProductStudioId('gen'),
    projectId: input.projectId,
    promptConfigId: input.promptConfigId,
    sourceSceneImageId: input.sourceSceneImageId,
    generationMode: input.generationMode,
    fileUrl: generated.fileUrl,
    title: input.title,
    actualPrompt: executionPrompt,
    inputImageSnapshot: input.inputImages,
    appliedSellingPoints: input.appliedSellingPoints,
    status: 'success',
    generationTimeMs: generated.generationTimeMs,
    traceId: generated.traceId,
    createdAt: new Date().toISOString(),
  };
}

function appendBatchSourceInputImage(
  inputImages: ProductStudioPromptInputImageRef[],
  batchSourceImage: ProductStudioPromptInputImageRef,
): ProductStudioPromptInputImageRef[] {
  return [
    ...inputImages.filter((image) => !(image.sourceType === batchSourceImage.sourceType && image.sourceId === batchSourceImage.sourceId)),
    batchSourceImage,
  ];
}

type ProductStudioBatchRunController = {
  isPaused(): boolean;
  isCancelled(): boolean;
  waitWhilePaused(): Promise<void>;
  onProviderJobId?(jobId: string): void;
};

async function waitForScenarioJob(jobId: string, controller?: ProductStudioBatchRunController): Promise<void> {
  const runtimeClient = getProductStudioRuntimeClient();
  const terminalStatuses = new Set([4, 5, 6, 7]);
  if (controller?.isCancelled()) {
    await runtimeClient.media.jobs.cancel({ jobId, reason: 'product_studio_user_cancelled' }).catch(() => undefined);
    throw new Error('PRODUCT_STUDIO_JOB_CANCELLED');
  }
  let currentJob = await runtimeClient.media.jobs.get(jobId);
  if (terminalStatuses.has(Number(currentJob.status))) {
    if (Number(currentJob.status) !== 4) {
      throw new Error(asString(currentJob.reasonDetail || currentJob.reasonCode) || 'PRODUCT_STUDIO_JOB_FAILED');
    }
    return;
  }
  const stream = await runtimeClient.media.jobs.subscribe(jobId);
  for await (const event of stream) {
    if (controller?.isCancelled()) {
      await runtimeClient.media.jobs.cancel({ jobId, reason: 'product_studio_user_cancelled' }).catch(() => undefined);
      throw new Error('PRODUCT_STUDIO_JOB_CANCELLED');
    }
    currentJob = event.job || currentJob;
    if (!terminalStatuses.has(Number(currentJob.status))) {
      continue;
    }
    if (Number(currentJob.status) !== 4) {
      throw new Error(asString(currentJob.reasonDetail || currentJob.reasonCode) || 'PRODUCT_STUDIO_JOB_FAILED');
    }
    return;
  }
  currentJob = await runtimeClient.media.jobs.get(jobId);
  if (Number(currentJob.status) !== 4) {
    throw new Error(asString(currentJob.reasonDetail || currentJob.reasonCode) || 'PRODUCT_STUDIO_JOB_FAILED');
  }
}

export async function runProductStudioBatchGeneration(input: {
  batchJobId?: string;
  projectId: string;
  promptConfig: ProductStudioPromptConfig;
  promptText: string;
  appliedSellingPoints: ProductStudioSellingPoint[];
  baseInputImages: ProductStudioPromptInputImageRef[];
  sourceRuns: Array<{ sourceId: string; sourceRef: ProductStudioPromptInputImageRef; title: string }>;
  variantCount: number;
  outputSubfolder?: string;
  controller?: ProductStudioBatchRunController;
  onProgress?: (payload: {
    batchJob: ProductStudioBatchJob;
    generatedImage?: ProductStudioGeneratedImage;
  }) => void;
}): Promise<{
  batchJob: ProductStudioBatchJob;
  generatedImages: ProductStudioGeneratedImage[];
  blockingError?: ProductStudioErrorEnvelope;
}> {
  const runtimeClient = getProductStudioRuntimeClient();
  const createdAt = new Date().toISOString();
  const batchJobId = input.batchJobId || createProductStudioId('batch');
  const batchMode = input.promptConfig.generationMode;
  const hasSourceRuns = input.sourceRuns.length > 0;
  const runCount = batchMode === 'multimodal'
    ? (hasSourceRuns ? input.sourceRuns.length : input.variantCount)
    : input.variantCount;
  const generatedImages: ProductStudioGeneratedImage[] = [];
  const logs: string[] = [];
  let completedCount = 0;
  let failedCount = 0;
  let lastTraceId = '';
  const buildBatchJob = (): ProductStudioBatchJob => ({
    id: batchJobId,
    projectId: input.projectId,
    promptConfigId: input.promptConfig.id,
    title: batchMode === 'multimodal'
      ? (hasSourceRuns ? 'Batch Source Run' : 'Fixed Input Variant Run')
      : 'Prompt Variant Run',
    status: input.controller?.isCancelled()
      ? 'CANCELLED'
      : completedCount + failedCount < runCount
        ? (input.controller?.isPaused() ? 'PAUSED' : 'RUNNING')
        : failedCount > 0
          ? 'PARTIAL_COMPLETED'
          : 'COMPLETED',
    totalCount: runCount,
    completedCount,
    failedCount,
    concurrency: 1,
    sceneImageIds: input.sourceRuns.map((item) => item.sourceId),
    batchSize: !hasSourceRuns ? input.variantCount : undefined,
    createdAt,
    startedAt: createdAt,
    completedAt: completedCount + failedCount >= runCount || input.controller?.isCancelled() ? new Date().toISOString() : undefined,
    logs: [...logs],
    traceId: lastTraceId || undefined,
    outputDirectoryKey: input.outputSubfolder,
    outputDirectoryLabel: buildGeneratedOutputPathLabel(input.outputSubfolder),
  });

  input.onProgress?.({ batchJob: buildBatchJob() });

  for (let index = 0; index < runCount; index += 1) {
    if (input.controller?.isCancelled()) {
      logs.push('Batch cancelled by user.');
      break;
    }
    await input.controller?.waitWhilePaused();
    if (input.controller?.isCancelled()) {
      logs.push('Batch cancelled by user.');
      break;
    }
    const sourceRun = batchMode === 'multimodal' && hasSourceRuns ? input.sourceRuns[index] : null;
    const inputImages = batchMode === 'multimodal'
      ? (sourceRun ? appendBatchSourceInputImage(input.baseInputImages, sourceRun.sourceRef) : input.baseInputImages)
      : [];
    try {
      const resolvedInputImages = await resolveRuntimeInputImages(inputImages);
      const route = await runtimeClient.route.resolve({ capability: 'image.generate' });
      const executionPrompt = buildExecutionPrompt(
        input.promptText,
        input.appliedSellingPoints.filter((item) => item.isActive).map((item) => item.text),
      );
      const job = await runtimeClient.media.jobs.submit({
        modal: 'image',
        input: {
          prompt: executionPrompt,
          ...(batchMode === 'multimodal' ? { referenceImages: resolvedInputImages.map((image) => image.fileUrl) } : {}),
          responseFormat: 'base64',
          size: '1536x1536',
          quality: 'high',
          model: asString(input.promptConfig.imageGenerateModel) || route.model || undefined,
        },
      });
      const jobId = asString(job.jobId);
      input.controller?.onProviderJobId?.(jobId);
      await waitForScenarioJob(jobId, input.controller);
      const artifactsResponse = await runtimeClient.media.jobs.getArtifacts(jobId);
      const artifact = artifactsResponse.artifacts[0];
      if (!artifact) {
        throw new Error('PRODUCT_STUDIO_JOB_ARTIFACT_EMPTY');
      }
      const fileUrl = await persistArtifactImage({ artifact, bucket: 'generated', subfolder: input.outputSubfolder });
      const outputFileName = `${sanitizeFileName(sourceRun?.title || `variant-${index + 1}`)}-${Date.now().toString(36)}.${extensionFromMimeType(artifact.mimeType)}`;
      lastTraceId = asString(artifactsResponse.traceId || job.traceId) || lastTraceId;
      completedCount += 1;
      generatedImages.push({
        id: createProductStudioId('gen'),
        projectId: input.projectId,
        batchJobId,
        promptConfigId: input.promptConfig.id,
        sourceSceneImageId: sourceRun?.sourceRef.sourceType === 'scene' ? sourceRun.sourceId : undefined,
        generationMode: batchMode,
        fileUrl,
        title: sourceRun?.title || `Variant ${index + 1}`,
        actualPrompt: executionPrompt,
        inputImageSnapshot: inputImages,
        appliedSellingPoints: input.appliedSellingPoints.filter((item) => item.isActive).map((item) => item.text),
        status: 'success',
        traceId: lastTraceId || undefined,
        createdAt: new Date().toISOString(),
        outputDirectoryKey: input.outputSubfolder,
        outputDirectoryLabel: buildGeneratedOutputPathLabel(input.outputSubfolder),
        outputFileName,
      });
      logs.push(batchMode === 'multimodal'
        ? `${sourceRun?.title || `Source ${index + 1}`} completed`
        : `Variant ${index + 1} completed`);
      input.onProgress?.({
        batchJob: buildBatchJob(),
        generatedImage: generatedImages[generatedImages.length - 1],
      });
    } catch (error) {
      if (asString(error instanceof Error ? error.message : error).includes('JOB_CANCELLED')) {
        logs.push('Batch cancelled by user.');
        break;
      }
      failedCount += 1;
      const envelope = wrapAsEnvelope(error, {
        reasonCode: 'PS_IMAGE_GENERATE_FAILED',
        actionHint: 'retry_image_generation',
        stage: 'gen-execute',
      });
      logs.push(batchMode === 'multimodal'
        ? `${sourceRun?.title || `Source ${index + 1}`} failed: ${envelope.reasonCode}`
        : `Variant ${index + 1} failed: ${envelope.reasonCode}`);
      input.onProgress?.({ batchJob: buildBatchJob() });
    }
  }

  const batchJob = buildBatchJob();
  input.onProgress?.({ batchJob });

  return {
    batchJob,
    generatedImages,
    ...(completedCount === 0 && failedCount > 0
      ? {
          blockingError: createErrorEnvelope({
            reasonCode: 'PS_BATCH_ALL_FAILED',
            actionHint: 'retry_failed_batch_items',
            stage: 'batch-summary',
            message: 'Every batch item failed.',
            traceId: lastTraceId || undefined,
          }),
        }
      : {}),
  };
}
