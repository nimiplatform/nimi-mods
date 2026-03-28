import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  AgentCaptureAgentSummary,
  AgentCaptureDraftSnapshot,
  AgentCaptureResultFacts,
  AgentCaptureRouteState,
  AgentCaptureSessionState,
  AgentCaptureVisualDelta,
  AgentCaptureVisualSpec,
} from '../src/types.js';
import { createEmptyDraftSnapshot, createEmptyRouteState, createEmptySessionState } from '../src/services/state.js';
import enLocale from '../src/locales/en.js';

const sdkState = vi.hoisted(() => ({
  hookClient: {
    storage: {},
    data: {
      query: vi.fn(),
    },
  },
  runtimeClient: {
    route: {
      listOptions: vi.fn(),
    },
  },
}));

type MockFixtures = {
  draft: AgentCaptureDraftSnapshot | null;
  session: AgentCaptureSessionState | null;
  routeState: AgentCaptureRouteState;
  agentList: AgentCaptureAgentSummary[];
  selectedAgent: AgentCaptureAgentSummary | null;
};

const fixtures = vi.hoisted((): MockFixtures => ({
  draft: null,
  session: null,
  routeState: {
    textRouteBinding: null,
    imageRouteBinding: null,
  },
  agentList: [],
  selectedAgent: null,
}));

const loadAgentCaptureDraftMock = vi.hoisted(() => vi.fn(async () => fixtures.draft));
const persistAgentCaptureDraftMock = vi.hoisted(() => vi.fn(async () => {}));
const clearAgentCaptureDraftMock = vi.hoisted(() => vi.fn(async () => {}));
const loadAgentCaptureSessionMock = vi.hoisted(() => vi.fn(async () => fixtures.session));
const persistAgentCaptureSessionMock = vi.hoisted(() => vi.fn(async () => {}));
const clearAgentCaptureSessionMock = vi.hoisted(() => vi.fn(async () => {}));
const loadAgentCaptureRouteStateMock = vi.hoisted(() => vi.fn(async () => fixtures.routeState));
const persistAgentCaptureRouteStateMock = vi.hoisted(() => vi.fn(async () => {}));
const listCreatorAgentsMock = vi.hoisted(() => vi.fn(async () => fixtures.agentList));
const getCreatorAgentMock = vi.hoisted(() => vi.fn(async () => fixtures.selectedAgent));
const sanitizeRouteStateAgainstRuntimeMock = vi.hoisted(() => vi.fn(async () => ({
  changed: false,
  routeState: fixtures.routeState,
})));
const recomputeCurrentBriefMock = vi.hoisted(() => vi.fn(async () => ({ brief: 'Refined brief', traceId: 'trace-brief' })));
const runCaptureTurnMock = vi.hoisted(() => vi.fn(async () => ({
  assistantReply: 'Thanks, the role direction is clearer now.',
  brief: 'Refined brief',
  visualDelta: {
    intentMode: 'refine',
    retain: ['palace purple', 'jade flute'],
    adjust: ['make the silhouette calmer'],
    touchedFields: ['silhouette', 'palette'],
  },
  traceId: 'trace-turn',
})));
const generateAgentDraftMock = vi.hoisted(() => vi.fn(async () => ({
  image: { url: 'https://images.test/final-role.png' },
  visualSpec: {
    roleCore: 'poised palace strategist',
    silhouette: 'slender full-body silhouette',
    outfit: 'layered palace robe',
    materials: ['gauze'],
    accessories: ['jade ornament'],
    handProp: 'jade flute',
    hairstyle: 'high ponytail',
    palette: {
      primary: 'palace purple',
      secondary: 'jade green',
    },
    artStyle: 'stylized painterly realism',
    backgroundWeight: 'minimal',
    signatureHook: {
      kind: 'prop',
      value: 'jade flute',
    },
  },
  resultFacts: {
    framing: 'full-body-anchor',
    backgroundWeight: 'minimal',
    signatureHook: {
      kind: 'prop',
      value: 'jade flute',
    },
    usesSourceImage: false,
  },
  draft: {
    name: 'Zi Ling',
    bio: 'A poised purple-robed palace figure.',
    personaSeed: 'Elegant and reserved.',
    tags: ['palace', 'purple'],
    characterReadout: 'The role lands on a poised palace silhouette with a purple gauze presence.',
  },
  textTraceId: 'trace-text',
  imageTraceId: 'trace-image',
})));
const storeSourceImageMock = vi.hoisted(() => vi.fn(async (_storage: unknown, _draftId: string, file: File) => ({
  url: `blob:${file.name}`,
  fileName: file.name,
  mimeType: file.type || 'image/png',
  path: '/tmp/source-image.png',
})));
const prepareAgentDraftCardPreviewMock = vi.hoisted(() => vi.fn(async () => ({
  svg: '<svg />',
  svgDataUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%20/%3E',
})));
const exportAgentDraftCardPngMock = vi.hoisted(() => vi.fn(async () => {}));

