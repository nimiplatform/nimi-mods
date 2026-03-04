# Transcription

> Domain: Meeting Scribe / Transcription
> Covers: Step 1 (Upload) + Step 2 (STT Transcription)

## 0. Normative Imports

| Kernel Location | Rule IDs |
|---|---|
| `kernel/entity-contract.md` | MS-ENT-001, MS-ENT-002 |
| `kernel/pipeline-contract.md` | MS-PIPE-002, MS-PIPE-003, MS-PIPE-005 |
| `kernel/routing-contract.md` | MS-ROUTE-001, MS-ROUTE-002, MS-ROUTE-003 |
| `kernel/tables/meeting-states.yaml` | idle → uploading → transcribing → transcribed |
| `kernel/tables/error-codes.yaml` | MS_UPLOAD_*, MS_STT_* |

## 1. Scope

本文档描述从用户上传音频文件到生成带时间戳和说话人标签的转录片段的完整流程。

## 2. 音频上传 (Step 1)

### 2.1 输入方式

| 方式 | 实现 | 限制 |
|------|------|------|
| 文件选择 | `<input type="file" accept="audio/*">` | 单文件 100MB |
| 拖拽上传 | drag & drop zone | 同上 |

### 2.2 文件校验

上传后立即执行前端校验：

1. **格式检查**：MIME type 必须在 `[audio/wav, audio/mpeg, audio/mp4, audio/webm, audio/ogg]` 内。
   - 不匹配时抛出 `MS_UPLOAD_UNSUPPORTED_FORMAT`。
2. **大小检查**：文件大小 ≤ 100MB (104,857,600 bytes)。
   - 超限时抛出 `MS_UPLOAD_TOO_LARGE`。
3. **读取**：通过 FileReader API 读取为 base64 字符串（Phase 1）。
   - 读取失败时抛出 `MS_UPLOAD_FILE_READ_ERROR`。

### 2.3 上传后状态

- 记录 `audioFileName`、`audioMimeType`、`audioSizeBytes`。
- 状态 `idle` → `uploading` → 校验通过后自动进入 `transcribing`。
- 校验失败时状态 → `error`。

## 3. STT 转录 (Step 2)

### 3.1 调用方式

```typescript
const result = await aiClient.transcribeAudio({
  audioBase64: meeting.audioBase64,
  mimeType: meeting.audioMimeType,
  routeHint: meeting.localOnly ? 'stt/local' : 'stt/default',
});
```

### 3.2 结果映射

STT 返回的原始结果需要映射为 `TranscriptSegment[]`：

```typescript
const segments: TranscriptSegment[] = rawResult.segments.map(
  (seg, index) => ({
    id: ulid(),
    index,
    startMs: seg.startTime,
    endMs: seg.endTime,
    speaker: seg.speaker ?? 'Unknown',
    text: seg.text,
    confidence: seg.confidence,
  })
);
```

### 3.3 说话人分离行为

| 路由模式 | STT Provider | 说话人标签 | 行为 |
|---------|-------------|-----------|------|
| Cloud | Gemini | `"Speaker 1"`, `"Speaker 2"`, ... | 自动标注，用户可编辑映射为真实姓名 |
| Local-only | Whisper | `"Unknown"` | 全部标记为 Unknown，用户可手动标注 |

说话人标签编辑：

- UI 提供说话人映射表：`Speaker 1 → 张三`, `Speaker 2 → 李四`。
- 修改映射后，所有关联 segment 的 `speaker` 字段同步更新。
- 映射关系存储在 `Meeting` 对象中（`speakerMap: Record<string, string>`）。

### 3.4 进度事件

转录过程中通过 hook event 推送进度：

```typescript
hook.event.publish('ms:transcription:progress', {
  meetingId: meeting.id,
  status: 'processing', // 'processing' | 'complete' | 'error'
  progress: 0.6, // 0.0 ~ 1.0（若 provider 支持进度报告）
});
```

### 3.5 转录完成

- 填充 `Meeting.transcript`、`Meeting.language`、`Meeting.audioDurationMs`。
- 状态 `transcribing` → `transcribed`。
- 自动触发 Step 3 (分析)。

### 3.6 错误处理

- `MS_STT_PROVIDER_UNAVAILABLE`: 检查路由配置，提示用户切换模式。
- `MS_STT_TIMEOUT`: 提供重试按钮。
- `MS_STT_EMPTY_RESULT`: 提示音频可能不含语音。
- `MS_STT_LOCAL_MODEL_NOT_INSTALLED`: 引导用户安装 Whisper 模型或切换到 Cloud 模式。

## 4. Pipeline Stage 抽象（为 Phase 2 DAG 迁移留接口）

Pipeline 步骤以 `PipelineStage` 接口抽象，便于未来迁移到 Runtime Workflow DAG：

```typescript
interface PipelineStage<TIn, TOut> {
  id: string;
  execute(input: TIn, ctx: PipelineContext): Promise<TOut>;
}

interface PipelineContext {
  aiClient: ModAiClient;
  localOnly: boolean;
  onProgress?: (progress: number) => void;
}

// Phase 1: Mod 内编排
const transcribeStage: PipelineStage<AudioInput, TranscriptSegment[]> = {
  id: 'transcribe',
  async execute(input, ctx) {
    return ctx.aiClient.transcribeAudio({
      audioBase64: input.audioBase64,
      mimeType: input.mimeType,
      routeHint: ctx.localOnly ? 'stt/local' : 'stt/default',
    });
  },
};

// Phase 2: 替换为 Runtime Workflow 调用
// const transcribeStage = workflowClient.createStage('AI_STT', { ... });
```
