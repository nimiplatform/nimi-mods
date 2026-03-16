import React, { startTransition, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useModTranslation, type RuntimeCanonicalCapability, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot, type RuntimeRouteSource } from "@nimiplatform/sdk/mod";
import {
  createGarment,
  createWearLog,
  generateOutfitSuggestions,
  getDailyOutfitSnapshot,
  retireGarment,
  seedDemoWardrobe,
  seedProfileFromPreferences,
  subscribeDailyOutfitStore,
  toggleFavoriteOutfit,
  updateGarment,
  updateOutfitCollage,
  updateOutfitTryOn,
} from '../state/store.js';
import {
  analyzeGarmentPhoto,
  bindingForConnector,
  bindingForModel,
  bindingForSource,
  explainProviderUnavailableError,
  explainModalityError,
  generateGarmentCutout,
  generateOutfitTryOn,
  listDailyOutfitRouteOptions,
  resolveRoutePickerState,
  suggestAnalysisBinding,
  suggestCutoutBinding,
  suggestTryOnBinding,
} from '../runtime-ai-client.js';
import { DAILY_OUTFIT_AGE_GROUPS, DAILY_OUTFIT_CATEGORIES, DAILY_OUTFIT_GENDERS, DAILY_OUTFIT_SEASONS } from '../types.js';
import { compressImageForStorage, resolveImageUrlForDisplay, resolveImageUrlForRuntime } from '../image-storage.js';
import { generateOutfitCollageImage } from './outfit-collage.js';
import { WeatherFlowerBackground } from './weather-flower-background.js';

function MetricCard(input: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-[28px] border border-[#e9ded8] bg-white p-6 shadow-[0_14px_40px_-28px_rgba(80,55,45,0.18)]">
      <div className="text-sm font-medium text-[#8b7e78]">{input.label}</div>
      <div className="mt-2 text-4xl font-semibold tracking-[-0.03em] text-[#2f2927]">{input.value}</div>
      <div className="mt-2 text-sm text-[#9a8d86]">{input.hint}</div>
    </div>
  );
}

function SectionCard(input: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[32px] border border-[#e9ded8] bg-white p-8 shadow-[0_18px_48px_-32px_rgba(74,53,44,0.16)]">
      {input.eyebrow ? (
        <div className="text-xs uppercase tracking-[0.22em] text-[#b0867d]">{input.eyebrow}</div>
      ) : null}
      <h2 className="mt-1 text-[2rem] font-semibold tracking-[-0.03em] text-[#2f2927]">{input.title}</h2>
      <div className="mt-5">{input.children}</div>
    </section>
  );
}

function FieldLabel(input: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-neutral-700">
      <span className="font-medium text-neutral-900">{input.label}</span>
      {input.children}
      {input.hint ? <span className="text-xs text-neutral-500">{input.hint}</span> : null}
    </label>
  );
}

type DailyOutfitViewTab = 'overview' | 'wardrobe' | 'lab' | 'settings';
type WardrobeSubTab = 'intake' | 'closet';
type ClosetFilterChipKind = 'search' | 'category' | 'subcategory' | 'color' | 'material' | 'style' | 'season' | 'status';
type ClosetFilterChip = {
  kind: ClosetFilterChipKind;
  typeLabel: string;
  value: string;
  label: string;
};

