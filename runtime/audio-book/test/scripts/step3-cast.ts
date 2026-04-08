#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Step 3 — Voice Casting (Layer 2 integration test)
//
// Reads step2 analysis result, classifies character tiers, uses LLM to
// recommend voice assignments for major/supporting characters against a
// hardcoded DashScope voice catalogue (mock TTS client — no real TTS call).
// Minor characters get gender-based defaults.
//
// Usage:
//   npx tsx test/scripts/step3-cast.ts [step2-result.json]
//
// Example:
//   NIMI_API_KEY=<your-gemini-key> \
//   NIMI_PROVIDER_TYPE=gemini \
//   NIMI_MODEL_ID=gemini/gemini-2.0-flash \
//     npx tsx test/scripts/step3-cast.ts \
//       test/output/step2-result-my-novel.json
//
// Default input: test/output/step2-result-short-story.json
// Output:        test/output/step3-result-<basename>.json
//
// Environment:
//   NIMI_RUNTIME_ENDPOINT  — runtime gRPC address (default: 127.0.0.1:46371)
//   NIMI_MODEL_ID          — chat model ID for cloud (default: cloud/default)
//   NIMI_API_KEY            — cloud provider API key (inline key-source)
//   NIMI_PROVIDER_TYPE      — cloud provider type (default: dashscope)
//   NIMI_PROVIDER_ENDPOINT  — cloud provider endpoint (optional)
//
// Prerequisites:
//   1. Start nimi runtime:  cd runtime && go run ./cmd/nimi
//   2. Run step2 first to produce the analysis JSON
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNimiAiProvider } from '@nimiplatform/sdk/ai-provider';
import { Runtime } from '@nimiplatform/sdk/runtime';
import { classifyAllCharacters } from '../../src/services/character-tier.js';
import { recommendAllVoices } from '../../src/services/voice-recommender.js';
import type { CharacterProfile, LlmClient } from '../../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RUNTIME_ENDPOINT = process.env.NIMI_RUNTIME_ENDPOINT ?? '127.0.0.1:46371';
const MODEL_ID = process.env.NIMI_MODEL_ID ?? 'cloud/default';
const API_KEY = process.env.NIMI_API_KEY ?? '';
const PROVIDER_TYPE = process.env.NIMI_PROVIDER_TYPE ?? 'dashscope';
const PROVIDER_ENDPOINT = process.env.NIMI_PROVIDER_ENDPOINT ?? '';
const APP_ID = 'nimi.audio-book.layer2-test';
const SUBJECT_USER_ID = 'user-audio-book-test';

const inputPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(__dirname, '../output/step2-result-short-story.json');

const outputName = `step3-result-${basename(inputPath, '.json').replace('step2-result-', '')}.json`;
const OUTPUT_PATH = resolve(__dirname, '../output', outputName);

// ---------------------------------------------------------------------------
// Build gRPC metadata for inline key-source
// ---------------------------------------------------------------------------

function buildMetadata(): Record<string, string> | undefined {
  if (!API_KEY) return undefined;
  const md: Record<string, string> = {
    'x-nimi-key-source': 'inline',
    'x-nimi-provider-type': PROVIDER_TYPE,
    'x-nimi-provider-api-key': API_KEY,
  };
  if (PROVIDER_ENDPOINT) {
    md['x-nimi-provider-endpoint'] = PROVIDER_ENDPOINT;
  }
  return md;
}

// ---------------------------------------------------------------------------
// Runtime-backed LLM client (Cloud via gRPC)
// ---------------------------------------------------------------------------

