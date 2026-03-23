export type ProductStudioProjectStatus = 'active' | 'archived';
export type ProductStudioGenerationMode = 'multimodal' | 'text-to-image';
export type ProductStudioSellingPointCategory = 'product' | 'store';
export type ProductStudioSceneStatus = 'pending' | 'used' | 'skipped';
export type ProductStudioPromptInputSourceType = 'reference' | 'scene' | 'ephemeral';
export type ProductStudioBatchStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'PARTIAL_COMPLETED';
export type ProductStudioGeneratedImageStatus = 'generating' | 'success' | 'failed' | 'discarded';

export type ProductStudioPromptInputImageRef = {
  sourceType: ProductStudioPromptInputSourceType;
  sourceId?: string;
  fileUrl: string;
  label?: string;
};

export type ProductStudioProject = {
  id: string;
  name: string;
  description: string;
  status: ProductStudioProjectStatus;
  heroImageUrl: string;
  accentStart: string;
  accentEnd: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductStudioReferenceImage = {
  id: string;
  projectId: string;
  fileUrl: string;
  label: string;
  note: string;
  isDefault: boolean;
  createdAt: string;
};

export type ProductStudioSceneImage = {
  id: string;
  projectId: string;
  fileUrl: string;
  sourceLabel: string;
  note: string;
  status: ProductStudioSceneStatus;
  createdAt: string;
};

export type ProductStudioSellingPoint = {
  id: string;
  projectId: string;
  category: ProductStudioSellingPointCategory;
  text: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
};

export type ProductStudioPromptConfig = {
  id: string;
  projectId: string;
  name: string;
  generationMode: ProductStudioGenerationMode;
  promptOptimizeModel?: string;
  imageGenerateModel?: string;
  userIntent: string;
  attachedImages: ProductStudioPromptInputImageRef[];
  refinedPrompt: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductStudioBatchJob = {
  id: string;
  projectId: string;
  promptConfigId: string;
  title: string;
  status: ProductStudioBatchStatus;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  concurrency: number;
  sceneImageIds: string[];
  batchSize?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  logs: string[];
  traceId?: string;
};

export type ProductStudioGeneratedImage = {
  id: string;
  projectId: string;
  batchJobId?: string;
  promptConfigId: string;
  sourceSceneImageId?: string;
  generationMode: ProductStudioGenerationMode;
  fileUrl: string;
  title: string;
  actualPrompt: string;
  inputImageSnapshot: ProductStudioPromptInputImageRef[];
  appliedSellingPoints: string[];
  status: ProductStudioGeneratedImageStatus;
  errorMessage?: string;
  generationTimeMs?: number;
  rating?: number;
  traceId?: string;
  createdAt: string;
};

export type ProductStudioSnapshot = {
  version: 1;
  projects: ProductStudioProject[];
  referenceImages: ProductStudioReferenceImage[];
  sceneImages: ProductStudioSceneImage[];
  sellingPoints: ProductStudioSellingPoint[];
  promptConfigs: ProductStudioPromptConfig[];
  batchJobs: ProductStudioBatchJob[];
  generatedImages: ProductStudioGeneratedImage[];
};

export type ProductStudioProjectBundle = {
  project: ProductStudioProject;
  referenceImages: ProductStudioReferenceImage[];
  sceneImages: ProductStudioSceneImage[];
  sellingPoints: ProductStudioSellingPoint[];
  promptConfigs: ProductStudioPromptConfig[];
  batchJobs: ProductStudioBatchJob[];
  generatedImages: ProductStudioGeneratedImage[];
};

export type ProductStudioErrorEnvelope = {
  reasonCode: string;
  actionHint: string;
  stage: string;
  message: string;
  traceId?: string;
};

export type ProductStudioPreviewGenerationInput = {
  projectId: string;
  promptConfigId: string;
  generationMode: ProductStudioGenerationMode;
  imageGenerateModel?: string;
  actualPrompt: string;
  inputImages: ProductStudioPromptInputImageRef[];
  appliedSellingPoints: string[];
  title: string;
  sourceSceneImageId?: string;
};
