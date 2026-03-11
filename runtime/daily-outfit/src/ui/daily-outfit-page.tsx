import React, { startTransition, useState, useSyncExternalStore } from 'react';
import {
  createGarment,
  createWearLog,
  generateOutfitSuggestions,
  getDailyOutfitSnapshot,
  retireGarment,
  seedProfileFromPreferences,
  subscribeDailyOutfitStore,
  toggleFavoriteOutfit,
} from '../state/store.js';
import { DAILY_OUTFIT_AGE_GROUPS, DAILY_OUTFIT_CATEGORIES, DAILY_OUTFIT_GENDERS, DAILY_OUTFIT_SEASONS } from '../types.js';

function MetricCard(input: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">{input.label}</div>
      <div className="mt-2 text-3xl font-semibold text-neutral-950">{input.value}</div>
      <div className="mt-2 text-sm text-neutral-600">{input.hint}</div>
    </div>
  );
}

function SectionCard(input: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
      {input.eyebrow ? (
        <div className="text-xs uppercase tracking-[0.22em] text-orange-600">{input.eyebrow}</div>
      ) : null}
      <h2 className="mt-1 text-xl font-semibold text-neutral-950">{input.title}</h2>
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

export function DailyOutfitPage() {
  const snapshot = useSyncExternalStore(subscribeDailyOutfitStore, getDailyOutfitSnapshot, getDailyOutfitSnapshot);
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

  const [occasionInput, setOccasionInput] = useState('office coffee catch-up');
  const [uploadError, setUploadError] = useState('');

  const handleSaveProfile = () => {
    startTransition(() => {
      seedProfileFromPreferences({
        gender,
        ageGroup,
        selfieUrl: selfieUrl.trim() || undefined,
        stylesText,
        scenesText,
      });
    });
  };

  const handleCreateGarment = () => {
    startTransition(() => {
      createGarment({
        photoUrls: [photoUrl.trim() || `local://daily-outfit/${category}`],
        thumbnailUrl: photoUrl.trim() || undefined,
        category,
        subcategory: subcategory.trim() || undefined,
        colors: textList(colorsText),
        material: material.trim() || undefined,
        styleTags: textList(styleTagsText),
        seasons: seasons as (typeof DAILY_OUTFIT_SEASONS)[number][],
        formalityLevel: Number(formalityLevel),
      });
    });
    setSubcategory('');
    setColorsText('white');
    setStyleTagsText('minimal');
    setPhotoFileName('');
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
      setUploadError(error instanceof Error ? error.message : String(error || 'Upload failed'));
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
      setUploadError(error instanceof Error ? error.message : String(error || 'Upload failed'));
    } finally {
      event.target.value = '';
    }
  };

  const activeGarments = snapshot.garments.filter((garment) => garment.status === 'active');

  return (
    <div
      data-nimi-mod-root="daily-outfit"
      className="min-h-full bg-[radial-gradient(circle_at_top_left,#fed7aa_0%,transparent_32%),linear-gradient(180deg,#fff7ed_0%,#fafaf9_42%,#ffffff_100%)] px-6 py-8 text-neutral-950"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <section className="rounded-[28px] border border-orange-200/70 bg-white/90 p-6 shadow-[0_24px_80px_-40px_rgba(120,53,15,0.45)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="text-xs uppercase tracking-[0.28em] text-orange-600">Daily Outfit</div>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-950">Operate the wardrobe, not just view it</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
                This slice now supports onboarding seed, garment intake, outfit suggestion generation, favorites,
                wear logging, and live insight updates on one workspace.
              </p>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              {snapshot.profile ? 'Profile seeded' : 'Onboarding profile missing'}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Active garments" value={snapshot.insights.activeGarmentCount} hint="Closet pieces currently eligible for recommendations." />
          <MetricCard label="Retired garments" value={snapshot.insights.retiredGarmentCount} hint="Archived pieces retained for history only." />
          <MetricCard label="Wear logs" value={snapshot.insights.wearLogCount} hint="Confirmed outfit history entries." />
          <MetricCard label="Favorites" value={snapshot.insights.favoriteOutfitCount} hint="Saved outfit combinations." />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <SectionCard title="Onboarding and profile" eyebrow="Profile seed">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldLabel label="Gender">
                <select className="rounded-2xl border border-neutral-200 px-4 py-3" value={gender} onChange={(event) => setGender(event.target.value as (typeof DAILY_OUTFIT_GENDERS)[number])}>
                  {DAILY_OUTFIT_GENDERS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="Age group">
                <select className="rounded-2xl border border-neutral-200 px-4 py-3" value={ageGroup} onChange={(event) => setAgeGroup(event.target.value as (typeof DAILY_OUTFIT_AGE_GROUPS)[number])}>
                  {DAILY_OUTFIT_AGE_GROUPS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="Selfie URL" hint="Optional for now; try-on orchestration can use it later.">
                <input className="rounded-2xl border border-neutral-200 px-4 py-3" value={selfieUrl} onChange={(event) => setSelfieUrl(event.target.value)} placeholder="local://daily-outfit/selfie" />
              </FieldLabel>
              <FieldLabel label="Preferred styles" hint="Comma-separated tags, e.g. minimal, business, street.">
                <input className="rounded-2xl border border-neutral-200 px-4 py-3" value={stylesText} onChange={(event) => setStylesText(event.target.value)} />
              </FieldLabel>
              <FieldLabel label="Frequent scenes" hint="Comma-separated scenes, e.g. office, weekend, dinner.">
                <input className="rounded-2xl border border-neutral-200 px-4 py-3" value={scenesText} onChange={(event) => setScenesText(event.target.value)} />
              </FieldLabel>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50">
                {selfieUrl ? (
                  <img src={selfieUrl} alt="Selfie preview" className="h-56 w-full object-cover" />
                ) : (
                  <div className="flex h-56 items-center justify-center text-sm text-neutral-500">No selfie uploaded</div>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <FieldLabel label="Upload selfie" hint="Uses browser File API for local preview right now.">
                  <input className="rounded-2xl border border-neutral-200 px-4 py-3" type="file" accept="image/*" onChange={handleSelfieUpload} />
                </FieldLabel>
                {selfieFileName ? <div className="text-sm text-neutral-600">Selected: {selfieFileName}</div> : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white" onClick={handleSaveProfile}>
                Save onboarding profile
              </button>
              {snapshot.profile ? (
                <div className="text-sm text-neutral-600">
                  Current styles: {Object.keys(snapshot.profile.styleWeights).join(', ') || 'none'}
                </div>
              ) : null}
              {uploadError ? <div className="text-sm text-red-600">{uploadError}</div> : null}
            </div>
          </SectionCard>

          <SectionCard title="Garment intake" eyebrow="Wardrobe">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldLabel label="Category">
                <select className="rounded-2xl border border-neutral-200 px-4 py-3" value={category} onChange={(event) => setCategory(event.target.value as (typeof DAILY_OUTFIT_CATEGORIES)[number])}>
                  {DAILY_OUTFIT_CATEGORIES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="Subcategory">
                <input className="rounded-2xl border border-neutral-200 px-4 py-3" value={subcategory} onChange={(event) => setSubcategory(event.target.value)} placeholder="shirt, denim, sneaker" />
              </FieldLabel>
              <FieldLabel label="Colors">
                <input className="rounded-2xl border border-neutral-200 px-4 py-3" value={colorsText} onChange={(event) => setColorsText(event.target.value)} placeholder="white, navy" />
              </FieldLabel>
              <FieldLabel label="Style tags">
                <input className="rounded-2xl border border-neutral-200 px-4 py-3" value={styleTagsText} onChange={(event) => setStyleTagsText(event.target.value)} placeholder="minimal, business" />
              </FieldLabel>
              <FieldLabel label="Material">
                <input className="rounded-2xl border border-neutral-200 px-4 py-3" value={material} onChange={(event) => setMaterial(event.target.value)} placeholder="cotton" />
              </FieldLabel>
              <FieldLabel label="Photo URL">
                <input className="rounded-2xl border border-neutral-200 px-4 py-3" value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} />
              </FieldLabel>
              <FieldLabel label="Formality level">
                <select className="rounded-2xl border border-neutral-200 px-4 py-3" value={formalityLevel} onChange={(event) => setFormalityLevel(event.target.value)}>
                  {['1', '2', '3', '4', '5'].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="Seasons">
                <div className="flex flex-wrap gap-2">
                  {DAILY_OUTFIT_SEASONS.map((season) => (
                    <button
                      key={season}
                      type="button"
                      className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.18em] ${
                        seasonSelected(seasons, season)
                          ? 'border-orange-300 bg-orange-50 text-orange-900'
                          : 'border-neutral-200 bg-white text-neutral-600'
                      }`}
                      onClick={() => handleToggleSeason(season)}
                    >
                      {season}
                    </button>
                  ))}
                </div>
              </FieldLabel>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50">
                {photoUrl ? (
                  <img src={photoUrl} alt="Garment preview" className="h-56 w-full object-cover" />
                ) : (
                  <div className="flex h-56 items-center justify-center text-sm text-neutral-500">No garment photo uploaded</div>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <FieldLabel label="Upload garment image" hint="PNG/JPG/WebP all work here; stored as a local data URL for now.">
                  <input className="rounded-2xl border border-neutral-200 px-4 py-3" type="file" accept="image/*" onChange={handleGarmentUpload} />
                </FieldLabel>
                {photoFileName ? <div className="text-sm text-neutral-600">Selected: {photoFileName}</div> : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white" onClick={handleCreateGarment}>
                Add garment
              </button>
              <div className="text-sm text-neutral-600">{activeGarments.length} active garments ready for outfit generation</div>
              {uploadError ? <div className="text-sm text-red-600">{uploadError}</div> : null}
            </div>
          </SectionCard>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <SectionCard title="Recommendation lab" eyebrow="Generate">
            <div className="flex flex-col gap-4">
              <FieldLabel label="Occasion prompt" hint="Examples: office coffee catch-up, rainy client meeting, weekend hike.">
                <input className="rounded-2xl border border-neutral-200 px-4 py-3" value={occasionInput} onChange={(event) => setOccasionInput(event.target.value)} />
              </FieldLabel>
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                  onClick={handleGenerateOutfits}
                  disabled={activeGarments.length === 0}
                >
                  Generate outfit suggestions
                </button>
                <div className="text-sm text-neutral-600">
                  Suggestion engine currently uses local heuristics from scene keywords, style weights, season, and formality.
                </div>
              </div>
              <div className="grid gap-4">
                {snapshot.outfits.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
                    No outfits yet. Seed profile + garments first, then generate suggestions.
                  </div>
                ) : snapshot.outfits.slice(0, 6).map((outfit) => (
                  <div key={outfit.id} className="rounded-2xl border border-neutral-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm uppercase tracking-[0.2em] text-neutral-500">{outfit.occasionTags.join(', ') || 'general'}</div>
                        <div className="mt-1 text-lg font-semibold text-neutral-950">{outfit.occasion}</div>
                        <div className="mt-2 text-sm leading-6 text-neutral-600">{outfit.aiReasoning}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {outfit.itemIds.map((itemId) => {
                            const garment = snapshot.garments.find((entry) => entry.id === itemId);
                            return (
                              <span key={itemId} className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                                {garment?.subcategory || garment?.category || itemId}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex min-w-[220px] flex-col gap-2">
                        <button className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-900" onClick={() => handleFavorite(outfit.id)}>
                          {outfit.isFavorite ? 'Unfavorite outfit' : 'Favorite outfit'}
                        </button>
                        <button className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-medium text-white" onClick={() => handleLogWear(outfit.id, outfit.occasion)}>
                          Log wear today
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <div className="space-y-6">
            <SectionCard title="Wardrobe snapshot" eyebrow="Live state">
              <div className="space-y-3">
                {snapshot.garments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
                    No garments yet. Use the intake form to start your closet.
                  </div>
                ) : snapshot.garments.map((garment) => (
                  <div key={garment.id} className="flex items-start justify-between rounded-2xl border border-neutral-200 px-4 py-3">
                    <div className="flex items-start gap-3">
                      {garment.thumbnailUrl ? (
                        <img src={garment.thumbnailUrl} alt={garment.subcategory || garment.category} className="h-16 w-16 rounded-2xl object-cover" />
                      ) : null}
                      <div>
                        <div className="font-medium text-neutral-950">{garment.subcategory || garment.category}</div>
                        <div className="mt-1 text-sm text-neutral-600">
                          {garment.colors.join(', ')} · {garment.styleTags.join(', ') || 'No style tags'}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
                          {garment.seasons.join(', ')} · formality {garment.formalityLevel}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                        {garment.status} · worn {garment.wearCount}x
                      </div>
                      {garment.status === 'active' ? (
                        <button
                          className="rounded-full border border-neutral-200 px-3 py-2 text-xs text-neutral-700"
                          onClick={() => {
                            startTransition(() => {
                              retireGarment(garment.id);
                            });
                          }}
                        >
                          Retire
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Recent wear logs" eyebrow="History">
              <div className="space-y-3">
                {snapshot.wearLogs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
                    No wear logs yet. Logging an outfit will update wear counts and scene frequencies.
                  </div>
                ) : snapshot.wearLogs.slice(0, 6).map((wearLog) => (
                  <div key={wearLog.id} className="rounded-2xl border border-neutral-200 px-4 py-3">
                    <div className="font-medium text-neutral-950">{wearLog.occasion || 'No occasion'}</div>
                    <div className="mt-1 text-sm text-neutral-600">
                      {wearLog.date} · {wearLog.itemIds.length} items
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Insight gaps" eyebrow="Closet signals">
              <div className="space-y-3 text-sm text-neutral-700">
                {snapshot.insights.gapSuggestions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-neutral-600">
                    No immediate gaps detected from the current local state.
                  </div>
                ) : snapshot.insights.gapSuggestions.map((suggestion) => (
                  <div key={suggestion} className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-orange-900">
                    {suggestion}
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </section>
      </div>
    </div>
  );
}
