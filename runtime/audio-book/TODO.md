# Audio Book Mod — TODO

## TTS 路由与 Model 选择改进

当前 TTS 流程为了快速跑通，存在大量硬编码和 DashScope 专用逻辑，需要通用化改进。

### 问题清单

#### 1. Model 选择依赖硬编码偏好列表

- **文件**: `src/controllers/use-tts-route.ts` — `pickTtsModelForConnector()`
- **现状**: 通过字符串匹配 vendor 名（`dashscope`/`alibaba`/`qwen`/`openai`）来猜测应该用哪个 model，维护了硬编码优先级列表
- **改进方向**: 应从 runtime 返回的 connector.models 列表中，结合 model 的 capability 标签来选择，而非猜测

#### 2. Vendor 检测用字符串拼接匹配

- **文件**: `src/controllers/use-tts-route.ts` — `inferProviderDefaultTtsModel()`、`pickTtsModelForConnector()`
- **现状**: 把 `connector.id + label + vendor` 拼在一起做子串匹配，换个 connector 名就可能匹配失败
- **改进方向**: 使用 runtime 提供的结构化 vendor/provider 类型字段

#### 3. Chat 和 TTS 共用同一个 connector 列表

- **文件**: `src/controllers/use-tts-route.ts` — `loadRouteOptions()`
- **现状**: `chatConnectors` 和 `ttsConnectors` 设的是同一个数组，没区分 connector 支持的 capability
- **改进方向**: 分别查询 `capability: 'chat'` 和 `capability: 'tts'` 的 route options

#### 4. Qwen Voice Catalog 硬编码兜底

- **文件**: `src/services/qwen-voice-catalog.ts`（21 个 DashScope 声音）
- **触发条件**: `listVoices()` 返回空 + model 是 Qwen 系 TTS
- **额外问题**: 这个 fallback 在 `tts-adapter.ts` 和 `voice-recommender.ts` 两处重复实现
- **改进方向**: runtime 应能返回完整 voice 列表；如需 fallback 应统一收口到一处

#### 5. 默认声音 ID 是 DashScope 专属

- **文件**: `src/services/voice-recommender.ts` — `DEFAULT_VOICE_MAP`
- **现状**: `Ethan`/`Cherry`/`Neil` 是 DashScope CosyVoice ID，其他 provider 不认
- **改进方向**: 默认声音应从当前 provider 的 voice 列表中动态选取

#### 6. 合成文本分块限制对所有 provider 生效

- **文件**: `src/services/synthesis-scheduler.ts` — `MAX_TTS_TEXT_CHARS = 300`
- **现状**: 这是 DashScope CosyVoice 的 ~500 字符限制的保守值，但所有 provider 都被约束
- **改进方向**: 按 provider/model 动态设置分块限制（OpenAI 支持更长文本）

#### 7. 分析步骤 LLM 绑死 Qwen

- **文件**: `src/manifest.ts` — AI dependencies
- **现状**: `qwen2.5-7b-instruct` 作为必需 chat model 依赖
- **改进方向**: 应支持任意 chat-capable model，manifest 中声明 capability 而非具体 model

#### 8. 试听文本硬编码

- **文件**: `src/controllers/audio-book-page-controller.ts` — `previewVoice()`
- **现状**: 写死 `'这是一段试听示例文本。This is a preview sample.'`
- **改进方向**: 可从当前角色的实际台词中取一段作为试听文本