function createRuntimeLlmClient(endpoint: string, modelId: string): LlmClient {
  const runtime = new Runtime({
    appId: APP_ID,
    transport: {
      type: 'node-grpc',
      endpoint,
    },
    defaults: {
      callerKind: 'desktop-core',
      callerId: 'audio-book-step3',
    },
    subjectContext: {
      subjectUserId: SUBJECT_USER_ID,
    },
  });

  const provider = createNimiAiProvider({
    runtime,
    appId: APP_ID,
    routePolicy: 'cloud',
    timeoutMs: 300_000,
    metadata: buildMetadata(),
  });

  const model = provider.text(modelId);

  return {
    async generateText(input) {
      const generated = await model.doGenerate({
        prompt: [
          { role: 'system', content: input.systemPrompt },
          {
            role: 'user',
            content: [{ type: 'text', text: input.userPrompt }],
          },
        ],
        temperature: input.temperature ?? 0.7,
        maxOutputTokens: input.maxTokens ?? 4096,
        providerOptions: {},
      });

      const text = generated.content
        .filter((item) => item.type === 'text')
        .map((item) => (item as { type: 'text'; text: string }).text)
        .join('')
        .trim();

      return { text };
    },
  };
}

// ---------------------------------------------------------------------------
// Mock TTS client (simulates available voices)
// ---------------------------------------------------------------------------

