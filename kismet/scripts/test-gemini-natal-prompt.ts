/**
 * Standalone diagnostic script to test the Kismet natal analysis prompt
 * directly against the Gemini API (OpenAI-compatible endpoint).
 *
 * This bypasses the runtime gRPC layer to isolate whether truncation
 * occurs at the Gemini model level or somewhere in the runtime pipeline.
 *
 * Usage:
 *   # Option 1: Use connector credential file directly
 *   npx tsx nimi-mods/kismet/scripts/test-gemini-natal-prompt.ts
 *
 *   # Option 2: Provide API key via env
 *   GEMINI_API_KEY=your-key npx tsx nimi-mods/kismet/scripts/test-gemini-natal-prompt.ts
 *
 *   # Option 3: Override model
 *   GEMINI_MODEL=models/gemini-2.5-flash npx tsx nimi-mods/kismet/scripts/test-gemini-natal-prompt.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── Configuration ───────────────────────────────────────────────────────────

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_MODEL = 'models/gemini-2.5-flash';
const MAX_TOKENS = 2048;
const TEMPERATURE = 0.4;

// Connector ID from the screenshot (the one kismet was using)
const TARGET_CONNECTOR_ID = '01KJZGX0JHNX6474GPZ1N04AZX';
// Fallback connector IDs to try
const FALLBACK_CONNECTOR_IDS = [
  'sys-cloud-gemini',
  '01KJPG3JC8KVS98EV2C9TVSGT1',
];

// ─── Prompt Construction (matches kismet's buildNatalSystemPrompt + buildNatalUserPrompt) ──

const SYSTEM_PROMPT = [
  '你是 Kismet 的命理分析引擎。',
  '系统已经确定性推导出四柱、日主、五行比例、喜忌与出生地环境。',
  '你不得重新计算或修改这些事实。',
  '你只能输出严格 JSON，顶层字段只允许 analysis 和 keyNodes。',
  '输出必须以 { 开始，以 } 结束。',
  '',
  'analysis 字段与长度上限（中文字数）：',
  '  summary(≤80), personality(≤60), industry(≤60), fengShui(≤60),',
  '  wealth(≤60), marriage(≤60), health(≤60), family(≤60),',
  '  crypto(≤60), partnerAffinitySummary(≤60), cryptoYear(≤80), cryptoStyle(≤60)。',
  '  scores: {summary,personality,industry,fengShui,wealth,marriage,health,family,crypto}，范围 0-10。',
  '',
  'keyNodes 必须是 5 到 15 个节点，包含 age=1 与 age>=95，年龄严格递增。',
  '每个 keyNode: {age, daYun, score, open, close, high, low, tag}。',
  '  score/open/close/high/low 范围 0-100, high>=max(open,close), low<=min(open,close)。',
  '  tag ≤ 8 字。',
  '',
  '禁止输出 markdown、解释文字或额外字段。',
].join('\n');

// Optimized user prompt — compact, no topCities, no redundant fields
const USER_PROMPT = JSON.stringify({
  pillars: { year: '乙亥', month: '己卯', day: '丁酉', hour: '戊申' },
  dayMaster: '丁火',
  fiveElementRatio: { metal: 16, wood: 40, water: 8, fire: 12, earth: 24 },
  favorableElements: ['water', 'earth'],
  unfavorableElements: ['fire', 'wood'],
  bigLuckCycles: ['戊寅', '丁丑', '丙子', '乙亥', '甲戌', '癸酉', '壬申', '辛未'],
  startAge: 9,
  birthCity: { name: '澳门', element: 'water', relation: 'conflicts' },
});

// ─── Credential Resolution ───────────────────────────────────────────────────

function loadApiKey(): string {
  // Priority 1: env var
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey) {
    console.log('[config] Using API key from GEMINI_API_KEY env var');
    return envKey;
  }

  // Priority 2: connector credential files
  const credDir = path.join(os.homedir(), '.nimi', 'runtime', 'connectors', 'credentials');
  const connectorIds = [TARGET_CONNECTOR_ID, ...FALLBACK_CONNECTOR_IDS];
  for (const connId of connectorIds) {
    const keyFile = path.join(credDir, `${connId}.key`);
    try {
      const key = fs.readFileSync(keyFile, 'utf-8').trim();
      if (key) {
        console.log(`[config] Using API key from connector ${connId}`);
        return key;
      }
    } catch {
      // try next
    }
  }

  console.error('ERROR: No Gemini API key found.');
  console.error('Set GEMINI_API_KEY env var or ensure connector credentials exist at:');
  console.error(`  ${credDir}/${TARGET_CONNECTOR_ID}.key`);
  process.exit(1);
}

// ─── Main Test ───────────────────────────────────────────────────────────────

async function runTest() {
  const apiKey = loadApiKey();
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const endpoint = `${GEMINI_BASE_URL}/v1/chat/completions`;

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  Kismet Natal Prompt — Direct Gemini API Test');
  console.log('════════════════════════════════════════════════════════════\n');
  console.log(`[config] Endpoint: ${endpoint}`);
  console.log(`[config] Model: ${model}`);
  console.log(`[config] max_tokens: ${MAX_TOKENS}`);
  console.log(`[config] temperature: ${TEMPERATURE}`);
  console.log(`[config] System prompt length: ${SYSTEM_PROMPT.length} chars`);
  console.log(`[config] User prompt length: ${USER_PROMPT.length} chars`);

  console.log('\n──── Optimized prompt test (no max_tokens) ────\n');
  await sendRequest({
    endpoint,
    apiKey,
    model,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
    maxTokens: 0,
    temperature: TEMPERATURE,
    useMaxCompletionTokens: false,
    label: 'Optimized',
  });
}

interface RequestConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
  useMaxCompletionTokens: boolean;
  label: string;
}

async function sendRequest(config: RequestConfig) {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: config.systemPrompt },
      { role: 'user', content: config.userPrompt },
    ],
    temperature: config.temperature,
    stream: false,
  };

  if (config.maxTokens > 0) {
    if (config.useMaxCompletionTokens) {
      body.max_completion_tokens = config.maxTokens;
    } else {
      body.max_tokens = config.maxTokens;
    }
  }

  const startTime = Date.now();

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[${config.label}] HTTP ${response.status}: ${errorBody.slice(0, 500)}`);
      return;
    }

    const data = await response.json() as {
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: string };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      model?: string;
    };

    const text = data.choices?.[0]?.message?.content || '';
    const finishReason = data.choices?.[0]?.finish_reason || 'unknown';
    const usage = data.usage;

    console.log(`[${config.label}] Response received in ${elapsed}ms`);
    console.log(`[${config.label}] Model: ${data.model || config.model}`);
    console.log(`[${config.label}] Finish Reason: ${finishReason}`);
    console.log(`[${config.label}] Usage: prompt=${usage?.prompt_tokens}, completion=${usage?.completion_tokens}, total=${usage?.total_tokens}`);
    console.log(`[${config.label}] Text length: ${text.length} chars`);
    console.log(`[${config.label}] First char: ${JSON.stringify(text[0])}`);
    console.log(`[${config.label}] Last char: ${JSON.stringify(text[text.length - 1])}`);
    console.log(`[${config.label}] First 200 chars:\n${text.slice(0, 200)}`);
    console.log(`[${config.label}] Last 200 chars:\n${text.slice(-200)}`);

    // Check for truncation indicators
    const isTruncated = finishReason === 'length';
    const hasUnclosedBraces = countBraceBalance(text) > 0;

    if (isTruncated) {
      console.log(`\n⚠️  [${config.label}] TRUNCATED: finish_reason is "length" — model hit output token limit`);
    }
    if (hasUnclosedBraces) {
      console.log(`⚠️  [${config.label}] INCOMPLETE JSON: brace balance = ${countBraceBalance(text)} (unclosed braces)`);
    }
    if (!isTruncated && !hasUnclosedBraces) {
      // Try to parse
      try {
        const parsed = JSON.parse(text.replace(/^```json\s*\n?/, '').replace(/\n?\s*```$/, ''));
        console.log(`\n[${config.label}] JSON parsed successfully. Top-level keys: ${Object.keys(parsed).join(', ')}`);
        if (parsed.analysis) {
          console.log(`[${config.label}] analysis keys: ${Object.keys(parsed.analysis).join(', ')}`);
        }
        if (parsed.keyNodes) {
          console.log(`[${config.label}] keyNodes count: ${Array.isArray(parsed.keyNodes) ? parsed.keyNodes.length : 'not an array'}`);
        }
      } catch (e) {
        console.log(`\n⚠️  [${config.label}] JSON parse failed: ${(e as Error).message}`);
      }
    }

    console.log(`\n[${config.label}] ─── Full Raw Text ───`);
    console.log(text);
    console.log(`[${config.label}] ─── End Full Raw Text ───`);

  } catch (err) {
    console.error(`[${config.label}] Request failed:`, err);
  }
}

function countBraceBalance(text: string): number {
  let balance = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') balance++;
    else if (char === '}') balance--;
  }
  return balance;
}

runTest().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
