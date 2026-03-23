import { createProductStudioArtwork } from '../demo-artwork.js';
import type {
  ProductStudioBatchJob,
  ProductStudioGeneratedImage,
  ProductStudioProject,
  ProductStudioProjectBundle,
  ProductStudioPromptConfig,
  ProductStudioReferenceImage,
  ProductStudioSceneImage,
  ProductStudioSellingPoint,
  ProductStudioSnapshot,
} from '../types.js';
import { loadProductStudioSnapshot, persistProductStudioSnapshot } from './indexed-db.js';

type ProductStudioStoreState = {
  snapshot: ProductStudioSnapshot | null;
};

const listeners = new Set<() => void>();
const state: ProductStudioStoreState = {
  snapshot: null,
};
const EMPTY_PRODUCT_STUDIO_SNAPSHOT: ProductStudioSnapshot = {
  version: 1,
  projects: [],
  referenceImages: [],
  sceneImages: [],
  sellingPoints: [],
  promptConfigs: [],
  batchJobs: [],
  generatedImages: [],
};

let hydrationPromise: Promise<ProductStudioSnapshot> | null = null;
let persistChain: Promise<void> = Promise.resolve();

function nowIso(): string {
  return new Date().toISOString();
}

export function createProductStudioId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneSnapshot(snapshot: ProductStudioSnapshot): ProductStudioSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as ProductStudioSnapshot;
}