function RoutePicker(input: {
  title: string;
  capability: RuntimeCanonicalCapability;
  snapshot: RuntimeRouteOptionsSnapshot | null;
  binding: RuntimeRouteBinding | null;
  loading: boolean;
  error: string;
  onReload: () => void;
  onBindingChange: (binding: RuntimeRouteBinding | null) => void;
}) {
  const { effectiveBinding, activeSource, activeConnectorId, activeModel, modelOptions } = resolveRoutePickerState(
    input.snapshot,
    input.binding,
  );
  const activeConnector = input.snapshot?.connectors.find((item) => item.id === activeConnectorId) || null;
  return (
    <div className="rounded-3xl border border-neutral-200 bg-neutral-50/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-neutral-950">{input.title}</div>
          <div className="text-xs text-neutral-500">{input.capability}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700"
            disabled={input.loading}
            onClick={input.onReload}
          >
            {input.loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700"
            onClick={() => input.onBindingChange(null)}
          >
            Use default
          </button>
        </div>
      </div>
      {input.error ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {input.error}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <FieldLabel label="Source">
          <select
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3"
            value={activeSource}
            onChange={(event) => input.onBindingChange(bindingForSource(input.snapshot, event.target.value as RuntimeRouteSource))}
            disabled={!input.snapshot}
          >
            <option value="local">Local</option>
            <option value="cloud">Cloud</option>
          </select>
        </FieldLabel>
        <FieldLabel label="Connector">
          <select
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3"
            value={activeSource === 'cloud' ? activeConnectorId : ''}
            onChange={(event) => input.onBindingChange(bindingForConnector(input.snapshot, event.target.value, effectiveBinding))}
            disabled={!input.snapshot || activeSource !== 'cloud'}
          >
            <option value="">None</option>
            {(input.snapshot?.connectors || []).map((connector) => (
              <option key={connector.id} value={connector.id}>
                {connector.label || connector.id}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Model">
          <select
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 font-mono text-sm"
            value={activeModel}
            onChange={(event) => input.onBindingChange(bindingForModel(input.snapshot, event.target.value, effectiveBinding))}
            disabled={!input.snapshot || modelOptions.length === 0}
          >
            {modelOptions.length === 0 ? (
              <option value="">{activeSource === 'cloud' ? 'No cloud models' : 'No local models'}</option>
            ) : null}
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>
      <div className="mt-3 text-xs text-neutral-500">
        {effectiveBinding
          ? `${effectiveBinding.source} · ${effectiveBinding.provider || activeConnector?.provider || '—'} · ${effectiveBinding.model || '—'}`
          : 'Using runtime default route'}
      </div>
    </div>
  );
}

function textList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function seasonSelected(current: string[], season: string): boolean {
  return current.includes(season);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('DAILY_OUTFIT_FILE_READ_FAILED'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  });
}

function collectImageRefs(values: Array<string | null | undefined>): string[] {
  const refs = new Set<string>();
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) {
      refs.add(normalized);
    }
  }
  return [...refs];
}

function displayImageUrl(imageUrl: string | null | undefined, resolved: Record<string, string>): string {
  const normalized = String(imageUrl || '').trim();
  if (!normalized) {
    return '';
  }
  return resolved[normalized] || normalized;
}

function normalizeClosetToken(value: string): string {
  return value.trim().toLowerCase();
}

function addUniqueTag(current: string[], nextValue: string): string[] {
  const trimmed = nextValue.trim();
  if (!trimmed) {
    return current;
  }
  return current.some((item) => normalizeClosetToken(item) === normalizeClosetToken(trimmed))
    ? current
    : [...current, trimmed];
}

export function DailyOutfitPage() {
  const { t } = useModTranslation('daily-outfit');
  const snapshot = useSyncExternalStore(subscribeDailyOutfitStore, getDailyOutfitSnapshot, getDailyOutfitSnapshot);
  const [viewTab, setViewTab] = useState<DailyOutfitViewTab>('overview');
  const [wardrobeSubTab, setWardrobeSubTab] = useState<WardrobeSubTab>('intake');
  const [gender, setGender] = useState<(typeof DAILY_OUTFIT_GENDERS)[number]>(snapshot.profile?.gender || 'female');
  const [ageGroup, setAgeGroup] = useState<(typeof DAILY_OUTFIT_AGE_GROUPS)[number]>(snapshot.profile?.ageGroup || '25-30');
  const [selfieUrl, setSelfieUrl] = useState(snapshot.profile?.selfieUrl || '');
  const [selfieFileName, setSelfieFileName] = useState('');
  const [profileStyleTags, setProfileStyleTags] = useState<string[]>(Object.keys(snapshot.profile?.styleWeights || {}));
  const [profileScenarioTags, setProfileScenarioTags] = useState<string[]>(Object.keys(snapshot.profile?.sceneFrequencies || {}));
  const [styleTagInput, setStyleTagInput] = useState('');
  const [scenarioTagInput, setScenarioTagInput] = useState('');

  const [category, setCategory] = useState<(typeof DAILY_OUTFIT_CATEGORIES)[number]>('top');
  const [subcategory, setSubcategory] = useState('');
  const [colorsText, setColorsText] = useState('white');
  const [styleTagsText, setStyleTagsText] = useState('minimal');
  const [material, setMaterial] = useState('cotton');
  const [seasons, setSeasons] = useState<string[]>(['spring', 'summer']);
  const [formalityLevel, setFormalityLevel] = useState('3');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFileName, setPhotoFileName] = useState('');
  const [cutoutUrl, setCutoutUrl] = useState('');
  const [analysisSummary, setAnalysisSummary] = useState('');
  const [analysisTraceId, setAnalysisTraceId] = useState('');
  const [cutoutTraceId, setCutoutTraceId] = useState('');
  const [closetQuery, setClosetQuery] = useState('');
  const [closetCategoryFilters, setClosetCategoryFilters] = useState<Array<(typeof DAILY_OUTFIT_CATEGORIES)[number]>>([]);
  const [closetSeasonFilters, setClosetSeasonFilters] = useState<Array<(typeof DAILY_OUTFIT_SEASONS)[number]>>([]);
  const [closetStatusFilters, setClosetStatusFilters] = useState<Array<'active' | 'retired'>>([]);
  const [closetSearchChips, setClosetSearchChips] = useState<ClosetFilterChip[]>([]);
  const [closetAutocompleteOpen, setClosetAutocompleteOpen] = useState(false);

  const [occasionInput, setOccasionInput] = useState('office coffee catch-up');
  const [uploadError, setUploadError] = useState('');
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [cutoutBusy, setCutoutBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [cutoutError, setCutoutError] = useState('');
  const [analysisRouteLoading, setAnalysisRouteLoading] = useState(false);
  const [cutoutRouteLoading, setCutoutRouteLoading] = useState(false);
  const [tryOnRouteLoading, setTryOnRouteLoading] = useState(false);
  const [analysisRouteError, setAnalysisRouteError] = useState('');
  const [cutoutRouteError, setCutoutRouteError] = useState('');
  const [tryOnRouteError, setTryOnRouteError] = useState('');
  const [analysisRouteSnapshot, setAnalysisRouteSnapshot] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [cutoutRouteSnapshot, setCutoutRouteSnapshot] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [tryOnRouteSnapshot, setTryOnRouteSnapshot] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [analysisBinding, setAnalysisBinding] = useState<RuntimeRouteBinding | null>(null);
  const [cutoutBinding, setCutoutBinding] = useState<RuntimeRouteBinding | null>(null);
  const [tryOnBinding, setTryOnBinding] = useState<RuntimeRouteBinding | null>(null);
  const [profileSaveBusy, setProfileSaveBusy] = useState(false);
  const [garmentSaveBusy, setGarmentSaveBusy] = useState(false);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const [filterCurrentSeason, setFilterCurrentSeason] = useState(true);
  const [filterRecentlyWorn, setFilterRecentlyWorn] = useState(true);
  const [tryOnBusy, setTryOnBusy] = useState(false);
  const [tryOnError, setTryOnError] = useState('');
  const [tryOnTraceId, setTryOnTraceId] = useState('');
  const [resolvedImageUrls, setResolvedImageUrls] = useState<Record<string, string>>({});
  const [openClosetActionId, setOpenClosetActionId] = useState<string | null>(null);
  const collageJobsRef = useRef(new Set<string>());
  const closetSearchRef = useRef<HTMLDivElement | null>(null);

  const loadRouteOptions = async (capability: RuntimeCanonicalCapability) => {
    return listDailyOutfitRouteOptions(capability);
  };

  const refreshAnalysisRoute = async () => {
    try {
      setAnalysisRouteLoading(true);
      setAnalysisRouteError('');
      const snapshot = await loadRouteOptions('text.generate');
      setAnalysisRouteSnapshot(snapshot);
      setAnalysisBinding((current) => suggestAnalysisBinding(snapshot, current));
    } catch (error) {
      setAnalysisRouteError(error instanceof Error ? error.message : String(error || 'FAILED_TO_LOAD_ANALYSIS_ROUTE'));
    } finally {
      setAnalysisRouteLoading(false);
    }
  };

  const refreshCutoutRoute = async () => {
    try {
      setCutoutRouteLoading(true);
      setCutoutRouteError('');
      const snapshot = await loadRouteOptions('image.generate');
      setCutoutRouteSnapshot(snapshot);
      setCutoutBinding((current) => suggestCutoutBinding(snapshot, current));
    } catch (error) {
      setCutoutRouteError(error instanceof Error ? error.message : String(error || 'FAILED_TO_LOAD_CUTOUT_ROUTE'));
    } finally {
      setCutoutRouteLoading(false);
    }
  };

  const refreshTryOnRoute = async () => {
    try {
      setTryOnRouteLoading(true);
      setTryOnRouteError('');
      const snapshot = await loadRouteOptions('image.generate');
      setTryOnRouteSnapshot(snapshot);
      setTryOnBinding((current) => suggestTryOnBinding(snapshot, current));
    } catch (error) {
      setTryOnRouteError(error instanceof Error ? error.message : String(error || 'FAILED_TO_LOAD_TRYON_ROUTE'));
    } finally {
      setTryOnRouteLoading(false);
    }
  };

  useEffect(() => {
    void refreshAnalysisRoute();
    void refreshCutoutRoute();
    void refreshTryOnRoute();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const missingCollages = snapshot.outfits.filter((outfit) => !outfit.collageImageUrl && outfit.itemIds.length > 0);
    if (missingCollages.length === 0) {
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      for (const outfit of missingCollages) {
        if (cancelled || collageJobsRef.current.has(outfit.id)) {
          continue;
        }
        const garments = outfit.itemIds
          .map((itemId) => snapshot.garments.find((garment) => garment.id === itemId) || null)
          .filter((garment): garment is NonNullable<typeof garment> => garment !== null)
          .filter((garment) => Boolean(garment.thumbnailUrl || garment.photoUrls[0]));
        if (garments.length === 0) {
          continue;
        }
        collageJobsRef.current.add(outfit.id);
        try {
          const collageImageUrl = await generateOutfitCollageImage({
            outfit,
            garments,
          });
          if (cancelled || !collageImageUrl) {
            continue;
          }
          const persistedCollageUrl = await compressImageForStorage({
            imageUrl: collageImageUrl,
            maxDimension: 1440,
            quality: 0.9,
            bucket: 'outfits',
          });
          if (cancelled || !persistedCollageUrl) {
            continue;
          }
          startTransition(() => {
            updateOutfitCollage(outfit.id, persistedCollageUrl);
          });
        } catch {
          // Ignore collage generation failures; recommendations still render as text.
        } finally {
          collageJobsRef.current.delete(outfit.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot.garments, snapshot.outfits]);

  useEffect(() => {
    if (snapshot.outfits.length === 0) {
      setSelectedOutfitId(null);
      return;
    }
    if (!selectedOutfitId || !snapshot.outfits.some((outfit) => outfit.id === selectedOutfitId)) {
      setSelectedOutfitId(snapshot.outfits[0]?.id || null);
    }
  }, [selectedOutfitId, snapshot.outfits]);

  useEffect(() => {
    let cancelled = false;
    const cleanup: Array<() => void> = [];
    const refs = collectImageRefs([
      selfieUrl,
      photoUrl,
      cutoutUrl,
      snapshot.profile?.selfieUrl,
      ...snapshot.garments.flatMap((garment) => [garment.thumbnailUrl, ...garment.photoUrls]),
      ...snapshot.outfits.flatMap((outfit) => [outfit.collageImageUrl, outfit.tryOnImageUrl]),
    ]);

    void (async () => {
      const next: Record<string, string> = {};
      for (const ref of refs) {
        const resolved = await resolveImageUrlForDisplay(ref);
        next[ref] = resolved.url;
        if (resolved.revoke) {
          cleanup.push(resolved.revoke);
        }
      }
      if (cancelled) {
        for (const revoke of cleanup) {
          revoke();
        }
        return;
      }
      setResolvedImageUrls(next);
    })();

    return () => {
      cancelled = true;
      for (const revoke of cleanup) {
        revoke();
      }
    };
  }, [cutoutUrl, photoUrl, selfieUrl, snapshot]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!closetSearchRef.current?.contains(event.target as Node)) {
        setClosetAutocompleteOpen(false);
      }
      const actionTarget = event.target as HTMLElement | null;
      if (!actionTarget?.closest('[data-closet-actions]')) {
        setOpenClosetActionId(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  const handleSaveProfile = async () => {
    try {
      setUploadError('');
      setProfileSaveBusy(true);
      const persistedSelfieUrl = selfieUrl.trim()
        ? await compressImageForStorage({
          imageUrl: selfieUrl.trim(),
          maxDimension: 1280,
          quality: 0.84,
          bucket: 'selfies',
        })
        : undefined;
      if (persistedSelfieUrl) {
        setSelfieUrl(persistedSelfieUrl);
      }
      startTransition(() => {
        seedProfileFromPreferences({
          gender,
          ageGroup,
          selfieUrl: persistedSelfieUrl,
          stylesText: profileStyleTags.join(', '),
          scenesText: profileScenarioTags.join(', '),
        });
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error || t('common.uploadFailed')));
    } finally {
      setProfileSaveBusy(false);
    }
  };

  const handleCreateGarment = async () => {
    if (!cutoutUrl.trim()) {
      setCutoutError('Generate a clean cutout before saving this garment.');
      return;
    }
    try {
      setGarmentSaveBusy(true);
      setCutoutError('');
      const persistedCutoutUrl = await compressImageForStorage({
        imageUrl: cutoutUrl.trim(),
        maxDimension: 1600,
        quality: 0.9,
        bucket: 'garments',
      });
      setCutoutUrl(persistedCutoutUrl);
      startTransition(() => {
        createGarment({
          photoUrls: [persistedCutoutUrl],
          thumbnailUrl: persistedCutoutUrl,
          category,
          subcategory: subcategory.trim() || undefined,
          colors: textList(colorsText),
          material: material.trim() || undefined,
          styleTags: textList(styleTagsText),
          seasons: seasons as (typeof DAILY_OUTFIT_SEASONS)[number][],
          formalityLevel: Number(formalityLevel),
        });
      });
      setPhotoUrl('');
      setSubcategory('');
      setColorsText('white');
      setStyleTagsText('minimal');
      setMaterial('cotton');
      setCutoutUrl('');
      setAnalysisSummary('');
      setAnalysisTraceId('');
      setCutoutTraceId('');
      setPhotoFileName('');
    } catch (error) {
      setCutoutError(error instanceof Error ? error.message : String(error || t('common.uploadFailed')));
    } finally {
      setGarmentSaveBusy(false);
    }
  };

  const handleToggleSeason = (season: string) => {
    setSeasons((current) => (
      current.includes(season)
        ? current.filter((entry) => entry !== season)
        : [...current, season]
    ));
  };

  const handleAddProfileStyleTag = () => {
    setProfileStyleTags((current) => addUniqueTag(current, styleTagInput));
    setStyleTagInput('');
  };

  const handleAddProfileScenarioTag = () => {
    setProfileScenarioTags((current) => addUniqueTag(current, scenarioTagInput));
    setScenarioTagInput('');
  };

  const removeProfileStyleTag = (tag: string) => {
    setProfileStyleTags((current) => current.filter((item) => item !== tag));
  };

  const removeProfileScenarioTag = (tag: string) => {
    setProfileScenarioTags((current) => current.filter((item) => item !== tag));
  };

  const toggleClosetCategoryFilter = (categoryValue: (typeof DAILY_OUTFIT_CATEGORIES)[number]) => {
    setClosetCategoryFilters((current) => (
      current.includes(categoryValue)
        ? current.filter((entry) => entry !== categoryValue)
        : [...current, categoryValue]
    ));
  };

  const toggleClosetSeasonFilter = (seasonValue: (typeof DAILY_OUTFIT_SEASONS)[number]) => {
    setClosetSeasonFilters((current) => (
      current.includes(seasonValue)
        ? current.filter((entry) => entry !== seasonValue)
        : [...current, seasonValue]
    ));
  };

  const toggleClosetStatusFilter = (statusValue: 'active' | 'retired') => {
    setClosetStatusFilters((current) => (
      current.includes(statusValue)
        ? current.filter((entry) => entry !== statusValue)
        : [...current, statusValue]
    ));
  };

  const addClosetSearchChip = (chip: ClosetFilterChip) => {
    setClosetSearchChips((current) => (
      current.some((entry) => entry.kind === chip.kind && entry.value === chip.value)
        ? current
        : [...current, chip]
    ));
    setClosetQuery('');
    setClosetAutocompleteOpen(false);
  };

  const removeClosetSearchChip = (chip: ClosetFilterChip) => {
    setClosetSearchChips((current) => current.filter((entry) => !(entry.kind === chip.kind && entry.value === chip.value)));
  };

  const clearClosetFilters = () => {
    setClosetQuery('');
    setClosetSearchChips([]);
    setClosetCategoryFilters([]);
    setClosetSeasonFilters([]);
    setClosetStatusFilters([]);
    setClosetAutocompleteOpen(false);
  };

  const handleRetireGarment = (garmentId: string) => {
    startTransition(() => {
      retireGarment(garmentId);
    });
    setOpenClosetActionId(null);
  };

  const handleReactivateGarment = (garmentId: string) => {
    startTransition(() => {
      updateGarment(garmentId, { status: 'active' });
    });
    setOpenClosetActionId(null);
  };

  const handleGenerateOutfits = () => {
    startTransition(() => {
      generateOutfitSuggestions({
        occasion: occasionInput,
        count: 3,
      });
    });
  };

  const handleSeedDemoWardrobe = () => {
    startTransition(() => {
      seedDemoWardrobe();
    });
  };

  const handleFavorite = (outfitId: string) => {
    startTransition(() => {
      toggleFavoriteOutfit(outfitId);
    });
  };

  const handleLogWear = (outfitId: string, occasion: string) => {
    startTransition(() => {
      createWearLog({
        outfitComboId: outfitId,
        itemIds: [],
        date: new Date().toISOString().slice(0, 10),
        occasion,
        notes: 'Logged from Daily Outfit recommendations',
      });
    });
  };

  const handleSelfieUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      setUploadError('');
      const dataUrl = await readFileAsDataUrl(file);
      setSelfieUrl(dataUrl);
      setSelfieFileName(file.name);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error || t('common.uploadFailed')));
    } finally {
      event.target.value = '';
    }
  };

  const handleGarmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      setUploadError('');
      setAnalysisError('');
      setCutoutError('');
      setAnalysisSummary('');
      setAnalysisTraceId('');
      setCutoutTraceId('');
      setCutoutUrl('');
      const dataUrl = await readFileAsDataUrl(file);
      setPhotoUrl(dataUrl);
      setPhotoFileName(file.name);
      if (!subcategory.trim()) {
        const inferredName = file.name.replace(/\.[^.]+$/u, '').replace(/[-_]+/gu, ' ').trim();
        if (inferredName) {
          setSubcategory(inferredName);
        }
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error || t('common.uploadFailed')));
    } finally {
      event.target.value = '';
    }
  };

  const handleAnalyzeGarment = async () => {
    if (!photoUrl.trim()) {
      setAnalysisError('Upload a garment image first.');
      return;
    }
    try {
      setAnalysisBusy(true);
      setAnalysisError('');
      const nextBinding = suggestAnalysisBinding(analysisRouteSnapshot, analysisBinding);
      if (nextBinding !== analysisBinding) {
        setAnalysisBinding(nextBinding);
      }
      const analysis = await analyzeGarmentPhoto({
        imageUrl: photoUrl.trim(),
        binding: nextBinding,
      });
      setCategory(analysis.category);
      setSubcategory(analysis.subcategory || '');
      setColorsText(analysis.colors.join(', '));
      setMaterial(analysis.material || '');
      setStyleTagsText(analysis.styleTags.join(', '));
      setSeasons(analysis.seasons);
      setFormalityLevel(String(analysis.formalityLevel));
      setAnalysisSummary(analysis.summary || '');
      setAnalysisTraceId(analysis.traceId || '');
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error || 'DAILY_OUTFIT_ANALYSIS_FAILED');
      setAnalysisError(rawMessage.includes('AI_MODALITY_NOT_SUPPORTED')
        ? explainModalityError({ capability: 'analysis', snapshot: analysisRouteSnapshot, binding: analysisBinding })
        : rawMessage);
    } finally {
      setAnalysisBusy(false);
    }
  };

  const handleGenerateCutout = async () => {
    if (!photoUrl.trim()) {
      setCutoutError('Upload a garment image first.');
      return;
    }
    try {
      setCutoutBusy(true);
      setCutoutError('');
      const nextBinding = suggestCutoutBinding(cutoutRouteSnapshot, cutoutBinding);
      if (nextBinding !== cutoutBinding) {
        setCutoutBinding(nextBinding);
      }
      const result = await generateGarmentCutout({
        imageUrl: photoUrl.trim(),
        category,
        subcategory: subcategory.trim() || undefined,
        material: material.trim() || undefined,
        colors: textList(colorsText),
        styleTags: textList(styleTagsText),
        binding: nextBinding,
      });
      const persistedCutoutUrl = await compressImageForStorage({
        imageUrl: result.imageUrl,
        maxDimension: 1600,
        quality: 0.9,
        bucket: 'garments',
        removeGeneratedBackground: true,
        trimTransparentPadding: true,
        trimMargin: 20,
      });
      setCutoutUrl(persistedCutoutUrl);
      setCutoutTraceId(result.traceId || '');
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error || 'DAILY_OUTFIT_CUTOUT_FAILED');
      setCutoutError(rawMessage.includes('AI_MODALITY_NOT_SUPPORTED')
        ? explainModalityError({ capability: 'cutout', snapshot: cutoutRouteSnapshot, binding: cutoutBinding })
        : rawMessage);
    } finally {
      setCutoutBusy(false);
    }
  };

  const activeGarments = snapshot.garments.filter((garment) => garment.status === 'active');
  const normalizedClosetQuery = normalizeClosetToken(closetQuery);
  const hasClosetFilters =
    closetCategoryFilters.length > 0 ||
    closetSeasonFilters.length > 0 ||
    closetStatusFilters.length > 0 ||
    closetSearchChips.length > 0;

  const closetAutocompleteOptions = [
    ...DAILY_OUTFIT_CATEGORIES.map((option) => ({
      kind: 'category' as const,
      typeLabel: '品类',
      value: option,
      label: t(`options.categories.${option}`),
    })),
    ...DAILY_OUTFIT_SEASONS.map((season) => ({
      kind: 'season' as const,
      typeLabel: '季节',
      value: season,
      label: t(`options.seasons.${season}`),
    })),
    { kind: 'status' as const, typeLabel: '状态', value: 'active', label: '启用中' },
    { kind: 'status' as const, typeLabel: '状态', value: 'retired', label: '已退役' },
    ...Array.from(new Set(snapshot.garments.flatMap((garment) => garment.colors))).map((value) => ({
      kind: 'color' as const,
      typeLabel: '颜色',
      value,
      label: value,
    })),
    ...Array.from(new Set(snapshot.garments.map((garment) => garment.material).filter(Boolean) as string[])).map((value) => ({
      kind: 'material' as const,
      typeLabel: '材质',
      value,
      label: value,
    })),
    ...Array.from(new Set(snapshot.garments.flatMap((garment) => garment.styleTags))).map((value) => ({
      kind: 'style' as const,
      typeLabel: '风格',
      value,
      label: value,
    })),
    ...Array.from(new Set(snapshot.garments.map((garment) => garment.subcategory).filter(Boolean) as string[])).map((value) => ({
      kind: 'subcategory' as const,
      typeLabel: '子类',
      value,
      label: value,
    })),
  ].filter((option, index, array) => array.findIndex((item) => item.kind === option.kind && item.value === option.value) === index);

  const filteredAutocompleteOptions = normalizedClosetQuery
    ? closetAutocompleteOptions.filter((option) => {
      const query = normalizedClosetQuery;
      return (
        normalizeClosetToken(option.label).includes(query) ||
        normalizeClosetToken(option.value).includes(query) ||
        normalizeClosetToken(option.typeLabel).includes(query)
      );
    }).filter((option) => !closetSearchChips.some((chip) => chip.kind === option.kind && chip.value === option.value)).slice(0, 8)
    : [];

  const filteredClosetGarments = snapshot.garments.filter((garment) => {
    if (closetCategoryFilters.length > 0 && !closetCategoryFilters.includes(garment.category)) {
      return false;
    }
    if (closetSeasonFilters.length > 0 && !garment.seasons.some((season) => closetSeasonFilters.includes(season as (typeof DAILY_OUTFIT_SEASONS)[number]))) {
      return false;
    }
    if (closetStatusFilters.length > 0 && !closetStatusFilters.includes(garment.status)) {
      return false;
    }
    if (closetSearchChips.length === 0) {
      return true;
    }

    return closetSearchChips.every((chip) => {
      const needle = normalizeClosetToken(chip.value);
      switch (chip.kind) {
        case 'category':
          return garment.category === chip.value;
        case 'season':
          return garment.seasons.includes(chip.value as (typeof DAILY_OUTFIT_SEASONS)[number]);
        case 'status':
          return garment.status === chip.value;
        case 'color':
          return garment.colors.some((color) => normalizeClosetToken(color).includes(needle));
        case 'material':
          return normalizeClosetToken(garment.material || '').includes(needle);
        case 'style':
          return garment.styleTags.some((tag) => normalizeClosetToken(tag).includes(needle));
        case 'subcategory':
          return normalizeClosetToken(garment.subcategory || '').includes(needle);
        case 'search':
        default: {
          const haystack = [
            garment.category,
            garment.subcategory,
            garment.material,
            garment.status,
            ...garment.colors,
            ...garment.styleTags,
            ...garment.seasons,
          ]
            .map((value) => normalizeClosetToken(String(value || '')))
            .join(' ');
          return haystack.includes(needle);
        }
      }
    });
  });
  const labOutfits = snapshot.outfits.slice(0, 3);
  const selectedOutfit = labOutfits.find((outfit) => outfit.id === selectedOutfitId) || labOutfits[0] || null;
  const selectedOutfitIndex = selectedOutfit ? Math.max(0, labOutfits.findIndex((outfit) => outfit.id === selectedOutfit.id)) : -1;
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());
  const insightCards = snapshot.insights.gapSuggestions.slice(0, 2).map((text, index) => ({
    text,
    className: index === 0
      ? 'border border-[#f0d4c8] bg-[#fff4ef] text-[#b15b3d]'
      : 'border border-[#dbe6fb] bg-[#f2f7ff] text-[#3c5ea8]',
  }));

  if (insightCards.length === 0) {
    insightCards.push({
      text: t('state.noInsights'),
      className: 'border border-[#ece3de] bg-[#f8f4f1] text-[#7f6f68]',
    });
  }

  const handleGenerateTryOn = async () => {
    if (!selectedOutfit?.collageImageUrl) {
      setTryOnError('请先生成搭配方案。');
      return;
    }
    if (!snapshot.profile?.selfieUrl) {
      setTryOnError('请先上传并保存自拍。');
      setViewTab('overview');
      return;
    }
    try {
      setTryOnBusy(true);
      setTryOnError('');
      const nextBinding = suggestTryOnBinding(tryOnRouteSnapshot, tryOnBinding || cutoutBinding);
      if (nextBinding !== tryOnBinding) {
        setTryOnBinding(nextBinding);
      }
      const result = await generateOutfitTryOn({
        selfieUrl: await resolveImageUrlForRuntime(snapshot.profile.selfieUrl),
        collageImageUrl: await resolveImageUrlForRuntime(selectedOutfit.collageImageUrl),
        occasion: selectedOutfit.occasion,
        reasoning: selectedOutfit.aiReasoning,
        binding: nextBinding,
      });
      const persistedTryOnUrl = await compressImageForStorage({
        imageUrl: result.imageUrl,
        maxDimension: 1440,
        quality: 0.9,
        bucket: 'outfits',
      });
      setTryOnTraceId(result.traceId || '');
      startTransition(() => {
        updateOutfitTryOn(selectedOutfit.id, persistedTryOnUrl);
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error || 'DAILY_OUTFIT_TRYON_FAILED');
      setTryOnError(rawMessage.includes('AI_MODALITY_NOT_SUPPORTED')
        ? explainModalityError({ capability: 'tryOn', snapshot: tryOnRouteSnapshot, binding: tryOnBinding || cutoutBinding })
        : rawMessage.includes('AI_PROVIDER_UNAVAILABLE')
          ? explainProviderUnavailableError({ capability: 'tryOn', snapshot: tryOnRouteSnapshot, binding: tryOnBinding || cutoutBinding })
          : rawMessage);
    } finally {
      setTryOnBusy(false);
    }
  };

  return (
    <div
      data-nimi-mod-root="daily-outfit"
      className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden bg-[#f7f3f0] px-6 py-8 text-[#2f2927]"
    >
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6">
        <header className="rounded-[32px] border border-[#e9ded8] bg-[linear-gradient(180deg,#fbf8f5_0%,#f6f0eb_100%)] px-8 py-5 shadow-[0_18px_48px_-32px_rgba(74,53,44,0.16)]">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.28em] text-[#b0867d]">Daily Outfit</div>
              <h1 className="mt-1 text-[1.65rem] font-semibold tracking-[-0.05em] text-[#2f2927] lg:text-[1.9rem] xl:text-[2rem]">{t('hero.title')}</h1>
            </div>
            <div className="justify-self-start lg:justify-self-end">
              <div className="grid grid-cols-2 rounded-[28px] border border-[#e4d8d2] bg-white p-1.5 shadow-[0_16px_36px_-30px_rgba(70,50,42,0.45)] sm:grid-cols-4">
                {[
                  { id: 'overview' as const, label: '数据总览', hint: '画像与指标' },
                  { id: 'wardrobe' as const, label: '服饰录入', hint: '识别与入库' },
                  { id: 'lab' as const, label: '穿搭实验室', hint: '推荐与试穿' },
                  { id: 'settings' as const, label: '模型设置', hint: '全局路由' },
                ].map((tab) => {
                  const active = viewTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setViewTab(tab.id)}
                      className={`min-w-[128px] rounded-[22px] px-5 py-2.5 text-left transition-all ${
                        active
                          ? 'bg-[#2f2927] text-white shadow-[0_14px_28px_-18px_rgba(47,41,39,0.8)]'
                          : 'text-[#7d6f69] hover:bg-[#f6efeb]'
                      }`}
                    >
                      <div className="text-sm font-semibold">{tab.label}</div>
                      <div className={`text-xs ${active ? 'text-white/75' : 'text-[#a2938c]'}`}>{tab.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </header>

        {viewTab === 'overview' ? (
          <div className="flex flex-col gap-8">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="总单品数" value={snapshot.garments.length} hint="衣橱中的全部单品资产。" />
              <MetricCard label="退役服饰" value={snapshot.insights.retiredGarmentCount} hint="已从活跃搭配池移出的单品。" />
              <MetricCard label="穿着记录" value={snapshot.insights.wearLogCount} hint="已确认的真实穿搭历史。" />
              <MetricCard label="收藏搭配" value={snapshot.insights.favoriteOutfitCount} hint="保留下来的推荐搭配板。" />
            </section>

            <section className="grid gap-6 xl:grid-cols-12">
              <div className="xl:col-span-4">
                <div className="relative flex h-full min-h-[388px] flex-col justify-between overflow-hidden rounded-[40px] border border-[#eaded8] bg-[#fdf5f2] p-8 text-[#4a2d2a] shadow-[0_24px_60px_-34px_rgba(122,92,84,0.2)]">
                  <div className="pointer-events-none absolute inset-x-[48px] bottom-[14px] top-[116px] overflow-hidden rounded-[36px]">
                    <WeatherFlowerBackground />
                  </div>
                  <div className="absolute inset-[14px] rounded-[32px] border border-[#f2e4dc]/80" />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-[#6a4d49]">上海，徐汇</span>
                      <span className="text-xs text-[#8e716a]">{dateLabel}</span>
                    </div>
                    <div className="mt-10 flex items-center gap-5">
                      <div className="text-[4rem] leading-none text-[#d48978]">✿</div>
                      <div>
                        <div className="text-[4rem] font-bold leading-none tracking-[-0.07em] text-[#4a2020]">18°</div>
                        <div className="mt-2 text-sm font-medium text-[#7a5c54]">多云转晴 · 适合轻薄叠穿</div>
                      </div>
                    </div>
                  </div>

                  <div className="relative mt-8 flex items-center justify-between gap-3 rounded-[22px] border border-[#ead9d1] bg-[rgba(255,250,247,0.78)] px-4 py-3 backdrop-blur-sm shadow-[0_18px_40px_-30px_rgba(120,88,80,0.16)]">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#b0867d]">OOTD</div>
                      <div className="text-sm font-semibold text-[#4a2020]">今日推荐</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#cfa08f] px-2.5 py-1 text-[11px] font-bold text-white">{labOutfits.length || 3} 套</span>
                      <button
                        type="button"
                        onClick={() => setViewTab('lab')}
                        className="rounded-full bg-[#fffdfb] px-4 py-2 text-sm font-bold text-[#4a2020] transition-colors hover:bg-white"
                      >
                        查看
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-8">
                <div className="rounded-[40px] border border-[#e9ded8] bg-white p-8 shadow-[0_18px_48px_-32px_rgba(74,53,44,0.16)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-extrabold tracking-[-0.03em] text-[#2f2927]">{t('sections.profileTitle')}</h3>
                      <p className="mt-1 text-xs font-medium text-[#8f837d]">完善基础信息与偏好，让 AI 更懂你的风格。</p>
                    </div>
                    <button
                      className="rounded-full bg-[#2f2927] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(47,41,39,0.8)] transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void handleSaveProfile()}
                      disabled={profileSaveBusy}
                    >
                      {profileSaveBusy ? '保存中...' : '保存画像'}
                    </button>
                  </div>

                  <div className="mt-8 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
                    <label className="group flex flex-col items-center gap-4">
                      <div className="relative h-[292px] w-[196px] cursor-pointer overflow-hidden rounded-[34px] border border-[#e6d9d2] bg-[#f4f1ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                        {selfieUrl ? (
                          <img src={displayImageUrl(selfieUrl, resolvedImageUrls)} alt={t('fields.uploadSelfie')} className="h-full w-full object-cover" />
                        ) : null}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 text-white transition-all group-hover:bg-black/45 group-hover:backdrop-blur-sm">
                          <span className="text-4xl opacity-0 transition-opacity group-hover:opacity-100">📷</span>
                        </div>
                        <input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept="image/*" onChange={handleSelfieUpload} />
                      </div>
                      <span className="text-xs font-semibold text-[#8f837d] transition-colors group-hover:text-[#b0867d]">更换自拍</span>
                    </label>

                    <div className="min-w-0 flex-1 space-y-6">
                      <div className="grid gap-6 md:grid-cols-2">
                        <FieldLabel label={t('fields.gender')}>
                          <select className="w-full appearance-none rounded-2xl border border-transparent bg-[#f7f3f0] px-4 py-3.5 text-sm font-medium outline-none transition-all hover:border-[#ddd0c9] focus:border-[#b0867d] focus:bg-white focus:ring-4 focus:ring-[#b0867d]/10" value={gender} onChange={(event) => setGender(event.target.value as (typeof DAILY_OUTFIT_GENDERS)[number])}>
                            {DAILY_OUTFIT_GENDERS.map((option) => (
                              <option key={option} value={option}>{t(`options.genders.${option}`)}</option>
                            ))}
                          </select>
                        </FieldLabel>
                        <FieldLabel label={t('fields.ageGroup')}>
                          <select className="w-full appearance-none rounded-2xl border border-transparent bg-[#f7f3f0] px-4 py-3.5 text-sm font-medium outline-none transition-all hover:border-[#ddd0c9] focus:border-[#b0867d] focus:bg-white focus:ring-4 focus:ring-[#b0867d]/10" value={ageGroup} onChange={(event) => setAgeGroup(event.target.value as (typeof DAILY_OUTFIT_AGE_GROUPS)[number])}>
                            {DAILY_OUTFIT_AGE_GROUPS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </FieldLabel>
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-bold text-[#2f2927]">偏好风格 (Style)</div>
                        <div className="flex min-h-[58px] flex-wrap items-center gap-2 rounded-2xl border border-transparent bg-[#f7f3f0] p-2.5 transition-all hover:border-[#ddd0c9] focus-within:border-[#b0867d] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#b0867d]/10">
                          {profileStyleTags.map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-1.5 rounded-xl border border-[#e1d4cd] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#2f2927] shadow-sm">
                              {tag}
                              <button type="button" className="rounded-full p-0.5 text-[#8f837d] transition-colors hover:text-red-500" onClick={() => removeProfileStyleTag(tag)}>×</button>
                            </span>
                          ))}
                          <div className="relative min-w-[160px] flex-1">
                            <input
                              type="text"
                              placeholder="输入并回车..."
                              value={styleTagInput}
                              onChange={(event) => setStyleTagInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  handleAddProfileStyleTag();
                                }
                              }}
                              className="w-full bg-transparent px-2 py-1 text-sm font-medium text-[#2f2927] outline-none placeholder:text-[#a3958f]"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-bold text-[#2f2927]">高频场景 (Scenarios)</div>
                        <div className="flex min-h-[58px] flex-wrap items-center gap-2 rounded-2xl border border-transparent bg-[#f7f3f0] p-2.5 transition-all hover:border-[#ddd0c9] focus-within:border-[#b0867d] focus-within:bg-white focus-within:ring-4 focus:ring-[#b0867d]/10">
                          {profileScenarioTags.map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-1.5 rounded-xl border border-[#e1d4cd] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#2f2927] shadow-sm">
                              {tag}
                              <button type="button" className="rounded-full p-0.5 text-[#8f837d] transition-colors hover:text-red-500" onClick={() => removeProfileScenarioTag(tag)}>×</button>
                            </span>
                          ))}
                          <div className="relative min-w-[160px] flex-1">
                            <input
                              type="text"
                              placeholder="输入并回车..."
                              value={scenarioTagInput}
                              onChange={(event) => setScenarioTagInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  handleAddProfileScenarioTag();
                                }
                              }}
                              className="w-full bg-transparent px-2 py-1 text-sm font-medium text-[#2f2927] outline-none placeholder:text-[#a3958f]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#8f837d]">
                    {selfieFileName ? <span>{t('common.selected')} {selfieFileName}</span> : null}
                    {uploadError ? <span className="text-red-600">{uploadError}</span> : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[30px] border border-[#e9ded8] bg-white px-6 py-5 shadow-[0_18px_48px_-32px_rgba(74,53,44,0.16)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="shrink-0 border-r border-[#eaded8] pr-6">
                  <div className="flex items-center gap-2 text-lg font-semibold text-[#2f2927]">
                    <span className="text-[#b0867d]">✦</span>
                    衣橱洞察
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 gap-4 overflow-x-auto">
                  {insightCards.map((item) => (
                    <div key={item.text} className={`min-w-[320px] flex-1 rounded-[18px] px-4 py-3 text-sm leading-7 ${item.className}`}>
                      {item.text}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {viewTab === 'wardrobe' ? (
          <SectionCard title={t('sections.wardrobeTitle')}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="inline-flex rounded-full border border-[#e4d8d2] bg-white p-1.5 shadow-[0_16px_36px_-30px_rgba(70,50,42,0.45)]">
                {[
                  { id: 'intake' as const, label: '服饰录入', hint: '识别与入库' },
                  { id: 'closet' as const, label: '我的衣橱', hint: '搜索与筛选' },
                ].map((tab) => {
                  const active = wardrobeSubTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setWardrobeSubTab(tab.id)}
                      className={`min-w-[132px] rounded-[22px] px-5 py-2.5 text-left transition-all ${
                        active
                          ? 'bg-[#2f2927] text-white shadow-[0_14px_28px_-18px_rgba(47,41,39,0.8)]'
                          : 'text-[#7d6f69] hover:bg-[#f6efeb]'
                      }`}
                    >
                      <div className="text-sm font-semibold">{tab.label}</div>
                      <div className={`text-xs ${active ? 'text-white/75' : 'text-[#a2938c]'}`}>{tab.hint}</div>
                    </button>
                  );
                })}
              </div>
              <p className="max-w-[720px] text-base leading-7 text-[#8f837d]">
                {wardrobeSubTab === 'intake'
                  ? '上传原图后，先在左侧完成识别与净单品图生成，再在右侧确认属性。模型路由已经提升到单独的全局设置页，不再混在录入流程里。'
                  : '在这里查看、搜索和筛选你的全部衣橱资产。支持按品类、季节、状态、风格标签等维度快速缩小范围。'}
              </p>
            </div>

            {wardrobeSubTab === 'intake' ? (
              <div className="mt-8 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                <div className="rounded-[30px] border border-[#e9ded8] bg-white p-6">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="group relative flex min-h-[360px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[24px] border-2 border-dashed border-[#eadad3] bg-[#fbf7f4] text-center text-[#9a8d86] transition-colors hover:border-[#b0867d]">
                      {photoUrl ? (
                        <img src={displayImageUrl(photoUrl, resolvedImageUrls)} alt={t('fields.uploadGarment')} className="absolute inset-0 h-full w-full object-cover" />
                      ) : null}
                      {!photoUrl ? (
                        <div className="relative z-10 flex max-w-[220px] flex-col items-center gap-2">
                          <div className="text-4xl">^</div>
                          <div className="text-sm font-medium">点击或拖拽上传原图</div>
                          <div className="text-xs opacity-70">PNG / JPG / WebP</div>
                        </div>
                      ) : null}
                      <input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept="image/*" onChange={handleGarmentUpload} />
                    </label>

                    <div className="relative overflow-hidden rounded-[24px] border border-[#e7dbd5] bg-[linear-gradient(180deg,#f8f4f1_0%,#f2ece7_100%)]">
                      {cutoutUrl ? (
                        <div
                          className="flex min-h-[360px] items-center justify-center p-6"
                          style={{
                            backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.6) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.6) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.6) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.6) 75%)',
                            backgroundSize: '28px 28px',
                            backgroundPosition: '0 0, 0 14px, 14px -14px, -14px 0px',
                          }}
                        >
                          <img src={displayImageUrl(cutoutUrl, resolvedImageUrls)} alt={t('fields.cutoutPreview')} className="max-h-[320px] w-full object-contain" />
                        </div>
                      ) : (
                        <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center text-[#9a8d86]">
                          <div className="rounded-full bg-white/85 px-4 py-2 text-sm shadow-sm">等待生成净单品图...</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      className="rounded-full border border-[#ded4cf] bg-white px-5 py-2.5 text-sm font-medium text-[#5f4d47] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void handleAnalyzeGarment()}
                      disabled={!photoUrl.trim() || analysisBusy}
                    >
                      {analysisBusy ? t('actions.analyzingGarment') : t('actions.analyzeGarment')}
                    </button>
                    <button
                      className="rounded-full border border-[#d8c1b7] bg-[#fbf4f1] px-5 py-2.5 text-sm font-medium text-[#9d6d5d] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void handleGenerateCutout()}
                      disabled={!photoUrl.trim() || cutoutBusy}
                    >
                      {cutoutBusy ? t('actions.generatingCutout') : t('actions.generateCutout')}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#8f837d]">
                    {photoFileName ? <span className="rounded-full bg-[#f5efeb] px-3 py-1">{t('common.selected')} {photoFileName}</span> : null}
                    {analysisSummary ? <span className="rounded-full bg-[#f5efeb] px-3 py-1">{analysisSummary}</span> : null}
                    {analysisTraceId ? <span className="rounded-full bg-[#f5efeb] px-3 py-1">analysis trace: {analysisTraceId}</span> : null}
                    {cutoutTraceId ? <span className="rounded-full bg-[#f5efeb] px-3 py-1">cutout trace: {cutoutTraceId}</span> : null}
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {analysisError ? <div className="text-red-600">{analysisError}</div> : null}
                    {cutoutError ? <div className="text-red-600">{cutoutError}</div> : null}
                    {uploadError ? <div className="text-red-600">{uploadError}</div> : null}
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="rounded-[30px] border border-[#e9ded8] bg-white p-7">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[#2f2927]">识别与属性</h3>
                      <div className="rounded-full bg-[#f7ece7] px-3 py-1 text-xs font-medium text-[#9b6d60]">
                        {analysisSummary ? 'AI parsed' : photoUrl ? 'Ready to analyze' : 'Waiting for image'}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <FieldLabel label={t('fields.category')}>
                        <select className="rounded-2xl border border-transparent bg-[#f4efeb] px-4 py-3 outline-none focus:border-[#d7c5bc]" value={category} onChange={(event) => setCategory(event.target.value as (typeof DAILY_OUTFIT_CATEGORIES)[number])}>
                          {DAILY_OUTFIT_CATEGORIES.map((option) => (
                            <option key={option} value={option}>{t(`options.categories.${option}`)}</option>
                          ))}
                        </select>
                      </FieldLabel>
                      <FieldLabel label={t('fields.subcategory')}>
                        <input className="rounded-2xl border border-transparent bg-[#f4efeb] px-4 py-3 outline-none focus:border-[#d7c5bc]" value={subcategory} onChange={(event) => setSubcategory(event.target.value)} placeholder={t('placeholders.subcategory')} />
                      </FieldLabel>
                      <FieldLabel label={t('fields.colors')}>
                        <div className="flex items-center rounded-2xl bg-[#f4efeb] px-3 py-3">
                          <span className="h-4 w-4 rounded-full bg-[#b0867d]" />
                          <input className="ml-3 w-full border-none bg-transparent outline-none" value={colorsText} onChange={(event) => setColorsText(event.target.value)} placeholder={t('placeholders.colors')} />
                        </div>
                      </FieldLabel>
                      <FieldLabel label={t('fields.material')}>
                        <input className="rounded-2xl border border-transparent bg-[#f4efeb] px-4 py-3 outline-none focus:border-[#d7c5bc]" value={material} onChange={(event) => setMaterial(event.target.value)} placeholder={t('placeholders.material')} />
                      </FieldLabel>
                    </div>

                    <div className="mt-4 grid gap-5 md:grid-cols-2 md:items-start">
                      <div className="space-y-4">
                        <FieldLabel label={t('fields.styleTags')}>
                          <input className="rounded-2xl border border-transparent bg-[#f4efeb] px-4 py-3 outline-none focus:border-[#d7c5bc]" value={styleTagsText} onChange={(event) => setStyleTagsText(event.target.value)} placeholder={t('placeholders.styleTags')} />
                        </FieldLabel>
                        <FieldLabel label={t('fields.seasons')}>
                          <div className="grid grid-cols-2 gap-3">
                            {DAILY_OUTFIT_SEASONS.map((season) => (
                              <button
                                key={season}
                                type="button"
                                className={`w-full rounded-2xl border-2 px-4 py-3 text-sm transition-colors ${
                                  seasonSelected(seasons, season)
                                    ? 'border-[#b0867d] bg-[#f7ece7] text-[#9b6d60]'
                                    : 'border-transparent bg-[#f4efeb] text-[#7b6f69]'
                                }`}
                                onClick={() => handleToggleSeason(season)}
                              >
                                {t(`options.seasons.${season}`)}
                              </button>
                            ))}
                          </div>
                        </FieldLabel>
                      </div>
                      <FieldLabel label={t('fields.formalityLevel')}>
                        <div className="mt-4 rounded-[24px] bg-[#fbf7f4] px-4 py-4">
                          <div className="flex items-center justify-between text-sm font-medium text-[#5f4d47]">
                            <span>{t('fields.formalityLevel')}</span>
                            <span>{formalityLevel} / 5</span>
                          </div>
                          <input
                            className="mt-4 h-2 w-full accent-[#b0867d]"
                            type="range"
                            min="1"
                            max="5"
                            step="1"
                            value={formalityLevel}
                            onChange={(event) => setFormalityLevel(event.target.value)}
                          />
                          <div className="mt-2 flex justify-between text-xs text-[#9a8d86]">
                            <span>休闲</span>
                            <span>商务</span>
                          </div>
                          <button
                            className="mt-5 w-full rounded-full bg-[#b0867d] px-5 py-2.5 text-sm font-medium text-white shadow-[0_14px_30px_-18px_rgba(176,134,125,0.9)] disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => void handleCreateGarment()}
                            disabled={garmentSaveBusy}
                          >
                            {garmentSaveBusy ? `${t('actions.addGarment')}...` : t('actions.addGarment')}
                          </button>
                        </div>
                      </FieldLabel>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-[30px] border border-[#e9ded8] bg-white p-6 shadow-[0_18px_48px_-32px_rgba(74,53,44,0.16)]">
                <div className="rounded-[24px] border border-[#eee4de] bg-[#fcfaf8] p-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <div ref={closetSearchRef} className="relative">
                      <div className="text-sm font-semibold text-[#2f2927]">搜索衣橱</div>
                      <input
                        className="mt-3 w-full rounded-full border border-transparent bg-[#f4f1ef] px-5 py-3.5 text-[15px] outline-none transition-colors focus:border-[#d7c5bc] focus:bg-white"
                        placeholder="输入标签、颜色、材质如 'na'，按回车或点击下拉项添加筛选"
                        value={closetQuery}
                        onChange={(event) => {
                          setClosetQuery(event.target.value);
                          setClosetAutocompleteOpen(Boolean(event.target.value.trim()));
                        }}
                        onFocus={() => setClosetAutocompleteOpen(Boolean(normalizedClosetQuery))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            const trimmed = closetQuery.trim();
                            if (!trimmed) {
                              return;
                            }
                            addClosetSearchChip({
                              kind: 'search',
                              typeLabel: '搜索',
                              value: trimmed,
                              label: trimmed,
                            });
                          }
                        }}
                      />
                      {closetAutocompleteOpen ? (
                        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-[22px] border border-[#eadfd9] bg-white shadow-[0_20px_36px_-22px_rgba(74,53,44,0.28)]">
                          <div className="p-2">
                            {filteredAutocompleteOptions.length > 0 ? (
                              filteredAutocompleteOptions.map((option) => (
                                <button
                                  key={`${option.kind}:${option.value}`}
                                  type="button"
                                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-[#f4f1ef]"
                                  onClick={() => addClosetSearchChip(option)}
                                >
                                  <span className="shrink-0 rounded-md bg-[#f0e6e1] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8f837d]">
                                    {option.typeLabel}
                                  </span>
                                  <span className="truncate text-sm text-[#2f2927]">{option.label}</span>
                                </button>
                              ))
                            ) : (
                              <div className="px-4 py-3 text-sm text-[#8f837d]">未找到与 “{closetQuery.trim()}” 相关的标签</div>
                            )}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                            !hasClosetFilters
                              ? 'bg-[#2f2927] text-white shadow-sm'
                              : 'bg-[#f4efeb] text-[#6b5b54] hover:bg-[#eee5df]'
                          }`}
                          onClick={clearClosetFilters}
                        >
                          全部 ({snapshot.garments.length})
                        </button>
                        {closetSearchChips.map((chip) => (
                          <span
                            key={`${chip.kind}:${chip.value}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#e0c8bd] bg-[#f7ece7] px-3 py-1.5 text-sm font-medium text-[#9b6d60]"
                          >
                            <span className="text-xs opacity-70">{chip.typeLabel}:</span>
                            {chip.label}
                            <button
                              type="button"
                              className="rounded-full p-0.5 transition-colors hover:bg-[#b0867d] hover:text-white"
                              onClick={() => removeClosetSearchChip(chip)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[20px] bg-white p-4">
                      <div className="text-sm font-semibold text-[#2f2927]">品类</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {DAILY_OUTFIT_CATEGORIES.map((option) => {
                          const active = closetCategoryFilters.includes(option);
                          return (
                            <button
                              key={option}
                              type="button"
                              className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                                active
                                  ? 'border-[#b0867d] bg-[#f7ece7] text-[#9b6d60]'
                                  : 'border-[#e7dad3] bg-[#f7f2ee] text-[#7f6f68] hover:border-[#c9aca1]'
                              }`}
                              onClick={() => toggleClosetCategoryFilter(option)}
                            >
                              {t(`options.categories.${option}`)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-[20px] bg-white p-4">
                      <div className="text-sm font-semibold text-[#2f2927]">季节</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {DAILY_OUTFIT_SEASONS.map((season) => {
                          const active = closetSeasonFilters.includes(season);
                          return (
                            <button
                              key={season}
                              type="button"
                              className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                                active
                                  ? 'border-[#b0867d] bg-[#f7ece7] text-[#9b6d60]'
                                  : 'border-[#e7dad3] bg-[#f7f2ee] text-[#7f6f68] hover:border-[#c9aca1]'
                              }`}
                              onClick={() => toggleClosetSeasonFilter(season)}
                            >
                              {t(`options.seasons.${season}`)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-[20px] bg-white p-4">
                      <div className="text-sm font-semibold text-[#2f2927]">状态</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          { value: 'active' as const, label: '启用中' },
                          { value: 'retired' as const, label: '已退役' },
                        ].map((statusOption) => {
                          const active = closetStatusFilters.includes(statusOption.value);
                          return (
                            <button
                              key={statusOption.value}
                              type="button"
                              className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                                active
                                  ? 'border-[#b0867d] bg-[#f7ece7] text-[#9b6d60]'
                                  : 'border-[#e7dad3] bg-[#f7f2ee] text-[#7f6f68] hover:border-[#c9aca1]'
                              }`}
                              onClick={() => toggleClosetStatusFilter(statusOption.value)}
                            >
                              {statusOption.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                </div>

                <div className="mt-6">
                  {filteredClosetGarments.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {filteredClosetGarments.map((garment) => (
                        <div key={garment.id} className="overflow-hidden rounded-[24px] border border-[#ece1db] bg-[#fcfaf8]">
                          <div className="relative aspect-[4/5] overflow-hidden bg-[linear-gradient(180deg,#f8f4f1_0%,#f2ece7_100%)]">
                            {garment.thumbnailUrl || garment.photoUrls[0] ? (
                              <img
                                src={displayImageUrl(garment.thumbnailUrl || garment.photoUrls[0], resolvedImageUrls)}
                                alt={garment.subcategory || garment.category}
                                className="h-full w-full object-contain p-5"
                              />
                            ) : null}
                            <div className="absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-xs font-medium text-[#7d6f69] shadow-sm">
                              {garment.status === 'active' ? '启用中' : '已退役'}
                            </div>
                          </div>
                          <div className="space-y-3 px-4 py-4">
                            <div className="relative pr-10">
                              <div className="text-xs uppercase tracking-[0.18em] text-[#b0867d]">{t(`options.categories.${garment.category}`)}</div>
                              <div className="mt-1 text-base font-semibold text-[#2f2927]">{garment.subcategory || '未命名单品'}</div>
                              <div data-closet-actions className="absolute right-0 top-0">
                                <button
                                  type="button"
                                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#eadfd9] bg-white text-lg leading-none text-[#7f6f68] transition-colors hover:border-[#c9aca1] hover:text-[#2f2927]"
                                  onClick={() => setOpenClosetActionId((current) => current === garment.id ? null : garment.id)}
                                  aria-label="更多操作"
                                >
                                  …
                                </button>
                                {openClosetActionId === garment.id ? (
                                  <div className="absolute right-0 top-10 z-20 min-w-[140px] overflow-hidden rounded-[18px] border border-[#eadfd9] bg-white p-2 shadow-[0_20px_36px_-22px_rgba(74,53,44,0.28)]">
                                    {garment.status === 'active' ? (
                                      <button
                                        type="button"
                                        className="w-full rounded-[14px] px-3 py-2 text-left text-sm text-[#9b6d60] transition-colors hover:bg-[#f7ece7]"
                                        onClick={() => handleRetireGarment(garment.id)}
                                      >
                                        退役单品
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="w-full rounded-[14px] px-3 py-2 text-left text-sm text-[#5f4d47] transition-colors hover:bg-[#f4efeb]"
                                        onClick={() => handleReactivateGarment(garment.id)}
                                      >
                                        重新启用
                                      </button>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-[#7f6f68]">
                              {garment.colors.slice(0, 3).map((color) => (
                                <span key={color} className="rounded-full bg-[#f4efeb] px-2.5 py-1">{color}</span>
                              ))}
                              {garment.styleTags.slice(0, 2).map((tag) => (
                                <span key={tag} className="rounded-full bg-[#fbf4f1] px-2.5 py-1 text-[#9d6d5d]">{tag}</span>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm text-[#8f837d]">
                              <div>材质 · {garment.material || '—'}</div>
                              <div>正式度 · {garment.formalityLevel}/5</div>
                              <div>季节 · {garment.seasons.map((season) => t(`options.seasons.${season}`)).join(' / ')}</div>
                              <div>穿着 · {garment.wearCount} 次</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[28px] border border-dashed border-[#d9c9c1] bg-[#faf6f3] px-8 py-14 text-center text-sm text-[#8f837d]">
                      没有找到符合当前筛选条件的衣物，试着放宽搜索词或筛选条件。
                    </div>
                  )}
                </div>
              </div>
            )}
          </SectionCard>
        ) : null}

        {viewTab === 'settings' ? (
          <SectionCard title="模型与路由设置" eyebrow="Global Runtime Routes">
            <div className="max-w-[960px]">
              <p className="text-base leading-7 text-[#8f837d]">
                这里的模型选择会全局影响 `服饰识别`、`净单品图生成`，以及 `Try on`。录入页和实验室不再重复放这些高级设置。
              </p>

              <div className="mt-6 grid gap-5">
                <RoutePicker
                  title={t('fields.analysisRoute')}
                  capability="text.generate"
                  snapshot={analysisRouteSnapshot}
                  binding={analysisBinding}
                  loading={analysisRouteLoading}
                  error={analysisRouteError}
                  onReload={() => void refreshAnalysisRoute()}
                  onBindingChange={setAnalysisBinding}
                />
                <RoutePicker
                  title="Image Generate Route"
                  capability="image.generate"
                  snapshot={cutoutRouteSnapshot}
                  binding={cutoutBinding}
                  loading={cutoutRouteLoading}
                  error={cutoutRouteError}
                  onReload={() => void refreshCutoutRoute()}
                  onBindingChange={setCutoutBinding}
                />
                <RoutePicker
                  title="Try-on Image Route"
                  capability="image.generate"
                  snapshot={tryOnRouteSnapshot}
                  binding={tryOnBinding}
                  loading={tryOnRouteLoading}
                  error={tryOnRouteError}
                  onReload={() => void refreshTryOnRoute()}
                  onBindingChange={setTryOnBinding}
                />
              </div>
            </div>
          </SectionCard>
        ) : null}

        {viewTab === 'lab' ? (
          <SectionCard title={t('sections.generateTitle')} eyebrow={t('sections.generateEyebrow')}>
            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="flex flex-col gap-5">
                <div className="rounded-[28px] border border-[#e8ddd7] bg-white p-5 shadow-[0_18px_48px_-32px_rgba(74,53,44,0.16)]">
                  <FieldLabel label="场景描述 (Prompt)">
                    <textarea
                      rows={3}
                      className="w-full resize-none rounded-[18px] border border-transparent bg-[#f4efeb] p-4 text-sm outline-none focus:border-[#d7c5bc]"
                      placeholder="例如：今晚出去约会，想要温柔但有一点态度，适合晚餐和散步。"
                      value={occasionInput}
                      onChange={(event) => setOccasionInput(event.target.value)}
                    />
                  </FieldLabel>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {['办公室咖啡局', '雨天通勤', '周末约会', '晚餐见朋友'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="rounded-full border border-[#e4d7d1] bg-white px-3 py-1 text-xs text-[#7f6f68] transition-colors hover:border-[#b0867d]"
                        onClick={() => setOccasionInput(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 rounded-[20px] bg-[#fbf6f3] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-[#2f2927]">实验室规则</h4>
                      <div className="text-xs text-[#8f837d]">{labOutfits.length} 套候选</div>
                    </div>
                    <div className="mt-3 space-y-2.5">
                      <label className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#f7f3f0]">
                        <input
                          type="checkbox"
                          checked={filterCurrentSeason}
                          onChange={(event) => setFilterCurrentSeason(event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-[#b0867d] focus:ring-[#b0867d]"
                        />
                        <span className="text-sm text-[#5b4c46]">仅使用当前季节服饰</span>
                      </label>
                      <label className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#f7f3f0]">
                        <input
                          type="checkbox"
                          checked={filterRecentlyWorn}
                          onChange={(event) => setFilterRecentlyWorn(event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-[#b0867d] focus:ring-[#b0867d]"
                        />
                        <span className="text-sm text-[#5b4c46]">排除最近 3 天穿过的衣服</span>
                      </label>
                    </div>
                    <div className="mt-3 rounded-[16px] bg-white px-4 py-3 text-sm leading-6 text-[#8f837d]">
                      {t('state.suggestionHint')}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      className="rounded-full border border-[#ded4cf] bg-white px-4 py-2.5 text-sm font-medium text-[#5f4d47]"
                      onClick={handleSeedDemoWardrobe}
                    >
                      {t('actions.loadDemoWardrobe')}
                    </button>
                    <button
                      className="rounded-[18px] bg-[#2f2927] px-4 py-2.5 text-sm font-medium text-white shadow-[0_14px_30px_-18px_rgba(47,41,39,0.8)] disabled:cursor-not-allowed disabled:bg-neutral-400"
                      onClick={handleGenerateOutfits}
                      disabled={activeGarments.length === 0}
                    >
                      {t('actions.generateOutfits')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="rounded-[32px] border border-[#e8ddd7] bg-white p-6 shadow-[0_18px_48px_-32px_rgba(74,53,44,0.16)]">
                  {selectedOutfit ? (
                    <div className="flex flex-col gap-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-[#b0867d]">Outfit Lab</div>
                          <h3 className="mt-1 text-[2rem] font-semibold tracking-[-0.04em] text-[#2f2927]">{selectedOutfit.occasion}</h3>
                          <p className="mt-2 text-sm text-[#8f837d]">当前主舞台展示选中的搭配板，并在右侧直接预留 Try-on 结果位。</p>
                        </div>
                        <div className="rounded-full bg-[#f7ece7] px-4 py-2 text-sm font-medium text-[#9b6d60]">
                          {snapshot.profile?.selfieUrl ? 'Try on ready' : 'Selfie required'}
                        </div>
                      </div>

                      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.94fr)_minmax(280px,0.72fr)]">
                        <div className="relative overflow-hidden rounded-[34px] border border-[#d8c7bd] bg-[#dbcbbf] shadow-[0_24px_56px_-32px_rgba(85,60,50,0.45)]">
                          {selectedOutfit.collageImageUrl ? (
                            <img
                              src={displayImageUrl(selectedOutfit.collageImageUrl, resolvedImageUrls)}
                              alt={selectedOutfit.occasion}
                              className="aspect-[21/32] w-full object-cover"
                            />
                          ) : (
                            <div className="flex aspect-[21/32] items-center justify-center text-sm text-[#7f6f68]">
                              Building outfit board...
                            </div>
                          )}
                          {labOutfits.length > 1 ? (
                            <>
                              <button
                                type="button"
                                className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/78 text-xl font-semibold text-[#4f403a] shadow-[0_14px_30px_-20px_rgba(47,41,39,0.7)] backdrop-blur transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                                onClick={() => {
                                  if (selectedOutfitIndex <= 0) return;
                                  setSelectedOutfitId(labOutfits[selectedOutfitIndex - 1]?.id || null);
                                }}
                                disabled={selectedOutfitIndex <= 0}
                                aria-label="上一张"
                              >
                                ‹
                              </button>
                              <button
                                type="button"
                                className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/78 text-xl font-semibold text-[#4f403a] shadow-[0_14px_30px_-20px_rgba(47,41,39,0.7)] backdrop-blur transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                                onClick={() => {
                                  if (selectedOutfitIndex < 0 || selectedOutfitIndex >= labOutfits.length - 1) return;
                                  setSelectedOutfitId(labOutfits[selectedOutfitIndex + 1]?.id || null);
                                }}
                                disabled={selectedOutfitIndex < 0 || selectedOutfitIndex >= labOutfits.length - 1}
                                aria-label="下一张"
                              >
                                ›
                              </button>
                            </>
                          ) : null}
                        </div>

                        <div className="flex flex-col gap-4">
                          <div className="overflow-hidden rounded-[30px] border border-[#e0d3cc] bg-[#fcf8f5] shadow-[0_18px_40px_-30px_rgba(74,53,44,0.2)]">
                            {selectedOutfit.tryOnImageUrl ? (
                              <img
                                src={displayImageUrl(selectedOutfit.tryOnImageUrl, resolvedImageUrls)}
                                alt={`${selectedOutfit.occasion} try on`}
                                className="aspect-[4/5] w-full object-cover"
                              />
                            ) : (
                              <div className="flex aspect-[4/5] flex-col items-center justify-center px-6 text-center text-[#8f837d]">
                                <div className="rounded-full bg-white px-4 py-2 text-sm font-medium shadow-sm">Try-on output</div>
                                <div className="mt-3 text-sm leading-6">先确认自拍已保存，再用当前 outfit board 直接生成试穿图。</div>
                              </div>
                            )}
                          </div>

                          <div className="rounded-[24px] bg-[#f8f4f1] px-5 py-4 text-sm leading-7 text-[#6d5c56]">
                            {selectedOutfit.aiReasoning}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            className="rounded-full bg-[#d1aca2] px-6 py-2.5 text-sm font-semibold text-[#3a3330] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => void handleGenerateTryOn()}
                            disabled={tryOnBusy || !selectedOutfit.collageImageUrl}
                          >
                            {tryOnBusy ? 'Generating...' : 'Try on'}
                          </button>
                          <button
                            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f0ebe6] text-[#4a4441] shadow-sm"
                            onClick={() => handleFavorite(selectedOutfit.id)}
                          >
                            {selectedOutfit.isFavorite ? '★' : '☆'}
                          </button>
                        </div>
                        <div className="text-xs text-[#8f837d]">
                          {selectedOutfit.occasionTags.length > 0
                            ? `Tags · ${selectedOutfit.occasionTags.slice(0, 3).join(', ')}`
                            : 'Curated outfit board'}
                        </div>
                      </div>

                      {labOutfits.length > 1 ? (
                        <div className="rounded-[24px] border border-[#ece1db] bg-[#fcfaf8] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-[#2f2927]">方案切换</div>
                              <div className="text-xs text-[#8f837d]">左右切换或直接点缩略卡片</div>
                            </div>
                            <div className="text-xs text-[#8f837d]">{selectedOutfitIndex + 1} / {labOutfits.length}</div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            {labOutfits.map((outfit, index) => (
                              <button
                                key={outfit.id}
                                type="button"
                                className={`grid grid-cols-[68px_minmax(0,1fr)] items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition-all ${
                                  selectedOutfit.id === outfit.id
                                    ? 'border-[#b0867d] bg-[#fbf4f1] shadow-[0_14px_30px_-22px_rgba(176,134,125,0.9)]'
                                    : 'border-[#ece1db] bg-white hover:border-[#d9c9c1]'
                                }`}
                                onClick={() => setSelectedOutfitId(outfit.id)}
                              >
                                <div className="overflow-hidden rounded-[16px] border border-[#eadfd8] bg-[#eadfd8]">
                                  {outfit.collageImageUrl ? (
                                    <img
                                      src={displayImageUrl(outfit.collageImageUrl, resolvedImageUrls)}
                                      alt={outfit.occasion}
                                      className="aspect-[3/4] w-full object-cover object-top"
                                    />
                                  ) : (
                                    <div className="aspect-[3/4] w-full bg-[#f3ebe6]" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#b0867d]">Look {index + 1}</div>
                                  <div className="mt-1 line-clamp-2 text-sm font-semibold text-[#2f2927]">{outfit.occasion}</div>
                                  <div className="mt-1 text-xs text-[#8f837d]">{outfit.itemIds.length} items</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {tryOnTraceId ? <div className="text-xs text-[#8f837d]">try-on trace: {tryOnTraceId}</div> : null}
                      {tryOnError ? <div className="text-sm text-red-600">{tryOnError}</div> : null}
                    </div>
                  ) : (
                    <div className="rounded-[28px] border border-dashed border-[#d9c9c1] bg-[#faf6f3] px-8 py-10 text-center text-sm text-[#8f837d]">
                      {t('state.noOutfits')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
