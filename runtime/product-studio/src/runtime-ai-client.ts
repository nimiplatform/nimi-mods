import { createProductStudioId } from './state/store.js';
import { persistArtifactImage, resolveImageUrlForRuntime } from './image-storage.js';
import { getProductStudioRuntimeClient } from './runtime-mod.js';
import type {
  ProductStudioBatchJob,
  ProductStudioErrorEnvelope,
  ProductStudioGeneratedImage,
  ProductStudioPreviewGenerationInput,
  ProductStudioPromptConfig,
  ProductStudioPromptInputImageRef,
  ProductStudioSellingPoint,
} from './types.js';

type ProductStudioTextMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; imageUrl: string; detail?: 'auto' | 'low' | 'high' };

type ProductStudioTextMessage = {
  role: 'user';
  content: ProductStudioTextMessageContentPart[];
};

function asString(value: unknown): string {
  return String(value || '').trim();
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
}): ProductStudioTextMessage[] {
  const sellingPointText = input.sellingPoints
    .filter((item) => item.isActive)
    .map((item, index) => `${index + 1}. [${item.category}] ${item.text}`)
    .join('\n');
  const imageNotes = input.inputImages
    .map((image, index) => {
      const role = image.sourceType === 'reference'
        ? '参考产品图'
        : image.sourceType === 'scene'
          ? '场景图'
          : '附加图片';
      return `图${index + 1} (${role}): ${image.label || image.sourceType}`;
    })
    .join('\n');

  const content: ProductStudioTextMessageContentPart[] = [
    {
      type: 'text',
      text: [
        '你是资深电商产品图 prompt 工程师，目标是把用户意图整理成一段可以直接用于图像生成的最终 prompt。',
        `当前模式: ${input.promptConfig.generationMode}.`,
        `用户原始意图: ${input.promptConfig.userIntent}`,
        imageNotes ? `输入图片说明:\n${imageNotes}` : '输入图片说明: 无',
        sellingPointText ? `可用卖点:\n${sellingPointText}` : '可用卖点: 无',
        '核心要求:',
        '1. 优先理解并执行“用户意图”，不要把任务退化成对输入图片内容的客观描述。',
        '2. 输入图片是约束和素材来源，不是让你逐张反向描述图片。',
        '3. 如果用户在描述里提到“替换”“保留原场景/构图”“把图1产品放到图2”等操作，必须把这些操作关系明确写进最终 prompt。',
        '4. 如果存在参考产品图和场景图，要把 prompt 写成“将参考产品自然整合/替换到目标场景”的执行型指令，而不是分别描述两张图长什么样。',
        '5. 如果用户提到卖点、文案、copy、文字布局等要求，要从可用卖点中挑选最合适的内容，并明确这些文案如何进入画面版式；如果用户没要求文案上画面，就只把卖点作为视觉语义参考，不强行做成大段文字。',
        '6. 最终 prompt 必须保留高级电商视觉、清晰产品层级、合理留白、真实材质与光影，并避免竞品品牌残留。',
        '输出规则:',
        '1. 只输出最终 prompt 本体，不要解释，不要加标题，不要返回 JSON。',
        '2. 使用完整、明确、可执行的描述，避免空泛形容词堆砌。',
        '3. 输出语言默认跟随用户原始意图的语言；用户用中文，就输出中文 prompt；用户用英文，就输出英文 prompt。',
        '4. 不要逐条罗列图片里看到了什么，不要写成图片理解报告。',
        '5. 如果用户意图是“替换产品”“保留构图”“加入卖点”，这些动作必须在最终 prompt 中明确体现。',
      ].join('\n\n'),
    },
  ];
  for (const image of input.inputImages) {
    content.push({
      type: 'image_url',
      imageUrl: image.fileUrl,
      detail: 'high',
    });
  }

  return [
    {
      role: 'user',
      content,
    },
  ] as ProductStudioTextMessage[];
}

async function resolveRuntimeInputImages(inputImages: ProductStudioPromptInputImageRef[]): Promise<ProductStudioPromptInputImageRef[]> {
  return await Promise.all(inputImages.map(async (image) => ({
    ...image,
    fileUrl: await resolveImageUrlForRuntime(image.fileUrl),
  })));
}

function orderMultimodalInputImages(inputImages: ProductStudioPromptInputImageRef[]): ProductStudioPromptInputImageRef[] {
  const priority = (sourceType: ProductStudioPromptInputImageRef['sourceType']) => {
    switch (sourceType) {
      case 'scene':
        return 0;
      case 'reference':
        return 1;
      default:
        return 2;
    }
  };
  return [...inputImages].sort((left, right) => priority(left.sourceType) - priority(right.sourceType));
}

export async function refineProductStudioPrompt(input: {
  promptConfig: ProductStudioPromptConfig;
  sellingPoints: ProductStudioSellingPoint[];
  inputImages: ProductStudioPromptInputImageRef[];
}): Promise<{ refinedPrompt: string; traceId?: string }> {
  const runtimeClient = getProductStudioRuntimeClient();
  const resolvedInputImages = await resolveRuntimeInputImages(input.inputImages);
  try {
    const route = await runtimeClient.route.resolve({ capability: 'text.generate' });
    const result = await runtimeClient.ai.text.generate({
      input: buildRefinementRequest({
        promptConfig: input.promptConfig,
        sellingPoints: input.sellingPoints,
        inputImages: resolvedInputImages,
      }),
      model: asString(input.promptConfig.promptOptimizeModel) || route.model || undefined,
      temperature: 0.4,
      maxTokens: 500,
    });
    const refinedPrompt = asString(result.text);
    if (!refinedPrompt) {
      throw new Error('PRODUCT_STUDIO_PROMPT_EMPTY');
    }
    return {
      refinedPrompt,
      traceId: asString(result.trace?.traceId) || undefined,
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
    const result = await runtimeClient.media.image.generate({
      prompt: input.actualPrompt,
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
      fileUrl: await persistArtifactImage({ artifact, bucket: 'generated' }),
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
  const generated = await generateProductStudioImageArtifact({
    actualPrompt: input.actualPrompt,
    generationMode: input.generationMode,
    imageGenerateModel: input.imageGenerateModel,
    inputImages: input.inputImages,
  });

  return {
    id: createProductStudioId('gen'),
    projectId: input.projectId,
    promptConfigId: input.promptConfigId,
    sourceSceneImageId: input.sourceSceneImageId,
    generationMode: input.generationMode,
    fileUrl: generated.fileUrl,
    title: input.title,
    actualPrompt: input.actualPrompt,
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
      const job = await runtimeClient.media.jobs.submit({
        modal: 'image',
        input: {
          prompt: input.promptText,
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
      const fileUrl = await persistArtifactImage({ artifact, bucket: 'generated' });
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
        actualPrompt: input.promptText,
        inputImageSnapshot: inputImages,
        appliedSellingPoints: input.appliedSellingPoints.filter((item) => item.isActive).map((item) => item.text),
        status: 'success',
        traceId: lastTraceId || undefined,
        createdAt: new Date().toISOString(),
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