function lookupValue(input: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, input);
}

function interpolate(template: string, options?: Record<string, unknown>): string {
  return template.replace(/\{\{(.*?)\}\}/g, (_, token) => {
    const value = options?.[String(token).trim()];
    return value === undefined || value === null ? '' : String(value);
  });
}

function t(key: string, options?: Record<string, unknown>): string {
  const value = lookupValue(enLocale as Record<string, unknown>, key);
  return typeof value === 'string' ? interpolate(value, options) : key;
}

vi.mock('@nimiplatform/sdk/mod', () => ({
  createHookClient: () => sdkState.hookClient,
  createModRuntimeClient: () => sdkState.runtimeClient,
  useModTranslation: () => ({
    t,
    i18n: {
      language: 'en-US',
      resolvedLanguage: 'en-US',
    },
  }),
  filterModelOptions: (models: string[], query: string) => {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) return models;
    return models.filter((item) => item.toLowerCase().includes(normalized));
  },
  normalizeRuntimeRouteSource: (value: string) => (value === 'cloud' ? 'cloud' : 'local'),
  parseRuntimeRouteOptions: (value: unknown) => value,
}));

vi.mock('../src/services/draft-storage.js', () => ({
  loadAgentCaptureDraft: loadAgentCaptureDraftMock,
  persistAgentCaptureDraft: persistAgentCaptureDraftMock,
  clearAgentCaptureDraft: clearAgentCaptureDraftMock,
}));

vi.mock('../src/services/session-storage.js', () => ({
  loadAgentCaptureSession: loadAgentCaptureSessionMock,
  persistAgentCaptureSession: persistAgentCaptureSessionMock,
  clearAgentCaptureSession: clearAgentCaptureSessionMock,
}));

vi.mock('../src/services/route-storage.js', () => ({
  loadAgentCaptureRouteState: loadAgentCaptureRouteStateMock,
  persistAgentCaptureRouteState: persistAgentCaptureRouteStateMock,
}));

vi.mock('../src/services/agent-data.js', () => ({
  listCreatorAgents: listCreatorAgentsMock,
  getCreatorAgent: getCreatorAgentMock,
}));

vi.mock('../src/services/route-validation.js', () => ({
  sanitizeRouteStateAgainstRuntime: sanitizeRouteStateAgainstRuntimeMock,
}));

vi.mock('../src/services/generation.js', () => ({
  runCaptureTurn: runCaptureTurnMock,
  recomputeCurrentBrief: recomputeCurrentBriefMock,
  generateAgentDraft: generateAgentDraftMock,
  storeSourceImage: storeSourceImageMock,
}));

vi.mock('../src/services/export.js', () => ({
  prepareAgentDraftCardPreview: prepareAgentDraftCardPreviewMock,
  exportAgentDraftCardPng: exportAgentDraftCardPngMock,
}));

import { AgentCapturePage } from '../src/ui/agent-capture-page.js';

function makeVisualSpec(overrides: Partial<AgentCaptureVisualSpec> = {}): AgentCaptureVisualSpec {
  return {
    roleCore: 'poised palace strategist',
    silhouette: 'slender full-body silhouette',
    outfit: 'layered palace robe',
    materials: ['gauze'],
    accessories: ['jade ornament'],
    handProp: 'jade flute',
    hairstyle: 'high ponytail',
    palette: {
      primary: 'palace purple',
      secondary: 'jade green',
    },
    artStyle: 'stylized painterly realism',
    backgroundWeight: 'minimal',
    signatureHook: {
      kind: 'prop',
      value: 'jade flute',
    },
    ...overrides,
  };
}

function makeVisualDelta(overrides: Partial<AgentCaptureVisualDelta> = {}): AgentCaptureVisualDelta {
  return {
    intentMode: 'refine',
    retain: ['palace purple', 'jade flute'],
    adjust: ['make the silhouette calmer'],
    touchedFields: ['silhouette', 'palette'],
    ...overrides,
  };
}

