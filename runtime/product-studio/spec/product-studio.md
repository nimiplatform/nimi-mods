# Product Studio — 领域文档

> Mod ID: `world.nimi.product-studio`
> Rule ID 前缀: `PS-*`
> 版本: 0.1.0

---

## 产品定位

Product Studio 是面向电商从业者的产品营销图生成工具。

**核心场景**: 电商卖家看到竞品的场景图效果好，想用自己的产品替换进去，并叠加卖点文案。

**核心两步流程**:
1. 自然语言描述 → AI 优化 prompt（适配生图模型）
2. 优化后的 prompt → 图像生成 → 满意后批量生图

**两种生图模式**（见 PS-DOM-005 `generationMode`）:
- `multimodal`：多模态生图。将图片输入 + prompt 一起发给多模态模型，适用于产品替换、场景融合等需要图片输入的场景。
- `text-to-image`：纯文生图。仅发送 prompt 给文生图模型，从零生成产品营销图。

---

## 功能域

### 领域契约 (PS-DOM-*)

完整实体定义见 [`kernel/domain-contract.md`](kernel/domain-contract.md)，字段事实源见 [`kernel/tables/entities.yaml`](kernel/tables/entities.yaml)。

| Rule ID | 实体 | 说明 |
|---------|------|------|
| PS-DOM-001 | Project | 电商产品工作空间 |
| PS-DOM-002 | ReferenceImage | 用户自己产品的参考照片 |
| PS-DOM-003 | SellingPoint | 产品/店铺卖点文案 |
| PS-DOM-004 | SceneImage | 竞品或模板场景图（multimodal 模式使用） |
| PS-DOM-005 | PromptConfig | Prompt 构建配置（含用户意图、附带图片、AI 优化结果） |
| PS-DOM-006 | BatchJob | 批量生图任务 |
| PS-DOM-007 | GeneratedImage | 单张生成结果图 |

### 流水线契约 (PS-PIPE-*)

完整流水线定义见 [`kernel/pipeline-contract.md`](kernel/pipeline-contract.md)，步骤事实源见 [`kernel/tables/pipeline-states.yaml`](kernel/tables/pipeline-states.yaml)。

| Rule ID | 流水线 | 说明 |
|---------|--------|------|
| PS-PIPE-001 | 项目设置流水线 | 创建项目、上传素材、配置卖点 |
| PS-PIPE-002 | Prompt 工坊流水线 | 自然语言意图 → AI 优化 prompt（核心第一步） |
| PS-PIPE-003 | 单图生成预览流水线 | prompt → 单张预览（核心第二步） |
| PS-PIPE-004 | 批量生成流水线 | 批量应用同一 PromptConfig |
| PS-PIPE-005 | 图库与导出流水线 | 浏览、评分、导出生成结果 |

### 能力契约 (PS-CAP-*)

完整能力声明见 [`kernel/capability-contract.md`](kernel/capability-contract.md)，注册表见 [`kernel/tables/capabilities.yaml`](kernel/tables/capabilities.yaml)。

| Rule ID | 能力域 | 说明 |
|---------|--------|------|
| PS-CAP-001 | 能力事实源 | `capabilities.yaml` 为唯一权威源 |
| PS-CAP-002 | SDK 接口边界 | 允许 `@nimiplatform/sdk/mod`，禁止底层 Tauri/Node 模块 |
| PS-CAP-003 | AI 文本能力治理 | Prompt 优化通过 `runtime.ai.text.*` |
| PS-CAP-004 | AI 图像能力治理 | 图像生成通过 `runtime.media.image.generate` |
| PS-CAP-005 | 数据 API 注册 | 7 个数据域的 CRUD 能力注册 |
| PS-CAP-006 | 云端与本地双轨 | mod 不感知底层调度，统一通过 SDK facade |

### 错误模型 (PS-ERR-*)

完整错误定义见 [`kernel/error-model.md`](kernel/error-model.md)，错误码注册表见 [`kernel/tables/reason-codes.yaml`](kernel/tables/reason-codes.yaml)。

