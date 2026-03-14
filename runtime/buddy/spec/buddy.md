# Buddy 领域规格

> Status: Draft
> Date: 2026-03-09
> Scope: Buddy 业务增量。

## 0. 规范性导入

- 能力边界: `kernel/capability-contract.md` (`BD-CAP-*`)
- 对话与语音管线: `kernel/pipeline-contract.md` (`BD-PIPE-*`)
- 动画合约: `kernel/animation-contract.md` (`BD-ANIM-*`)
- 儿童安全: `kernel/safety-contract.md` (`BD-SAFE-*`)
- 错误语义: `kernel/error-model.md` (`BD-ERR-*`)
- 验收门控: `kernel/acceptance-contract.md` (`BD-ACC-*`)

## 1. 领域不变量

- `BD-DOM-001`: Buddy 是桌面端 Live2D 儿童互动陪伴 mod，不是云端聊天运行时。
- `BD-DOM-002`: 对话历史和用户偏好仅本地持久化（Buddy 专属宿主 sqlite）。
- `BD-DOM-003`: 路由覆盖仅作用于 Buddy mod，不得变更全局运行时默认值。
- `BD-DOM-004`: TTS 失败不阻塞文字对话，静默降级。
- `BD-DOM-005`: Live2D 渲染和口型同步在 mod 内部完成，不依赖外部服务。
- `BD-DOM-006`: 模型文件从 mod assets 加载，不通过网络下载。

## 2. 领域增量

- `BD-DOM-010`: Live2D 角色渲染在 `ui-extension.app.content.routes` 注册的 React 组件中，使用 Pixi.js Canvas。
- `BD-DOM-011`: 动画控制器采用插件架构，5 个内置插件按优先级执行（口型 > 表情 > 眨眼 > 眼球 > 呼吸）。
- `BD-DOM-012`: 情绪系统支持 6 种状态（happy/excited/sad/surprised/thinking/sleepy），其中 happy 为默认状态。
- `BD-DOM-013`: 瞬时情绪（excited 3s, surprised 2s）自动回退到 happy。
- `BD-DOM-014`: System prompt 包含不可覆盖的儿童安全指令层。
- `BD-DOM-015`: TTS 路由源跟随用户的 local/cloud 选择，与 LLM 路由独立。
- `BD-DOM-016`: 口型同步使用 wLipSync WASM 做 MFCC 音频分析，不依赖模型自带的 .wav 文件。
- `BD-DOM-017`: 模型目录在 `tables/model-catalog.yaml` 中声明，开发阶段使用 Live2D 官方示范模型。
- `BD-DOM-018`: 连续使用 30 分钟触发休息提醒，以角色对话方式呈现。
- `BD-DOM-019`: 对话历史保留最近 20 轮，超出后按 FIFO 淘汰。

## 3. 样例模型: 春（Haru）

开发阶段使用 Live2D 官方 Haru 完整版作为样例验证：

- 43 个参数（超出 Buddy 所需的 17 个，兼容性充足）
- 8 个预置表情文件（F01-F08），可用于验证表情切换
- 4 个物理模拟组（前发/侧发/后发/围巾）
- 27 个动作文件（1 idle + 26 action）
- 4 个语音文件（不使用，语音由 runtime TTS 生成）
- 许可: Live2D Free Material License，开发阶段可用，不可打包到发布产品中

Haru 接待版（haru_greeter_t05）作为无表情/无语音的回退验证模型。

## 4. 未来阶段（不在 P0 范围内）

- `BD-FUTURE-001`: knowledge-base inter-mod 集成（语料 embedding + RAG 检索）。
- `BD-FUTURE-002`: 自制儿童卡通 Live2D 模型（替代官方示范模型用于发布）。
- `BD-FUTURE-003`: 用户上传照片 → AI 生成 Live2D 模型（依赖 CartoonAlive 等工具成熟）。
- `BD-FUTURE-004`: 多语言 TTS 语音选择。
- `BD-FUTURE-005`: 触摸/点击角色触发特殊动作。

## 5. 禁止过度设计

- `BD-DOM-020`: 不直接调用外部 AI/TTS HTTP 端点。
- `BD-DOM-021`: 不使用 host wiring 导入。
- `BD-DOM-022`: 不绕过 UI 注册机制直接操作 DOM。
- `BD-DOM-023`: 不自行实现物理模拟（委托 Cubism SDK 内置引擎）。
- `BD-DOM-024`: 不实现模型编辑/绑定功能（模型为预制资产）。
