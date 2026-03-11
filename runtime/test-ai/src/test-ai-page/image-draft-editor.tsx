import React from 'react';
import {
  COMMON_IMAGE_WORKFLOW_SLOTS,
  artifactDisplayLabel,
  artifactsForWorkflowSlot,
  presetLabel,
  useTestAiLocale,
} from './core.js';
import type {
  ImageResponseFormatMode,
  ImageWorkflowDraftState,
  ImageWorkflowPresetSelection,
  ImageWorkflowPresetSelectionKey,
} from './core.js';
import type { ModRuntimeLocalArtifactRecord } from '@nimiplatform/sdk/mod/runtime';

type ImageDraftEditorProps = {
  draft: ImageWorkflowDraftState;
  updateDraft: (
    updater: Partial<ImageWorkflowDraftState> | ((prev: ImageWorkflowDraftState) => ImageWorkflowDraftState),
  ) => void;
  isLocalAIImageWorkflow: boolean;
  artifacts: ModRuntimeLocalArtifactRecord[];
  artifactLoading: boolean;
  artifactError: string;
  hasKnownCompanionArtifacts: boolean;
  coreCompanionPresets: ImageWorkflowPresetSelection[];
  extendedCompanionPresets: ImageWorkflowPresetSelection[];
  companionPresetArtifacts: Record<ImageWorkflowPresetSelectionKey, ModRuntimeLocalArtifactRecord[]>;
  onAddComponent: () => void;
  onRemoveComponent: (componentId: string) => void;
  onComponentChange: (componentId: string, key: 'slot' | 'localArtifactId', value: string) => void;
};