function makeResultFacts(overrides: Partial<AgentCaptureResultFacts> = {}): AgentCaptureResultFacts {
  return {
    framing: 'full-body-anchor',
    backgroundWeight: 'minimal',
    signatureHook: {
      kind: 'prop',
      value: 'jade flute',
    },
    usesSourceImage: false,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<AgentCaptureDraftSnapshot> = {}): AgentCaptureDraftSnapshot {
  return {
    ...createEmptyDraftSnapshot(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<AgentCaptureSessionState> = {}): AgentCaptureSessionState {
  return {
    ...createEmptySessionState(),
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentCaptureAgentSummary> = {}): AgentCaptureAgentSummary {
  return {
    id: 'agent-1',
    handle: 'zi_ling',
    displayName: 'Zi Ling',
    bio: null,
    avatarUrl: null,
    tags: ['palace'],
    worldId: null,
    activeWorldId: null,
    ownershipType: null,
    importance: null,
    state: null,
    ...overrides,
  };
}

function renderPage() {
  return render(<AgentCapturePage />);
}

beforeEach(() => {
  fixtures.draft = null;
  fixtures.session = null;
  fixtures.routeState = createEmptyRouteState();
  fixtures.agentList = [];
  fixtures.selectedAgent = null;

  loadAgentCaptureDraftMock.mockClear();
  persistAgentCaptureDraftMock.mockClear();
  clearAgentCaptureDraftMock.mockClear();
  loadAgentCaptureSessionMock.mockClear();
  persistAgentCaptureSessionMock.mockClear();
  clearAgentCaptureSessionMock.mockClear();
  loadAgentCaptureRouteStateMock.mockClear();
  persistAgentCaptureRouteStateMock.mockClear();
  listCreatorAgentsMock.mockClear();
  getCreatorAgentMock.mockClear();
  sanitizeRouteStateAgainstRuntimeMock.mockClear();
  recomputeCurrentBriefMock.mockClear();
  runCaptureTurnMock.mockClear();
  generateAgentDraftMock.mockClear();
  storeSourceImageMock.mockClear();
  prepareAgentDraftCardPreviewMock.mockClear();
  exportAgentDraftCardPngMock.mockClear();
});

describe('AgentCapturePage UI flow', () => {
  it('renders a persisted result and opens the fullscreen image preview', async () => {
    fixtures.draft = makeDraft({
      name: 'Zi Ling',
      generatedImage: { url: 'https://images.test/ziling.png' },
      characterReadout: 'A poised role image.',
      visualSpec: makeVisualSpec(),
    });

    renderPage();

    const resultHeading = await screen.findByRole('heading', { name: 'Zi Ling' });
    expect(resultHeading).toBeDefined();

    const resultPanel = resultHeading.closest('section');
    expect(resultPanel).toBeTruthy();
    const previewButton = within(resultPanel as HTMLElement).getByRole('button', { name: /zi ling/i });

    fireEvent.click(previewButton);

    expect(await screen.findByRole('button', { name: 'Close preview' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Close preview' })).toBeNull();
    });
  });

  it('opens the draft card preview and exports the current draft as png', async () => {
    fixtures.draft = makeDraft({
      name: 'Zi Ling',
      generatedImage: { url: 'https://images.test/ziling.png' },
      characterReadout: 'A poised role image.',
      bio: 'A restrained palace figure with a poetic presence.',
      tags: ['palace', 'jade'],
      visualSpec: makeVisualSpec(),
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Zi Ling' });
    fireEvent.click(screen.getByRole('button', { name: 'Export draft card' }));

    const previewDialog = await screen.findByRole('dialog', { name: 'Draft card preview' });
    await waitFor(() => {
      expect(prepareAgentDraftCardPreviewMock).toHaveBeenCalledTimes(1);
    });
    expect(within(previewDialog).getByRole('img', { name: 'Draft card preview' })).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: 'Save PNG' })[0] as HTMLElement);

    await waitFor(() => {
      expect(exportAgentDraftCardPngMock).toHaveBeenCalledTimes(1);
    });
    expect(exportAgentDraftCardPngMock.mock.calls[0]?.[0]).toMatchObject({
      storage: sdkState.hookClient.storage,
      preferredLanguage: 'en-US',
    });
  });

  it('toggles support inputs from the compact workbench layout', async () => {
    fixtures.draft = makeDraft({
      sourcePrompt: 'Purple palace dress with gauze layers',
    });
    fixtures.session = makeSession({
      inputMode: 'dialogue',
      currentBrief: 'Purple palace silhouette with gauze and jade flute.',
    });

    renderPage();

    await screen.findByText('Purple palace silhouette with gauze and jade flute.');
    expect(screen.queryByText('Add reference image')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show support inputs' }));

    expect(await screen.findByText('Add reference image')).toBeDefined();
    expect(screen.getByText('Select existing agent')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Hide support inputs' }));

    await waitFor(() => {
      expect(screen.queryByText('Add reference image')).toBeNull();
    });
  });

  it('supports the main refine -> confirm -> generate flow', async () => {
    fixtures.routeState = {
      textRouteBinding: { source: 'cloud', connectorId: 'text-connector', model: 'gemini-3-flash-preview' },
      imageRouteBinding: { source: 'cloud', connectorId: 'image-connector', model: 'gemini-2.5-flash-image' },
    };

    renderPage();

    const input = await screen.findByPlaceholderText('Describe the role you want, even if it is only a feeling');
    fireEvent.change(input, { target: { value: 'Zi Ling, purple palace dress, gauze layers, high ponytail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue chat' }));

    await waitFor(() => {
      expect(runCaptureTurnMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('Current board')).toBeDefined();
    expect(await screen.findByText('Current response')).toBeDefined();
    expect(await screen.findByText('Thanks, the role direction is clearer now.')).toBeDefined();
    expect(screen.getByText('Refined brief')).toBeDefined();
    expect(screen.getByText('Still taking shape')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Generate Agent' }));

    expect(await screen.findByRole('button', { name: 'Generate with this brief' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Generate with this brief' }));

    await waitFor(() => {
      expect(generateAgentDraftMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByDisplayValue('Zi Ling')).toBeDefined();
    expect(screen.getAllByText('The role lands on a poised palace silhouette with a purple gauze presence.').length).toBeGreaterThan(0);
    expect(screen.getByText('jade flute')).toBeDefined();
    expect(generateAgentDraftMock.mock.calls[0]?.[0]).toMatchObject({
      textBinding: fixtures.routeState.textRouteBinding,
      imageBinding: fixtures.routeState.imageRouteBinding,
      preferredLanguage: 'en-US',
    });
  });

  it('uses support inputs to refresh the current brief context', async () => {
    fixtures.draft = makeDraft({
      sourcePrompt: 'A restrained palace figure in purple',
    });
    fixtures.session = makeSession({
      inputMode: 'expanded',
      currentBrief: 'Initial brief',
    });
    fixtures.agentList = [makeAgent()];
    fixtures.selectedAgent = makeAgent();
    recomputeCurrentBriefMock.mockResolvedValue({
      brief: 'Refined brief from support inputs',
      traceId: 'trace-support',
    });

    const { container } = renderPage();

    await screen.findByText('Add reference image');

    const agentSelect = container.querySelector('select');
    expect(agentSelect).toBeTruthy();
    fireEvent.change(agentSelect as HTMLSelectElement, { target: { value: 'agent-1' } });

    await waitFor(() => {
      expect(getCreatorAgentMock).toHaveBeenCalledWith(sdkState.hookClient, 'agent-1');
      expect(recomputeCurrentBriefMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Refined brief from support inputs')).toBeDefined();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();
    const file = new File(['image-bytes'], 'reference.png', { type: 'image/png' });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(storeSourceImageMock).toHaveBeenCalledTimes(1);
      expect(recomputeCurrentBriefMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('reference.png')).toBeDefined();
  });

  it('surfaces generation failures in the visible feedback area and error banner', async () => {
    fixtures.draft = makeDraft({
      sourcePrompt: 'Zi Ling in palace purple',
      visualSpec: makeVisualSpec(),
      lastVisualDelta: makeVisualDelta(),
      resultFacts: makeResultFacts(),
    });
    fixtures.session = makeSession({
      currentBrief: 'Ready to generate',
    });
    generateAgentDraftMock.mockRejectedValueOnce(new Error('provider request timed out'));

    renderPage();

    await screen.findByText('Ready to generate');
    fireEvent.click(screen.getByRole('button', { name: 'Generate Agent' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Generate with this brief' }));

    expect(await screen.findByText('Role first-image generation failed: provider request timed out')).toBeDefined();
    expect(screen.getByText('provider request timed out')).toBeDefined();
  });
});
