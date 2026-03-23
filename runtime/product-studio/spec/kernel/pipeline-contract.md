# Product Studio 流水线契约

> Rule ID 前缀: `PS-PIPE-*`
> 步骤事实源: [`tables/pipeline-states.yaml`](tables/pipeline-states.yaml)
> 批量状态机事实源: [`tables/batch-states.yaml`](tables/batch-states.yaml)
> 生图模式事实源: [`tables/generation-modes.yaml`](tables/generation-modes.yaml)

---

## PS-PIPE-001 — 项目设置流水线

创建产品项目并导入素材。

**步骤**: 见 `pipeline-states.yaml` → `pipeline: setup`

**规则**:
- 步骤 2-4（上传参考图、导入场景图、配置卖点）可任意顺序完成，不强制线性。
- 项目创建（步骤 1）完成后即可进入工作台，无需等待素材导入完成。
- 参考图为推荐素材而非项目创建硬前置；未上传时允许继续配置项目，并在需要图片输入的生成步骤再做模式化校验。
- `text-to-image` 模式下，步骤 3（导入场景图）可完全跳过。
- 卖点为可选配置；若未配置卖点，AI 优化 prompt 时不融入卖点文案，不触发错误（`PS_SELLING_POINTS_EMPTY` 为非阻塞）。

---

## PS-PIPE-002 — Prompt 工坊流水线

**这是核心两步流程的第一步。** 从自然语言意图到生图模型可消费的 prompt。

**步骤**: 见 `pipeline-states.yaml` → `pipeline: prompt-workshop`

**设计原则**: 尽可能简单，用户只需要做两件事 — 贴图 + 描述意图，AI 负责剩下的。

**步骤说明**:

### prompt-compose（输入构建）
用户在统一输入区完成：
1. 选择生图模式（multimodal / text-to-image）
2. 粘贴/拖入/从素材区选择图片 → 自动编号为图1、图2...
3. 用自然语言描述意图，引用图片编号
   - multimodal 示例："参考图1的产品外观，替换到图2的场景中，保持原图的光线和构图，去掉竞品 logo"
   - text-to-image 示例："为图1中的水过滤器产品生成一张清新自然风格的电商主图，突出纯净水质"
4. 可选：勾选卖点（从项目卖点列表中勾选，AI 会自动融入 prompt）

### prompt-ai-refine（AI 优化）
AI 分析所有附带图片的视觉特征 + 用户意图 + 勾选的卖点，生成优化后的 prompt。

- 用户可预览并手动微调
- 可跳过 AI 优化，直接在 prompt 输出区手写或编辑 prompt
- 支持多次迭代（修改意图 → 重新优化）

### prompt-save（确认保存）
展示最终 prompt 全文，用户确认后保存为 PromptConfig（PS-DOM-005），可收藏复用。

保存规则:
- PromptConfig 可保存为纯文本模板，不要求必须附带图片。
- 若用户当前附带了图片，则保存时必须将这些图片持久化并写入 `attachedImages`。

**AI Prompt 优化实现**:
- 使用 `runtime.ai.text.generate` 或 `runtime.ai.text.stream`（PS-CAP-003）
- 优化失败返回 `PS_PROMPT_REFINE_FAILED`（非阻塞），用户可手动编辑

---

## PS-PIPE-003 — 单图生成预览流水线

**这是核心两步流程的第二步。** 验证 prompt 效果，满意后批量生成。

**步骤**: 见 `pipeline-states.yaml` → `pipeline: single-preview`

### gen-confirm-params（确认参数）
确认本次生成输入（基于 PromptConfig + 用户本次补充或替换的附带图片）。

前置检查（阻塞）:
- `multimodal` 模式下，本次解析后的输入图片集不可为空 → `PS_NO_IMAGES_FOR_MULTIMODAL`
- 若本次解析后的任一附带图片文件不存在 → `PS_SCENE_IMAGE_LOAD_FAILED`

### gen-execute（图像生成）
通过 `runtime.media.image.generate`（PS-CAP-004）发起调用：
- 进入实际调用前解析图像生成路由；若无可用路由 → `PS_ROUTE_NO_IMAGE_PROVIDER`
- `multimodal` 模式: 携带本次解析后的图片集 + `refinedPrompt`
- `text-to-image` 模式: 仅携带 `refinedPrompt`

失败处理（非阻塞）:
- 生成失败 → `PS_IMAGE_GENERATE_FAILED`
- 生成超时 → `PS_IMAGE_GENERATE_TIMEOUT`

### gen-preview-evaluate（预览评估）
展示生成结果，用户评估。

评估后动作（见 `pipeline-states.yaml` → `post_evaluate_actions`）:
- 满意 → 跳转批量任务 Tab（自动填充当前 PromptConfig）
- 不满意 → 回到 Prompt 工坊（PS-PIPE-002）
- 重新生成 → 使用相同参数重新执行 gen-execute

**历史记录**: 每次生成的结果自动保存为 GeneratedImage（PS-DOM-007），可横向滚动对比。

---

## PS-PIPE-004 — 批量生成流水线

批量应用同一 PromptConfig（PS-DOM-005）。

**步骤**: 见 `pipeline-states.yaml` → `pipeline: batch-generation`

### 两种批量模式

**multimodal 替换模式**:
- 对 `sceneImageIds` 列表中的每张场景图逐一调用生图
- 默认跳过已有成功输出的场景图（通过 `GeneratedImage.sourceSceneImageId` 判定）
- `SceneImage.status` 在生成成功后自动更新为 `used`

**text-to-image 变体模式**:
- 使用同一 prompt 生成 `BatchJob.batchSize` 张变体图片
- 无场景图概念，每次调用仅携带 prompt

### batch-monitor（执行监控）
- 实时进度：`completedCount / totalCount`，`failedCount`
- 支持暂停（PAUSED）/ 恢复（RUNNING）/ 取消（CANCELLED）
- 并发控制：`concurrency` 字段（默认 5，范围 1-10）

### batch-summary（结果汇总）
- 展示成功率、平均耗时
- 失败列表可重试（创建新 BatchJob 仅包含失败项）
- 若全部失败 → `PS_BATCH_ALL_FAILED`（阻塞）

**不变量**:
- 单个子任务失败不阻塞其他子任务（见 `batch-states.yaml` → `resume_semantics`）
- 任务暂停后可恢复，已完成项不重复执行
- `PARTIAL_COMPLETED` 为终态；“重试失败项”必须创建新的 BatchJob，而不是复用旧任务。

---

## PS-PIPE-005 — 图库与导出流水线

浏览、筛选、评分和导出生成结果。

**步骤**: 见 `pipeline-states.yaml` → `pipeline: gallery-export`

### gallery-browse（图库浏览）
网格视图，支持多维度筛选：
- 按生图模式（multimodal / text-to-image）
- 按批次（BatchJob）
- 按评分（1-5 星）
- 按状态（generating / success / failed / discarded）
- 按日期范围

### gallery-compare（对比视图）
仅 `multimodal` 模式可用：原始场景图 ↔ 生成图左右并排对比，支持滑块拖动。

### gallery-rate（评分标记）
- 用户评分 1-5（存入 `GeneratedImage.rating`）
- 丢弃：标记 `status: discarded`，**不删除本地文件**

### gallery-export（批量导出）
- 选中图片批量导出到用户指定目录
- 支持"全部（筛选后）"批量导出
- 存储写入失败 → `PS_STORAGE_WRITE_FAILED`（阻塞）
