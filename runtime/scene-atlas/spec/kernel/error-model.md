# Scene-Atlas 错误模型

> Rule ID 前缀: `SA-ERR-*`
> 错误码事实源: [`tables/reason-codes.yaml`](tables/reason-codes.yaml)

---

## SA-ERR-001 — 错误码事实源

`tables/reason-codes.yaml` 是 Scene-Atlas 错误码的唯一事实源。

## SA-ERR-002 — 阻塞与非阻塞语义

**阻塞错误（`blocking: true`）**:
- 中止当前动作
- 用户必须修复前置条件后才能继续

**非阻塞错误（`blocking: false`）**:
- 当前动作失败，但不破坏 pack 工作上下文
- 用户可继续编辑、重试或移除当前项

**分类原则**:
- 导入失败、路由缺失、发布前结构不完整、style lock 冲突 -> 阻塞
- 单次场景生成失败 -> 非阻塞

## SA-ERR-003 — 可解析错误信封

所有错误响应必须暴露以下字段：

```typescript
interface SceneAtlasErrorEnvelope {
  reasonCode: string;
  actionHint: string;
  stage: string;
  blocking: boolean;
  traceId?: string;
  upstreamReasonCode?: string;
}
```

## SA-ERR-004 — readiness 与上游错误透传

**规则**:
- readiness 阶段的失败必须通过 `readinessIssues[]` 暴露，不得仅返回黑盒失败。
- 上游 route / generation 能力若返回 `reasonCode` 或 `traceId`，Scene-Atlas 必须透传诊断信息。
