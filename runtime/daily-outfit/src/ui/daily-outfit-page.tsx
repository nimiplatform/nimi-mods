import React, { startTransition, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useModTranslation, type RuntimeCanonicalCapability, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot, type RuntimeRouteSource } from "@nimiplatform/sdk/mod";
import {
  createGarment,
  createWearLog,
  generateOutfitSuggestions,
  getDailyOutfitSnapshot,
  seedDemoWardrobe,
  seedProfileFromPreferences,
  subscribeDailyOutfitStore,
  toggleFavoriteOutfit,
  updateOutfitCollage,
  updateOutfitTryOn,
} from '../state/store.js';
import {
  analyzeGarmentPhoto,
  bindingForConnector,
  bindingForModel,
  bindingForSource,
  explainModalityError,
  generateGarmentCutout,
  generateOutfitTryOn,
  listDailyOutfitRouteOptions,
  resolveRoutePickerState,
  suggestAnalysisBinding,
  suggestCutoutBinding,
} from '../runtime-ai-client.js';
import { DAILY_OUTFIT_AGE_GROUPS, DAILY_OUTFIT_CATEGORIES, DAILY_OUTFIT_GENDERS, DAILY_OUTFIT_SEASONS } from '../types.js';
import { compressImageForStorage, resolveImageUrlForDisplay, resolveImageUrlForRuntime } from '../image-storage.js';
import { generateOutfitCollageImage } from './outfit-collage.js';

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

