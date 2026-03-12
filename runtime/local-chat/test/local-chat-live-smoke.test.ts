import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createNimiAiProvider } from '@nimiplatform/sdk/ai-provider';
import { Runtime, createRuntimeClient } from '@nimiplatform/sdk/runtime';
import { clearModSdkHost, setModSdkHost } from '../../../shared/testing/mod-sdk-host.js';
import { runTextTurn } from '../src/hooks/turn-send/text-turn-runner.ts';

type LiveProviderConfig = {
  provider: 'openai' | 'dashscope';
  modelId: string;
  runtimeEnv: Record<string, string>;
};

type RuntimeRunResult = {
  stdout: string;
  stderr: string;
};

const APP_ID = 'nimi.mods.local-chat.live';
const SUBJECT_USER_ID = 'mods-local-chat-live-user';
const DEFAULT_RUNTIME_READY_TIMEOUT_MS = 120_000;
const DEFAULT_RUNTIME_READY_POLL_INTERVAL_MS = 250;

async function allocatePort(): Promise<number> {
  return await new Promise((resolvePromise, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('failed to allocate port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(port);
      });
    });
    server.on('error', reject);
  });
}

function resolveRuntimeDir(): string {
  let cursor = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = resolve(cursor, 'runtime');
    if (existsSync(resolve(candidate, 'cmd', 'nimi'))) {
      return candidate;
    }
    const parent = resolve(cursor, '..');
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }
  throw new Error('runtime directory not found for local-chat live smoke');
}

async function waitForRuntimeReady(endpoint: string): Promise<void> {
  const client = createRuntimeClient({
    appId: APP_ID,
    transport: {
      type: 'node-grpc',
      endpoint,
    },
    defaults: {
      callerKind: 'desktop-core',
      callerId: 'mods-local-chat-live-ready',
    },
  });

  let lastError: unknown = null;
  const deadline = Date.now() + resolveRuntimeReadyTimeoutMs();
  while (Date.now() < deadline) {
    try {
      await client.local.listLocalModels({});
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, DEFAULT_RUNTIME_READY_POLL_INTERVAL_MS));
    }
  }

  throw new Error(`runtime readiness check failed: ${String(lastError)}`);
}

async function terminateDaemon(daemon: ReturnType<typeof spawn>): Promise<void> {
  const killGroup = (signal: NodeJS.Signals) => {
    if (daemon.pid === undefined) {
      return;
    }
    try {
      process.kill(-daemon.pid, signal);
    } catch {
      // no-op
    }
    try {
      process.kill(daemon.pid, signal);
    } catch {
      // no-op
    }
  };

  killGroup('SIGTERM');
  const settled = await Promise.race([
    once(daemon, 'exit'),
    new Promise((resolvePromise) => setTimeout(() => resolvePromise('timeout'), 8_000)),
  ]);
  if (settled === 'timeout') {
    killGroup('SIGKILL');
  }
}