function CompanionPresetSelect(props: {
  preset: ImageWorkflowPresetSelection;
  draft: ImageWorkflowDraftState;
  artifactLoading: boolean;
  presetArtifacts: ModRuntimeLocalArtifactRecord[];
  onChange: (value: string) => void;
}) {
  const locale = useTestAiLocale();
  const { preset, draft, artifactLoading, presetArtifacts, onChange } = props;

  return (
    <label key={preset.key} className="flex flex-col gap-1 text-xs">
      <span className="text-gray-500">{presetLabel(locale, preset.key)}</span>
      <select
        className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
        value={draft[preset.key]}
        onChange={(event) => onChange(event.target.value)}
        disabled={artifactLoading || presetArtifacts.length === 0}
      >
        <option value="">{locale.image.layerOptional}</option>
        {presetArtifacts.map((artifact) => (
          <option key={artifact.localArtifactId} value={artifact.localArtifactId}>
            {artifactDisplayLabel(artifact)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ImageDraftEditor(props: ImageDraftEditorProps) {
  const locale = useTestAiLocale();
  const {
    draft,
    updateDraft,
    isLocalAIImageWorkflow,
    artifacts,
    artifactLoading,
    artifactError,
    hasKnownCompanionArtifacts,
    coreCompanionPresets,
    extendedCompanionPresets,
    companionPresetArtifacts,
    onAddComponent,
    onRemoveComponent,
    onComponentChange,
  } = props;

  return (
    <>
      <textarea
        className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
        value={draft.prompt}
        onChange={(event) => updateDraft({ prompt: event.target.value })}
        placeholder={locale.image.promptPlaceholder}
      />
      <textarea
        className="h-14 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
        value={draft.negativePrompt}
        onChange={(event) => updateDraft({ negativePrompt: event.target.value })}
        placeholder={locale.image.negativePromptPlaceholder}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">{locale.image.size}</span>
          <input
            className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
            value={draft.size}
            onChange={(event) => updateDraft({ size: event.target.value })}
            placeholder="1024x1024"
            list="test-ai-image-size-options"
          />
          <datalist id="test-ai-image-size-options">
            <option value="512x512" /><option value="768x768" /><option value="1024x1024" /><option value="1024x576" /><option value="576x1024" />
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">{locale.image.count}</span>
          <input
            type="number"
            min="1"
            max="4"
            className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
            value={draft.n}
            onChange={(event) => updateDraft({ n: event.target.value })}
          />
        </label>
      </div>
      {isLocalAIImageWorkflow ? (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-2">
            <div className="text-xs font-semibold text-gray-700">{locale.image.companionModels}</div>
            <div className="text-[11px] text-gray-500">
              {locale.image.companionDescription}
            </div>
          </div>
          {artifactLoading ? (
            <div className="rounded-md bg-blue-50 p-2 text-[11px] text-blue-700">
              {locale.image.loadingArtifacts}
            </div>
          ) : null}
          {artifactError ? (
            <div className="rounded-md bg-red-50 p-2 text-[11px] text-red-700">{artifactError}</div>
          ) : null}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{locale.image.coreCompanions}</div>
              <div className="text-[11px] text-gray-500">
                {locale.image.coreCompanionsDescription}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {coreCompanionPresets.map((preset) => (
                <CompanionPresetSelect
                  key={preset.key}
                  preset={preset}
                  draft={draft}
                  artifactLoading={artifactLoading}
                  presetArtifacts={companionPresetArtifacts[preset.key] || []}
                  onChange={(value) => updateDraft({ [preset.key]: value } as Partial<ImageWorkflowDraftState>)}
                />
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{locale.image.extendedCompanions}</div>
              <div className="text-[11px] text-gray-500">
                {locale.image.extendedCompanionsDescription}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {extendedCompanionPresets.map((preset) => (
                <CompanionPresetSelect
                  key={preset.key}
                  preset={preset}
                  draft={draft}
                  artifactLoading={artifactLoading}
                  presetArtifacts={companionPresetArtifacts[preset.key] || []}
                  onChange={(value) => updateDraft({ [preset.key]: value } as Partial<ImageWorkflowDraftState>)}
                />
              ))}
            </div>
          </div>
          {!artifactLoading && !artifactError && !hasKnownCompanionArtifacts ? (
            <div className="mt-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-700">
              {locale.image.localArtifactsMissing}
            </div>
          ) : null}
        </div>
      ) : null}
      <details className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs">
        <summary className="cursor-pointer font-semibold text-gray-600">{locale.image.advancedOptions}</summary>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="flex max-w-xs flex-col gap-1 text-xs">
            <span className="text-gray-500">{locale.image.responseFormat}</span>
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={draft.responseFormatMode}
              onChange={(event) => updateDraft({ responseFormatMode: event.target.value as ImageResponseFormatMode })}
            >
              <option value="auto">auto</option>
              <option value="base64">base64</option>
              <option value="url">url</option>
            </select>
            <span className="text-[11px] text-gray-400">
              {locale.image.responseFormatHint}
            </span>
          </label>
          <label className="flex max-w-xs flex-col gap-1 text-xs">
            <span className="text-gray-500">{locale.image.seed}</span>
            <input
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={draft.seed}
              onChange={(event) => updateDraft({ seed: event.target.value })}
              placeholder={locale.image.layerOptional}
            />
            <span className="text-[11px] text-gray-400">
              {locale.image.seedHint}
            </span>
          </label>
          <label className="flex max-w-xs flex-col gap-1 text-xs">
            <span className="text-gray-500">{locale.image.timeout}</span>
            <input
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={draft.timeoutMs}
              onChange={(event) => updateDraft({ timeoutMs: event.target.value })}
              placeholder="600000"
            />
            <span className="text-[11px] text-gray-400">
              {locale.image.timeoutHint}
            </span>
          </label>
        </div>
        {isLocalAIImageWorkflow ? (
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-gray-700">{locale.image.localWorkflow}</div>
                <div className="text-[11px] text-gray-500">
                  {locale.image.localWorkflowDescription}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                onClick={onAddComponent}
              >
                {locale.common.addComponent}
              </button>
            </div>
            <datalist id="test-ai-image-workflow-slots">
              {COMMON_IMAGE_WORKFLOW_SLOTS.map((slot) => (
                <option key={slot} value={slot} />
              ))}
            </datalist>
            {artifactLoading ? (
              <div className="mt-2 rounded-md bg-blue-50 p-2 text-[11px] text-blue-700">
                {locale.image.loadingArtifacts}
              </div>
            ) : null}
            {artifactError ? (
              <div className="mt-2 rounded-md bg-red-50 p-2 text-[11px] text-red-700">{artifactError}</div>
            ) : null}
            {!artifactLoading && !artifactError && artifacts.length === 0 ? (
              <div className="mt-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-700">
                {locale.image.noInstalledArtifacts}
              </div>
            ) : null}
            <div className="mt-3 flex flex-col gap-2">
              {draft.componentDrafts.length === 0 ? (
                <div className="rounded-md bg-gray-50 p-2 text-[11px] text-gray-500">
                  {locale.image.noExtraComponents}
                </div>
              ) : null}
              {draft.componentDrafts.map((component) => {
                const selectedArtifact = artifacts.find((artifact) => artifact.localArtifactId === component.localArtifactId) || null;
                const artifactChoices = (() => {
                  const choices = artifactsForWorkflowSlot(artifacts, component.slot);
                  if (selectedArtifact && !choices.some((artifact) => artifact.localArtifactId === selectedArtifact.localArtifactId)) {
                    return [selectedArtifact, ...choices];
                  }
                  return choices;
                })();

                return (
                  <div key={component.id} className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-gray-500">{locale.image.slot}</span>
                      <input
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                        value={component.slot}
                        onChange={(event) => onComponentChange(component.id, 'slot', event.target.value)}
                        list="test-ai-image-workflow-slots"
                        placeholder="vae_path / llm_path / ..."
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-gray-500">{locale.image.artifact}</span>
                      <select
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                        value={component.localArtifactId}
                        onChange={(event) => onComponentChange(component.id, 'localArtifactId', event.target.value)}
                        disabled={artifactLoading || artifactChoices.length === 0}
                      >
                        <option value="">{locale.image.layerOptional}</option>
                        {artifactChoices.map((artifact) => (
                          <option key={artifact.localArtifactId} value={artifact.localArtifactId}>
                            {artifactDisplayLabel(artifact)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                        onClick={() => onRemoveComponent(component.id)}
                      >
                        {locale.common.remove}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-gray-500">{locale.image.steps}</span>
                <input
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                  value={draft.step}
                  onChange={(event) => updateDraft({ step: event.target.value })}
                  placeholder="25"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-gray-500">{locale.image.cfgScale}</span>
                <input
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                  value={draft.cfgScale}
                  onChange={(event) => updateDraft({ cfgScale: event.target.value })}
                  placeholder={locale.image.layerOptional}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-gray-500">{locale.image.sampler}</span>
                <input
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                  value={draft.sampler}
                  onChange={(event) => updateDraft({ sampler: event.target.value })}
                  placeholder="euler / dpmpp2m / ..."
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-gray-500">{locale.image.scheduler}</span>
                <input
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                  value={draft.scheduler}
                  onChange={(event) => updateDraft({ scheduler: event.target.value })}
                  placeholder={locale.image.layerOptional}
                />
              </label>
            </div>
            <label className="mt-3 flex flex-col gap-1 text-xs">
              <span className="text-gray-500">{locale.image.optionsPerLine}</span>
              <textarea
                className="h-20 resize-y rounded-md border border-gray-300 bg-white p-2 font-mono text-xs"
                value={draft.optionsText}
                onChange={(event) => updateDraft({ optionsText: event.target.value })}
                placeholder={'diffusion_model\noffload_params_to_cpu:true'}
              />
            </label>
            <label className="mt-3 flex flex-col gap-1 text-xs">
              <span className="text-gray-500">{locale.image.rawProfileOverrides}</span>
              <textarea
                className="h-24 resize-y rounded-md border border-gray-300 bg-white p-2 font-mono text-xs"
                value={draft.rawProfileOverridesText}
                onChange={(event) => updateDraft({ rawProfileOverridesText: event.target.value })}
                placeholder={'{"clip_skip": 2}'}
              />
              <span className="text-[11px] text-gray-400">
                {locale.image.rawProfileOverridesHint}
              </span>
            </label>
          </div>
        ) : (
          <div className="mt-3 rounded-md bg-blue-50 p-2 text-[11px] text-blue-700">
            {locale.image.localOnlyHint}
          </div>
        )}
      </details>
    </>
  );
}
