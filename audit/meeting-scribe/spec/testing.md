# Testing

> Domain: Meeting Scribe / Testing
> Covers: 独立冒烟测试脚本（不依赖 nimi-desktop）

## 0. Normative Imports

| Kernel Location | Rule IDs |
|---|---|
| `kernel/pipeline-contract.md` | MS-PIPE-003, MS-PIPE-004 |
| `kernel/routing-contract.md` | MS-ROUTE-001 |

## 1. Scope

本文档描述 Meeting Scribe 的独立测试策略。测试直接通过 SDK `Runtime` 类经 gRPC 调用 nimi-runtime，不需要 nimi-desktop 或 nimi-hook 基础设施。

## 2. 测试架构

```
test script (TypeScript, node:test)
    │
    ├── withRuntimeDaemon()         → 自动启动 Go runtime 子进程
    │     └── go run ./cmd/nimi serve
    │
    ├── new Runtime({ transport: 'node-grpc' })
    │     ├── runtime.media.stt.transcribe()    → STT 测试
    │     └── runtime.ai.text.generate()        → 文本分析测试
    │
    └── assert + console.log        → 验证结果
```

关键依赖：
- `sdk/src/runtime/runtime.ts` — `Runtime` 类，提供 gRPC 客户端
- `sdk/test/runtime/contract/helpers/runtime-daemon.ts` — `withRuntimeDaemon` 辅助函数，自动管理 runtime 生命周期

## 3. 冒烟测试脚本

### 3.1 STT 转录测试

**文件**: `test/smoke/stt-transcribe.test.ts`

**目的**: 验证音频文件能通过 Gemini cloud 成功转录。

**运行方式**:
```bash
# 使用内置 fixture
NIMI_SDK_LIVE=1 \
NIMI_LIVE_GEMINI_API_KEY=<your-key> \
npx tsx --test nimi-mods/audit/meeting-scribe/test/smoke/stt-transcribe.test.ts

# 使用自定义音频文件
MS_TEST_AUDIO_FILE=/path/to/meeting.wav \
NIMI_SDK_LIVE=1 \
NIMI_LIVE_GEMINI_API_KEY=<your-key> \
npx tsx --test nimi-mods/audit/meeting-scribe/test/smoke/stt-transcribe.test.ts
```

**验证项**:
- 转录结果非空
- 返回 job 元数据
- 控制台输出转录文本前 500 字符供人工检查

**Runtime API 调用**:
```typescript
runtime.media.stt.transcribe({
  model: 'gemini/gemini-2.0-flash',
  audio: { kind: 'bytes', bytes: audioBuffer },
  mimeType: 'audio/wav',
  diarization: true,       // 请求说话人分离
  route: 'cloud',
  fallback: 'deny',
});
```

### 3.2 分析摘要测试

**文件**: `test/smoke/analysis-generate.test.ts`

**目的**: 验证从转录文本生成结构化摘要（要点 + 决议 + 待办）。

**运行方式**:
```bash
# 使用内置样本转录
NIMI_SDK_LIVE=1 \
NIMI_LIVE_GEMINI_API_KEY=<your-key> \
npx tsx --test nimi-mods/audit/meeting-scribe/test/smoke/analysis-generate.test.ts

# 使用自定义转录文件
MS_TEST_TRANSCRIPT_FILE=/path/to/transcript.txt \
NIMI_SDK_LIVE=1 \
NIMI_LIVE_GEMINI_API_KEY=<your-key> \
npx tsx --test nimi-mods/audit/meeting-scribe/test/smoke/analysis-generate.test.ts
```

**验证项**:
- 输出包含有效 JSON
- JSON 结构符合预期 schema（keyPoints, decisions, actionItems）
- 至少提取 1 个要点
- 至少提取 1 个待办事项
- 使用内置样本时，验证能识别出负责人

**Runtime API 调用**:
```typescript
runtime.ai.text.generate({
  model: 'gemini/gemini-2.0-flash',
  system: SYSTEM_PROMPT,
  input: transcriptText,
  maxTokens: 2048,
  temperature: 0.3,
  route: 'cloud',
  fallback: 'deny',
});
```

## 4. 环境变量

| 变量 | 用途 | 必须 |
|------|------|------|
| `NIMI_SDK_LIVE` | 设为 `1` 启用 live 测试 | 是 |
| `NIMI_LIVE_GEMINI_API_KEY` | Gemini API key | 是 |
| `MS_TEST_AUDIO_FILE` | 自定义音频文件路径 | 否（默认用 fixture） |
| `MS_TEST_TRANSCRIPT_FILE` | 自定义转录文本文件路径 | 否（默认用内置样本） |

## 5. Fixture

| 文件 | 说明 |
|------|------|
| `test/fixtures/sample.wav` | 1-2 分钟的会议录音样本（需用户自行放置） |

fixture 不提交到 git（音频文件过大）。首次运行测试前需手动准备。

## 6. 未来测试计划

| 测试 | Phase | 说明 |
|------|-------|------|
| STT 端到端（Gemini） | Phase 1 ✓ | 当前实现 |
| 分析端到端（Gemini） | Phase 1 ✓ | 当前实现 |
| STT 本地 Whisper | Phase 2 | 需本地模型安装 |
| 分析本地模型 | Phase 2 | 需本地 chat 模型 |
| Pipeline 集成测试 | Phase 2 | STT → 分析 串联 |
| UI 组件测试 | Phase 2 | vitest + testing-library |
