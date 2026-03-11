# 错误模型

> Owner Domain: `BD-ERR-*`

## BD-ERR-001 Reason Code 真相源

Reason code 注册表的权威来源是 `tables/reason-codes.yaml`。

## BD-ERR-002 阻断型 vs 非阻断型错误

阻断型错误停止当前管线推进；非阻断型错误记录为诊断信息，不影响主流程：

- 模型加载失败 → 阻断（无法渲染角色）
- LLM 生成失败 → 阻断（无法产生回复）
- TTS 失败 → 非阻断（降级为纯文字显示）
- STT 失败 → 阻断语音输入（提示用户切换到文字输入）
- 口型同步失败 → 非阻断（嘴型参数归零，角色仍可显示）
- 路由不可用 → 阻断（无法调用 AI 服务）

## BD-ERR-003 可解析错误信封

错误必须暴露可解析的 `reasonCode + actionHint` 和稳定的阶段标签，供 UI 和诊断消费。