function createQwenTtsClient() {
  return {
    async listVoices() {
      const V = (voiceId: string, voiceName: string, gender: 'male' | 'female', language = 'zh-cn') =>
        ({ providerId: 'dashscope', voiceId, voiceName, gender, language }) as const;
      return [
        // -- 普通话・女性 --
        V('Cherry', '芊悦（阳光积极、亲切自然小姐姐）', 'female'),
        V('Serena', '苏瑶（温柔小姐姐）', 'female'),
        V('Chelsie', '千雪（二次元虚拟女友）', 'female'),
        V('Momo', '茉兔（撒娇搞怪、逗你开心）', 'female'),
        V('Vivian', '十三（搞搞的、可爱的小暴躁）', 'female'),
        V('Maia', '四月（知性与温柔的碰撞）', 'female'),
        V('Bella', '萌宝（喝酒不打醉拳的小萝莉）', 'female'),
        V('Jennifer', '詹妮弗（品牌级、电影质感般美语女声）', 'female'),
        V('Katerina', '卡捷琳娜（御姐音色、韵律回味十足）', 'female'),
        V('Mia', '乖小妹（温顺如春水、乖巧如初雪）', 'female'),
        V('Bellona', '燕铮萱（声音洪亮、吐字清晰、有声书江湖风）', 'female'),
        V('Bunny', '萌小媛（萌属性爆棚的小萝莉）', 'female'),
        V('Elias', '墨讲师（学科严谨、叙事技巧型知识讲师）', 'female'),
        V('Nini', '邻家妹妹（又软又黏的甜蜜嗓音）', 'female'),
        V('Ebona', '诡婆婆（低语如生锈钥匙、恐怖悬疑风）', 'female'),
        V('Seren', '小婉（温和舒缓、助眠系声线）', 'female'),
        V('Stella', '少女阿月（迷糊少女音、充满爱与正义）', 'female'),
        V('Sohee', '素熙（温柔开朗、情绪丰富的韩风）', 'female'),
        V('Ono Anna', '小野杏（鬼灵精怪的青梅竹马）', 'female'),
        V('Sonrisa', '索尼莎（热情开朗的拉美大姐）', 'female'),
        // -- 普通话・男性 --
        V('Ethan', '晨煦（标准普通话、阳光温暖朝气）', 'male'),
        V('Moon', '月白（率性帅气）', 'male'),
        V('Kai', '凯（耳朵的一场SPA、治愈系）', 'male'),
        V('Nofish', '不吃鱼（不会翘舌音的设计师）', 'male'),
        V('Ryan', '甜茶（节奏拉满、戏感炸裂）', 'male'),
        V('Aiden', '艾登（精通厨艺的美语大男孩）', 'male'),
        V('Eldric Sage', '沧明子（沉稳睿智的老者、沧桑如松）', 'male'),
        V('Vincent', '田叔（沙哑烟嗓、千军万马江湖豪情）', 'male'),
        V('Neil', '阿闻（字正腔圆、专业新闻主持人）', 'male'),
        V('Arthur', '徐大爷（质朴嗓音、满村奇闻异事）', 'male'),
        V('Andre', '安德雷（声音磁性、自然舒服沉稳）', 'male'),
        V('Lenn', '莱恩（理性底色、叛逆藏细节的德国青年）', 'male'),
        V('Emilien', '埃米尔安（浪漫的法国大哥哥）', 'male'),
        V('Bodega', '博德加（热情的西班牙大叔）', 'male'),
        V('Alek', '阿列克（战斗民族的冷与暖）', 'male'),
        V('Dolce', '多尔切（慵懒的意大利大叔）', 'male'),
        V('Radio Gol', '拉迪奥·戈尔（足球诗人解说风）', 'male'),
        // -- 童声 --
        V('Mochi', '沙小邪（聪明伶俐的小大人、童真未泯）', 'male'),
        V('Pip', '祝尼小孩（调皮捣蛋充满童真）', 'male'),
        // -- 方言 --
        V('Jada', '上海-阿珍（风风火火的沪上阿姐）', 'female', 'zh-shanghai'),
        V('Dylan', '北京-晓东（北京胡同里长大的少年）', 'male', 'zh-beijing'),
        V('Li', '南京-老李（耐心的瑜伽老师）', 'male', 'zh-nanjing'),
        V('Marcus', '陕西-秦川（面宽话短、老陕的味道）', 'male', 'zh-shaanxi'),
        V('Roy', '闽南-阿杰（谈话直爽、台湾哥仔）', 'male', 'zh-minnan'),
        V('Peter', '天津-李彼得（天津相声、专业捧哏）', 'male', 'zh-tianjin'),
        V('Sunny', '四川-晴儿（甜到你心里的川妹子）', 'female', 'zh-sichuan'),
        V('Eric', '四川-程川（跳脱市井的成都男子）', 'male', 'zh-sichuan'),
        V('Rocky', '粤语-阿强（幽默风趣、在线陪聊）', 'male', 'zh-cantonese'),
        V('Kiki', '粤语-阿清（甜美的港妹闺蜜）', 'female', 'zh-cantonese'),
      ];
    },
    async synthesize() {
      throw new Error('Not implemented in mock — use step4 with real TTS endpoint');
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Audio Book Step 3: Voice Casting Test (Runtime Cloud) ===');
  console.log(`Runtime:  ${RUNTIME_ENDPOINT}`);
  console.log(`Model:    ${MODEL_ID}`);
  console.log(`Provider: ${PROVIDER_TYPE}`);
  console.log(`KeyMode:  ${API_KEY ? 'inline' : 'runtime-config'}`);
  console.log(`Input:    ${inputPath}`);
  console.log(`Output:   ${OUTPUT_PATH}`);
  console.log('');

  // 1. Read step2 result
  const step2Raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
  const characters: CharacterProfile[] = step2Raw.characters;

  // 2. Classify tiers
  const classified = classifyAllCharacters(characters);
  console.log('Characters:');
  for (const ch of classified) {
    console.log(`  ${ch.name}: ${ch.tier} (${ch.segmentCount} segments)`);
  }
  console.log('');

  // 3. Recommend voices via runtime Cloud
  const llm = createRuntimeLlmClient(RUNTIME_ENDPOINT, MODEL_ID);
  const tts = createQwenTtsClient();

  console.log('Recommending voices...');
  const castings = await recommendAllVoices(llm, tts, classified);

  // 4. Output
  const output = {
    meta: {
      inputFile: inputPath,
      modelId: MODEL_ID,
      providerType: PROVIDER_TYPE,
      keyMode: API_KEY ? 'inline' : 'runtime-config',
      runtimeEndpoint: RUNTIME_ENDPOINT,
      timestamp: new Date().toISOString(),
    },
    characters: classified,
    castings,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  console.log('');
  console.log(`Results written to: ${OUTPUT_PATH}`);
  console.log('Voice castings:');
  for (const c of castings) {
    console.log(`  ${c.characterName} → ${c.voiceName} (${c.voiceId}, ${c.providerId})`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
