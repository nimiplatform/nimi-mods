import process from 'node:process';
import {
  Runtime,
  RoutePolicy,
  FallbackPolicy,
  Modal,
  type GenerateResponse,
} from '../../../../sdk/src/runtime/index.js';
import { extractGenerateText } from '../../../../sdk/src/runtime/helpers.js';
import { deriveCanonicalProfile } from '../../src/services/bazi/derive-profile.js';
import { buildLocationContext } from '../../src/services/city-affinity.js';
import { buildDailyDefaults } from '../../src/services/daily-context.js';
import {
  buildDailyPromptPackage,
  buildNatalPromptPackage,
} from '../../src/services/prompt-import.js';
import { validateKismetBirthInput } from '../../src/validation/validate-input.js';
import type { KismetBirthInputV2 } from '../../src/types.js';

type ProbeKind = 'natal-profile' | 'daily-fortune';

function getArg(name: string, fallback = ''): string {
  const flag = `--${name}`;
  const argv = process.argv.slice(2);
  const index = argv.findIndex((item) => item === flag);
  if (index >= 0) {
    return String(argv[index + 1] || '').trim();
  }
  return fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function normalizeFinishReason(value: number): string {
  if (value === 1) return 'STOP';
  if (value === 2) return 'LENGTH';
  if (value === 3) return 'TOOL_CALL';
  if (value === 4) return 'CONTENT_FILTER';
  if (value === 5) return 'ERROR';
  return 'UNSPECIFIED';
}

function resolveBirthInput(): KismetBirthInputV2 {
  const raw = {
    name: getArg('name', process.env.KISMET_PROBE_NAME || 'Probe'),
    gender: getArg('gender', process.env.KISMET_PROBE_GENDER || 'male'),
    birthDate: getArg('birth-date', process.env.KISMET_PROBE_BIRTH_DATE || '1995-03-09'),
    birthTime: getArg('birth-time', process.env.KISMET_PROBE_BIRTH_TIME || '16:30'),
    birthPlaceId: getArg('birth-place-id', process.env.KISMET_PROBE_BIRTH_PLACE_ID || 'cn-macau'),
    birthPlaceLabel: getArg('birth-place-label', process.env.KISMET_PROBE_BIRTH_PLACE_LABEL || '澳门'),
    timezone: getArg('timezone', process.env.KISMET_PROBE_TIMEZONE || 'Asia/Macau'),
    consent: {
      allowCityAffinityUse: true,
      allowLocalProfilePersist: true,
      allowLocalProfileMatchUse: true,
    },
  } satisfies KismetBirthInputV2;

  const validated = validateKismetBirthInput(raw);
  if (!validated.ok) {
    throw new Error(`invalid probe birth input: ${validated.error.message}`);
  }
  return validated.data;
}

function buildPromptPackage(kind: ProbeKind, birthInput: KismetBirthInputV2) {
  const canonicalProfile = deriveCanonicalProfile(birthInput);
  const locationContext = buildLocationContext({
    profile: canonicalProfile,
    birthPlaceId: birthInput.birthPlaceId,
    birthPlaceLabel: birthInput.birthPlaceLabel,
  });
  if (!locationContext.ok) {
    throw new Error(locationContext.error.message);
  }

  if (kind === 'daily-fortune') {
    return buildDailyPromptPackage({
      canonicalProfile,
      locationContext: locationContext.data,
      dailyDefaults: buildDailyDefaults(canonicalProfile, birthInput.timezone),
    });
  }

  return buildNatalPromptPackage({
    canonicalProfile,
    birthCityLabel: birthInput.birthPlaceLabel,
  });
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

async function main() {
  const kind = (getArg('kind', process.env.KISMET_PROBE_KIND || 'natal-profile') || 'natal-profile') as ProbeKind;
  if (kind !== 'natal-profile' && kind !== 'daily-fortune') {
    throw new Error(`unsupported kind: ${kind}`);
  }

  const endpoint = getArg('runtime-endpoint', process.env.NIMI_RUNTIME_ENDPOINT || '127.0.0.1:46371');
  const route = (getArg('route', process.env.KISMET_PROBE_ROUTE || 'token-api') || 'token-api') as 'token-api' | 'local-runtime';
  const connectorId = getArg('connector-id', process.env.KISMET_PROBE_CONNECTOR_ID || '01KJZGX0JHNX6474GPZ1N04AZX');
  const model = getArg('model', process.env.KISMET_PROBE_MODEL || 'models/gemini-2.5-flash');
  const maxTokens = Number(getArg('max-tokens', process.env.KISMET_PROBE_MAX_TOKENS || '2048'));
  const temperature = Number(getArg('temperature', process.env.KISMET_PROBE_TEMPERATURE || '0.4'));

  if (route === 'token-api' && !connectorId) {
    throw new Error('connector-id is required for token-api probe');
  }

  const birthInput = resolveBirthInput();
  const promptPackage = buildPromptPackage(kind, birthInput);
  const runtime = new Runtime({
    appId: 'world.nimi.kismet.probe',
    transport: {
      type: 'node-grpc',
      endpoint,
    },
    defaults: {
      callerKind: 'desktop-core',
      callerId: 'kismet-runtime-probe',
    },
    subjectContext: {
      subjectUserId: 'user-kismet-probe',
    },
  });

  const response = await runtime.ai.generate({
    appId: runtime.appId,
    subjectUserId: 'user-kismet-probe',
    modelId: model,
    modal: Modal.TEXT,
    input: [{
      role: 'user',
      content: promptPackage.userPrompt,
      name: '',
    }],
    systemPrompt: promptPackage.systemPrompt,
    tools: [],
    temperature,
    topP: 0,
    maxTokens,
    routePolicy: route === 'token-api' ? RoutePolicy.TOKEN_API : RoutePolicy.LOCAL_RUNTIME,
    fallback: FallbackPolicy.DENY,
    timeoutMs: 60_000,
    connectorId: route === 'token-api' ? connectorId : '',
  });

  const responseRecord = asRecord(response);
  const text = extractGenerateText(asRecord(responseRecord).output as GenerateResponse['output']);
  const traceId = String(responseRecord.traceId || '').trim();
  const report = {
    probe: {
      kind,
      endpoint,
      route,
      connectorId: route === 'token-api' ? connectorId : '',
      model,
      maxTokens,
      temperature,
    },
    prompt: hasFlag('print-prompts') ? {
      systemPrompt: promptPackage.systemPrompt,
      userPrompt: promptPackage.userPrompt,
    } : undefined,
    response: {
      traceId,
      modelResolved: String(responseRecord.modelResolved || '').trim(),
      routeDecision: Number(responseRecord.routeDecision) === RoutePolicy.TOKEN_API ? 'token-api' : 'local-runtime',
      finishReason: normalizeFinishReason(Number(responseRecord.finishReason)),
      textLength: text.length,
      firstChar: text[0] || '',
      lastChar: text[text.length - 1] || '',
      text,
      escapedText: JSON.stringify(text),
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error || '');
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
