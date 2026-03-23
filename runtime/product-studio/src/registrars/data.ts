import { type HookClient } from '@nimiplatform/sdk/mod';
import {
  PRODUCT_STUDIO_DATA_API_BATCHES_GET,
  PRODUCT_STUDIO_DATA_API_BATCHES_LIST,
  PRODUCT_STUDIO_DATA_API_BATCHES_UPSERT,
  PRODUCT_STUDIO_DATA_API_GALLERY_GET,
  PRODUCT_STUDIO_DATA_API_GALLERY_LIST,
  PRODUCT_STUDIO_DATA_API_GALLERY_RATE,
  PRODUCT_STUDIO_DATA_API_GALLERY_UPSERT,
  PRODUCT_STUDIO_DATA_API_PROJECTS_CREATE,
  PRODUCT_STUDIO_DATA_API_PROJECTS_GET,
  PRODUCT_STUDIO_DATA_API_PROJECTS_LIST,
  PRODUCT_STUDIO_DATA_API_PROJECTS_UPDATE,
  PRODUCT_STUDIO_DATA_API_PROMPTS_GET,
  PRODUCT_STUDIO_DATA_API_PROMPTS_LIST,
  PRODUCT_STUDIO_DATA_API_PROMPTS_UPSERT,
  PRODUCT_STUDIO_DATA_API_REFERENCES_LIST,
  PRODUCT_STUDIO_DATA_API_REFERENCES_UPSERT,
  PRODUCT_STUDIO_DATA_API_SCENES_LIST,
  PRODUCT_STUDIO_DATA_API_SCENES_UPSERT,
  PRODUCT_STUDIO_DATA_API_SELLING_POINTS_LIST,
  PRODUCT_STUDIO_DATA_API_SELLING_POINTS_UPSERT,
} from '../contracts.js';
import {
  addProductStudioGeneratedImage,
  createProductStudioProject,
  getProductStudioProjectBundle,
  getProductStudioSnapshot,
  listProductStudioProjectBundles,
  replaceProductStudioReferenceImages,
  replaceProductStudioSceneImages,
  replaceProductStudioSellingPoints,
  upsertProductStudioProject,
  upsertProductStudioBatchJob,
  upsertProductStudioPromptConfig,
} from '../state/store.js';
import type {
  ProductStudioBatchJob,
  ProductStudioGeneratedImage,
  ProductStudioPromptConfig,
  ProductStudioProject,
  ProductStudioReferenceImage,
  ProductStudioSceneImage,
  ProductStudioSellingPoint,
} from '../types.js';

function readStringField(input: unknown, key: string): string {
  if (!input || typeof input !== 'object') {
    return '';
  }
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function readObjectField<T extends Record<string, unknown>>(input: unknown, key: string): T | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const value = (input as Record<string, unknown>)[key];
  return value && typeof value === 'object' ? value as T : null;
}

function readArrayField<T>(input: unknown, key: string): T[] {
  if (!input || typeof input !== 'object') {
    return [];
  }
  const value = (input as Record<string, unknown>)[key];
  return Array.isArray(value) ? value as T[] : [];
}