async function withRuntimeDaemon(
  runtimeEnv: Record<string, string>,
  run: (endpoint: string) => Promise<void>,
): Promise<RuntimeRunResult> {
  const runtimeDir = resolveRuntimeDir();
  const stateRoot = mkdtempSync(join(tmpdir(), 'nimi-mod-local-chat-runtime-'));
  const grpcPort = await allocatePort();
  const httpPort = await allocatePort();
  const endpoint = `127.0.0.1:${grpcPort}`;

  const daemon = spawn('go', ['run', './cmd/nimi', 'serve'], {
    cwd: runtimeDir,
    detached: true,
    env: {
      ...process.env,
      NIMI_RUNTIME_GRPC_ADDR: endpoint,
      NIMI_RUNTIME_HTTP_ADDR: `127.0.0.1:${httpPort}`,
      NIMI_RUNTIME_ENABLE_WORKERS: '0',
      NIMI_RUNTIME_LOCK_PATH: join(stateRoot, 'runtime.lock'),
      NIMI_RUNTIME_CONFIG_PATH: join(stateRoot, 'config.json'),
      NIMI_RUNTIME_MODEL_REGISTRY_PATH: join(stateRoot, 'model-registry.json'),
      NIMI_RUNTIME_LOCAL_STATE_PATH: join(stateRoot, 'local-state.json'),
      NIMI_RUNTIME_CONNECTOR_STORE_PATH: join(stateRoot, 'connector-store.json'),
      XDG_DATA_HOME: join(stateRoot, 'xdg-data'),
      XDG_CACHE_HOME: join(stateRoot, 'xdg-cache'),
      ...runtimeEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  daemon.stdout.on('data', (chunk: Buffer | string) => {
    stdout += String(chunk || '');
  });

  let stderr = '';
  daemon.stderr.on('data', (chunk: Buffer | string) => {
    stderr += String(chunk || '');
  });

  const daemonError = once(daemon, 'error')
    .then(([error]) => error as Error)
    .catch(() => null);

  try {
    const readyOrError = await Promise.race([
      waitForRuntimeReady(endpoint).then(() => null),
      daemonError,
    ]);
    if (readyOrError) {
      throw new Error(`runtime daemon failed before ready: ${readyOrError.message}`);
    }

    await run(endpoint);
    return { stdout, stderr };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || '');
    throw new Error(`${detail}\nstdout=${stdout}\nstderr=${stderr}`);
  } finally {
    await terminateDaemon(daemon);
    rmSync(stateRoot, { recursive: true, force: true });
  }
}

function resolveRuntimeReadyTimeoutMs(): number {
  const configured = Number(process.env.NIMI_RUNTIME_READY_TIMEOUT_MS || '');
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_RUNTIME_READY_TIMEOUT_MS;
}

function requiredEnv(name: string): string {
  return String(process.env[name] || '').trim();
}

function normalizeCloudModelId(provider: LiveProviderConfig['provider'], modelId: string): string {
  const normalized = String(modelId || '').trim();
  if (!normalized) {
    return '';
  }
  const lower = normalized.toLowerCase();
  if (lower.startsWith('cloud/') || lower.startsWith(`${provider}/`)) {
    return normalized;
  }
  return `${provider}/${normalized}`;
}

function resolveProviderConfigOrSkip(t: { skip: (msg?: string) => void }): LiveProviderConfig | null {
  const openaiKey = requiredEnv('NIMI_LIVE_OPENAI_API_KEY');
  const openaiModel = requiredEnv('NIMI_LIVE_OPENAI_MODEL_ID');
  if (openaiKey && openaiModel) {
    return {
      provider: 'openai',
      modelId: openaiModel,
      runtimeEnv: {
        NIMI_RUNTIME_CLOUD_OPENAI_BASE_URL: 'https://api.openai.com/v1',
        NIMI_RUNTIME_CLOUD_OPENAI_API_KEY: openaiKey,
      },
    };
  }

  const dashscopeKey = requiredEnv('NIMI_LIVE_DASHSCOPE_API_KEY');
  const dashscopeModel = requiredEnv('NIMI_LIVE_DASHSCOPE_MODEL_ID');
  if (dashscopeKey && dashscopeModel) {
    return {
      provider: 'dashscope',
      modelId: dashscopeModel,
      runtimeEnv: {
        NIMI_RUNTIME_CLOUD_DASHSCOPE_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        NIMI_RUNTIME_CLOUD_DASHSCOPE_API_KEY: dashscopeKey,
      },
    };
  }

  t.skip('set OpenAI or DashScope env vars to run local-chat live smoke');
  return null;
}

function promptFromText(text: string) {
  return [{
    role: 'user' as const,
    content: [{
      type: 'text' as const,
      text,
    }],
  }];
}

function extractTextContent(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((item) => item.type === 'text')
    .map((item) => String(item.text || ''))
    .join('')
    .trim();
}

function installNoopModSdkHost(): void {
  setModSdkHost({
    logging: {
      emitRuntimeLog: () => {},
      createRendererFlowId: (prefix: string) => `${prefix}-test`,
      logRendererEvent: () => {},
    },
  } as never);
}

test('local-chat live smoke: runTextTurn real provider with trace continuity', {
  skip: process.env.NIMI_MODS_LIVE !== '1',
  timeout: 240_000,
}, async (t) => {
  const providerConfig = resolveProviderConfigOrSkip(t);
  if (!providerConfig) {
    return;
  }

  installNoopModSdkHost();

  let observedTraceId = '';

  try {
    await withRuntimeDaemon(providerConfig.runtimeEnv, async (endpoint) => {
      const runtime = new Runtime({
        appId: APP_ID,
        transport: {
          type: 'node-grpc',
          endpoint,
        },
        defaults: {
          callerKind: 'desktop-core',
          callerId: 'mods-local-chat-live-smoke',
        },
        subjectContext: {
          subjectUserId: SUBJECT_USER_ID,
        },
      });

      const provider = createNimiAiProvider({
        runtime,
        appId: APP_ID,
        routePolicy: 'cloud',
        fallback: 'deny',
        timeoutMs: 45_000,
      });

      const textModel = provider.text(
        normalizeCloudModelId(providerConfig.provider, providerConfig.modelId),
      );

      const aiClient = {
        streamText: async function* (input: Record<string, unknown>) {
          const generated = await textModel.doGenerate({
            prompt: promptFromText(String(input.prompt || '').trim() || 'Say hello from local-chat live smoke.'),
            providerOptions: {},
          });

          const traceId = String(
            (generated.providerMetadata as { nimi?: { traceId?: string } } | undefined)?.nimi?.traceId
            || generated.response?.id
            || '',
          ).trim();
          observedTraceId = traceId || observedTraceId;
          const text = extractTextContent(generated.content as Array<{ type: string; text?: string }>);
          if (text) {
            yield { type: 'text_delta', textDelta: text };
          }
          yield { type: 'done', traceId: traceId || undefined };
        },
        generateText: async (input: Record<string, unknown>) => {
          const generated = await textModel.doGenerate({
            prompt: promptFromText(String(input.prompt || '').trim() || 'Say hello from local-chat live smoke.'),
            providerOptions: {},
          });

          const traceId = String(
            (generated.providerMetadata as { nimi?: { traceId?: string } } | undefined)?.nimi?.traceId
            || generated.response?.id
            || '',
          ).trim();
          observedTraceId = traceId || observedTraceId;
          return {
            text: extractTextContent(generated.content as Array<{ type: string; text?: string }>),
            promptTraceId: traceId || `local-chat-live-${Date.now().toString(36)}`,
            traceId: traceId || undefined,
          };
        },
      };

      const result = await runTextTurn({
        flowId: 'local-chat-live-smoke',
        aiClient,
        invokeInput: {
          capability: 'text.generate',
          prompt: '你是一个简洁友好的助手。',
          mode: 'STORY',
          maxTokens: 512,
          agentId: 'agent.local-chat.live',
        },
        prompt: '请先规划回复，再回答用户。',
        allowMultiReply: false,
      });

      assert.ok(result.segments.length > 0, 'segments should not be empty');
      assert.ok(String(result.segments[0]?.content || '').trim().length > 0, 'first segment should have content');
      assert.ok(String(result.traceId || '').trim().length > 0, 'runTextTurn should expose a non-empty traceId');
      assert.ok(String(observedTraceId || '').trim().length > 0, 'provider call should expose a non-empty traceId');
    });
  } finally {
    clearModSdkHost();
  }
});
