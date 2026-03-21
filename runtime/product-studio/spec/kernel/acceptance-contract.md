# Product Studio 验收契约

> Rule ID 前缀: `PS-ACC-*`
> 验收用例事实源: [`tables/acceptance-cases.yaml`](tables/acceptance-cases.yaml)

---

## PS-ACC-001 — Prompt 工坊验收门

**覆盖用例**: PS-001 ~ PS-003、PS-007

| 用例 ID | 验收条件 |
|---------|---------|
| PS-001 | multimodal 模式 + 无附带图片 → 阻塞，返回 `PS_NO_IMAGES_FOR_MULTIMODAL` |
| PS-002 | text-to-image 模式 + 无附带图片 → 正常进入生图流程 |
| PS-003 | AI 优化失败 → 非阻塞，返回 `PS_PROMPT_REFINE_FAILED`，用户可手动编辑 |
| PS-007 | PromptConfig 无卖点 → 正常执行，不阻塞 |

**验证要点**:
- multimodal 和 text-to-image 的前置检查逻辑必须通过模式分支独立验证。
- AI 优化失败路径下，prompt 输出区仍可编辑。

---

## PS-ACC-002 — 前置阻塞错误验收门

**覆盖用例**: PS-003、PS-008、PS-009、PS-015

| 用例 ID | 验收条件 |
|---------|---------|
| PS-003 | AI 优化失败 → 非阻塞，prompt 编辑区保持可用 |
| PS-008 | 场景图文件不存在 → 阻塞，返回 `PS_SCENE_IMAGE_LOAD_FAILED` |
| PS-009 | 无可用图像生成服务 → 阻塞，返回 `PS_ROUTE_NO_IMAGE_PROVIDER` |
| PS-015 | 本地存储写入失败 → 阻塞，返回 `PS_STORAGE_WRITE_FAILED` |

**验证要点**:
- 所有阻塞错误必须在进入生图调用前触发，不允许生图调用后才检测前置条件。
- `PS_ROUTE_NO_IMAGE_PROVIDER` 必须在 gen-execute 步骤发生，不在 gen-confirm-params 步骤。

---

## PS-ACC-003 — 批量任务生命周期验收门

**覆盖用例**: PS-004 ~ PS-006、PS-011

| 用例 ID | 验收条件 |
|---------|---------|
| PS-004 | 单个子任务失败 → 不阻塞其他子任务，BatchJob 不变为 CANCELLED |
| PS-005 | 全部子任务失败 → PARTIAL_COMPLETED + 阻塞 `PS_BATCH_ALL_FAILED` |
| PS-006 | PAUSED → RUNNING 恢复 → 已完成项不重复执行（multimodal 模式） |
| PS-011 | text-to-image 模式 → 生成数量等于 `BatchJob.batchSize` |

**验证要点**:
- 状态机转换必须严格遵循 `batch-states.yaml` 中定义的合法转换路径。
- `completedCount + failedCount = totalCount` 在任务终态时成立。

---

## PS-ACC-004 — 数据可追溯性验收门

**覆盖用例**: PS-010、PS-012

| 用例 ID | 验收条件 |
|---------|---------|
| PS-010 | 每张 GeneratedImage 可通过 promptConfigId 追溯到使用的 prompt 和附带图片 |
| PS-012 | 卖点 JSON 导入 → 可视化编辑正确展示 → 再导出 JSON 与原始内容等价（roundtrip） |

**验证要点**:
- `GeneratedImage.actualPrompt` 必须是实际发送给模型的 prompt（允许与 `PromptConfig.refinedPrompt` 不同）。
- 卖点 JSON 格式为 `{ "product": string[], "store": string[] }`，roundtrip 必须保持字段顺序和值不变。

---

## PS-ACC-005 — 错误信封可解析验收门

**覆盖用例**: PS-013、PS-014

| 用例 ID | 验收条件 |
|---------|---------|
| PS-013 | 所有错误响应包含 `reasonCode`、`actionHint`、`stage` 字段 |
| PS-014 | AI 能力调用失败时，错误响应保留上游 `reasonCode` 和 `traceId` |

**验证要点**:
- `reasonCode` 值必须来自 `reason-codes.yaml` 中的注册值。
- `actionHint` 内容必须与 `reason-codes.yaml` 的 `user_hint` 对应值一致。
- 上游 `traceId` 为空时，`traceId` 字段可省略，不可填 `null` 字符串。
