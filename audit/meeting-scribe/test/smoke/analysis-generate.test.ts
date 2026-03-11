/**
 * Meeting Scribe — Analysis (Summary + Action Items) Smoke Test
 *
 * Tests that structured analysis (summary + decisions + action items)
 * works end-to-end through the runtime text generation.
 *
 * Uses a sample transcript (hardcoded or from file) to generate
 * structured output via generateObject pattern.
 *
 * Prerequisites:
 *   - Gemini API key set in env (or any other chat provider)
 *
 * Run:
 *   NIMI_SDK_LIVE=1 \
 *   NIMI_LIVE_GEMINI_API_KEY=<key> \
 *   npx tsx --test nimi-mods/audit/meeting-scribe/test/smoke/analysis-generate.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

import { Runtime } from '../../../../sdk/src/runtime/runtime.js';
import { withRuntimeDaemon } from '../../../../sdk/test/runtime/contract/helpers/runtime-daemon.js';

const APP_ID = 'nimi.meeting-scribe.smoke.analysis';

function requiredEnvOrSkip(t: { skip: (msg?: string) => void }, key: string): string | null {
  const value = String(process.env[key] || '').trim();
  if (!value) {
    t.skip(`set ${key} to run this smoke test`);
    return null;
  }
  return value;
}

const SAMPLE_TRANSCRIPT = `
[Speaker 1] (00:00:05) 好的，我们开始今天的周会。主要讨论Q2的产品路线图。
[Speaker 2] (00:00:15) 好的。上周我们确定了三个核心功能，分别是用户仪表盘、通知系统和数据导出。
[Speaker 1] (00:00:30) 对，我觉得用户仪表盘的优先级最高，应该先做。张三你来负责这个。
[Speaker 3] (00:00:42) 没问题，我这周开始做设计稿，预计下周一能出初版。
[Speaker 2] (00:00:55) 通知系统我来跟进。不过需要后端支持，李四你那边什么时候能提供API？
[Speaker 4] (00:01:08) 这周五之前API可以ready。
[Speaker 1] (00:01:15) 好的。数据导出功能可以放到Q2后半段再做，优先级低一些。
[Speaker 2] (00:01:25) 同意。那我们再确认一下预算的事情，上次提到要增加20%的研发预算。
[Speaker 1] (00:01:38) 这个已经批了。大家按新预算规划就行。
[Speaker 3] (00:01:45) 那我这边设计工具的license也可以升级了对吧？
[Speaker 1] (00:01:52) 对，需要什么跟行政那边申请就行。好，还有其他事情吗？
[Speaker 2] (00:02:00) 没有了。
[Speaker 1] (00:02:03) 好，那今天就到这里。下周同一时间再开。
`.trim();

const SYSTEM_PROMPT = `你是一个会议记录分析专家。请从以下会议转录文本中提取结构化摘要。

输出要求（JSON格式）：
1. keyPoints: 会议核心要点（3-10条，每条一句话）
2. decisions: 会议中做出的明确决议
3. actionItems: 待办事项，每项包含：
   - description: 待办描述
   - assignee: 负责人（如能识别），否则为null
   - dueDate: 截止日期（如有提及），否则为null
   - priority: 优先级（high/medium/low）

请仅输出JSON，不要包含其他文本。`;

test('meeting-scribe analysis: gemini structured summary generation', {
  skip: process.env.NIMI_SDK_LIVE !== '1',
  timeout: 300_000,
}, async (t) => {
  const apiKey = requiredEnvOrSkip(t, 'NIMI_LIVE_GEMINI_API_KEY');
  if (!apiKey) return;

  const transcript = process.env.MS_TEST_TRANSCRIPT_FILE
    ? readFileSync(process.env.MS_TEST_TRANSCRIPT_FILE, 'utf-8')
    : SAMPLE_TRANSCRIPT;

  console.log(`[analysis-test] Transcript length: ${transcript.length} chars`);

  await withRuntimeDaemon({
    appId: APP_ID,
    runtimeEnv: {
      NIMI_RUNTIME_CLOUD_GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      NIMI_RUNTIME_CLOUD_GEMINI_API_KEY: apiKey,
    },
    run: async ({ endpoint }) => {
      const runtime = new Runtime({
        appId: APP_ID,
        transport: { type: 'node-grpc', endpoint },
        defaults: {
          callerKind: 'desktop-core',
          callerId: 'meeting-scribe-analysis-smoke',
        },
      });

      console.log('[analysis-test] Generating structured summary...');
      const result = await runtime.ai.text.generate({
        model: 'gemini/gemini-2.0-flash',
        subjectUserId: 'user-ms-smoke',
        system: SYSTEM_PROMPT,
        input: transcript,
        maxTokens: 2048,
        temperature: 0.3,
        route: 'cloud',
        fallback: 'deny',
        timeoutMs: 60_000,
      });

      console.log('[analysis-test] Raw output:');
      console.log(result.text);
      console.log(`[analysis-test] Tokens: ${JSON.stringify(result.usage)}`);
      console.log(`[analysis-test] Route: ${result.trace.routeDecision}`);

      // Parse and validate structure
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      assert.ok(jsonMatch, 'output should contain a JSON object');

      const parsed = JSON.parse(jsonMatch[0]);
      console.log('\n[analysis-test] Parsed summary:');
      console.log(`  Key points (${parsed.keyPoints?.length ?? 0}):`);
      for (const kp of parsed.keyPoints ?? []) {
        console.log(`    - ${kp}`);
      }
      console.log(`  Decisions (${parsed.decisions?.length ?? 0}):`);
      for (const d of parsed.decisions ?? []) {
        console.log(`    - ${d}`);
      }
      console.log(`  Action items (${parsed.actionItems?.length ?? 0}):`);
      for (const ai of parsed.actionItems ?? []) {
        console.log(`    - [${ai.priority}] ${ai.description} (assignee: ${ai.assignee ?? '-'}, due: ${ai.dueDate ?? '-'})`);
      }

      // Structural assertions
      assert.ok(Array.isArray(parsed.keyPoints), 'should have keyPoints array');
      assert.ok(parsed.keyPoints.length >= 1, 'should have at least 1 key point');
      assert.ok(Array.isArray(parsed.decisions), 'should have decisions array');
      assert.ok(Array.isArray(parsed.actionItems), 'should have actionItems array');
      assert.ok(parsed.actionItems.length >= 1, 'should extract at least 1 action item');

      // Content assertions for sample transcript
      if (!process.env.MS_TEST_TRANSCRIPT_FILE) {
        const allAssignees = parsed.actionItems
          .map((ai: { assignee?: string }) => ai.assignee)
          .filter(Boolean);
        console.log(`\n[analysis-test] Extracted assignees: ${JSON.stringify(allAssignees)}`);
        assert.ok(
          allAssignees.length >= 1,
          'should identify at least 1 assignee from sample transcript',
        );
      }
    },
  });
});
