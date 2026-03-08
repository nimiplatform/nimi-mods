# Routing Contract

> Owner Domain: `MS-ROUTE-*`
> Authoritative fact source: N/A (pure rule contract)

本合约定义 Meeting Scribe 的 AI 路由策略和 local-only 隐私模式。

---

## MS-ROUTE-001 — 双模路由策略

Meeting Scribe 支持两种路由模式，由用户在 UI 上通过 `localOnly` 开关切换：

| 模式 | localOnly | STT capability + binding.source | Chat capability + binding.source | 说话人分离 |
|------|-----------|---------------------------------|----------------------------------|-----------|
| Cloud (default) | `false` | `audio.transcribe` + `cloud` | `text.generate` + `cloud` | Gemini 原生支持 |
| Local-only | `true` | `audio.transcribe` + `local` | `text.generate` + `local` | 不可用（降级为 Unknown） |

- 路由模式在创建会议时确定，处理过程中不可切换。
- 路由切换通过 `runtime.route.resolve()` 选出 binding，并由 runtime facade 调用携带 binding；mod 不感知具体 provider。

## MS-ROUTE-002 — Local-only 隐私保证

当 `localOnly = true` 时：

- 全部 AI 请求强制走 `local` 路由，不发起任何 `cloud` 调用。
- 音频数据、转录文本、摘要结果全部留在本机，不传输到云端。
- UI 上显示明确的隐私模式标识（锁图标 + "Local Only" 标签）。
- 如果本地模型未安装或不可用，显示引导安装提示而非静默回退到云端。

## MS-ROUTE-003 — Local-only 降级规则

Local-only 模式下，部分功能降级：

| 功能 | Cloud 模式 | Local-only 模式 |
|------|-----------|----------------|
| STT 转录 | Gemini（高精度） | Whisper（精度取决于模型尺寸） |
| 说话人分离 | Gemini 原生 | 不可用，全部标记为 `"Unknown"` |
| 语言检测 | Gemini 自动检测 | Whisper 自动检测 |
| 文本分析 | 云端大模型 | 本地模型（质量可能降低） |
| 音频长度 | 无实际限制 | 受本地模型内存限制（建议 < 30 分钟） |

- 降级功能在 UI 上以提示信息标注（如"说话人分离仅在云端模式下可用"）。
- Local-only 模式不影响数据模型结构，仅影响 `TranscriptSegment.speaker` 的填充值。
