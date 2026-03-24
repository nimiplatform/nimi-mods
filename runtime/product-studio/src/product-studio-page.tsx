import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { parseRuntimeRouteOptions, type RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod';
import { persistBrowserFileImage, resolveImageUrlForDisplay } from './image-storage.js';
import { getProductStudioRuntimeClient } from './runtime-mod.js';
import {
  addProductStudioGeneratedImage,
  createProductStudioId,
  createProductStudioProject,
  ensureProductStudioStoreReady,
  getProductStudioSnapshot,
  listProductStudioProjectBundles,
  replaceProductStudioReferenceImages,
  replaceProductStudioSceneImages,
  replaceProductStudioSellingPoints,
  subscribeProductStudioStore,
  upsertManyProductStudioGeneratedImages,
  upsertProductStudioBatchJob,
  upsertProductStudioPromptConfig,
} from './state/store.js';
import { generateProductStudioPreview, refineProductStudioPrompt, runProductStudioBatchGeneration } from './runtime-ai-client.js';
import type {
  ProductStudioErrorEnvelope,
  ProductStudioGenerationMode,
  ProductStudioProjectBundle,
  ProductStudioPromptConfig,
  ProductStudioPromptInputImageRef,
  ProductStudioSellingPoint,
  ProductStudioSellingPointCategory,
} from './types.js';

type WorkspaceTab = 'prompt' | 'batch' | 'gallery';
type GalleryView = 'grid' | 'compare';
type EditorTab = 'visual' | 'json';
type ShellSection = 'projects' | 'templates' | 'assets' | 'settings';
type StudioAssetSelection = {
  id: string;
  fileUrl: string;
  label: string;
  note: string;
  sourceType: 'reference' | 'scene';
};

const headlineFont = '"Manrope", "Avenir Next", "Segoe UI", sans-serif';
const bodyFont = '"Inter", "SF Pro Text", "Segoe UI", sans-serif';

function ensureRouteOptionsSnapshotShape(snapshot: RuntimeRouteOptionsSnapshot | null): RuntimeRouteOptionsSnapshot | null {
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

function dedupeModels(models: string[]): string[] {
  return Array.from(new Set(models.map((value) => String(value || '').trim()).filter(Boolean)));
}

function routeDefaultModel(snapshot: RuntimeRouteOptionsSnapshot | null): string {
  const selected = snapshot?.selected || snapshot?.resolvedDefault || null;
  return String(selected?.modelId || selected?.model || '').trim();
}

function routeModelOptions(snapshot: RuntimeRouteOptionsSnapshot | null): string[] {
  if (!snapshot) {
    return [];
  }
  const selected = snapshot.selected || snapshot.resolvedDefault || null;
  const source = selected?.source || 'local';
  if (source === 'local') {
    return dedupeModels((snapshot.local?.models || []).map((item) => String(item.modelId || item.model || '').trim()));
  }
  const connectorId = String(selected?.connectorId || '').trim();
  const connector = snapshot.connectors.find((item) => String(item.id || '').trim() === connectorId) || null;
  return dedupeModels(connector?.models || []);
}

function formatRelativeUpdate(iso: string): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) {
    return 'Updated recently';
  }
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) {
    return `Updated ${diffMinutes}m ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Updated ${diffHours}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return diffDays <= 1 ? 'Updated yesterday' : `Updated ${diffDays}d ago`;
}

function useResolvedImageMap(fileUrls: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = useMemo(() => [...new Set(fileUrls.filter(Boolean))].sort().join('|'), [fileUrls]);

  useEffect(() => {
    const unique = [...new Set(fileUrls.filter(Boolean))];
    const cleanup: Array<() => void> = [];
    let cancelled = false;

    void Promise.all(unique.map(async (fileUrl) => {
      const resolved = await resolveImageUrlForDisplay(fileUrl);
      return { fileUrl, resolved };
    })).then((entries) => {
      if (cancelled) {
        for (const entry of entries) {
          entry.resolved.revoke?.();
        }
        return;
      }
      const nextMap: Record<string, string> = {};
      for (const entry of entries) {
        nextMap[entry.fileUrl] = entry.resolved.url;
        if (entry.resolved.revoke) {
          cleanup.push(entry.resolved.revoke);
        }
      }
      setMap(nextMap);
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      for (const revoke of cleanup) {
        revoke();
      }
    };
  }, [key, fileUrls]);

  return map;
}

const signatureGradient = 'linear-gradient(135deg, #000000 0%, #497cff 100%)';

function Icon({ name, className = '', fill = false }: { name: string; className?: string; fill?: boolean }) {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={{
        fontVariationSettings: fill
          ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
        verticalAlign: 'middle',
        lineHeight: 1,
      }}
    >
      {name}
    </span>
  );
}

function ActionButton(input: {
  label: string;
  onClick?: () => void;
  tone?: 'primary' | 'secondary' | 'ghost';
  small?: boolean;
  disabled?: boolean;
}) {
  const tone = input.tone || 'secondary';
  const className =
    tone === 'primary'
      ? 'text-white shadow-[0_12px_32px_rgba(73,124,255,0.22)]'
      : tone === 'ghost'
        ? 'bg-transparent text-[#45464d] hover:bg-[#f2f3ff]'
        : 'bg-[#dae2fd] text-[#131b2e] hover:bg-[#c8d5fb]';

  return (
    <button
      type="button"
      onClick={input.onClick}
      disabled={input.disabled}
      className={`inline-flex items-center justify-center rounded-xl text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${input.small ? 'px-3 py-2' : 'px-4 py-2.5'} ${className}`}
      style={tone === 'primary' ? { backgroundImage: signatureGradient } : undefined}
    >
      {input.label}
    </button>
  );
}

function resolveDisplayUrl(map: Record<string, string>, fileUrl: string): string {
  const normalized = String(fileUrl || '').trim();
  if (!normalized) {
    return '';
  }
  if (
    normalized.startsWith('data:')
    || normalized.startsWith('blob:')
    || normalized.startsWith('http://')
    || normalized.startsWith('https://')
  ) {
    return normalized;
  }
  return map[fileUrl] || '';
}

function isProductStudioErrorEnvelope(value: unknown): value is ProductStudioErrorEnvelope {
  return Boolean(
    value
    && typeof value === 'object'
    && 'reasonCode' in value
    && 'message' in value,
  );
}

function sanitizeFileName(value: string): string {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'product-studio-image';
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = String(mimeType || '').trim().toLowerCase();
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/svg+xml') return 'svg';
  if (normalized === 'image/webp') return 'webp';
  return 'png';
}

function toBannerFromEnvelope(envelope: ProductStudioErrorEnvelope): { tone: 'error'; text: string } {
  return {
    tone: 'error',
    text: `${envelope.reasonCode} · ${envelope.message}${envelope.traceId ? ` · trace ${envelope.traceId}` : ''}`,
  };
}

export function ProductStudioPage() {
  const snapshot = useSyncExternalStore(subscribeProductStudioStore, getProductStudioSnapshot, getProductStudioSnapshot);
  const projectBundles = useMemo(() => listProductStudioProjectBundles(), [snapshot]);
  const [ready, setReady] = useState(false);
  const [shellSection, setShellSection] = useState<ShellSection>('projects');
  const [pageView, setPageView] = useState<'dashboard' | 'workspace'>('dashboard');
  const [activeProjectId, setActiveProjectId] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('prompt');
  const [searchQuery, setSearchQuery] = useState('');
  const [galleryView, setGalleryView] = useState<GalleryView>('grid');
  const [templateName, setTemplateName] = useState('');
  const [promptMode, setPromptMode] = useState<ProductStudioGenerationMode>('multimodal');
  const [promptOptimizeModel, setPromptOptimizeModel] = useState('');
  const [imageGenerateModel, setImageGenerateModel] = useState('');
  const [intent, setIntent] = useState('');
  const [refinedPrompt, setRefinedPrompt] = useState('');
  const [attachedImageIds, setAttachedImageIds] = useState<string[]>([]);
  const [selectedSellingPointIds, setSelectedSellingPointIds] = useState<string[]>([]);
  const [previewAssetId, setPreviewAssetId] = useState('');
  const [galleryModeFilter, setGalleryModeFilter] = useState<'all' | ProductStudioGenerationMode>('all');
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
  const [batchCount, setBatchCount] = useState(6);
  const [batchFixedInputIds, setBatchFixedInputIds] = useState<string[]>([]);
  const [selectedBatchSourceIds, setSelectedBatchSourceIds] = useState<string[]>([]);
  const [sellingPointsOpen, setSellingPointsOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('visual');
  const [editorDraft, setEditorDraft] = useState<ProductStudioSellingPoint[]>([]);
  const [editorJson, setEditorJson] = useState('');
  const [statusBanner, setStatusBanner] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [busyLabel, setBusyLabel] = useState('');
  const [textRouteSnapshot, setTextRouteSnapshot] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [imageRouteSnapshot, setImageRouteSnapshot] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [modelConfigError, setModelConfigError] = useState('');
  const [runningBatchJobId, setRunningBatchJobId] = useState('');
  const [batchPaused, setBatchPaused] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const sceneInputRef = useRef<HTMLInputElement | null>(null);
  const batchFixedInputRef = useRef<HTMLInputElement | null>(null);
  const batchSourceInputRef = useRef<HTMLInputElement | null>(null);
  const batchPausedRef = useRef(false);
  const batchCancelledRef = useRef(false);
  const batchResumeResolversRef = useRef<Array<() => void>>([]);
  const currentProviderJobIdRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    void ensureProductStudioStoreReady()
      .then((loadedSnapshot) => {
        if (cancelled) {
          return;
        }
        setReady(true);
        if (!activeProjectId) {
          setActiveProjectId(loadedSnapshot.projects[0]?.id || '');
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setReady(true);
        setStatusBanner({
          tone: 'error',
          text: error instanceof Error ? error.message : String(error || 'Failed to load Product Studio'),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getProductStudioRuntimeClient().route.listOptions({ capability: 'text.generate' }),
      getProductStudioRuntimeClient().route.listOptions({ capability: 'image.generate' }),
    ])
      .then(([textOptions, imageOptions]) => {
        if (cancelled) {
          return;
        }
        setTextRouteSnapshot(ensureRouteOptionsSnapshotShape(parseRuntimeRouteOptions(textOptions, { includeResolvedDefault: true })));
        setImageRouteSnapshot(ensureRouteOptionsSnapshotShape(parseRuntimeRouteOptions(imageOptions, { includeResolvedDefault: true })));
        setModelConfigError('');
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setModelConfigError(error instanceof Error ? error.message : String(error || 'Failed to load route models'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const promptOptimizeModelOptions = useMemo(() => routeModelOptions(textRouteSnapshot), [textRouteSnapshot]);
  const imageGenerateModelOptions = useMemo(() => routeModelOptions(imageRouteSnapshot), [imageRouteSnapshot]);
  const defaultPromptOptimizeModel = useMemo(() => routeDefaultModel(textRouteSnapshot), [textRouteSnapshot]);
  const defaultImageGenerateModel = useMemo(() => routeDefaultModel(imageRouteSnapshot), [imageRouteSnapshot]);

  const activeBundle = projectBundles.find((bundle) => bundle.project.id === activeProjectId) || projectBundles[0] || null;
  const activePromptConfig = activeBundle?.promptConfigs[0] || null;
  const promptOptimizeModelMenu = useMemo(
    () => dedupeModels([promptOptimizeModel, defaultPromptOptimizeModel, ...promptOptimizeModelOptions]),
    [promptOptimizeModel, defaultPromptOptimizeModel, promptOptimizeModelOptions],
  );
  const imageGenerateModelMenu = useMemo(
    () => dedupeModels([imageGenerateModel, defaultImageGenerateModel, ...imageGenerateModelOptions]),
    [imageGenerateModel, defaultImageGenerateModel, imageGenerateModelOptions],
  );
  const effectivePromptMode: ProductStudioGenerationMode = attachedImageIds.length > 0 ? 'multimodal' : 'text-to-image';

  useEffect(() => {
    if (!activeBundle) {
      return;
    }
    const promptConfig = activeBundle.promptConfigs[0];
    const persistedAttachedIds = promptConfig?.attachedImages.map((image) => image.sourceId).filter(Boolean) as string[] || [];
    setTemplateName(promptConfig?.name || `${activeBundle.project.name} Template`);
    setPromptMode(promptConfig?.generationMode || 'multimodal');
    setPromptOptimizeModel(promptConfig?.promptOptimizeModel || '');
    setImageGenerateModel(promptConfig?.imageGenerateModel || '');
    setIntent(promptConfig?.userIntent || '');
    setRefinedPrompt(promptConfig?.refinedPrompt || '');
    setAttachedImageIds(persistedAttachedIds);
    setSelectedSellingPointIds(activeBundle.sellingPoints.filter((item) => item.isActive).map((item) => item.id));
    setBatchFixedInputIds([]);
    setSelectedBatchSourceIds(activeBundle.sceneImages.map((image) => image.id));
    setPreviewAssetId(activeBundle.generatedImages[0]?.id || '');
    setSelectedExportIds([]);
  }, [activeProjectId, activeBundle?.project.id]);

  useEffect(() => {
    const linkId = 'ps-material-symbols';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const allAssetIds = useMemo<Map<string, StudioAssetSelection>>(() => (
    new Map<string, StudioAssetSelection>([
      ...((activeBundle?.referenceImages || []).map((image) => [image.id, {
        id: image.id,
        fileUrl: image.fileUrl,
        label: image.label,
        note: image.note,
        sourceType: 'reference' as const,
      }] as const)),
      ...((activeBundle?.sceneImages || []).map((image) => [image.id, {
        id: image.id,
        fileUrl: image.fileUrl,
        label: image.sourceLabel,
        note: image.note,
        sourceType: 'scene' as const,
      }] as const)),
    ])
  ), [activeBundle]);

  const activeGallery = activeBundle
    ? activeBundle.generatedImages.filter((item) => galleryModeFilter === 'all' || item.generationMode === galleryModeFilter)
    : [];
  const previewAsset = activeBundle?.generatedImages.find((item) => item.id === previewAssetId) || activeGallery[0] || null;

  const displayImageUrls = useMemo(() => {
    if (pageView === 'dashboard') {
      return projectBundles.map((bundle) => bundle.project.heroImageUrl);
    }
    if (!activeBundle) {
      return [];
    }
    return [
      activeBundle.project.heroImageUrl,
      ...activeBundle.referenceImages.map((item) => item.fileUrl),
      ...activeBundle.sceneImages.map((item) => item.fileUrl),
      ...activeBundle.generatedImages.map((item) => item.fileUrl),
    ];
  }, [pageView, projectBundles, activeBundle]);
  const displayImageMap = useResolvedImageMap(displayImageUrls);
  const promptInputAssets = useMemo(() => {
    return attachedImageIds
      .map((imageId) => allAssetIds.get(imageId))
      .filter(Boolean) as StudioAssetSelection[];
  }, [attachedImageIds, allAssetIds]);
  const batchFixedAssets = useMemo(() => (
    (activeBundle?.referenceImages || []).filter((asset) => batchFixedInputIds.includes(asset.id)).map((asset) => ({
      id: asset.id,
      fileUrl: asset.fileUrl,
      label: asset.label,
      note: asset.note,
      sourceType: 'reference' as const,
    }))
  ), [activeBundle, batchFixedInputIds]);
  const batchSourceAssets = useMemo(() => (
    (activeBundle?.sceneImages || []).map((asset) => ({
      id: asset.id,
      fileUrl: asset.fileUrl,
      label: asset.sourceLabel,
      note: asset.note,
      sourceType: 'scene' as const,
      status: asset.status,
    }))
  ), [activeBundle]);

  function enterWorkspace(projectId: string) {
    setShellSection('projects');
    setActiveProjectId(projectId);
    setPageView('workspace');
    setWorkspaceTab('prompt');
    setStatusBanner(null);
  }

  async function handleCreateProject() {
    setBusyLabel('Creating project');
    try {
      const bundle = await createProductStudioProject({ name: `New Capsule ${projectBundles.length + 1}` });
      setShellSection('projects');
      setActiveProjectId(bundle.project.id);
      setPageView('workspace');
      setWorkspaceTab('prompt');
      setStatusBanner({ tone: 'info', text: 'New project created in Product Studio.' });
    } catch (error) {
      setStatusBanner({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error || 'Failed to create project'),
      });
    } finally {
      setBusyLabel('');
    }
  }

  function toggleAttachedImage(imageId: string) {
    setAttachedImageIds((current) => (
      current.includes(imageId) ? current.filter((item) => item !== imageId) : [...current, imageId]
    ));
  }

  function toggleSellingPoint(pointId: string) {
    setSelectedSellingPointIds((current) => (
      current.includes(pointId) ? current.filter((item) => item !== pointId) : [...current, pointId]
    ));
  }

  function selectedSellingPoints(): ProductStudioSellingPoint[] {
    return activeBundle?.sellingPoints.filter((item) => selectedSellingPointIds.includes(item.id)) || [];
  }

  function buildAttachedImagesFromSelection(): ProductStudioPromptInputImageRef[] {
    return attachedImageIds.map((imageId) => {
      const asset = allAssetIds.get(imageId);
      if (!asset) {
        return null;
      }
      return {
        sourceType: asset.sourceType,
        sourceId: asset.id,
        fileUrl: asset.fileUrl,
        label: asset.label,
      };
    }).filter(Boolean) as ProductStudioPromptInputImageRef[];
  }

  function buildPromptConfigDraft(): ProductStudioPromptConfig | null {
    if (!activeBundle) {
      return null;
    }
    const now = new Date().toISOString();
    const attachedImages = buildAttachedImagesFromSelection();
    return {
      id: activePromptConfig?.id || createProductStudioId('tpl'),
      projectId: activeBundle.project.id,
      name: templateName.trim() || 'Untitled Template',
      generationMode: attachedImages.length > 0 ? 'multimodal' : 'text-to-image',
      promptOptimizeModel: String(promptOptimizeModel || '').trim() || undefined,
      imageGenerateModel: String(imageGenerateModel || '').trim() || undefined,
      userIntent: intent.trim(),
      attachedImages,
      refinedPrompt: refinedPrompt.trim(),
      isFavorite: activePromptConfig?.isFavorite || false,
      createdAt: activePromptConfig?.createdAt || now,
      updatedAt: now,
    };
  }

  function saveCurrentPromptConfig(): ProductStudioPromptConfig | null {
    const draft = buildPromptConfigDraft();
    if (!draft) {
      return null;
    }
    return upsertProductStudioPromptConfig(draft);
  }

  async function handleReferenceFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    if (!activeBundle) {
      return;
    }
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      return;
    }
    setBusyLabel('Importing reference images');
    try {
      const nextImages = [...activeBundle.referenceImages];
      for (const file of files) {
        const fileUrl = await persistBrowserFileImage({ file, bucket: 'references' });
        nextImages.push({
          id: createProductStudioId('ref'),
          projectId: activeBundle.project.id,
          fileUrl,
          label: file.name.replace(/\.[^.]+$/u, '') || 'Reference Image',
          note: 'Imported from desktop',
          isDefault: nextImages.length === 0,
          createdAt: new Date().toISOString(),
        });
      }
      replaceProductStudioReferenceImages(activeBundle.project.id, nextImages);
      setStatusBanner({ tone: 'info', text: `${files.length} image${files.length > 1 ? 's' : ''} added to the input library.` });
    } catch (error) {
      setStatusBanner({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error || 'Reference import failed'),
      });
    } finally {
      setBusyLabel('');
      event.target.value = '';
    }
  }

  async function handleSceneFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    if (!activeBundle) {
      return;
    }
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      return;
    }
    setBusyLabel('Importing scene images');
    try {
      const nextImages = [...activeBundle.sceneImages];
      for (const file of files) {
        const fileUrl = await persistBrowserFileImage({ file, bucket: 'scenes' });
        nextImages.push({
          id: createProductStudioId('scene'),
          projectId: activeBundle.project.id,
          fileUrl,
          sourceLabel: file.name.replace(/\.[^.]+$/u, '') || 'Scene Image',
          note: 'Added from desktop input tray',
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      }
      replaceProductStudioSceneImages(activeBundle.project.id, nextImages);
      setStatusBanner({ tone: 'info', text: `${files.length} scene image${files.length > 1 ? 's' : ''} imported.` });
    } catch (error) {
      setStatusBanner({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error || 'Scene import failed'),
      });
    } finally {
      setBusyLabel('');
      event.target.value = '';
    }
  }

  async function handleBatchFixedFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    if (!activeBundle) {
      return;
    }
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      return;
    }
    setBusyLabel('Importing batch fixed inputs');
    try {
      const nextImages = [...activeBundle.referenceImages];
      const nextIds = [...batchFixedInputIds];
      for (const file of files) {
        const fileUrl = await persistBrowserFileImage({ file, bucket: 'references' });
        const id = createProductStudioId('ref');
        nextImages.push({
          id,
          projectId: activeBundle.project.id,
          fileUrl,
          label: file.name.replace(/\.[^.]+$/u, '') || 'Batch Fixed Input',
          note: 'Uploaded from batch fixed inputs',
          isDefault: nextImages.length === 0,
          createdAt: new Date().toISOString(),
        });
        nextIds.push(id);
      }
      replaceProductStudioReferenceImages(activeBundle.project.id, nextImages);
      setBatchFixedInputIds(nextIds);
      setStatusBanner({ tone: 'info', text: `${files.length} batch fixed input${files.length > 1 ? 's' : ''} imported.` });
    } catch (error) {
      setStatusBanner({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error || 'Batch fixed input import failed'),
      });
    } finally {
      setBusyLabel('');
      event.target.value = '';
    }
  }

  async function handleBatchSourceFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    if (!activeBundle) {
      return;
    }
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      return;
    }
    setBusyLabel('Importing batch source images');
    try {
      const nextImages = [...activeBundle.sceneImages];
      const nextIds = [...selectedBatchSourceIds];
      for (const file of files) {
        const fileUrl = await persistBrowserFileImage({ file, bucket: 'scenes' });
        const id = createProductStudioId('scene');
        nextImages.push({
          id,
          projectId: activeBundle.project.id,
          fileUrl,
          sourceLabel: file.name.replace(/\.[^.]+$/u, '') || 'Batch Source Image',
          note: 'Uploaded from batch source inputs',
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
        nextIds.push(id);
      }
      replaceProductStudioSceneImages(activeBundle.project.id, nextImages);
      setSelectedBatchSourceIds(nextIds);
      setStatusBanner({ tone: 'info', text: `${files.length} batch source image${files.length > 1 ? 's' : ''} imported.` });
    } catch (error) {
      setStatusBanner({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error || 'Batch source import failed'),
      });
    } finally {
      setBusyLabel('');
      event.target.value = '';
    }
  }

  async function exportGallerySelection() {
    if (!activeBundle) {
      return;
    }
    const targets = (selectedExportIds.length > 0
      ? activeBundle.generatedImages.filter((item) => selectedExportIds.includes(item.id))
      : activeGallery);
    if (targets.length === 0) {
      setStatusBanner({ tone: 'error', text: 'Select at least one generated image to export.' });
      return;
    }
    setBusyLabel('Exporting images');
    try {
      const directoryApi = (window as unknown as {
        showDirectoryPicker?: () => Promise<{
          getFileHandle: (name: string, options: { create: boolean }) => Promise<{
            createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
          }>;
        }>;
      }).showDirectoryPicker;

      if (directoryApi) {
        const directory = await directoryApi();
        for (const image of targets) {
          const resolved = await resolveImageUrlForDisplay(image.fileUrl);
          const response = await fetch(resolved.url);
          const blob = await response.blob();
          const extension = extensionFromMimeType(blob.type);
          const handle = await directory.getFileHandle(`${sanitizeFileName(image.title)}.${extension}`, { create: true });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          resolved.revoke?.();
        }
      } else {
        for (const image of targets) {
          const resolved = await resolveImageUrlForDisplay(image.fileUrl);
          const response = await fetch(resolved.url);
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = `${sanitizeFileName(image.title)}.${extensionFromMimeType(blob.type)}`;
          anchor.click();
          URL.revokeObjectURL(objectUrl);
          resolved.revoke?.();
        }
      }

      setStatusBanner({ tone: 'info', text: `${targets.length} image${targets.length > 1 ? 's' : ''} exported.` });
    } catch (error) {
      setStatusBanner({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error || 'Image export failed'),
      });
    } finally {
      setBusyLabel('');
    }
  }

  async function optimizePrompt() {
    const draft = buildPromptConfigDraft();
    if (!draft) {
      return;
    }
    if (!draft.userIntent.trim()) {
      setStatusBanner({ tone: 'error', text: 'User intent is required before AI prompt refinement.' });
      return;
    }
    setBusyLabel('Optimizing prompt');
    try {
      const result = await refineProductStudioPrompt({
        promptConfig: draft,
        sellingPoints: selectedSellingPoints(),
        inputImages: draft.attachedImages,
      });
      setRefinedPrompt(result.refinedPrompt);
      setStatusBanner({
        tone: 'info',
        text: `Prompt optimized for the current workspace context${result.traceId ? ` · trace ${result.traceId}` : ''}.`,
      });
    } catch (error) {
      const envelope = error as ProductStudioErrorEnvelope;
      setStatusBanner('reasonCode' in envelope ? toBannerFromEnvelope(envelope) : {
        tone: 'error',
        text: error instanceof Error ? error.message : String(error || 'Prompt refinement failed'),
      });
    } finally {
      setBusyLabel('');
    }
  }

  function saveTemplate() {
    const promptConfig = saveCurrentPromptConfig();
    if (!promptConfig) {
      return;
    }
    setStatusBanner({ tone: 'info', text: 'Prompt template saved to this project.' });
  }

  async function previewGenerate() {
    const promptConfig = saveCurrentPromptConfig();
    if (!promptConfig || !activeBundle) {
      return;
    }
    setBusyLabel('Generating preview');
    try {
      const sceneInput = promptConfig.attachedImages.find((item) => item.sourceType === 'scene');
      const generatedImage = await generateProductStudioPreview({
        projectId: activeBundle.project.id,
        promptConfigId: promptConfig.id,
        generationMode: promptConfig.generationMode,
        imageGenerateModel: promptConfig.imageGenerateModel,
        actualPrompt: promptConfig.refinedPrompt || promptConfig.userIntent,
        inputImages: promptConfig.attachedImages,
        appliedSellingPoints: selectedSellingPoints().map((item) => item.text),
        title: `${activeBundle.project.name} Preview`,
        sourceSceneImageId: sceneInput?.sourceId,
      });
      addProductStudioGeneratedImage(generatedImage);
      setPreviewAssetId(generatedImage.id);
      setStatusBanner({
        tone: 'info',
        text: `Preview generated and added to the project gallery${generatedImage.traceId ? ` · trace ${generatedImage.traceId}` : ''}.`,
      });
    } catch (error) {
      setStatusBanner(isProductStudioErrorEnvelope(error) ? toBannerFromEnvelope(error) : {
        tone: 'error',
        text: error instanceof Error ? error.message : String(error || 'Preview generation failed'),
      });
    } finally {
      setBusyLabel('');
    }
  }

  async function startBatch() {
    const promptConfig = saveCurrentPromptConfig();
    if (!promptConfig || !activeBundle) {
      return;
    }
    const batchJobId = createProductStudioId('batch');
    batchPausedRef.current = false;
    batchCancelledRef.current = false;
    currentProviderJobIdRef.current = '';
    setRunningBatchJobId(batchJobId);
    setBatchPaused(false);
    setBusyLabel('Running batch');
    try {
      const fixedInputImages = batchFixedInputIds
        .map((imageId) => allAssetIds.get(imageId))
        .filter((asset): asset is StudioAssetSelection => Boolean(asset))
        .map((asset) => ({
          sourceType: asset.sourceType,
          sourceId: asset.id,
          fileUrl: asset.fileUrl,
          label: asset.label,
        }));
      const sourceRuns = batchSourceAssets
        .filter((asset) => selectedBatchSourceIds.includes(asset.id))
        .map((asset) => ({
          sourceId: asset.id,
          title: asset.label,
          sourceRef: {
            sourceType: asset.sourceType,
            sourceId: asset.id,
            fileUrl: asset.fileUrl,
            label: asset.label,
          },
        }));
      const executionPromptConfig = {
        ...promptConfig,
        generationMode: fixedInputImages.length > 0 || sourceRuns.length > 0 ? 'multimodal' as const : 'text-to-image' as const,
      };

      const { batchJob, generatedImages, blockingError } = await runProductStudioBatchGeneration({
        batchJobId,
        projectId: activeBundle.project.id,
        promptConfig: executionPromptConfig,
        promptText: promptConfig.refinedPrompt || promptConfig.userIntent,
        appliedSellingPoints: selectedSellingPoints(),
        baseInputImages: fixedInputImages,
        sourceRuns,
        variantCount: batchCount,
        controller: {
          isPaused: () => batchPausedRef.current,
          isCancelled: () => batchCancelledRef.current,
          waitWhilePaused: async () => {
            if (!batchPausedRef.current) {
              return;
            }
            await new Promise<void>((resolve) => {
              batchResumeResolversRef.current.push(resolve);
            });
          },
          onProviderJobId: (jobId) => {
            currentProviderJobIdRef.current = jobId;
          },
        },
        onProgress: ({ batchJob: nextBatchJob, generatedImage }) => {
          upsertProductStudioBatchJob(nextBatchJob);
          if (generatedImage) {
            addProductStudioGeneratedImage(generatedImage);
            setPreviewAssetId((current) => current || generatedImage.id);
          }
        },
      });
      upsertProductStudioBatchJob(batchJob);
      upsertManyProductStudioGeneratedImages(generatedImages);
      setWorkspaceTab('batch');
      setPreviewAssetId(generatedImages[0]?.id || '');
      setStatusBanner(blockingError ? toBannerFromEnvelope(blockingError) : {
        tone: batchJob.status === 'CANCELLED' ? 'error' : 'info',
        text: batchJob.status === 'CANCELLED'
          ? 'Batch cancelled.'
          : `Batch run finished with ${batchJob.completedCount} completed and ${batchJob.failedCount} failed.`,
      });
    } catch (error) {
      setStatusBanner(isProductStudioErrorEnvelope(error) ? toBannerFromEnvelope(error) : {
        tone: 'error',
        text: error instanceof Error ? error.message : String(error || 'Batch generation failed'),
      });
    } finally {
      setBusyLabel('');
      setRunningBatchJobId('');
      setBatchPaused(false);
      batchPausedRef.current = false;
      batchCancelledRef.current = false;
      currentProviderJobIdRef.current = '';
    }
  }

  function pauseBatch() {
    if (!runningBatchJobId || batchPausedRef.current) {
      return;
    }
    batchPausedRef.current = true;
    setBatchPaused(true);
    const batch = activeBundle?.batchJobs.find((item) => item.id === runningBatchJobId);
    if (batch) {
      upsertProductStudioBatchJob({ ...batch, status: 'PAUSED' });
    }
    setStatusBanner({ tone: 'info', text: 'Batch will pause after the current provider job finishes.' });
  }

  function resumeBatch() {
    if (!runningBatchJobId || !batchPausedRef.current) {
      return;
    }
    batchPausedRef.current = false;
    setBatchPaused(false);
    const resolvers = [...batchResumeResolversRef.current];
    batchResumeResolversRef.current = [];
    for (const resolve of resolvers) {
      resolve();
    }
    const batch = activeBundle?.batchJobs.find((item) => item.id === runningBatchJobId);
    if (batch) {
      upsertProductStudioBatchJob({ ...batch, status: 'RUNNING' });
    }
    setStatusBanner({ tone: 'info', text: 'Batch resumed.' });
  }

  async function cancelBatch() {
    if (!runningBatchJobId) {
      return;
    }
    batchCancelledRef.current = true;
    setBatchPaused(false);
    const resolvers = [...batchResumeResolversRef.current];
    batchResumeResolversRef.current = [];
    for (const resolve of resolvers) {
      resolve();
    }
    if (currentProviderJobIdRef.current) {
      try {
        const { getProductStudioRuntimeClient } = await import('./runtime-mod.js');
        await getProductStudioRuntimeClient().media.jobs.cancel({
          jobId: currentProviderJobIdRef.current,
          reason: 'product_studio_user_cancelled',
        });
      } catch {
        // Ignore runtime cancel errors; loop exit still depends on controller flag.
      }
    }
    setStatusBanner({ tone: 'info', text: 'Batch cancellation requested.' });
  }

  function openSellingPointsEditor() {
    if (!activeBundle) {
      return;
    }
    const grouped = {
      product: activeBundle.sellingPoints.filter((item) => item.category === 'product').map((item) => item.text),
      store: activeBundle.sellingPoints.filter((item) => item.category === 'store').map((item) => item.text),
    };
    setEditorDraft(activeBundle.sellingPoints.map((item) => ({ ...item })));
    setEditorJson(JSON.stringify(grouped, null, 2));
    setEditorTab('visual');
    setSellingPointsOpen(true);
  }

  function applySellingPoints() {
    if (!activeBundle) {
      return;
    }

    let nextPoints = editorDraft;
    if (editorTab === 'json') {
      try {
        const parsed = JSON.parse(editorJson) as { product?: string[]; store?: string[] };
        const product = Array.isArray(parsed.product) ? parsed.product : [];
        const store = Array.isArray(parsed.store) ? parsed.store : [];
        nextPoints = [
          ...product.map((text, index) => ({
            id: createProductStudioId('sp'),
            projectId: activeBundle.project.id,
            category: 'product' as const,
            text,
            sortOrder: index + 1,
            isActive: true,
            createdAt: new Date().toISOString(),
          })),
          ...store.map((text, index) => ({
            id: createProductStudioId('sp'),
            projectId: activeBundle.project.id,
            category: 'store' as const,
            text,
            sortOrder: product.length + index + 1,
            isActive: true,
            createdAt: new Date().toISOString(),
          })),
        ];
      } catch {
        setStatusBanner({ tone: 'error', text: 'Selling points JSON is invalid. Fix the JSON before applying it.' });
        return;
      }
    }

    replaceProductStudioSellingPoints(activeBundle.project.id, nextPoints);
    setSelectedSellingPointIds(nextPoints.filter((item) => item.isActive).map((item) => item.id));
    setSellingPointsOpen(false);
    setStatusBanner({ tone: 'info', text: 'Selling points updated for the current project.' });
  }

  function updateEditorPoint(id: string, patch: Partial<ProductStudioSellingPoint>) {
    setEditorDraft((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addEditorPoint(category: ProductStudioSellingPointCategory) {
    if (!activeBundle) {
      return;
    }
    setEditorDraft((current) => [
      ...current,
      {
        id: createProductStudioId('sp'),
        projectId: activeBundle.project.id,
        category,
        text: category === 'product' ? 'New product narrative' : 'New store support line',
        sortOrder: current.length + 1,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function removeEditorPoint(id: string) {
    setEditorDraft((current) => current.filter((item) => item.id !== id));
  }

  function updateGeneratedImage(id: string, patch: Partial<ProductStudioProjectBundle['generatedImages'][number]>) {
    const target = activeBundle?.generatedImages.find((item) => item.id === id);
    if (!target) {
      return;
    }
    addProductStudioGeneratedImage({ ...target, ...patch });
  }

  function renderDashboard() {
    const filteredBundles = projectBundles.filter((bundle) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return [bundle.project.name, bundle.project.description].some((value) =>
        String(value || '').toLowerCase().includes(query),
      );
    });
    const totalGenerations = projectBundles.reduce((sum, b) => sum + b.generatedImages.length, 0);
    const totalBatchRuns = projectBundles.reduce((sum, b) => sum + b.batchJobs.length, 0);

    return (
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Generations', value: totalGenerations.toLocaleString(), trend: '+14%', hint: 'vs last period' },
            { label: 'Active Workspaces', value: String(projectBundles.length), trend: null, hint: 'prompt-led campaigns' },
            { label: 'Batch Runs', value: String(totalBatchRuns), trend: null, hint: 'completed or partial' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-[#f2f3ff] p-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#45464d]">{stat.label}</div>
              <div className="mt-3 flex items-end gap-3">
                <div className="text-4xl font-extrabold tracking-[-0.05em] text-[#131b2e]" style={{ fontFamily: headlineFont }}>
                  {stat.value}
                </div>
                {stat.trend ? (
                  <div className="mb-1 rounded-full bg-[#dae2fd] px-2 py-0.5 text-xs font-bold text-[#497cff]">{stat.trend}</div>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-[#45464d]">{stat.hint}</div>
            </div>
          ))}
        </div>

        {/* Projects grid */}
        <div>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#131b2e]" style={{ fontFamily: headlineFont }}>Your Projects</h2>
            <div className="text-xs font-medium text-[#45464d]">{filteredBundles.length} workspace{filteredBundles.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredBundles.map((bundle) => (
              <article
                key={bundle.project.id}
                onClick={() => enterWorkspace(bundle.project.id)}
                className="group cursor-pointer overflow-hidden rounded-2xl bg-white shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-[#eaedff]">
                  {resolveDisplayUrl(displayImageMap, bundle.project.heroImageUrl) ? (
                    <img
                      src={resolveDisplayUrl(displayImageMap, bundle.project.heroImageUrl)}
                      alt={bundle.project.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Icon name="photo_library" className="text-4xl text-[#c6c6cd]" />
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#45464d]">
                    {bundle.referenceImages.length > 0 ? 'Reference' : 'Starter'}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-[#45464d] hover:bg-white"
                  >
                    <Icon name="more_vert" className="text-base" />
                  </button>
                </div>
                <div className="p-5">
                  <div className="mb-1">
                    <h3 className="text-base font-bold text-[#131b2e]" style={{ fontFamily: headlineFont }}>{bundle.project.name}</h3>
                  </div>
                  <p className="text-xs text-[#45464d]">{formatRelativeUpdate(bundle.project.updatedAt)}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">
                        <span>Generations</span>
                        <span className="text-[#131b2e]">{bundle.generatedImages.length}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eaedff]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, bundle.generatedImages.length * 10)}%`, backgroundImage: signatureGradient }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">
                        <span>Brand Kit</span>
                        <span className="text-[#131b2e]">{bundle.sellingPoints.length}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eaedff]">
                        <div
                          className="h-full rounded-full bg-[#9466ff]"
                          style={{ width: `${Math.min(100, bundle.sellingPoints.length * 10)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
            {/* Start New Project card */}
            <button
              type="button"
              onClick={handleCreateProject}
              disabled={Boolean(busyLabel)}
              className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#c6c6cd] bg-transparent text-[#45464d] transition-colors hover:border-[#497cff] hover:bg-[#f2f3ff] hover:text-[#497cff] disabled:opacity-50"
            >
              <div className="grid h-12 w-12 place-items-center rounded-full bg-[#eaedff]">
                <Icon name="add" className="text-2xl" />
              </div>
              <div className="text-sm font-semibold">{busyLabel || 'Start New Project'}</div>
            </button>
          </div>
        </div>

        {/* AI Suggestions */}
        <div className="rounded-2xl bg-[#f2f3ff] p-6">
          <div className="mb-4 flex items-center gap-2">
            <Icon name="auto_awesome" className="text-xl text-[#9466ff]" />
            <div className="text-sm font-bold text-[#131b2e]">AI Suggestions</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Optimize lighting for apparel', 'Try lifestyle backgrounds', 'A/B test color variants', 'Batch seasonal scenes', 'Refine selling narratives'].map((suggestion) => (
              <div key={suggestion} className="rounded-full bg-[#23005c] px-4 py-2 text-xs font-semibold text-white">
                {suggestion}
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { icon: 'trending_up', title: 'Conversion Insight', body: 'Lifestyle backgrounds improve CTR by 23% for apparel in your category.' },
              { icon: 'palette', title: 'Style Recommendation', body: 'Try neutral tones with high-contrast accent lighting for premium product feel.' },
            ].map((card) => (
              <div key={card.title} className="flex items-start gap-3 rounded-xl bg-white p-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e9ddff]">
                  <Icon name={card.icon} className="text-base text-[#9466ff]" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#131b2e]">{card.title}</div>
                  <div className="mt-1 text-xs text-[#45464d]">{card.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderTemplatesIndex() {
    const templates = projectBundles.flatMap((bundle) => bundle.promptConfigs.map((promptConfig) => ({ bundle, promptConfig })));
    return (
      <div className="mx-auto max-w-7xl space-y-10">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl p-10" style={{ background: signatureGradient }}>
          <div className="relative z-10 max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
              <Icon name="auto_awesome" className="text-xs" />
              AI Generation v2 Beta
            </div>
            <h2 className="text-[2.2rem] font-extrabold leading-tight tracking-[-0.05em] text-white" style={{ fontFamily: headlineFont }}>
              Predictive Scene Architecture
            </h2>
            <p className="mt-3 text-sm leading-7 text-white/70">
              Saved prompt configurations reusable across all product campaigns.
            </p>
            <button
              type="button"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/15 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/25"
            >
              <Icon name="play_circle" className="text-base" />
              Preview Engine
            </button>
          </div>
          <div className="pointer-events-none absolute -right-8 -top-4 hidden h-64 w-56 rotate-6 overflow-hidden rounded-2xl border-2 border-white/20 bg-white/10 backdrop-blur-sm lg:block" />
        </section>

        {/* Template cards */}
        {templates.length === 0 ? (
          <div className="rounded-2xl bg-[#f2f3ff] p-8 text-sm text-[#45464d]">
            No templates saved yet. Open a workspace, write a prompt, and save it as a template.
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[#45464d]">Saved Templates</h3>
              <div className="text-xs font-medium text-[#45464d]">{templates.length} template{templates.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {templates.map(({ bundle, promptConfig }) => (
                <button
                  key={promptConfig.id}
                  type="button"
                  onClick={() => {
                    setActiveProjectId(bundle.project.id);
                    setPageView('workspace');
                    setWorkspaceTab('prompt');
                    setShellSection('projects');
                  }}
                  className="group overflow-hidden rounded-2xl bg-white text-left shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-[#eaedff]">
                    {resolveDisplayUrl(displayImageMap, bundle.project.heroImageUrl) ? (
                      <img
                        src={resolveDisplayUrl(displayImageMap, bundle.project.heroImageUrl)}
                        alt={bundle.project.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Icon name="auto_awesome_motion" className="text-4xl text-[#c6c6cd]" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9466ff]">{bundle.project.name}</div>
                    <div className="mt-2 text-base font-bold text-[#131b2e]" style={{ fontFamily: headlineFont }}>{promptConfig.name}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-lg bg-[#eaedff] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#45464d]">{promptConfig.generationMode}</span>
                      <span className="rounded-lg bg-[#eaedff] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#45464d]">{promptConfig.attachedImages.length} inputs</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#45464d]">
                      {promptConfig.refinedPrompt || promptConfig.userIntent || 'No prompt text saved yet.'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderAssetsIndex() {
    const assets = projectBundles.flatMap((bundle) => [
      ...bundle.referenceImages.map((asset, i) => ({ bundle, title: asset.label, fileUrl: asset.fileUrl, type: 'Reference', assetKey: `${bundle.project.id}-ref-${i}`, rating: 4.5 })),
      ...bundle.sceneImages.map((asset, i) => ({ bundle, title: asset.sourceLabel, fileUrl: asset.fileUrl, type: 'Scene', assetKey: `${bundle.project.id}-scene-${i}`, rating: 4.2 })),
      ...bundle.generatedImages.map((asset, i) => ({ bundle, title: asset.title, fileUrl: asset.fileUrl, type: 'Generated', assetKey: `${bundle.project.id}-gen-${i}`, rating: asset.rating ?? 4.8 })),
    ]);
    return (
      <div className="mx-auto max-w-7xl space-y-6 pb-20">
        {/* Header + filters */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#131b2e]" style={{ fontFamily: headlineFont }}>Project Asset Vault</h2>
            <p className="mt-1 text-xs text-[#45464d]">Review references, scenes, and generated outputs across all projects.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-xl bg-[#f2f3ff] px-3 py-2 text-xs font-semibold text-[#45464d]">
              <Icon name="filter_list" className="text-sm" />
              Batch
            </div>
            <div className="rounded-xl bg-[#f2f3ff] px-3 py-2 text-xs font-semibold text-[#45464d]">Asset Type</div>
            <div className="rounded-xl bg-[#f2f3ff] px-3 py-2 text-xs font-semibold text-[#45464d]">Rating</div>
            <div className="flex items-center gap-1.5 rounded-xl bg-[#dae2fd] px-3 py-2 text-xs font-semibold text-[#131b2e]">
              <Icon name="grid_view" className="text-sm" />
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((asset) => {
            const isSelected = selectedExportIds.includes(asset.assetKey);
            return (
              <button
                key={asset.assetKey}
                type="button"
                onClick={() => {
                  setSelectedExportIds((current) =>
                    current.includes(asset.assetKey)
                      ? current.filter((id) => id !== asset.assetKey)
                      : [...current, asset.assetKey],
                  );
                }}
                className={`group relative flex flex-col rounded-xl bg-white p-2 text-left transition-all ${isSelected ? 'border-2 border-[#497cff] ring-4 ring-[#497cff]/5' : 'border-2 border-transparent hover:border-[#dae2fd]'}`}
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-[#eaedff]">
                  {resolveDisplayUrl(displayImageMap, asset.fileUrl) ? (
                    <img
                      src={resolveDisplayUrl(displayImageMap, asset.fileUrl)}
                      alt={asset.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Icon name="image" className="text-3xl text-[#c6c6cd]" />
                    </div>
                  )}
                  {isSelected ? (
                    <div className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-[#497cff] text-white">
                      <Icon name="check" className="text-xs" />
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 px-1">
                  <div className="truncate text-[11px] font-bold text-[#131b2e]">{asset.title}</div>
                  <div className="mt-0.5 flex items-center justify-between gap-1">
                    <span className="text-[10px] text-[#45464d]">{asset.type}</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-[#45464d]">
                      <Icon name="star" className="text-[10px] text-amber-400" fill />
                      {asset.rating}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selection action bar */}
        {selectedExportIds.length > 0 ? (
          <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
            <div className="flex items-center gap-3 rounded-2xl bg-[#283044] px-5 py-3 shadow-2xl">
              <div className="text-sm font-bold text-white">{selectedExportIds.length} Assets Selected</div>
              <div className="h-4 w-px bg-white/20" />
              <button
                type="button"
                onClick={() => setSelectedExportIds([])}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#8ea4d8] hover:text-white"
              >
                Discard
              </button>
              <button
                type="button"
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                Move to
              </button>
              <button
                type="button"
                onClick={() => { void exportGallerySelection(); }}
                disabled={Boolean(busyLabel)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                style={{ backgroundImage: signatureGradient }}
              >
                Export Selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedExportIds([])}
                className="grid h-6 w-6 place-items-center rounded-full text-[#8ea4d8] hover:text-white"
              >
                <Icon name="close" className="text-sm" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderSettingsIndex() {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-2xl bg-[#f2f3ff] p-8">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#45464d]">Settings</div>
          <h2 className="mt-2 text-2xl font-bold text-[#131b2e]" style={{ fontFamily: headlineFont }}>Runtime and storage profile</h2>
          <p className="mt-1 text-sm text-[#45464d]">Desktop-mod execution model and storage configuration.</p>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {[
              ['Execution', 'Desktop runtime facade for text and image generation, with provider jobs backing preview and batch flows.'],
              ['Persistence', 'Local mod snapshot storage for projects, prompts, gallery state, references, scenes, and batch history.'],
              ['Export', 'Browser download fallback plus directory picker flow when the host supports direct writes.'],
            ].map(([label, body]) => (
              <div key={label} className="rounded-xl bg-white p-5 shadow-[0_4px_12px_rgba(15,23,42,0.05)]">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#45464d]">{label}</div>
                <p className="mt-3 text-sm leading-7 text-[#45464d]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderPromptWorkspace() {
    if (!activeBundle) return null;
    const isGeneratingPreview = busyLabel === 'Generating preview';
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-[#c6c6cd]/15 bg-[#f2f3ff] p-5">
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#45464d]">Image Inputs</div>
              <button type="button" onClick={() => referenceInputRef.current?.click()} className="text-[11px] font-bold text-[#497cff] hover:underline">+ Add</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {promptInputAssets.length === 0 ? (
                <div className="col-span-2 rounded-2xl border border-dashed border-[#c6c6cd] bg-white/60 px-4 py-6 text-center text-xs text-[#6a7186]">
                  No images yet
                </div>
              ) : null}
              {promptInputAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => toggleAttachedImage(asset.id)}
                  className={`group relative aspect-square overflow-hidden rounded-xl bg-[#eaedff] text-left transition-all ${attachedImageIds.includes(asset.id) ? 'ring-2 ring-[#497cff]' : 'hover:ring-2 hover:ring-[#d5dfff]'}`}
                >
                  {resolveDisplayUrl(displayImageMap, asset.fileUrl) ? (
                    <img src={resolveDisplayUrl(displayImageMap, asset.fileUrl)} alt={asset.label} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center"><Icon name="image" className="text-2xl text-[#c6c6cd]" /></div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0f172a]/75 to-transparent px-2 pb-2 pt-6">
                    <div className="truncate text-[11px] font-bold text-white">{asset.label}</div>
                    <div className="text-[10px] text-white/80">{asset.sourceType === 'scene' ? 'Scene asset' : 'Uploaded image'}</div>
                  </div>
                  {attachedImageIds.includes(asset.id) ? (
                    <>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleAttachedImage(asset.id);
                        }}
                        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[#131b2e]/85 text-white"
                        title="Remove from input"
                      >
                        <Icon name="close" className="text-sm" />
                      </button>
                      <div className="absolute right-10 top-2 grid min-h-[22px] min-w-[22px] place-items-center rounded-full bg-[#497cff] px-1 text-[10px] font-bold text-white">
                        {attachedImageIds.indexOf(asset.id) + 1}
                      </div>
                    </>
                  ) : null}
                </button>
              ))}
              <button
                type="button"
                onClick={() => referenceInputRef.current?.click()}
                className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-[#c6c6cd] bg-transparent text-[#c6c6cd] hover:border-[#497cff] hover:text-[#497cff]"
              >
                <Icon name="add_photo_alternate" className="text-xl" />
              </button>
            </div>
          </div>

          {/* Selling Points */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#45464d]">Selling Points</div>
              <button
                type="button"
                onClick={openSellingPointsEditor}
                className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#45464d] hover:text-[#497cff]"
              >
                Edit
              </button>
            </div>
            <div className="rounded-2xl bg-white/80 p-3 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold text-[#131b2e]">{selectedSellingPointIds.length} selected</div>
                {activeBundle.sellingPoints.length > 0 ? (
                  <div className="text-[10px] text-[#6a7186]">{activeBundle.sellingPoints.length} total</div>
                ) : null}
              </div>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {activeBundle.sellingPoints.filter((point) => selectedSellingPointIds.includes(point.id)).slice(0, 8).map((point) => (
                  <button
                    key={point.id}
                    type="button"
                    onClick={() => toggleSellingPoint(point.id)}
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#131b2e] px-2.5 py-1 text-[10px] font-semibold text-white"
                  >
                    <span className="truncate">{point.text}</span>
                    <Icon name="close" className="text-[10px]" />
                  </button>
                ))}
                {selectedSellingPointIds.length === 0 ? (
                  <div className="text-[11px] text-[#6a7186]">No selling points selected.</div>
                ) : null}
                {selectedSellingPointIds.length > 8 ? (
                  <div className="inline-flex items-center rounded-full bg-[#edf1ff] px-2.5 py-1 text-[10px] font-semibold text-[#45464d]">
                    +{selectedSellingPointIds.length - 8} more
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        {/* Right panel */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#faf8ff]">
          <div className="flex-1 overflow-y-auto p-8">
            <div className="mx-auto max-w-3xl space-y-6">
              {statusBanner ? (
                <div className={`rounded-2xl px-5 py-3.5 text-sm ${statusBanner.tone === 'error' ? 'bg-[#ffdad6] text-[#7a1414]' : 'bg-[#dbe1ff] text-[#16377d]'}`}>
                  {statusBanner.text}
                </div>
              ) : null}
              {/* Generation header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className={`inline-flex rounded-full px-4 py-2 text-xs font-bold ${effectivePromptMode === 'multimodal' ? 'bg-[#e8f0ff] text-[#16377d]' : 'bg-[#eaedff] text-[#45464d]'}`}>
                  {effectivePromptMode === 'multimodal' ? `Image-guided generation · ${attachedImageIds.length} image${attachedImageIds.length > 1 ? 's' : ''}` : 'Text-only generation'}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex min-w-[220px] flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">Prompt Model</span>
                    <select
                      value={promptOptimizeModel || ''}
                      onChange={(event) => setPromptOptimizeModel(event.target.value)}
                      className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-[#131b2e] outline-none"
                    >
                      <option value="">{defaultPromptOptimizeModel ? `Runtime default · ${defaultPromptOptimizeModel}` : 'Runtime default'}</option>
                      {promptOptimizeModelMenu.map((model) => (
                        <option key={`prompt-model-${model}`} value={model}>{model}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex min-w-[220px] flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">Image Model</span>
                    <select
                      value={imageGenerateModel || ''}
                      onChange={(event) => setImageGenerateModel(event.target.value)}
                      className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-[#131b2e] outline-none"
                    >
                      <option value="">{defaultImageGenerateModel ? `Runtime default · ${defaultImageGenerateModel}` : 'Runtime default'}</option>
                      {imageGenerateModelMenu.map((model) => (
                        <option key={`image-model-${model}`} value={model}>{model}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {modelConfigError ? (
                <div className="rounded-xl border border-[#ffdad6] bg-[#ffdad6] px-4 py-3 text-xs text-[#93000a]">
                  {modelConfigError}
                </div>
              ) : null}

              {/* Intent textarea */}
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#45464d]">User Intent</div>
                <div className="relative">
                  <textarea
                    value={intent}
                    onChange={(event) => setIntent(event.target.value)}
                    className="h-40 w-full resize-none rounded-2xl bg-white px-5 py-4 pr-16 text-sm leading-7 text-[#131b2e] shadow-[0_4px_16px_rgba(15,23,42,0.06)] outline-none"
                    placeholder="Describe your creative vision in natural language..."
                  />
                  <div className="absolute bottom-3 left-4 text-[10px] font-medium text-[#c6c6cd]">{intent.length}/2000</div>
                  <button
                    type="button"
                    onClick={() => { void optimizePrompt(); }}
                    disabled={Boolean(busyLabel)}
                    className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-xl text-white shadow-lg disabled:opacity-40"
                    style={{ backgroundImage: signatureGradient }}
                    title="AI Optimize"
                  >
                    <Icon name="auto_fix_high" className="text-base" />
                  </button>
                </div>
              </div>

              {/* AI Optimized Prompt */}
              <div className="rounded-2xl bg-[#23005c] p-5 text-white">
                <div className="mb-3 flex items-center gap-2">
                  <Icon name="auto_fix_high" className="text-base text-[#d0bcff]" fill />
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#d0bcff]">AI Optimized Prompt</div>
                </div>
                <textarea
                  value={refinedPrompt}
                  onChange={(event) => setRefinedPrompt(event.target.value)}
                  className="min-h-[120px] w-full resize-none bg-transparent text-sm leading-7 text-[#eef0ff] outline-none"
                  placeholder="AI-optimized prompt will appear here..."
                />
              </div>

              {/* 2-col preview */}
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#45464d]">Primary Input</div>
                  <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-[#eaedff]">
                    {resolveDisplayUrl(displayImageMap, allAssetIds.get(attachedImageIds[0] || '')?.fileUrl || activeBundle.project.heroImageUrl) ? (
                      <img
                        src={resolveDisplayUrl(displayImageMap, allAssetIds.get(attachedImageIds[0] || '')?.fileUrl || activeBundle.project.heroImageUrl)}
                        alt="Source"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center"><Icon name="image" className="text-4xl text-[#c6c6cd]" /></div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#45464d]">Generation Preview</div>
                  <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl bg-[#eaedff]">
                    {isGeneratingPreview ? (
                      <>
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80">
                          <Icon name="hourglass_top" className="animate-pulse text-2xl text-[#497cff]" />
                        </div>
                        <div className="text-xs font-medium text-[#45464d]">Generating preview...</div>
                        <div className="text-[10px] text-[#8d91a0]">The image will appear here as soon as it is ready.</div>
                      </>
                    ) : previewAsset && resolveDisplayUrl(displayImageMap, previewAsset.fileUrl) ? (
                      <img src={resolveDisplayUrl(displayImageMap, previewAsset.fileUrl)} alt={previewAsset.title} className="h-full w-full object-cover" />
                    ) : (
                      <>
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80">
                          <Icon name="image_search" className="text-2xl text-[#c6c6cd]" />
                        </div>
                        <div className="text-xs font-medium text-[#45464d]">No preview yet</div>
                        <div className="text-[10px] text-[#c6c6cd]">Click Generate Now to create</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky bottom bar */}
          <div className="shrink-0 bg-[#283044] px-6 py-4">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-6">
              <div className="flex items-center gap-8 text-xs">
                <div>
                  <div className="font-bold uppercase tracking-[0.16em] text-[#8ea4d8]">Guidance</div>
                  <div className="mt-0.5 text-sm font-bold text-white">7.5</div>
                </div>
                <div>
                  <div className="font-bold uppercase tracking-[0.16em] text-[#8ea4d8]">Steps</div>
                  <div className="mt-0.5 text-sm font-bold text-white">30</div>
                </div>
                <div>
                  <div className="font-bold uppercase tracking-[0.16em] text-[#8ea4d8]">Sampler</div>
                  <div className="mt-0.5 text-sm font-bold text-white">Runtime Default</div>
                </div>
              </div>
              <button
                type="button"
                onClick={previewGenerate}
                disabled={Boolean(busyLabel)}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(73,124,255,0.3)] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundImage: signatureGradient }}
              >
                <Icon name="bolt" className="text-base" fill />
                {busyLabel || 'GENERATE NOW'}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderBatchWorkspace() {
    if (!activeBundle) return null;
    const activeBatchJob = activeBundle.batchJobs.find((item) => item.id === runningBatchJobId);
    const progressPct = activeBatchJob
      ? Math.min(100, Math.round((activeBatchJob.completedCount / Math.max(1, activeBatchJob.totalCount)) * 100))
      : 0;
    const totalFailures = activeBundle.batchJobs.reduce((sum, b) => sum + b.failedCount, 0);
    const fixedInputAssets = batchFixedAssets;
    const hasBatchSource = selectedBatchSourceIds.length > 0;
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Row 1: Pipeline hero + Config panel */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Pipeline hero */}
          <div className="rounded-2xl bg-[#f2f3ff] p-6">
            <div className="mb-5 flex items-start justify-between gap-5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#45464d]">Active Pipeline</div>
                <div className="mt-2 text-2xl font-bold text-[#131b2e]" style={{ fontFamily: headlineFont }}>
                  {templateName || 'Batch Generation Run'}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-5 text-right">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">Success</div>
                  <div className="mt-1 text-xl font-bold text-[#497cff]">{activeBundle.generatedImages.length}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">Failures</div>
                  <div className="mt-1 text-xl font-bold text-[#ba1a1a]">{totalFailures}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">ETA</div>
                  <div className="mt-1 text-xl font-bold text-[#131b2e]">{runningBatchJobId ? 'Running' : 'Idle'}</div>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#45464d]">Generation Progress</span>
                <span className="text-[#497cff]">{progressPct}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-[#dae2fd]">
                <div className="h-full rounded-full" style={{ width: `${progressPct}%`, backgroundImage: signatureGradient }} />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-3">
              {[
                { label: 'Run Count', value: hasBatchSource ? `${selectedBatchSourceIds.length}` : `${batchCount}` },
                { label: 'Throughput', value: `${activeBundle.generatedImages.length} img` },
                { label: 'Latency', value: 'Runtime' },
                { label: 'Emergency Stop', value: null, isStop: true },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl bg-white p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#45464d]">{metric.label}</div>
                  {metric.isStop ? (
                    <button
                      type="button"
                      onClick={() => { void cancelBatch(); }}
                      disabled={!runningBatchJobId}
                      className="mt-2 w-full rounded-lg bg-[#ffdad6] px-2 py-1 text-[10px] font-bold text-[#ba1a1a] disabled:opacity-40"
                    >
                      STOP
                    </button>
                  ) : (
                    <div className="mt-1.5 text-sm font-bold text-[#131b2e]">{metric.value}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Config panel */}
          <div className="rounded-2xl bg-[#f2f3ff] p-5">
            <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[#45464d]">Configuration</div>
            <div className="space-y-4">
              <label className="block">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">Prompt Template</div>
                <select
                  className="w-full rounded-xl bg-white px-4 py-2.5 text-sm text-[#131b2e] outline-none"
                  value={activePromptConfig?.id || ''}
                  onChange={(event) => {
                    const promptConfig = activeBundle.promptConfigs.find((item) => item.id === event.target.value);
                    if (!promptConfig) return;
                    setTemplateName(promptConfig.name);
                    setPromptMode(promptConfig.generationMode);
                    setPromptOptimizeModel(promptConfig.promptOptimizeModel || '');
                    setImageGenerateModel(promptConfig.imageGenerateModel || '');
                    setIntent(promptConfig.userIntent);
                    setRefinedPrompt(promptConfig.refinedPrompt);
                    setWorkspaceTab('batch');
                  }}
                >
                  {activeBundle.promptConfigs.map((promptConfig) => (
                    <option key={promptConfig.id} value={promptConfig.id}>{promptConfig.name}</option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-white p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">Prompt Model</div>
                  <div className="mt-2 break-all text-sm font-semibold text-[#131b2e]">
                    {promptOptimizeModel || (defaultPromptOptimizeModel ? `Runtime default · ${defaultPromptOptimizeModel}` : 'Runtime default')}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">Image Model</div>
                  <div className="mt-2 break-all text-sm font-semibold text-[#131b2e]">
                    {imageGenerateModel || (defaultImageGenerateModel ? `Runtime default · ${defaultImageGenerateModel}` : 'Runtime default')}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">Fixed Inputs</div>
                  <div className="space-y-2 rounded-xl bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-[#6a7186]">Upload batch-only fixed images here. They do not come from Prompt Studio.</div>
                      <button
                        type="button"
                        onClick={() => batchFixedInputRef.current?.click()}
                        className="rounded-full bg-[#edf1ff] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#497cff]"
                      >
                        + Add
                      </button>
                    </div>
                    {fixedInputAssets.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#d5daf3] px-3 py-4 text-xs text-[#6a7186]">
                        No fixed batch images yet. If you leave this empty, batch will run from prompt text or from the batch source only.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {fixedInputAssets.map((asset, index) => (
                          <div key={`fixed-${asset.id}`} className="relative overflow-hidden rounded-xl bg-[#f2f3ff]">
                            <button
                              type="button"
                              onClick={() => setBatchFixedInputIds((current) => current.filter((item) => item !== asset.id))}
                              className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-[#131b2e]/80 text-white"
                              title="Remove fixed input"
                            >
                              <Icon name="close" className="text-sm" />
                            </button>
                            <div className="aspect-square overflow-hidden bg-[#eaedff]">
                              {resolveDisplayUrl(displayImageMap, asset.fileUrl) ? (
                                <img src={resolveDisplayUrl(displayImageMap, asset.fileUrl)} alt={asset.label} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center"><Icon name="image" className="text-3xl text-[#c6c6cd]" /></div>
                              )}
                            </div>
                            <div className="space-y-1 p-2">
                              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#497cff]">Fixed {index + 1}</div>
                              <div className="truncate text-[11px] font-semibold text-[#131b2e]">{asset.label}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">Batch Source</div>
                  <div className="space-y-2 rounded-xl bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-[#6a7186]">These are the images batch will rotate through. Pick any number of uploaded source images.</div>
                      <button
                        type="button"
                        onClick={() => batchSourceInputRef.current?.click()}
                        className="rounded-full bg-[#edf1ff] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#497cff]"
                      >
                        + Add
                      </button>
                    </div>
                    {batchSourceAssets.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#d5daf3] px-3 py-4 text-xs text-[#6a7186]">
                        No batch source images yet. If you leave this empty, batch will generate multiple variants from the same prompt.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {batchSourceAssets.map((asset) => (
                          <label key={asset.id} className="flex items-center gap-3 rounded-xl bg-[#f7f8ff] px-3 py-2.5 text-xs text-[#45464d]">
                            <input
                              type="checkbox"
                              checked={selectedBatchSourceIds.includes(asset.id)}
                              onChange={() => setSelectedBatchSourceIds((current) =>
                                current.includes(asset.id) ? current.filter((item) => item !== asset.id) : [...current, asset.id],
                              )}
                            />
                            <div className="h-10 w-10 overflow-hidden rounded-lg bg-[#eaedff]">
                              {resolveDisplayUrl(displayImageMap, asset.fileUrl) ? (
                                <img src={resolveDisplayUrl(displayImageMap, asset.fileUrl)} alt={asset.label} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center"><Icon name="image" className="text-lg text-[#c6c6cd]" /></div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[11px] font-semibold text-[#131b2e]">{asset.label}</div>
                              <div className="text-[10px] text-[#6a7186]">Uploaded batch source</div>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">
                              {asset.status}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <label className="block">
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#45464d]">Fallback Variant Count</div>
                  <input type="range" min={2} max={12} value={batchCount} onChange={(event) => setBatchCount(Number(event.target.value))} className="w-full" />
                  <div className="mt-1 text-xs text-[#45464d]">{batchCount} prompt-only variants when no batch source is selected</div>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton label="Start Batch" tone="primary" onClick={startBatch} disabled={Boolean(busyLabel)} />
                <ActionButton label="Pause" onClick={pauseBatch} disabled={!runningBatchJobId || batchPaused} />
                <ActionButton label="Resume" onClick={resumeBatch} disabled={!runningBatchJobId || !batchPaused} />
                <ActionButton label="Cancel" tone="ghost" onClick={() => { void cancelBatch(); }} disabled={!runningBatchJobId} />
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: System logs */}
        <div className="rounded-2xl bg-[#131b2e] p-5">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="terminal" className="text-base text-[#8ea4d8]" />
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8ea4d8]">System Runtime Logs</div>
            <div className="ml-auto flex h-2 w-2 rounded-full bg-[#497cff]" style={{ animation: runningBatchJobId ? 'pulse 1.5s infinite' : undefined }} />
          </div>
          <div className="min-h-[120px] space-y-1 font-mono text-xs text-[#8ea4d8]">
            {activeBundle.batchJobs.length === 0 ? (
              <div className="text-[#45464d]">No batch runs yet. Logs will appear here during generation.</div>
            ) : (
              activeBundle.batchJobs.flatMap((b) => b.logs).slice(-20).map((log, i) => (
                <div key={i} className="text-[#a8b8d8]">&gt; {log}</div>
              ))
            )}
          </div>
        </div>

        {/* Row 3: Historical pipeline runs table */}
        <div className="rounded-2xl bg-[#f2f3ff] p-5">
          <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[#45464d]">Historical Pipeline Runs</div>
          {activeBundle.batchJobs.length === 0 ? (
            <div className="rounded-xl bg-white p-4 text-xs text-[#45464d]">No pipeline runs yet.</div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#eaedff]">
                    {['Run Name', 'Status', 'Completed', 'Failed', 'Total', 'Started'].map((col) => (
                      <th key={col} className="px-4 py-3 text-left font-bold uppercase tracking-[0.14em] text-[#45464d]">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeBundle.batchJobs.map((batch) => (
                    <tr key={batch.id} className="border-b border-[#eaedff] last:border-0">
                      <td className="px-4 py-3 font-semibold text-[#131b2e]">{batch.title}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${batch.status === 'COMPLETED' ? 'bg-[#dae2fd] text-[#497cff]' : batch.status === 'RUNNING' ? 'bg-[#e9ddff] text-[#9466ff]' : 'bg-[#f2f3ff] text-[#45464d]'}`}>
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-[#497cff]">{batch.completedCount}</td>
                      <td className="px-4 py-3 font-bold text-[#ba1a1a]">{batch.failedCount}</td>
                      <td className="px-4 py-3 text-[#131b2e]">{batch.totalCount}</td>
                      <td className="px-4 py-3 text-[#45464d]">{formatRelativeUpdate(batch.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderGalleryWorkspace() {
    if (!activeBundle) return null;
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Filters row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'All', value: 'all' as const },
              { label: 'Multimodal', value: 'multimodal' as const },
              { label: 'Text-to-Image', value: 'text-to-image' as const },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setGalleryModeFilter(item.value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${galleryModeFilter === item.value ? 'bg-[#131b2e] text-white' : 'bg-[#f2f3ff] text-[#45464d]'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-full bg-[#f2f3ff] p-1">
              {(['grid', 'compare'] as GalleryView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setGalleryView(view)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${galleryView === view ? 'bg-white text-[#131b2e] shadow-sm' : 'text-[#45464d]'}`}
                >
                  {view === 'grid' ? 'Grid' : 'Compare'}
                </button>
              ))}
            </div>
            <ActionButton
              label={selectedExportIds.length > 0 ? `Export (${selectedExportIds.length})` : 'Export All'}
              onClick={() => { void exportGallerySelection(); }}
              disabled={Boolean(busyLabel) || activeGallery.length === 0}
            />
          </div>
        </div>

        {activeGallery.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-[#f2f3ff] py-20">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#eaedff]">
              <Icon name="photo_library" className="text-3xl text-[#c6c6cd]" />
            </div>
            <div className="text-sm font-semibold text-[#45464d]">No images yet</div>
            <div className="text-xs text-[#c6c6cd]">Generate from Prompt Studio to populate the gallery</div>
          </div>
        ) : galleryView === 'grid' ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeGallery.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPreviewAssetId(item.id)}
                className="overflow-hidden rounded-2xl bg-white text-left shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
              >
                <div className="relative">
                  {resolveDisplayUrl(displayImageMap, item.fileUrl) ? (
                    <img src={resolveDisplayUrl(displayImageMap, item.fileUrl)} alt={item.title} className="h-52 w-full object-cover" />
                  ) : (
                    <div className="flex h-52 items-center justify-center bg-[#eaedff]">
                      <Icon name="image" className="text-4xl text-[#c6c6cd]" />
                    </div>
                  )}
                  <div
                    className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-white"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedExportIds((current) =>
                        current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
                      );
                    }}
                  >
                    {selectedExportIds.includes(item.id) ? (
                      <div className="h-4 w-4 rounded-full bg-[#497cff]" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-[#c6c6cd]" />
                    )}
                  </div>
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[#131b2e]">{item.title}</div>
                    <div className="rounded-full bg-[#eaedff] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#45464d]">{item.generationMode}</div>
                  </div>
                  <div className="text-xs text-[#45464d]">{formatRelativeUpdate(item.createdAt)}</div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <button
                          key={rating}
                          type="button"
                          onClick={(event) => { event.stopPropagation(); updateGeneratedImage(item.id, { rating }); }}
                          className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ${item.rating === rating ? 'bg-[#131b2e] text-white' : 'bg-[#eaedff] text-[#45464d]'}`}
                        >
                          {rating}
                        </button>
                      ))}
                    </div>
                    <ActionButton
                      label={item.status === 'discarded' ? 'Discarded' : 'Discard'}
                      tone="ghost"
                      small
                      onClick={() => updateGeneratedImage(item.id, { status: item.status === 'discarded' ? 'success' : 'discarded' })}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
              {resolveDisplayUrl(displayImageMap, activeBundle.sceneImages.find((item) => item.id === previewAsset?.sourceSceneImageId)?.fileUrl || activeBundle.project.heroImageUrl) ? (
                <img
                  src={resolveDisplayUrl(displayImageMap, activeBundle.sceneImages.find((item) => item.id === previewAsset?.sourceSceneImageId)?.fileUrl || activeBundle.project.heroImageUrl)}
                  alt="Source Scene"
                  className="h-80 w-full object-cover"
                />
              ) : (
                <div className="flex h-80 items-center justify-center bg-[#eaedff]"><Icon name="image" className="text-5xl text-[#c6c6cd]" /></div>
              )}
              <div className="p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#45464d]">Source Scene</div>
                <div className="mt-1 text-sm text-[#131b2e]">
                  {activeBundle.sceneImages.find((item) => item.id === previewAsset?.sourceSceneImageId)?.sourceLabel || 'No scene attached to this result.'}
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
              {resolveDisplayUrl(displayImageMap, previewAsset?.fileUrl || '') ? (
                <img
                  src={resolveDisplayUrl(displayImageMap, previewAsset?.fileUrl || '')}
                  alt={previewAsset?.title || 'Generated'}
                  className="h-80 w-full object-cover"
                />
              ) : (
                <div className="flex h-80 items-center justify-center bg-[#eaedff]"><Icon name="image" className="text-5xl text-[#c6c6cd]" /></div>
              )}
              <div className="space-y-2 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#45464d]">Generated Result</div>
                <div className="text-lg font-bold text-[#131b2e]" style={{ fontFamily: headlineFont }}>
                  {previewAsset?.title || 'No result selected'}
                </div>
                <div className="text-sm leading-6 text-[#45464d]">
                  {previewAsset?.actualPrompt || 'Select a gallery item to inspect the generated prompt context.'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!ready && projectBundles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#faf8ff]" style={{ fontFamily: bodyFont }}>
        <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#eaedff] border-t-[#497cff]" />
          <span className="text-sm font-medium text-[#45464d]">Loading Product Studio…</span>
        </div>
      </div>
    );
  }

  const isWorkspace = shellSection === 'projects' && pageView === 'workspace';
  const isPromptTab = isWorkspace && workspaceTab === 'prompt';

  return (
    <div
      data-nimi-mod-root="product-studio"
      className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[#faf8ff] text-[#131b2e]"
      style={{ fontFamily: bodyFont }}
    >
      <input ref={referenceInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void handleReferenceFilesSelected(event); }} />
      <input ref={sceneInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void handleSceneFilesSelected(event); }} />
      <input ref={batchFixedInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void handleBatchFixedFilesSelected(event); }} />
      <input ref={batchSourceInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void handleBatchSourceFilesSelected(event); }} />

      {/* Sidebar */}
      <aside className="flex h-full w-64 shrink-0 flex-col bg-white border-r border-[#c6c6cd]/20">
        {/* Brand */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="grid h-9 w-9 place-items-center rounded-xl text-white"
              style={{ backgroundImage: signatureGradient }}
            >
              <Icon name="dataset" className="text-base" fill />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-[#131b2e]" style={{ fontFamily: headlineFont }}>Product Studio</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.26em] text-[#45464d]">Elite Edition</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-3">
          {[
            { value: 'projects', label: 'Projects', icon: 'folder_open' },
            { value: 'templates', label: 'Templates', icon: 'auto_awesome_motion' },
            { value: 'assets', label: 'Asset Library', icon: 'photo_library' },
            { value: 'settings', label: 'Settings', icon: 'settings' },
          ].map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setShellSection(value as ShellSection);
                if (value !== 'projects') setPageView('dashboard');
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${shellSection === value ? 'bg-[#eaedff] font-semibold text-[#131b2e]' : 'text-[#45464d] hover:bg-[#f2f3ff]'}`}
            >
              <Icon name={icon} className={`text-xl ${shellSection === value ? 'text-[#497cff]' : 'text-[#c6c6cd]'}`} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Create New Project */}
        <div className="px-3 pb-4 pt-3">
          <button
            type="button"
            onClick={handleCreateProject}
            disabled={Boolean(busyLabel)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(73,124,255,0.25)] transition disabled:cursor-not-allowed disabled:opacity-45"
            style={{ backgroundImage: signatureGradient }}
          >
            <Icon name="add" className="text-base" />
            {busyLabel || 'Create New Project'}
          </button>
        </div>

        {/* Footer */}
        <div className="border-t border-[#c6c6cd]/20 px-3 py-4 space-y-0.5">
          {[
            { label: 'Support', icon: 'help_outline' },
            { label: 'Account', icon: 'person' },
          ].map(({ label, icon }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[#45464d]">
              <Icon name={icon} className="text-xl text-[#c6c6cd]" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-h-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-[#c6c6cd]/15 bg-white/90 px-6 backdrop-blur-md">
          <div className="flex items-center gap-2 text-sm">
            {isWorkspace ? (
              <>
                <button type="button" onClick={() => setPageView('dashboard')} className="text-[#45464d] hover:text-[#131b2e]">Projects</button>
                <Icon name="chevron_right" className="text-base text-[#c6c6cd]" />
                <span className="font-semibold text-[#131b2e]">{activeBundle?.project.name || 'Workspace'}</span>
              </>
            ) : (
              <span className="font-bold text-[#131b2e]">
                {shellSection === 'templates' ? 'Template Library' : shellSection === 'assets' ? 'Asset Library' : shellSection === 'settings' ? 'Settings' : 'Project Dashboard'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search…"
                className="w-48 rounded-full bg-[#f2f3ff] px-3 py-1.5 text-sm text-[#131b2e] outline-none"
              />
            </div>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-full text-[#45464d] hover:bg-[#f2f3ff]">
              <Icon name="notifications" className="text-xl" />
            </button>
            <button type="button" className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-xs font-semibold text-[#45464d] hover:bg-[#eaedff]">Share</button>
            <button
              type="button"
              onClick={() => { if (isWorkspace) { void previewGenerate(); } else { void handleCreateProject(); } }}
              disabled={Boolean(busyLabel)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              style={{ backgroundImage: signatureGradient }}
            >
              <Icon name="add" className="text-sm" />
              New Generation
            </button>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#dae2fd] text-xs font-bold text-[#497cff]">PS</div>
          </div>
        </header>

        {/* Workspace sub-nav */}
        {isWorkspace ? (
          <div className="flex shrink-0 items-center gap-1 border-b border-[#c6c6cd]/15 bg-white px-6 py-0">
            {[
              { key: 'prompt', label: 'Prompt Studio', icon: 'edit_note' },
              { key: 'batch', label: 'Batch Tasks', icon: 'batch_prediction' },
              { key: 'gallery', label: 'Gallery', icon: 'photo_library' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setWorkspaceTab(tab.key as WorkspaceTab)}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${workspaceTab === tab.key ? 'border-[#131b2e] text-[#131b2e]' : 'border-transparent text-[#45464d] hover:text-[#131b2e]'}`}
              >
                <Icon name={tab.icon} className="text-sm" />
                {tab.label}
              </button>
            ))}
            <div className="ml-4 inline-flex items-center gap-1.5 rounded-full bg-[#23005c] px-3 py-1 text-[10px] font-bold text-white">
              <Icon name="auto_awesome" className="text-xs" />
              AI Optimizer Enabled
            </div>
          </div>
        ) : null}

        {/* Content */}
        <div className={`min-h-0 flex-1 ${isPromptTab ? 'flex overflow-hidden' : 'overflow-auto px-8 pb-8 pt-6'}`}>
          {!isPromptTab && statusBanner ? (
            <div className={`mb-5 rounded-2xl px-5 py-3.5 text-sm ${statusBanner.tone === 'error' ? 'bg-[#ffdad6] text-[#7a1414]' : 'bg-[#dbe1ff] text-[#16377d]'}`}>
              {statusBanner.text}
            </div>
          ) : null}

          {shellSection === 'projects'
            ? (pageView === 'dashboard'
              ? renderDashboard()
              : workspaceTab === 'prompt'
                ? renderPromptWorkspace()
                : workspaceTab === 'batch'
                  ? renderBatchWorkspace()
                  : renderGalleryWorkspace())
            : shellSection === 'templates'
              ? renderTemplatesIndex()
              : shellSection === 'assets'
                ? renderAssetsIndex()
                : renderSettingsIndex()}
        </div>
      </main>

      {/* Selling Points Editor Modal */}
      {sellingPointsOpen ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#131b2e]/20 px-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#45464d]">Editor</div>
                <div className="mt-1 text-xl font-bold text-[#131b2e]" style={{ fontFamily: headlineFont }}>Selling Points Editor</div>
                <div className="mt-0.5 text-xs text-[#45464d]">Configure the narrative mix for AI prompt injection</div>
              </div>
              <button type="button" onClick={() => setSellingPointsOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-[#45464d] hover:bg-[#f2f3ff]">
                <Icon name="close" className="text-base" />
              </button>
            </div>

            {/* AI recommendation banner */}
            <div className="mx-6 mb-4 flex items-start gap-3 rounded-xl bg-[#23005c] px-4 py-3">
              <Icon name="auto_awesome" className="mt-0.5 shrink-0 text-base text-[#d0bcff]" />
              <div className="text-xs text-[#d0bcff]">
                <span className="font-bold text-white">AI Recommendation: </span>
                Highlight 2–4 points per category for optimal prompt saturation without context overflow.
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-[#eaedff] px-6">
              {(['visual', 'json'] as EditorTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setEditorTab(tab)}
                  className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${editorTab === tab ? 'border-[#131b2e] text-[#131b2e]' : 'border-transparent text-[#45464d]'}`}
                >
                  {tab === 'visual' ? 'Visual Editor' : 'JSON Schema'}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="p-6">
              {editorTab === 'visual' ? (
                <div className="space-y-3">
                  {editorDraft.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl bg-[#f2f3ff] p-3">
                      <Icon name="drag_indicator" className="shrink-0 text-lg text-[#c6c6cd]" />
                      <input
                        value={item.text}
                        onChange={(event) => updateEditorPoint(item.id, { text: event.target.value })}
                        className="w-1/3 shrink-0 rounded-lg bg-white px-3 py-2 text-xs text-[#131b2e] outline-none"
                        placeholder="Title"
                      />
                      <input
                        value={item.text}
                        onChange={(event) => updateEditorPoint(item.id, { text: event.target.value })}
                        className="flex-1 rounded-lg bg-white px-3 py-2 text-xs text-[#131b2e] outline-none"
                        placeholder="Description"
                      />
                      <button
                        type="button"
                        onClick={() => updateEditorPoint(item.id, { isActive: !item.isActive })}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${item.isActive ? 'bg-[#497cff]' : 'bg-[#c6c6cd]'}`}
                      >
                        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${item.isActive ? 'left-4' : 'left-0.5'}`} />
                      </button>
                      <button type="button" onClick={() => removeEditorPoint(item.id)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[#45464d] hover:bg-[#eaedff]">
                        <Icon name="delete_outline" className="text-sm" />
                      </button>
                    </div>
                  ))}
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => addEditorPoint('product')}
                      className="flex items-center gap-1.5 rounded-xl border border-dashed border-[#c6c6cd] px-4 py-2 text-xs font-semibold text-[#45464d] hover:border-[#497cff] hover:text-[#497cff]"
                    >
                      <Icon name="add" className="text-sm" />
                      Add New Selling Point
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-[#f2f3ff] p-3">
                  <textarea
                    value={editorJson}
                    onChange={(event) => setEditorJson(event.target.value)}
                    className="min-h-[320px] w-full rounded-lg bg-white px-4 py-3 font-mono text-xs leading-6 text-[#131b2e] outline-none"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[#eaedff] px-6 py-4">
              <div className="text-xs text-[#45464d]">Last synced 3s ago</div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSellingPointsOpen(false)} className="rounded-xl px-4 py-2 text-xs font-semibold text-[#45464d] hover:bg-[#f2f3ff]">
                  Discard Changes
                </button>
                <button
                  type="button"
                  onClick={applySellingPoints}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white"
                  style={{ backgroundImage: signatureGradient }}
                >
                  <Icon name="check" className="text-sm" />
                  Apply to Asset
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
