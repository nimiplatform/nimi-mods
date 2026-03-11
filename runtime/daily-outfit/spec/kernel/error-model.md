# Daily Outfit 错误模型

> 所有者领域: `DO-ERR-*`

## DO-ERR-001 错误码事实源

`tables/reason-codes.yaml` 中的错误码注册表为唯一事实源。

## DO-ERR-002 阻塞与非阻塞错误

- **阻塞错误**: 中止当前流水线，用户必须处理后才能继续。
  - 衣橱为空、场景无法解析、画像不完整等。
- **非阻塞错误**: 记录为诊断信息，流水线可降级继续。
  - TTS 失败（如有语音播报）、虚拟试穿生成失败（降级到拼图预览）、去背景失败（保留原图）等。

## DO-ERR-003 可解析错误信封

错误必须暴露可解析的 `reasonCode + actionHint` 和稳定的 stage 标签。

- `reasonCode`: 稳定的错误码字符串，由 `tables/reason-codes.yaml` 定义。
- `actionHint`: 面向用户的恢复建议文本。
- `stage`: 错误发生的流水线阶段标签。

## DO-ERR-004 上游错误透传

当 AI 能力调用返回错误时，mod 必须保留上游的 `reasonCode` 和 `traceId`，不得用兜底文案掩盖。