export async function registerProductStudioDataCapabilities(input: {
  hookClient: HookClient;
}): Promise<void> {
  const register = async (capability: string, handler: (query: unknown) => Promise<unknown> | unknown) => {
    await input.hookClient.data.register({
      capability,
      handler,
    });
  };

  await register(PRODUCT_STUDIO_DATA_API_PROJECTS_LIST, async () => listProductStudioProjectBundles());
  await register(PRODUCT_STUDIO_DATA_API_PROJECTS_GET, async (query) => getProductStudioProjectBundle(readStringField(query, 'projectId')));
  await register(PRODUCT_STUDIO_DATA_API_PROJECTS_CREATE, async (query) => createProductStudioProject({ name: readStringField(query, 'name') }));
  await register(PRODUCT_STUDIO_DATA_API_PROJECTS_UPDATE, async (query) => {
    const project = readObjectField<ProductStudioProject>(query, 'project');
    if (!project) {
      throw new Error('PRODUCT_STUDIO_PROJECT_REQUIRED');
    }
    return upsertProductStudioProject(project);
  });

  await register(PRODUCT_STUDIO_DATA_API_REFERENCES_LIST, async (query) => (
    getProductStudioSnapshot().referenceImages.filter((item) => item.projectId === readStringField(query, 'projectId'))
  ));
  await register(PRODUCT_STUDIO_DATA_API_REFERENCES_UPSERT, async (query) => {
    const projectId = readStringField(query, 'projectId');
    const referenceImages = readArrayField<ProductStudioReferenceImage>(query, 'referenceImages');
    replaceProductStudioReferenceImages(projectId, referenceImages);
    return getProductStudioSnapshot().referenceImages.filter((item) => item.projectId === projectId);
  });

  await register(PRODUCT_STUDIO_DATA_API_SCENES_LIST, async (query) => (
    getProductStudioSnapshot().sceneImages.filter((item) => item.projectId === readStringField(query, 'projectId'))
  ));
  await register(PRODUCT_STUDIO_DATA_API_SCENES_UPSERT, async (query) => {
    const projectId = readStringField(query, 'projectId');
    const sceneImages = readArrayField<ProductStudioSceneImage>(query, 'sceneImages');
    replaceProductStudioSceneImages(projectId, sceneImages);
    return getProductStudioSnapshot().sceneImages.filter((item) => item.projectId === projectId);
  });

  await register(PRODUCT_STUDIO_DATA_API_SELLING_POINTS_LIST, async (query) => (
    getProductStudioSnapshot().sellingPoints.filter((item) => item.projectId === readStringField(query, 'projectId'))
  ));
  await register(PRODUCT_STUDIO_DATA_API_SELLING_POINTS_UPSERT, async (query) => {
    const projectId = readStringField(query, 'projectId');
    const sellingPoints = readArrayField<ProductStudioSellingPoint>(query, 'sellingPoints');
    replaceProductStudioSellingPoints(projectId, sellingPoints);
    return getProductStudioSnapshot().sellingPoints.filter((item) => item.projectId === projectId);
  });

  await register(PRODUCT_STUDIO_DATA_API_PROMPTS_LIST, async (query) => (
    getProductStudioSnapshot().promptConfigs.filter((item) => item.projectId === readStringField(query, 'projectId'))
  ));
  await register(PRODUCT_STUDIO_DATA_API_PROMPTS_GET, async (query) => (
    getProductStudioSnapshot().promptConfigs.find((item) => item.id === readStringField(query, 'promptConfigId')) || null
  ));
  await register(PRODUCT_STUDIO_DATA_API_PROMPTS_UPSERT, async (query) => {
    const promptConfig = readObjectField<ProductStudioPromptConfig>(query, 'promptConfig');
    if (!promptConfig) {
      throw new Error('PRODUCT_STUDIO_PROMPT_CONFIG_REQUIRED');
    }
    return upsertProductStudioPromptConfig(promptConfig);
  });

  await register(PRODUCT_STUDIO_DATA_API_BATCHES_LIST, async (query) => (
    getProductStudioSnapshot().batchJobs.filter((item) => item.projectId === readStringField(query, 'projectId'))
  ));
  await register(PRODUCT_STUDIO_DATA_API_BATCHES_GET, async (query) => (
    getProductStudioSnapshot().batchJobs.find((item) => item.id === readStringField(query, 'batchJobId')) || null
  ));
  await register(PRODUCT_STUDIO_DATA_API_BATCHES_UPSERT, async (query) => {
    const batchJob = readObjectField<ProductStudioBatchJob>(query, 'batchJob');
    if (!batchJob) {
      throw new Error('PRODUCT_STUDIO_BATCH_JOB_REQUIRED');
    }
    upsertProductStudioBatchJob(batchJob);
    return batchJob;
  });

  await register(PRODUCT_STUDIO_DATA_API_GALLERY_LIST, async (query) => (
    getProductStudioSnapshot().generatedImages.filter((item) => item.projectId === readStringField(query, 'projectId'))
  ));
  await register(PRODUCT_STUDIO_DATA_API_GALLERY_GET, async (query) => (
    getProductStudioSnapshot().generatedImages.find((item) => item.id === readStringField(query, 'generatedImageId')) || null
  ));
  await register(PRODUCT_STUDIO_DATA_API_GALLERY_UPSERT, async (query) => {
    const generatedImage = readObjectField<ProductStudioGeneratedImage>(query, 'generatedImage');
    if (!generatedImage) {
      throw new Error('PRODUCT_STUDIO_GENERATED_IMAGE_REQUIRED');
    }
    addProductStudioGeneratedImage(generatedImage);
    return generatedImage;
  });
  await register(PRODUCT_STUDIO_DATA_API_GALLERY_RATE, async (query) => {
    const generatedImageId = readStringField(query, 'generatedImageId');
    const rating = Number((query as Record<string, unknown> | null)?.rating);
    const snapshot = getProductStudioSnapshot();
    const target = snapshot.generatedImages.find((item) => item.id === generatedImageId);
    if (!target) {
      return null;
    }
    const nextImage: ProductStudioGeneratedImage = {
      ...target,
      rating: Number.isFinite(rating) ? Math.max(1, Math.min(5, Math.round(rating))) : target.rating,
    };
    addProductStudioGeneratedImage(nextImage);
    return nextImage;
  });
}