| Rule ID | 规则 |
|---------|------|
| PS-ERR-001 | 错误码事实源 |
| PS-ERR-002 | 阻塞与非阻塞语义 |
| PS-ERR-003 | 可解析错误信封（`reasonCode + actionHint + stage`） |
| PS-ERR-004 | 上游错误透传 |

### 验收门 (PS-ACC-*)

完整验收规则见 [`kernel/acceptance-contract.md`](kernel/acceptance-contract.md)，验收用例见 [`kernel/tables/acceptance-cases.yaml`](kernel/tables/acceptance-cases.yaml)。

---

## 非目标

- **不支持 ControlNet、LoRA 等复杂参数**：生图参数限于 prompt + 图片输入。
- **不支持视频生成**：仅支持静态图片生成。
- **不内置图片编辑器**：生成后的图片编辑由外部工具负责。
- **不管理电商平台上传**：导出到本地目录为止，不集成电商平台 API。
- **不支持团队协作**：单用户本地工作流，无多用户权限管理。

---

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                Product Studio Mod                    │
│                                                     │
│  View Layer (React)                                 │
│  ├── ProjectDashboard        (View 1)               │
│  ├── ProjectWorkspace        (View 2)               │
│  │   ├── PromptStudio        (View 3, 核心)          │
│  │   ├── BatchControlPanel   (View 4)               │
│  │   └── Gallery             (View 5)               │
│  └── SellingPointsEditor     (View 6, 弹窗)          │
│                                                     │
│  Domain Layer                                       │
│  ├── Project / ReferenceImage / SceneImage          │
│  ├── SellingPoint                                   │
│  ├── PromptConfig (generationMode: multimodal|t2i)  │
│  ├── BatchJob (状态机: DRAFT→QUEUED→RUNNING→...)    │
│  └── GeneratedImage                                 │
│                                                     │
│  SDK Facade (PS-CAP-002)                            │
│  ├── runtime.ai.text.generate / .stream             │
│  ├── runtime.media.image.generate                   │
│  ├── runtime.media.jobs.*                           │
│  └── storage.sqlite.* / storage.files.*             │
└─────────────────────────────────────────────────────┘
```

---

## UI 视图设计

> 以下描述每个视图的功能、布局和交互行为，供前端设计参考。

### View 1: 项目仪表盘 (Project Dashboard)

**入口**: 侧边栏 "Product Studio" 导航项
**功能**: 展示所有产品项目列表

**布局**:
- 顶部：标题 "Product Studio" + "新建项目" 按钮
- 主体：项目卡片网格（每行 2-3 张）
  - 卡片展示：项目名称、缩略图（默认参考图）、场景图数量、已生成图数量、上次更新时间
  - 卡片右上角：更多操作菜单（归档、删除）
- 空状态：引导用户创建第一个项目

**交互**:
- 点击卡片 → 进入项目工作台
- 点击"新建项目" → 弹出创建对话框（名称 + 描述）

---

### View 2: 项目工作台 (Project Workspace)

**功能**: 单个项目的主工作区，是所有操作的 hub

**布局**: 左右分栏
- **左侧面板（素材区）** — 可折叠，约 30% 宽度
  - Tab 1 "参考图"：产品参考图列表（网格），支持上传、设默认、删除
  - Tab 2 "场景图"：场景素材图列表（网格），支持批量导入、状态标记
  - Tab 3 "卖点"：卖点列表（可切换产品/店铺），支持增删改排序、JSON 导入导出
- **右侧主区（工作区）** — 70% 宽度
  - 顶部 Tab：Prompt 工坊 | 批量任务 | 图库
  - 默认展示 Prompt 工坊

**交互**:
- 左侧素材区和右侧工作区联动：场景图右键可"用此图预览生成"
- 素材区支持拖拽上传

---

### View 3: Prompt 工坊 (Prompt Studio)

**功能**: 核心交互 — 贴图 + 描述意图 → AI 优化 prompt → 预览生成

**布局**: 上下分区

**上半区（输入与 Prompt 区）**:
- 顶部：生图模式切换（Segmented Control: "多模态" / "文生图"）
- **输入区**（类似聊天输入框体验）:
  - 图片区：已添加图片横向排列，自动标注"图1"、"图2"...，点击可移除
  - 添加图片方式：从素材区拖入 / 点击"+"选择 / 粘贴（Cmd+V）
  - 多行文本输入框
    - placeholder: "描述你想要的效果，用图1、图2引用上方图片。如：参考图1的产品，替换到图2的场景中，保持原图光线..."
  - 卖点参考（可折叠）：项目卖点勾选列表，AI 优化时融入 prompt
  - "优化 Prompt" 按钮
- **Prompt 输出区**:
  - 可编辑的 prompt 全文展示区（AI 流式输出，用户可手动微调）
  - 操作栏："保存配置" | "收藏" | "预览生成 ▶"

**下半区（预览区）**:
- 左侧：输入图片缩略图（图1、图2... 小图排列）
- 右侧：生成结果展示区（loading → 结果大图）
- 结果下方："满意 → 批量生成" | "调整 Prompt" | "重新生成" | 评分（1-5 星）
- 历史生成列表：横向滚动查看多次结果对比

**交互流程**:
1. 选择生图模式（多模态 / 文生图）
2. 贴入/选择图片 → 自动编号
3. 用自然语言描述意图（引用图片编号）
4. 可选：勾选卖点作为参考
5. 点击"优化 Prompt" → AI 流式输出优化后的 prompt
6. 用户微调 prompt（可选）
7. 点击"预览生成" → 等待生成 → 评估
8. 满意 → 跳转批量任务 Tab

快捷键：Cmd+Enter 触发优化/生成

---

### View 4: 批量任务 (Batch Control Panel)

**功能**: 管理批量生图任务

**布局**:
- **顶部控制栏**:
  - 当前 PromptConfig 选择器
  - 多模态模式：场景图范围选择（全部未处理 / 手动勾选 / 全部）、"跳过已生成" 开关
  - 文生图模式：生成数量输入（如 20 张变体）
  - 通用：并发数设置（滑块 1-10，默认 5）
  - "开始批量生成" 主按钮
- **任务监控区**:
  - 进度条：X/Y 完成，Z 失败
  - 实时日志滚动区（每张图的状态）
  - 操作按钮：暂停 / 恢复 / 取消
- **历史任务列表**:
  - 表格：任务 ID、Prompt 配置、生图模式、范围、进度、状态、创建时间
  - 点击展开：查看每张图详细状态
  - 失败项："重试失败项" 按钮

---

### View 5: 图库 (Gallery)

**功能**: 浏览、对比、评分、导出生成结果

**布局**:
- **筛选栏**: 按生图模式 / 批次 / 评分 / 状态 / 日期范围筛选
- **主体**: 两种视图
  - 网格视图：生成图缩略图网格（悬停显示详情）
  - 对比视图：左右并排（原始场景图 ↔ 生成图），仅多模态模式可用
- **底部操作栏**: 多选 → "导出选中" / "导出全部（筛选后）" / "丢弃选中"

**交互**:
- 点击单张图 → 大图预览（lightbox），支持左右翻页
- 大图预览中可评分、查看 prompt 信息、查看应用的卖点
- 多模态模式下支持滑块对比（原图/生成图）

---

### View 6: 卖点管理弹窗 (Selling Points Editor)

**功能**: JSON 导入和可视化编辑卖点

**布局**: 模态弹窗，两 Tab
- Tab "可视化"：分两区（产品卖点 / 店铺卖点），可拖拽排序列表
  - 每行：拖拽手柄 | 文案文本（可编辑）| 启用开关 | 删除按钮
  - 底部："添加卖点" 按钮
- Tab "JSON"：代码编辑器，直接编辑 `{ "product": [...], "store": [...] }` 格式
  - 两 Tab 实时同步
