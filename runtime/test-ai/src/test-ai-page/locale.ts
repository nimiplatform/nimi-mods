import enLocale from '../locales/en.js';
import zhLocale from '../locales/zh.js';
import { MEDIA_IMAGE_COMPONENTS_REQUIRED_ERROR, type CapabilityId, type ImageWorkflowDraftState, type ImageWorkflowPresetSelectionKey, } from './types.js';
import { scenarioJobEventLabel, scenarioJobStatusLabel, } from './utils.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
export type TestAiLocale = typeof enLocale | typeof zhLocale;
export function createInitialImageWorkflowDraftState(prompt: string = enLocale.image.defaultPrompt, negativePrompt: string = enLocale.image.defaultNegativePrompt): ImageWorkflowDraftState {
    return {
        prompt,
        negativePrompt,
        size: '1024x1024',
        n: '1',
        seed: '',
        responseFormatMode: 'auto',
        timeoutMs: '600000',
        step: '25',
        cfgScale: '',
        sampler: '',
        scheduler: '',
        optionsText: '',
        rawProfileOverridesText: '',
        vaeModel: '',
        llmModel: '',
        clipLModel: '',
        clipGModel: '',
        controlnetModel: '',
        loraModel: '',
        auxiliaryModel: '',
        componentDrafts: [],
    };
}
export function useTestAiLocale(): TestAiLocale {
    const { i18n } = useModTranslation('test-ai');
    const language = `${i18n.resolvedLanguage || i18n.language || 'en'}`.toLowerCase();
    return language.startsWith('zh') ? zhLocale : enLocale;
}
export function capabilityCopy(locale: TestAiLocale, capabilityId: CapabilityId) {
    return locale.sidebar.capabilities[capabilityId];
}
export function presetLabel(locale: TestAiLocale, key: ImageWorkflowPresetSelectionKey): string {
    return locale.image.presetLabels[key];
}
export function localizeKnownMessage(message: string, locale: TestAiLocale): string {
    switch (message) {
        case MEDIA_IMAGE_COMPONENTS_REQUIRED_ERROR:
            return locale.image.companionRequired;
        case 'Raw profile_overrides JSON must be an object.':
            return locale.image.rawProfileMustBeObject;
        case 'Invalid profile_overrides JSON.':
            return locale.image.invalidProfileJson;
        default:
            return message;
    }
}
export function localizedJobStatus(value: unknown, locale: TestAiLocale): string {
    const statusKey = scenarioJobStatusLabel(value) as keyof typeof locale.jobs.statuses;
    return locale.jobs.statuses[statusKey] || locale.jobs.statuses.unknown;
}
export function localizedJobEvent(value: unknown, locale: TestAiLocale): string {
    const eventKey = scenarioJobEventLabel(value) as keyof typeof locale.jobs.events;
    return locale.jobs.events[eventKey] || locale.jobs.events.event;
}
