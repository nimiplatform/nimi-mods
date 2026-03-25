# Agent-Capture 错误模型

> Rule ID 前缀: `AC-ERR-*`
> 原因码事实源: [`tables/reason-codes.yaml`](tables/reason-codes.yaml)

---

## AC-ERR-001 — 原因码事实源

`tables/reason-codes.yaml` 是 Agent-Capture reason code 的唯一事实源。

## AC-ERR-002 — 阻断式失败

以下失败必须阻断当前动作，不得伪装为成功：

- 缺少有效输入仍试图生成
- route 不可用或 route override 非法
- 图像生成失败
- 文本生成失败
- Forge handoff 不可用或 handoff 执行失败

## AC-ERR-003 — 非阻断式保留

以下场景不得破坏当前已保存 draft：

- 显式 handoff 失败
- 用户放弃继续 refine
- 退出前仍保留非空 draft

## AC-ERR-004 — 清理语义

空 draft 清理是工作态治理行为，不属于用户可见“成功发布”语义。
