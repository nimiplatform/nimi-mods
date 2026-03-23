# Product Studio 错误模型

> Rule ID 前缀: `PS-ERR-*`
> 错误码注册表事实源: [`tables/reason-codes.yaml`](tables/reason-codes.yaml)

---

## PS-ERR-001 — 错误码事实源

`tables/reason-codes.yaml` 中的错误码注册表为唯一事实源。

**不变量**:
- 所有运行时错误必须使用 `reason-codes.yaml` 中注册的错误码。
- 新增错误码时，必须同时更新 `reason-codes.yaml` 并在本文档的错误码清单中添加描述。
- 禁止在代码中硬编码字符串错误码，必须使用注册的枚举值。

**完整错误码清单**（详细字段见 `reason-codes.yaml`）:

| 错误码 | 阶段 | 阻塞 | 用户提示 |
|--------|------|:----:|---------|
| `PS_SCENE_IMAGE_LOAD_FAILED` | gen-confirm-params | Y | 输入图片加载失败，请检查文件是否存在 |
| `PS_PROMPT_REFINE_FAILED` | prompt-ai-refine | N | AI 优化 prompt 失败，可手动编辑 prompt |
| `PS_IMAGE_GENERATE_FAILED` | gen-execute | N | 图片生成失败，请稍后重试或更换模型 |
| `PS_IMAGE_GENERATE_TIMEOUT` | gen-execute | N | 图片生成超时，可尝试使用更快的模型 |
| `PS_BATCH_ALL_FAILED` | batch-summary | Y | 批量任务全部失败，请检查模型连接和 prompt |
| `PS_SELLING_POINTS_EMPTY` | prompt-compose | N | 未配置卖点，本次优化将不融入卖点文案 |
| `PS_STORAGE_WRITE_FAILED` | * | Y | 本地存储写入失败，请检查磁盘空间 |
| `PS_ROUTE_NO_IMAGE_PROVIDER` | gen-execute | Y | 未找到可用的图像生成服务，请在设置中配置 |
| `PS_NO_IMAGES_FOR_MULTIMODAL` | gen-confirm-params | Y | 多模态模式需要至少附带一张图片 |

---

## PS-ERR-002 — 阻塞与非阻塞错误

**阻塞错误（`blocking: true`）**:
- 中止当前流水线步骤
- 用户必须处理（修复配置、上传素材、检查存储等）后才能继续
- UI 展示: 醒目的错误状态 + 明确的操作指引（`actionHint`）

**非阻塞错误（`blocking: false`）**:
- 记录为诊断信息（系统日志 + 可选的用户提示）
- 流水线可降级继续（如 AI 优化失败时允许用户手动编辑 prompt）
- UI 展示: 轻量级警告提示，不阻断主流程

**分类原则**:
- 外部依赖失败（AI 模型调用失败）→ 非阻塞（允许降级或重试）
- 前置条件缺失（素材未上传、路由未配置）→ 阻塞
- 全局资源问题（磁盘空间不足）→ 阻塞
- 单个子任务失败（批量中的一张图片生成失败）→ 非阻塞

---

## PS-ERR-003 — 可解析错误信封

所有错误响应必须暴露以下字段（见验收用例 PS-013）:

```typescript
interface PsErrorEnvelope {
  reasonCode: string;     // 来自 reason-codes.yaml 的注册错误码
  actionHint: string;     // 用户操作提示（对应 reason-codes.yaml 的 user_hint）
  stage: string;          // 错误发生的流水线步骤（对应 reason-codes.yaml 的 stage）
  blocking: boolean;      // 是否阻塞当前流水线
  traceId?: string;       // 来自上游的 trace ID（若有）
  upstreamReasonCode?: string; // 上游错误码（若有，见 PS-ERR-004）
}
```

**实现规则**:
- `reasonCode` 必须来自 `reason-codes.yaml` 中的注册值，不允许自由字符串。
- `actionHint` 直接使用 `reason-codes.yaml` 中对应的 `user_hint` 值。
- `stage` 对应错误发生的流水线步骤名称（如 `gen-execute`、`batch-summary`）。

---

## PS-ERR-004 — 上游错误透传

AI 能力调用返回错误时，必须保留上游错误信息。

**规则**:
- 上游返回 `reasonCode` 时，将其记录在错误信封的 `upstreamReasonCode` 字段。
- 上游返回 `traceId` 时，将其记录在错误信封的 `traceId` 字段（见验收用例 PS-014）。
- 不允许将上游错误转换为通用错误而丢失诊断信息。
- `PS_IMAGE_GENERATE_FAILED`、`PS_IMAGE_GENERATE_TIMEOUT`、`PS_PROMPT_REFINE_FAILED` 的错误信封必须包含上游 `traceId`（若上游提供）。