export function DailyOutfitPage() {
  const { t } = useModTranslation('daily-outfit');
  const snapshot = useSyncExternalStore(subscribeDailyOutfitStore, getDailyOutfitSnapshot, getDailyOutfitSnapshot);
  const [viewTab, setViewTab] = useState<DailyOutfitViewTab>('overview');
  const [gender, setGender] = useState<(typeof DAILY_OUTFIT_GENDERS)[number]>(snapshot.profile?.gender || 'female');
  const [ageGroup, setAgeGroup] = useState<(typeof DAILY_OUTFIT_AGE_GROUPS)[number]>(snapshot.profile?.ageGroup || '25-30');
  const [selfieUrl, setSelfieUrl] = useState(snapshot.profile?.selfieUrl || '');
  const [selfieFileName, setSelfieFileName] = useState('');
  const [stylesText, setStylesText] = useState(Object.keys(snapshot.profile?.styleWeights || {}).join(', '));
  const [scenesText, setScenesText] = useState(Object.keys(snapshot.profile?.sceneFrequencies || {}).join(', '));

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

  const [occasionInput, setOccasionInput] = useState('office coffee catch-up');
  const [uploadError, setUploadError] = useState('');
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [cutoutBusy, setCutoutBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [cutoutError, setCutoutError] = useState('');
  const [analysisRouteLoading, setAnalysisRouteLoading] = useState(false);
  const [cutoutRouteLoading, setCutoutRouteLoading] = useState(false);
  const [analysisRouteError, setAnalysisRouteError] = useState('');
  const [cutoutRouteError, setCutoutRouteError] = useState('');
  const [analysisRouteSnapshot, setAnalysisRouteSnapshot] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [cutoutRouteSnapshot, setCutoutRouteSnapshot] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [analysisBinding, setAnalysisBinding] = useState<RuntimeRouteBinding | null>(null);
  const [cutoutBinding, setCutoutBinding] = useState<RuntimeRouteBinding | null>(null);
  const [profileSaveBusy, setProfileSaveBusy] = useState(false);
  const [garmentSaveBusy, setGarmentSaveBusy] = useState(false);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const [filterCurrentSeason, setFilterCurrentSeason] = useState(true);
  const [filterRecentlyWorn, setFilterRecentlyWorn] = useState(true);
  const [tryOnBusy, setTryOnBusy] = useState(false);
  const [tryOnError, setTryOnError] = useState('');
  const [tryOnTraceId, setTryOnTraceId] = useState('');
  const [resolvedImageUrls, setResolvedImageUrls] = useState<Record<string, string>>({});
  const collageJobsRef = useRef(new Set<string>());

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

  useEffect(() => {
    void refreshAnalysisRoute();
    void refreshCutoutRoute();
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
          stylesText,
          scenesText,
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
  const labOutfits = snapshot.outfits.slice(0, 3);
  const selectedOutfit = labOutfits.find((outfit) => outfit.id === selectedOutfitId) || labOutfits[0] || null;
  const profileStyles = Object.keys(snapshot.profile?.styleWeights || {}).join(', ');
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
      const nextBinding = suggestCutoutBinding(cutoutRouteSnapshot, cutoutBinding);
      if (nextBinding !== cutoutBinding) {
        setCutoutBinding(nextBinding);
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
      setTryOnError(error instanceof Error ? error.message : String(error || 'DAILY_OUTFIT_TRYON_FAILED'));
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
              <div className="inline-flex rounded-full border border-[#e4d8d2] bg-white p-1.5 shadow-[0_16px_36px_-30px_rgba(70,50,42,0.45)]">
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
                      className={`rounded-full px-5 py-2.5 text-left transition-all ${
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
              <MetricCard label={t('metrics.activeGarments')} value={snapshot.insights.activeGarmentCount} hint={t('metrics.activeGarmentsHint')} />
              <MetricCard label={t('metrics.retiredGarments')} value={snapshot.insights.retiredGarmentCount} hint={t('metrics.retiredGarmentsHint')} />
              <MetricCard label={t('metrics.wearLogs')} value={snapshot.insights.wearLogCount} hint={t('metrics.wearLogsHint')} />
              <MetricCard label={t('metrics.favorites')} value={snapshot.insights.favoriteOutfitCount} hint={t('metrics.favoritesHint')} />
            </section>

            <section className="grid gap-8 2xl:grid-cols-[1.95fr_0.95fr]">
              <SectionCard title={t('sections.profileTitle')}>
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm text-[#8f837d]">
                    {snapshot.profile ? t('hero.profileSeeded') : t('hero.profileMissing')}
                  </div>
                  <button
                    className="rounded-full bg-[#2f2927] px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void handleSaveProfile()}
                    disabled={profileSaveBusy}
                  >
                    {profileSaveBusy ? `${t('actions.saveProfile')}...` : t('actions.saveProfile')}
                  </button>
                </div>

                <div className="mt-6 grid gap-6 md:grid-cols-[160px_1fr]">
                  <label className="group relative flex h-[190px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[24px] border-2 border-dashed border-[#e5d7d1] bg-[#faf6f3] text-[#9c8d87] transition-colors hover:border-[#b0867d]">
                    {selfieUrl ? (
                      <img src={displayImageUrl(selfieUrl, resolvedImageUrls)} alt={t('fields.uploadSelfie')} className="absolute inset-0 h-full w-full object-cover" />
                    ) : null}
                    <div className={`relative z-10 flex flex-col items-center gap-2 ${selfieUrl ? 'rounded-2xl bg-white/80 px-4 py-3 backdrop-blur' : ''}`}>
                      <div className="text-3xl">+</div>
                      <div className="text-sm font-medium">{t('fields.uploadSelfie')}</div>
                    </div>
                    <input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept="image/*" onChange={handleSelfieUpload} />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FieldLabel label={t('fields.gender')}>
                      <select className="rounded-2xl border border-transparent bg-[#f4efeb] px-4 py-3.5 outline-none focus:border-[#d7c5bc]" value={gender} onChange={(event) => setGender(event.target.value as (typeof DAILY_OUTFIT_GENDERS)[number])}>
                        {DAILY_OUTFIT_GENDERS.map((option) => (
                          <option key={option} value={option}>{t(`options.genders.${option}`)}</option>
                        ))}
                      </select>
                    </FieldLabel>
                    <FieldLabel label={t('fields.ageGroup')}>
                      <select className="rounded-2xl border border-transparent bg-[#f4efeb] px-4 py-3.5 outline-none focus:border-[#d7c5bc]" value={ageGroup} onChange={(event) => setAgeGroup(event.target.value as (typeof DAILY_OUTFIT_AGE_GROUPS)[number])}>
                        {DAILY_OUTFIT_AGE_GROUPS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </FieldLabel>
                    <FieldLabel label={t('fields.preferredStyles')}>
                      <input className="rounded-2xl border border-transparent bg-[#f4efeb] px-4 py-3.5 outline-none focus:border-[#d7c5bc] md:col-span-2" value={stylesText} onChange={(event) => setStylesText(event.target.value)} />
                    </FieldLabel>
                    <FieldLabel label={t('fields.frequentScenes')}>
                      <input className="rounded-2xl border border-transparent bg-[#f4efeb] px-4 py-3.5 outline-none focus:border-[#d7c5bc] md:col-span-2" value={scenesText} onChange={(event) => setScenesText(event.target.value)} />
                    </FieldLabel>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#8f837d]">
                  {selfieFileName ? <span>{t('common.selected')} {selfieFileName}</span> : null}
                  {profileStyles ? <span>{t('state.currentStyles')} {profileStyles}</span> : null}
                  {uploadError ? <span className="text-red-600">{uploadError}</span> : null}
                </div>
              </SectionCard>

              <SectionCard title={t('sections.insightsTitle')}>
                <div className="space-y-4">
                  {insightCards.map((item) => (
                    <div key={item.text} className={`rounded-[22px] p-4 text-sm leading-7 ${item.className}`}>
                      {item.text}
                    </div>
                  ))}
                </div>
              </SectionCard>
            </section>
          </div>
        ) : null}

        {viewTab === 'wardrobe' ? (
          <SectionCard title={t('sections.wardrobeTitle')}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <p className="max-w-[860px] text-base leading-7 text-[#8f837d]">
                上传原图后，先在左侧完成识别与净单品图生成，再在右侧确认属性。模型路由已经提升到单独的全局设置页，不再混在录入流程里。
              </p>
            </div>

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
              </div>
            </div>
          </SectionCard>
        ) : null}

        {viewTab === 'lab' ? (
          <SectionCard title={t('sections.generateTitle')} eyebrow={t('sections.generateEyebrow')}>
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="text-3xl font-semibold tracking-[-0.03em] text-[#2f2927]">{t('sections.generateTitle')}</h3>
                <p className="mt-2 text-base text-[#8f837d]">描述今天要去的场景，从衣橱里快速生成 3 套可视化搭配。</p>
              </div>

              <div className="flex flex-col gap-8 xl:flex-row">
                <div className="w-full xl:w-[360px] xl:flex-none">
                  <div className="flex flex-col gap-6">
                    <div className="rounded-[28px] border border-[#e8ddd7] bg-white p-6 shadow-[0_18px_48px_-32px_rgba(74,53,44,0.16)]">
                      <FieldLabel label="场景描述 (Prompt)">
                        <textarea
                          rows={5}
                          className="w-full resize-none rounded-[20px] border border-transparent bg-[#f4efeb] p-4 text-sm outline-none focus:border-[#d7c5bc]"
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
                            className="rounded-full border border-[#e4d7d1] bg-white px-3 py-1.5 text-xs text-[#7f6f68] transition-colors hover:border-[#b0867d]"
                            onClick={() => setOccasionInput(chip)}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>

                      <div className="mt-6 flex gap-3">
                        <button
                          className="rounded-full border border-[#ded4cf] bg-white px-5 py-3 text-sm font-medium text-[#5f4d47]"
                          onClick={handleSeedDemoWardrobe}
                        >
                          {t('actions.loadDemoWardrobe')}
                        </button>
                        <button
                          className="flex-1 rounded-[18px] bg-[#2f2927] px-5 py-3 text-sm font-medium text-white shadow-[0_14px_30px_-18px_rgba(47,41,39,0.8)] disabled:cursor-not-allowed disabled:bg-neutral-400"
                          onClick={handleGenerateOutfits}
                          disabled={activeGarments.length === 0}
                        >
                          {t('actions.generateOutfits')}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-[#e8ddd7] bg-white p-6 shadow-[0_18px_48px_-32px_rgba(74,53,44,0.16)]">
                      <h4 className="text-sm font-semibold text-[#2f2927]">实时过滤规则</h4>
                      <div className="mt-4 space-y-3">
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
                      <div className="mt-5 rounded-[20px] bg-[#f8f4f1] px-4 py-3 text-sm text-[#8f837d]">
                        {t('state.suggestionHint')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="rounded-[32px] border border-[#e8ddd7] bg-white p-8 shadow-[0_18px_48px_-32px_rgba(74,53,44,0.16)]">
                    {selectedOutfit ? (
                      <div className="flex flex-col gap-6">
                        <div className="flex flex-col items-center xl:flex-row xl:items-start xl:justify-center xl:gap-10">
                          <div className="relative w-full max-w-[420px] overflow-hidden rounded-[36px] border border-[#d8c7bd] bg-[#dbcbbf] shadow-[0_24px_56px_-32px_rgba(85,60,50,0.45)]">
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
                          </div>

                          {selectedOutfit.tryOnImageUrl ? (
                            <div className="mt-6 w-full max-w-[360px] overflow-hidden rounded-[32px] border border-[#e0d3cc] bg-white shadow-[0_18px_40px_-30px_rgba(74,53,44,0.2)] xl:mt-0">
                              <img
                                src={displayImageUrl(selectedOutfit.tryOnImageUrl, resolvedImageUrls)}
                                alt={`${selectedOutfit.occasion} try on`}
                                className="aspect-square w-full object-cover"
                              />
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-col items-center">
                          <p className="mb-4 text-sm font-medium text-[#8f837d]">为你生成了 {labOutfits.length} 套方案，请选择：</p>
                          <div className="flex flex-wrap justify-center gap-4">
                            {labOutfits.map((outfit, index) => (
                              <button
                                key={outfit.id}
                                type="button"
                                className={`relative h-28 w-20 overflow-hidden rounded-xl border-2 bg-white p-1 transition-all ${
                                  selectedOutfit.id === outfit.id
                                    ? 'border-[#b0867d] shadow-[0_12px_26px_-18px_rgba(176,134,125,0.9)]'
                                    : 'border-transparent opacity-70 hover:border-[#e0d1ca] hover:opacity-100'
                                }`}
                                onClick={() => setSelectedOutfitId(outfit.id)}
                              >
                                <div className="h-full w-full overflow-hidden rounded-lg bg-[#eadfd8]">
                                  {outfit.collageImageUrl ? (
                                    <img src={displayImageUrl(outfit.collageImageUrl, resolvedImageUrls)} alt={outfit.occasion} className="h-full w-full object-cover object-top" />
                                  ) : null}
                                </div>
                                {selectedOutfit.id === outfit.id ? (
                                  <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#b0867d] text-[10px] font-semibold text-white">
                                    {index + 1}
                                  </div>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex w-full flex-wrap items-center justify-center gap-3">
                          <button
                            className="rounded-full bg-[#d1aca2] px-6 py-2.5 text-sm font-semibold text-[#3a3330] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => void handleGenerateTryOn()}
                            disabled={tryOnBusy || !selectedOutfit.collageImageUrl}
                          >
                            {tryOnBusy ? 'Generating...' : 'Try on'}
                          </button>
                          <button className="rounded-full bg-[#f0ebe6] px-8 py-2.5 text-sm font-semibold text-[#4a4441] shadow-sm">
                            Edit
                          </button>
                          <button
                            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f0ebe6] text-[#4a4441] shadow-sm"
                            onClick={() => handleFavorite(selectedOutfit.id)}
                          >
                            {selectedOutfit.isFavorite ? '★' : '☆'}
                          </button>
                        </div>

                        <div className="mx-auto w-full max-w-[700px] rounded-[24px] bg-[#f8f4f1] px-5 py-4 text-sm leading-7 text-[#6d5c56]">
                          {selectedOutfit.aiReasoning}
                        </div>
                        {tryOnTraceId ? <div className="text-center text-xs text-[#8f837d]">try-on trace: {tryOnTraceId}</div> : null}
                        {tryOnError ? <div className="text-center text-sm text-red-600">{tryOnError}</div> : null}
                      </div>
                    ) : (
                      <div className="rounded-[28px] border border-dashed border-[#d9c9c1] bg-[#faf6f3] px-8 py-10 text-center text-sm text-[#8f837d]">
                        {t('state.noOutfits')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
