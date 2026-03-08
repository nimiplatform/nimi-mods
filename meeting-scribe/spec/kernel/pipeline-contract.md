# Pipeline Contract

> Owner Domain: `MS-PIPE-*`
> Authoritative fact source: `tables/meeting-states.yaml`

本合约定义 Meeting Scribe 的三步流水线及其状态转换规则。

---

## MS-PIPE-001 — 三步流水线

Meeting Scribe 的用户流程为严格有序的三个阶段：

| Step | 阶段 | 入口条件 | 产出 |
|------|------|---------|------|
| 1 | 上传音频 (Upload) | 无 | audioFile 引用 + 元信息 |
| 2 | STT 转录 (Transcribe) | 音频文件已上传 | TranscriptSegment[] |
| 3 | 结构化分析 (Analyze) | TranscriptSegment[] 非空 | MeetingSummary (含 ActionItem[]) |

Step 2 在 Step 1 完成后自动触发（无需用户手动点击）。
Step 3 在 Step 2 完成后自动触发。
整个 pipeline 对用户呈现为"上传 → 等待 → 查看结果"的单步体验。

## MS-PIPE-002 — 音频上传规则

- 支持的输入方式：
  - 文件上传（`<input type="file">` + 拖拽，浏览器 File API）
- 支持的音频格式：
  - `audio/wav` (.wav)
  - `audio/mpeg` (.mp3)
  - `audio/mp4` (.m4a)
  - `audio/webm` (.webm)
  - `audio/ogg` (.ogg)
- 文件大小限制：单文件 100MB（`MS_UPLOAD_TOO_LARGE`）。
- 上传后记录 `audioFileName`、`audioMimeType`、文件大小。
- 音频数据在 Phase 1 以 base64 或 Blob URL 保存在内存。

## MS-PIPE-003 — STT 转录规则

- 转录调用 `aiClient.transcribeAudio()`，传入音频数据和 MIME type。
- Runtime capability / binding 由 `localOnly` 开关决定：
  - `localOnly = false`: `audio.transcribe` + `binding.source = cloud`（走 Gemini cloud）。
  - `localOnly = true`: `audio.transcribe` + `binding.source = local`（走本地 Whisper）。
- 转录结果包含：
  - 有序的文本片段（含时间戳）。
  - 说话人标签（Gemini 模式下可用；local 模式下为 `"Unknown"`）。
  - 检测到的语言代码。
- 转录进度通过 `hook.event.publish('ms:transcription:progress', ...)` 推送。
- 转录失败时记录错误码（见 `tables/error-codes.yaml`），状态转为 `error`。

## MS-PIPE-004 — 结构化分析规则

- 分析调用 `aiClient.generateObject()`，传入完整转录文本。
- 一次调用同时生成摘要、决议、待办事项（单一 Zod schema 约束输出）。
- Runtime capability / binding 由 `localOnly` 开关决定：
  - `localOnly = false`: `text.generate` + `binding.source = cloud`。
  - `localOnly = true`: `text.generate` + `binding.source = local`。
- 分析进度通过 `hook.event.publish('ms:analysis:progress', ...)` 推送。
- 分析语言自动跟随 STT 检测到的语言（不硬编码语言）。

## MS-PIPE-005 — 错误处理与重试

- STT 转录失败：
  - 瞬态错误（网络超时、provider 暂不可用）：允许用户手动重试，从 `error` 回到 `uploading` 重新执行。
  - 永久错误（不支持的格式、文件损坏）：显示错误信息，用户需重新上传。
- 分析失败：
  - 瞬态错误：允许用户手动重试，从 `error` 回到 `transcribed` 重新执行分析。
  - 永久错误（转录文本为空、超出 context window）：显示错误信息。
- 不实现自动重试（Phase 1）。用户通过 UI 按钮手动触发重试。
