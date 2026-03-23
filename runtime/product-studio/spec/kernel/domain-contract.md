# Product Studio 领域契约

> Rule ID 前缀: `PS-DOM-*`
> 字段事实源: [`tables/entities.yaml`](tables/entities.yaml)
> 生图模式事实源: [`tables/generation-modes.yaml`](tables/generation-modes.yaml)

---

## PS-DOM-001 — Project（产品项目）

电商产品的工作空间。每个产品（如"水过滤器"）对应一个 Project。

**字段**: 见 `entities.yaml` → `entity: Project`

**不变量**:
- 一个 Project 可有多张 ReferenceImage（PS-DOM-002），但只能有一张 `isDefault: true` 的参考图。
- Project 归档（`status: archived`）后，不可发起新的 BatchJob（PS-DOM-006）。

---

## PS-DOM-002 — ReferenceImage（参考产品图）

用户自己产品的参考照片。一个 Project 可有多张参考图（不同角度/变体）。

**字段**: 见 `entities.yaml` → `entity: ReferenceImage`

**不变量**:
- 同一 Project 内，`ReferenceImage` 可为空；一旦存在默认图，则同一时刻最多一张 `isDefault: true`。
- 上传新参考图时，若设为默认，则旧的默认图自动取消默认标记。
- `fileUrl` 必须为本地文件路径，不支持远程 URL。

---

## PS-DOM-003 — SellingPoint（卖点文案）

产品和店铺的营销卖点。分为 `product`（产品特性）和 `store`（店铺服务）两类。

**字段**: 见 `entities.yaml` → `entity: SellingPoint`

**不变量**:
- 卖点为项目级别，属于 Project，不属于单个 PromptConfig。
- 卖点在 PromptConfig 中仅作为"参考素材"，由 AI 自行决定如何融入 prompt。
- `isActive: false` 的卖点在 AI 优化 prompt 时不被引用。
- `sortOrder` 值决定展示顺序和 AI 优化 prompt 时的优先级参考顺序。

---

## PS-DOM-004 — SceneImage（场景素材图）

竞品或模板场景图。用户希望将自己的产品替换进这些场景。

**字段**: 见 `entities.yaml` → `entity: SceneImage`

**约束**:
- **仅 `multimodal` 模式使用**（见 PS-DOM-005 `generationMode`）。`text-to-image` 模式不需要 SceneImage。
- `status` 状态机: `pending` → `used`（成功生成后自动更新）/ `skipped`（用户手动跳过）。
- 批量任务（PS-DOM-006）通过 `sceneImageIds` 关联场景图列表。

---

## PS-DOM-005 — PromptConfig（Prompt 配置）

一次 prompt 构建的完整配置。包含用户的自然语言意图、附带的参考图片和 AI 优化后的最终 prompt。

**字段**: 见 `entities.yaml` → `entity: PromptConfig`
**生图模式枚举**: 见 `tables/generation-modes.yaml`

**核心设计理念**:
用户直接用自然语言描述意图，附上图片和卖点作为参考素材，AI 直接优化成生图 prompt。不需要复杂的模式选择，流程尽可能简单。

**多图输入机制**:
- 用户可粘贴/拖入/选择多张图片，系统自动编号为"图1"、"图2"...
- 用户在自然语言描述中引用图片编号（如"参考图1的产品，替换到图2的场景中"）
- 图片来源不限：可以是项目的 ReferenceImage（PS-DOM-002）、SceneImage（PS-DOM-004），也可以是临时上传的图片
- `attachedImages` 按顺序对应图1、图2...；每项为 `PromptInputImageRef`
- `PromptInputImageRef` 最少包含 `sourceType`（`reference | scene | ephemeral`）、`sourceId?`、`fileUrl`
- 保存 PromptConfig 时，`attachedImages` 可为空；图片绑定属于模板可选信息，不是保存模板的硬前置
- AI 优化 prompt 时会分析所有附带图片的视觉特征

**`generationMode` 决定生图调用方式**:
- `multimodal`: 将 `attachedImages` 对应的图片 + `refinedPrompt` 一起发给多模态模型
- `text-to-image`: 仅发送 `refinedPrompt` 给文生图模型；`attachedImages` 仅用于 AI 优化 prompt 阶段的视觉分析，不参与最终生图调用

**AI Prompt 优化设计**:
```
角色: 电商产品图 prompt 工程师
输入:
  - 用户自然语言意图（含图片引用如"图1"、"图2"）
  - 附带图片的视觉分析（AI 自动分析每张图的内容、风格、构图）
  - 用户勾选的卖点（如有）
  - 生图模式（multimodal / text-to-image）
输出: 优化后的 prompt（直接可喂给对应生图模型）
```

**不变量**:
- `attachedImages` 必须为稳定顺序数组；允许为空数组。即使存在临时粘贴图片，也必须在保存 PromptConfig 前持久化并记录 `fileUrl`。
- `refinedPrompt` 为最终生图文本；跳过 AI 优化时，由用户手写后保存。
- `userIntent` 为必填，是 AI 优化的核心输入。
- 同一 PromptConfig 可被多个 BatchJob（PS-DOM-006）复用。
- 一次实际生成调用使用的图片集合以执行时解析出的输入为准，可与 `PromptConfig.attachedImages` 不同；历史结果以 `GeneratedImage.inputImageSnapshot` 为准。

---

## PS-DOM-006 — BatchJob（批量任务）

一次批量生图任务。关联一个 PromptConfig（PS-DOM-005），批量执行。

**字段**: 见 `entities.yaml` → `entity: BatchJob`
**状态机**: 见 `tables/batch-states.yaml`

**两种批量模式**:
- **multimodal 替换模式**: 对 `sceneImageIds` 列表中的每张场景图逐一生成（`sceneImageIds` 必填）
- **text-to-image 变体模式**: 使用同一 prompt 生成 `batchSize` 张变体（`batchSize` 必填）

**不变量**:
- `completedCount + failedCount ≤ totalCount`
- 单个子任务失败不改变 BatchJob 整体为 `CANCELLED`；全部完成后，有失败项则变为 `PARTIAL_COMPLETED`。
- `concurrency` 默认值为 5，取值范围 1-10。
- multimodal 模式下，`sceneImageIds` 不可为空。
- “跳过已生成” 的判定以 `GeneratedImage.sourceSceneImageId + status=success` 为准，不依赖场景图展示顺序。

---

## PS-DOM-007 — GeneratedImage（生成图片）

单张生成的结果图片。

**字段**: 见 `entities.yaml` → `entity: GeneratedImage`

**追溯链**:
`GeneratedImage.promptConfigId → PromptConfig` 提供配置级上下文；
`GeneratedImage.inputImageSnapshot + actualPrompt` 提供本次调用的稳定快照。

通过上述追溯链，每张生成图都可回溯到：
- 使用的 prompt（`actualPrompt`，因为用户可能在生成前微调过）
- 输入图片（`inputImageSnapshot`；不受后续 PromptConfig 编辑影响）
- 应用的卖点（`appliedSellingPoints`）

**不变量**:
- 单张预览生成时（非批量），`batchJobId` 为空。
- `actualPrompt` 记录实际发送给模型的 prompt，可能与 `PromptConfig.refinedPrompt` 不同（用户微调）。
- multimodal 结果若对应具体场景图，则必须填写 `sourceSceneImageId`。
- `inputImageSnapshot` 必须完整记录实际发送给本次生成调用的图片集合；无图输入时为空数组。
- `status: discarded` 仅标记，不删除本地文件（物理删除由用户手动操作或垃圾清理流程处理）。
- `rating` 为 1-5 整数，未评分时为空。
