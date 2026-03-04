# STT Runtime Adapter Gap Analysis

> Date: 2026-03-03
> Status: Open — blocking STT smoke test

## Problem

Meeting Scribe spec 假设 STT 走 `runtime.media.stt.transcribe()` + Gemini token-api，但实际调查发现 **runtime 的 STT 适配器与所有可直接使用的 cloud provider API 格式不匹配**。

## Runtime STT 适配器现状

Runtime 有三条 STT 路径：

| 适配器 | 触发条件 | 请求格式 | 端点 |
|--------|---------|---------|------|
| `adapterGeminiOperation` | `gemini/` 前缀 | JSON POST + base64 audio | `{baseURL}/operations`（submit + poll） |
| `adapterAlibabaNative` | `dashscope/` 前缀 | multipart-form POST（`ExecuteGLMTranscribe`） | `{baseURL}/api/v1/services/audio/asr/transcription` |
| `adapterOpenAICompat` | fallback | multipart-form POST（Whisper 格式） | `{baseURL}/v1/audio/transcriptions` |

## Cloud Provider 兼容性

### Gemini (`adapterGeminiOperation`)

- 适配器 POST 到 `{baseURL}/operations`
- 测试用 base URL: `https://generativelanguage.googleapis.com/v1beta/openai`
- **实际 URL**: `https://generativelanguage.googleapis.com/v1beta/openai/operations` — Google API 上不存在此端点
- `/operations` 是 NimiLLM 代理 / 本地推理服务器的自定义协议，不是 Google 原生 API
- **结论：不可用**

### DashScope paraformer-v2 (`adapterAlibabaNative`)

- 适配器发 multipart-form 同步请求
- DashScope paraformer-v2 要求：JSON body + `file_urls` + `X-DashScope-Async: enable` 异步模式
- 请求格式完全不同（multipart-form vs JSON，同步 vs 异步，bytes vs URL）
- **结论：不可用**

### DashScope qwen3-asr-flash

- 走 chat completions 格式（`/compatible-mode/v1/chat/completions` + `input_audio` content type）
- 不是传统 STT 端点，是 multimodal chat 模型
- Runtime 的 `media.stt.transcribe()` 无法路由到 chat completions 路径
- **结论：不可用**（需要走 `ai.text.generate` / `ai.chat.complete` 路径，且 SDK 需支持 audio content part）

### OpenRouter

- 不支持 `/v1/audio/transcriptions` Whisper 端点
- 音频功能仅走 chat completions `input_audio`
- **结论：不可用**

### OpenAI / Groq Whisper (`adapterOpenAICompat`)

- 标准 `/v1/audio/transcriptions` multipart-form 端点
- 适配器格式完全匹配
- **但 runtime 未注册 `openai` 或 `groq` 为 cloud provider**（零引用）
- **结论：适配器兼容，但缺少 provider 注册**

## 可行的解决路径

### 路径 A：注册 OpenAI/Groq 为 cloud provider（最小改动）

在 `runtime/internal/config/config.go` 和 `runtime/internal/nimillm/cloud_provider.go` 中注册 `openai` 和/或 `groq` provider，配上 env var binding。STT 请求用 `openai/whisper-1` 或 `groq/whisper-large-v3` 走 `adapterOpenAICompat`。

- 改动范围：runtime config + cloud_provider 注册
- 风险：低，仅添加新 provider
- 说话人分离：不支持（Whisper 无 diarization）

### 路径 B：适配 DashScope paraformer-v2 异步 API

修改 `adapterAlibabaNative` 的 STT 路径，支持 paraformer-v2 的 JSON + async + file_urls 格式。

- 改动范围：`runtime/internal/nimillm/adapter_dashscope.go` STT 分支
- 风险：中，需要改变现有适配器逻辑或新增子路径
- 说话人分离：支持（`diarization_enabled: true`）

### 路径 C：支持 qwen3-asr-flash 通过 chat completions

在 SDK `ai.text.generate()` 或 `ai.chat.complete()` 中支持 multimodal audio input（`input_audio` content part），让 qwen3-asr-flash 走 chat 路径做 STT。

- 改动范围：SDK types + runtime chat handler（如果不支持 audio content part）
- 风险：中高，涉及 SDK 接口变更
- 说话人分离：不支持（qwen3-asr-flash 文档未提及）

### 路径 D：修复 Gemini Operation 适配器 URL

将 `adapterGeminiOperation` 对接到 Gemini 原生 API（如 `models/{model}:generateContent` with inline audio），而非 `/operations` 自定义端点。

- 改动范围：`runtime/internal/nimillm/adapter_gemini.go`
- 风险：高，需要重写 Gemini STT 逻辑
- 说话人分离：Gemini 原生支持

## 建议优先级

1. **短期**：路径 B（paraformer-v2）— DashScope 已在 runtime 注册，改动局限在 adapter STT 分支，且支持说话人分离
2. **中期**：路径 A（Whisper fallback）— 作为通用后备方案
3. **长期**：路径 C / D — 完善 multimodal 和 Gemini 原生支持

## 对 Meeting Scribe Spec 的影响

| Spec 文档 | 需要更新的内容 |
|-----------|--------------|
| `INDEX.md` | Design Decisions 表中 STT 方案从 "Gemini token-api" 改为 "待定，受 runtime adapter 限制" |
| `transcription.md` | § 3.1 调用方式需根据最终选定的 provider 更新 |
| `testing.md` | § 3.1 STT 测试的 env vars 和 model ID 需更新 |
| `routing-contract.md` | MS-ROUTE-001 cloud 路由的具体 provider 需更新 |