function demoArtwork(key: string): string {
  switch (key) {
    case 'aurora-hero':
      return createProductStudioArtwork('Hero 01', 'Refined skin-care visual', '#0f172a', '#5c90ff');
    case 'aurora-poster':
      return createProductStudioArtwork('Hero 03', 'Premium launch variant', '#182232', '#7d93ff');
    case 'nova-hero':
      return createProductStudioArtwork('Nova', 'Filtered hydration campaign', '#132034', '#6ab6ff');
    case 'luma-hero':
      return createProductStudioArtwork('Luma', 'Quiet fragrance capsule', '#2f1b21', '#d28f7e');
    case 'aurora-ref-1':
      return createProductStudioArtwork('Ref 01', 'Ceramic bottle, front angle', '#20273a', '#497cff');
    case 'aurora-ref-2':
      return createProductStudioArtwork('Ref 02', 'Dropper bottle, shadow study', '#16213a', '#5ea2ff');
    case 'aurora-scene-1':
      return createProductStudioArtwork('Marble', 'Editorial countertop scene', '#57443b', '#d39e73');
    case 'aurora-scene-2':
      return createProductStudioArtwork('Linen', 'Soft daylight product set', '#7f6b57', '#dbc9b8');
    case 'aurora-scene-3':
      return createProductStudioArtwork('Noir', 'High-contrast campaign frame', '#192232', '#4a567a');
    case 'nova-ref-1':
      return createProductStudioArtwork('Filter', 'Front shot', '#21324b', '#67a5ff');
    case 'nova-scene-1':
      return createProductStudioArtwork('Kitchen', 'Clean warm interior', '#6f5d4a', '#dcc0a2');
    case 'nova-scene-2':
      return createProductStudioArtwork('Splash', 'High-speed fluid shot', '#123659', '#5cd4ff');
    case 'luma-scene-1':
      return createProductStudioArtwork('Velvet', 'Low-light gifting scene', '#3a2025', '#c97a70');
    case 'nova-generated-1':
      return createProductStudioArtwork('Nova 01', 'Countertop integration', '#1b263b', '#7bb5ff');
    case 'starter-hero':
      return createProductStudioArtwork('New', 'Editorial starter workspace', '#111827', '#5f95ff');
    case 'starter-scene':
      return createProductStudioArtwork('Starter', 'Soft scene placeholder', '#5f5244', '#dac3b0');
    default:
      return '';
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function schedulePersist(snapshot: ProductStudioSnapshot): void {
  const cloned = cloneSnapshot(snapshot);
  persistChain = persistChain
    .catch(() => undefined)
    .then(async () => {
      await persistProductStudioSnapshot(cloned);
    })
    .catch(() => undefined);
}

function setSnapshot(snapshot: ProductStudioSnapshot): ProductStudioSnapshot {
  state.snapshot = cloneSnapshot(snapshot);
  notifyListeners();
  schedulePersist(snapshot);
  return cloneSnapshot(snapshot);
}

export function subscribeProductStudioStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProductStudioSnapshot(): ProductStudioSnapshot {
  return state.snapshot || EMPTY_PRODUCT_STUDIO_SNAPSHOT;
}

function normalizeLegacySnapshot(snapshot: ProductStudioSnapshot): ProductStudioSnapshot {
  const next = cloneSnapshot(snapshot);

  const projectHeroMap: Record<string, string> = {
    'project-aurora': demoArtwork('aurora-hero'),
    'project-nova': demoArtwork('nova-hero'),
    'project-luma': demoArtwork('luma-hero'),
  };
  next.projects = next.projects.map((project) => ({
    ...project,
    heroImageUrl: projectHeroMap[project.id]
      || (project.description === 'Fresh workspace seeded from the editorial Product Studio starter kit.' ? demoArtwork('starter-hero') : project.heroImageUrl),
  }));

  const referenceMap: Record<string, string> = {
    'ref-aurora-1': demoArtwork('aurora-ref-1'),
    'ref-aurora-2': demoArtwork('aurora-ref-2'),
    'ref-nova-1': demoArtwork('nova-ref-1'),
  };
  next.referenceImages = next.referenceImages.map((image) => ({
    ...image,
    fileUrl: referenceMap[image.id] || image.fileUrl,
  }));

  const sceneMap: Record<string, string> = {
    'scene-aurora-1': demoArtwork('aurora-scene-1'),
    'scene-aurora-2': demoArtwork('aurora-scene-2'),
    'scene-aurora-3': demoArtwork('aurora-scene-3'),
    'scene-nova-1': demoArtwork('nova-scene-1'),
    'scene-nova-2': demoArtwork('nova-scene-2'),
    'scene-luma-1': demoArtwork('luma-scene-1'),
  };
  next.sceneImages = next.sceneImages.map((image) => ({
    ...image,
    fileUrl: sceneMap[image.id]
      || (image.sourceLabel === 'Starter Scene' && image.note === 'Soft directional starter composition' ? demoArtwork('starter-scene') : image.fileUrl),
  }));

  const generatedMap: Record<string, string> = {
    'gen-aurora-1': demoArtwork('aurora-hero'),
    'gen-aurora-2': demoArtwork('aurora-poster'),
    'gen-nova-1': demoArtwork('nova-generated-1'),
  };
  next.generatedImages = next.generatedImages.map((image) => ({
    ...image,
    fileUrl: generatedMap[image.id] || image.fileUrl,
  }));

  return next;
}

async function createSeedSnapshot(): Promise<ProductStudioSnapshot> {
  const createdAt = nowIso();
  const auroraHero = demoArtwork('aurora-hero');
  const auroraPoster = demoArtwork('aurora-poster');
  const novaHero = demoArtwork('nova-hero');
  const lumaHero = demoArtwork('luma-hero');

  const auroraRef1 = demoArtwork('aurora-ref-1');
  const auroraRef2 = demoArtwork('aurora-ref-2');
  const auroraScene1 = demoArtwork('aurora-scene-1');
  const auroraScene2 = demoArtwork('aurora-scene-2');
  const auroraScene3 = demoArtwork('aurora-scene-3');
  const novaRef1 = demoArtwork('nova-ref-1');
  const novaScene1 = demoArtwork('nova-scene-1');
  const novaScene2 = demoArtwork('nova-scene-2');
  const lumaScene1 = demoArtwork('luma-scene-1');
  const auroraGenerated1 = auroraHero;
  const auroraGenerated2 = auroraPoster;
  const novaGenerated1 = demoArtwork('nova-generated-1');

  const projects: ProductStudioProject[] = [
    {
      id: 'project-aurora',
      name: 'Aurora Serum Launch',
      description: 'Premium skincare launch pack for spring marketplace promos.',
      status: 'active',
      heroImageUrl: auroraHero,
      accentStart: '#111827',
      accentEnd: '#497cff',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'project-nova',
      name: 'Nova Filter Refresh',
      description: 'Marketplace upgrade for water filter hero scenes and carousel art.',
      status: 'active',
      heroImageUrl: novaHero,
      accentStart: '#1f2937',
      accentEnd: '#6fb2ff',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'project-luma',
      name: 'Luma Candle Capsule',
      description: 'Mood-led campaign concepts for a premium candle gifting line.',
      status: 'active',
      heroImageUrl: lumaHero,
      accentStart: '#3b1f24',
      accentEnd: '#d18d7d',
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const referenceImages: ProductStudioReferenceImage[] = [
    { id: 'ref-aurora-1', projectId: 'project-aurora', fileUrl: auroraRef1, label: 'Bottle Front', note: 'Primary packshot', isDefault: true, createdAt },
    { id: 'ref-aurora-2', projectId: 'project-aurora', fileUrl: auroraRef2, label: 'Bottle Detail', note: 'Cap and dropper close-up', isDefault: false, createdAt },
    { id: 'ref-nova-1', projectId: 'project-nova', fileUrl: novaRef1, label: 'Filter Packshot', note: 'Front hero angle', isDefault: true, createdAt },
  ];

  const sceneImages: ProductStudioSceneImage[] = [
    { id: 'scene-aurora-1', projectId: 'project-aurora', fileUrl: auroraScene1, sourceLabel: 'Marble Vanity', note: 'Bright countertop composition', status: 'pending', createdAt },
    { id: 'scene-aurora-2', projectId: 'project-aurora', fileUrl: auroraScene2, sourceLabel: 'Linen Softbox', note: 'Folded fabric with haze', status: 'pending', createdAt },
    { id: 'scene-aurora-3', projectId: 'project-aurora', fileUrl: auroraScene3, sourceLabel: 'Night Editorial', note: 'Moody cobalt highlight', status: 'used', createdAt },
    { id: 'scene-nova-1', projectId: 'project-nova', fileUrl: novaScene1, sourceLabel: 'Kitchen Counter', note: 'Natural family-home setup', status: 'pending', createdAt },
    { id: 'scene-nova-2', projectId: 'project-nova', fileUrl: novaScene2, sourceLabel: 'Splash Frame', note: 'Water motion and highlights', status: 'pending', createdAt },
    { id: 'scene-luma-1', projectId: 'project-luma', fileUrl: lumaScene1, sourceLabel: 'Velvet Table', note: 'Romantic gifting vignette', status: 'pending', createdAt },
  ];

  const sellingPoints: ProductStudioSellingPoint[] = [
    { id: 'sp-aurora-1', projectId: 'project-aurora', category: 'product', text: 'Triple-peptide repair story with clean clinical tone', sortOrder: 1, isActive: true, createdAt },
    { id: 'sp-aurora-2', projectId: 'project-aurora', category: 'product', text: 'Translucent glass bottle should stay hero and premium', sortOrder: 2, isActive: true, createdAt },
    { id: 'sp-aurora-3', projectId: 'project-aurora', category: 'store', text: 'Fast domestic fulfillment and gifting-ready packaging', sortOrder: 3, isActive: false, createdAt },
    { id: 'sp-aurora-4', projectId: 'project-aurora', category: 'store', text: 'Bundle-ready for spring skincare routines', sortOrder: 4, isActive: true, createdAt },
    { id: 'sp-nova-1', projectId: 'project-nova', category: 'product', text: 'Purity narrative should feel science-backed, not generic wellness', sortOrder: 1, isActive: true, createdAt },
    { id: 'sp-nova-2', projectId: 'project-nova', category: 'store', text: 'Subscription replacement message available for later overlays', sortOrder: 2, isActive: true, createdAt },
    { id: 'sp-luma-1', projectId: 'project-luma', category: 'product', text: 'Soft wax texture and glass reflections must stay believable', sortOrder: 1, isActive: true, createdAt },
  ];

  const promptConfigs: ProductStudioPromptConfig[] = [
    {
      id: 'tpl-aurora-1',
      projectId: 'project-aurora',
      name: 'Vanity Editorial',
      generationMode: 'multimodal',
      userIntent: 'Replace the competitor serum with our Aurora bottle, keep the marble mood and the daylight falloff, remove all other logos.',
      refinedPrompt: 'Create a refined e-commerce hero image featuring the Aurora serum bottle as the focal object. Preserve the marble vanity composition, soft directional daylight, premium skincare styling, realistic reflections, and a clean luxury finish. Remove competing branding and keep negative space for later copy placement.',
      attachedImages: [
        { sourceType: 'reference', sourceId: 'ref-aurora-1', fileUrl: auroraRef1, label: 'Bottle Front' },
        { sourceType: 'scene', sourceId: 'scene-aurora-1', fileUrl: auroraScene1, label: 'Marble Vanity' },
      ],
      isFavorite: false,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'tpl-aurora-2',
      projectId: 'project-aurora',
      name: 'Launch Poster',
      generationMode: 'text-to-image',
      userIntent: 'Generate a clean launch key visual with a floating serum bottle, rich cobalt shadows, and room for a headline.',
      refinedPrompt: 'Design a premium launch key visual for a luxury skincare serum with a floating glass bottle, deep cobalt shadows, restrained editorial lighting, subtle reflections, and ample headline space. Keep the atmosphere high-end, quiet, and retail-ready.',
      attachedImages: [],
      isFavorite: false,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'tpl-nova-1',
      projectId: 'project-nova',
      name: 'Family Countertop',
      generationMode: 'multimodal',
      userIntent: 'Swap our filter pitcher into the competitor family countertop scene with crisp highlights and no clutter.',
      refinedPrompt: 'Stage the Nova filter pitcher inside a bright family countertop environment with crisp highlights, clean composition, and practical aspirational realism. Keep surrounding clutter minimal and reserve clear copy space on the right.',
      attachedImages: [
        { sourceType: 'reference', sourceId: 'ref-nova-1', fileUrl: novaRef1, label: 'Filter Packshot' },
        { sourceType: 'scene', sourceId: 'scene-nova-1', fileUrl: novaScene1, label: 'Kitchen Counter' },
      ],
      isFavorite: false,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'tpl-luma-1',
      projectId: 'project-luma',
      name: 'Quiet Gift Poster',
      generationMode: 'text-to-image',
      userIntent: 'Create a gifting poster for an amber candle with editorial shadows and romantic warm depth.',
      refinedPrompt: 'Compose an editorial candle poster with amber glass, warm theatrical shadows, tactile wax detail, and quiet gifting atmosphere. Keep the composition minimal, premium, and suitable for marketplace hero usage.',
      attachedImages: [],
      isFavorite: false,
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const generatedImages: ProductStudioGeneratedImage[] = [
    {
      id: 'gen-aurora-1',
      projectId: 'project-aurora',
      promptConfigId: 'tpl-aurora-1',
      sourceSceneImageId: 'scene-aurora-1',
      generationMode: 'multimodal',
      fileUrl: auroraGenerated1,
      title: 'Marble Vanity Hero',
      actualPrompt: 'Aurora serum bottle integrated into marble vanity composition.',
      inputImageSnapshot: [
        { sourceType: 'reference', sourceId: 'ref-aurora-1', fileUrl: auroraRef1, label: 'Bottle Front' },
        { sourceType: 'scene', sourceId: 'scene-aurora-1', fileUrl: auroraScene1, label: 'Marble Vanity' },
      ],
      appliedSellingPoints: ['Triple-peptide repair story with clean clinical tone', 'Translucent glass bottle should stay hero and premium'],
      status: 'success',
      rating: 5,
      createdAt,
    },
    {
      id: 'gen-aurora-2',
      projectId: 'project-aurora',
      promptConfigId: 'tpl-aurora-2',
      generationMode: 'text-to-image',
      fileUrl: auroraGenerated2,
      title: 'Launch Poster Variant',
      actualPrompt: 'Floating serum bottle launch poster with cobalt light.',
      inputImageSnapshot: [],
      appliedSellingPoints: ['Bundle-ready for spring skincare routines'],
      status: 'success',
      rating: 4,
      createdAt,
    },
    {
      id: 'gen-nova-1',
      projectId: 'project-nova',
      promptConfigId: 'tpl-nova-1',
      sourceSceneImageId: 'scene-nova-1',
      generationMode: 'multimodal',
      fileUrl: novaGenerated1,
      title: 'Countertop Conversion',
      actualPrompt: 'Nova pitcher on family countertop scene.',
      inputImageSnapshot: [
        { sourceType: 'reference', sourceId: 'ref-nova-1', fileUrl: novaRef1, label: 'Filter Packshot' },
        { sourceType: 'scene', sourceId: 'scene-nova-1', fileUrl: novaScene1, label: 'Kitchen Counter' },
      ],
      appliedSellingPoints: ['Purity narrative should feel science-backed, not generic wellness'],
      status: 'success',
      rating: 4,
      createdAt,
    },
  ];

  const batchJobs: ProductStudioBatchJob[] = [
    {
      id: 'batch-aurora-1',
      projectId: 'project-aurora',
      promptConfigId: 'tpl-aurora-1',
      title: 'Marketplace Spring Set',
      status: 'PARTIAL_COMPLETED',
      totalCount: 3,
      completedCount: 2,
      failedCount: 1,
      concurrency: 3,
      sceneImageIds: ['scene-aurora-1', 'scene-aurora-2', 'scene-aurora-3'],
      createdAt,
      startedAt: createdAt,
      completedAt: createdAt,
      logs: [
        'scene-aurora-1 completed with premium-retail grade output',
        'scene-aurora-2 completed with softer shadows than baseline',
        'scene-aurora-3 failed because the bottle silhouette drifted',
      ],
    },
  ];

  return {
    version: 1,
    projects,
    referenceImages,
    sceneImages,
    sellingPoints,
    promptConfigs,
    batchJobs,
    generatedImages,
  };
}

export async function ensureProductStudioStoreReady(): Promise<ProductStudioSnapshot> {
  if (state.snapshot) {
    return cloneSnapshot(state.snapshot);
  }
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const stored = await loadProductStudioSnapshot();
      if (stored) {
        state.snapshot = normalizeLegacySnapshot(stored);
        notifyListeners();
        return cloneSnapshot(state.snapshot);
      }
      const seeded = await createSeedSnapshot();
      state.snapshot = cloneSnapshot(seeded);
      notifyListeners();
      await persistProductStudioSnapshot(seeded);
      return cloneSnapshot(seeded);
    })();
  }
  return await hydrationPromise;
}

function requireSnapshot(): ProductStudioSnapshot {
  if (!state.snapshot) {
    throw new Error('PRODUCT_STUDIO_STORE_NOT_READY');
  }
  return state.snapshot;
}

export function listProductStudioProjectBundles(): ProductStudioProjectBundle[] {
  const snapshot = getProductStudioSnapshot();
  return snapshot.projects.map((project) => ({
    project,
    referenceImages: snapshot.referenceImages.filter((item) => item.projectId === project.id),
    sceneImages: snapshot.sceneImages.filter((item) => item.projectId === project.id),
    sellingPoints: snapshot.sellingPoints
      .filter((item) => item.projectId === project.id)
      .sort((left, right) => left.sortOrder - right.sortOrder),
    promptConfigs: snapshot.promptConfigs
      .filter((item) => item.projectId === project.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    batchJobs: snapshot.batchJobs
      .filter((item) => item.projectId === project.id)
      .sort((left, right) => (right.startedAt || right.createdAt).localeCompare(left.startedAt || left.createdAt)),
    generatedImages: snapshot.generatedImages
      .filter((item) => item.projectId === project.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  }));
}

export function getProductStudioProjectBundle(projectId: string): ProductStudioProjectBundle | null {
  return listProductStudioProjectBundles().find((item) => item.project.id === projectId) || null;
}

export async function createProductStudioProject(input: {
  name: string;
}): Promise<ProductStudioProjectBundle> {
  const snapshot = requireSnapshot();
  const createdAt = nowIso();
  const projectId = createProductStudioId('project');
  const starterScenePath = demoArtwork('starter-scene');
  const heroPath = demoArtwork('starter-hero');
  const promptId = createProductStudioId('tpl');
  const sceneId = createProductStudioId('scene');
  const sellingPointId = createProductStudioId('sp');

  const nextSnapshot: ProductStudioSnapshot = {
    ...snapshot,
    projects: [
      {
        id: projectId,
        name: input.name.trim() || `New Capsule ${snapshot.projects.length + 1}`,
        description: 'Fresh workspace seeded from the editorial Product Studio starter kit.',
        status: 'active',
        heroImageUrl: heroPath,
        accentStart: '#111827',
        accentEnd: '#5f95ff',
        createdAt,
        updatedAt: createdAt,
      },
      ...snapshot.projects,
    ],
    sceneImages: [
      {
        id: sceneId,
        projectId,
        fileUrl: starterScenePath,
        sourceLabel: 'Starter Scene',
        note: 'Soft directional starter composition',
        status: 'pending',
        createdAt,
      },
      ...snapshot.sceneImages,
    ],
    sellingPoints: [
      {
        id: sellingPointId,
        projectId,
        category: 'product',
        text: 'Add your first product narrative here',
        sortOrder: 1,
        isActive: true,
        createdAt,
      },
      ...snapshot.sellingPoints,
    ],
    promptConfigs: [
      {
        id: promptId,
        projectId,
        name: 'Starter Prompt',
        generationMode: 'text-to-image',
        userIntent: 'Describe the visual direction for your first campaign image.',
        attachedImages: [],
        refinedPrompt: 'Design a premium marketplace visual with clear product hierarchy, soft editorial lighting, and whitespace for copy.',
        isFavorite: false,
        createdAt,
        updatedAt: createdAt,
      },
      ...snapshot.promptConfigs,
    ],
  };

  setSnapshot(nextSnapshot);
  return getProductStudioProjectBundle(projectId)!;
}

export function upsertProductStudioPromptConfig(promptConfig: ProductStudioPromptConfig): ProductStudioPromptConfig {
  const snapshot = requireSnapshot();
  const nextPrompt = {
    ...promptConfig,
    updatedAt: nowIso(),
  };
  const nextSnapshot: ProductStudioSnapshot = {
    ...snapshot,
    projects: snapshot.projects.map((project) => (
      project.id === promptConfig.projectId
        ? { ...project, updatedAt: nextPrompt.updatedAt }
        : project
    )),
    promptConfigs: [
      nextPrompt,
      ...snapshot.promptConfigs.filter((item) => item.id !== nextPrompt.id),
    ],
  };
  setSnapshot(nextSnapshot);
  return nextPrompt;
}

export function upsertProductStudioProject(projectPatch: ProductStudioProject): ProductStudioProject {
  const snapshot = requireSnapshot();
  const nextProject = {
    ...projectPatch,
    updatedAt: nowIso(),
  };
  const exists = snapshot.projects.some((item) => item.id === nextProject.id);
  const nextSnapshot: ProductStudioSnapshot = {
    ...snapshot,
    projects: exists
      ? snapshot.projects.map((project) => (project.id === nextProject.id ? nextProject : project))
      : [nextProject, ...snapshot.projects],
  };
  setSnapshot(nextSnapshot);
  return nextProject;
}

export function replaceProductStudioReferenceImages(projectId: string, referenceImages: ProductStudioReferenceImage[]): void {
  const snapshot = requireSnapshot();
  const updatedAt = nowIso();
  const normalized = referenceImages.map((image, index) => ({
    ...image,
    projectId,
    isDefault: image.isDefault || index === 0,
  })).map((image, index, items) => ({
    ...image,
    isDefault: items.some((item) => item.isDefault) ? image.isDefault && index === items.findIndex((item) => item.isDefault) : index === 0,
  }));

  const nextSnapshot: ProductStudioSnapshot = {
    ...snapshot,
    projects: snapshot.projects.map((project) => (
      project.id === projectId ? { ...project, updatedAt } : project
    )),
    referenceImages: [
      ...snapshot.referenceImages.filter((item) => item.projectId !== projectId),
      ...normalized,
    ],
  };
  setSnapshot(nextSnapshot);
}

export function replaceProductStudioSceneImages(projectId: string, sceneImages: ProductStudioSceneImage[]): void {
  const snapshot = requireSnapshot();
  const updatedAt = nowIso();
  const nextSnapshot: ProductStudioSnapshot = {
    ...snapshot,
    projects: snapshot.projects.map((project) => (
      project.id === projectId ? { ...project, updatedAt } : project
    )),
    sceneImages: [
      ...snapshot.sceneImages.filter((item) => item.projectId !== projectId),
      ...sceneImages.map((image) => ({ ...image, projectId })),
    ],
  };
  setSnapshot(nextSnapshot);
}

export function replaceProductStudioSellingPoints(projectId: string, sellingPoints: ProductStudioSellingPoint[]): void {
  const snapshot = requireSnapshot();
  const updatedAt = nowIso();
  const nextSnapshot: ProductStudioSnapshot = {
    ...snapshot,
    projects: snapshot.projects.map((project) => (
      project.id === projectId ? { ...project, updatedAt } : project
    )),
    sellingPoints: [
      ...snapshot.sellingPoints.filter((item) => item.projectId !== projectId),
      ...sellingPoints,
    ],
  };
  setSnapshot(nextSnapshot);
}

export function addProductStudioGeneratedImage(image: ProductStudioGeneratedImage): void {
  const snapshot = requireSnapshot();
  const updatedAt = nowIso();
  const nextSnapshot: ProductStudioSnapshot = {
    ...snapshot,
    projects: snapshot.projects.map((project) => (
      project.id === image.projectId
        ? {
            ...project,
            updatedAt,
            heroImageUrl: image.status === 'success' ? image.fileUrl : project.heroImageUrl,
          }
        : project
    )),
    sceneImages: snapshot.sceneImages.map((scene) => (
      scene.id === image.sourceSceneImageId && image.status === 'success'
        ? { ...scene, status: 'used' }
        : scene
    )),
    generatedImages: [
      image,
      ...snapshot.generatedImages.filter((item) => item.id !== image.id),
    ],
  };
  setSnapshot(nextSnapshot);
}

export function upsertProductStudioBatchJob(batchJob: ProductStudioBatchJob): void {
  const snapshot = requireSnapshot();
  const updatedAt = nowIso();
  const nextSnapshot: ProductStudioSnapshot = {
    ...snapshot,
    projects: snapshot.projects.map((project) => (
      project.id === batchJob.projectId ? { ...project, updatedAt } : project
    )),
    batchJobs: [
      batchJob,
      ...snapshot.batchJobs.filter((item) => item.id !== batchJob.id),
    ],
  };
  setSnapshot(nextSnapshot);
}

export function upsertManyProductStudioGeneratedImages(images: ProductStudioGeneratedImage[]): void {
  for (const image of images) {
    addProductStudioGeneratedImage(image);
  }
}
