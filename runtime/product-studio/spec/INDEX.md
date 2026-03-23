# Product Studio Spec 索引

> 任务导向阅读路径。根据当前任务选择入口。

## 快速导航

| 任务 | 入口 |
|------|------|
| 了解产品定位与架构全貌 | [`product-studio.md`](product-studio.md) |
| 实现数据模型 / 数据库表 | [`kernel/domain-contract.md`](kernel/domain-contract.md) → [`kernel/tables/entities.yaml`](kernel/tables/entities.yaml) |
| 实现业务流水线逻辑 | [`kernel/pipeline-contract.md`](kernel/pipeline-contract.md) → [`kernel/tables/pipeline-states.yaml`](kernel/tables/pipeline-states.yaml) |
| 注册 mod 能力声明 | [`kernel/capability-contract.md`](kernel/capability-contract.md) → [`kernel/tables/capabilities.yaml`](kernel/tables/capabilities.yaml) |
| 处理错误 / 错误码映射 | [`kernel/error-model.md`](kernel/error-model.md) → [`kernel/tables/reason-codes.yaml`](kernel/tables/reason-codes.yaml) |
| 编写验收测试 | [`kernel/acceptance-contract.md`](kernel/acceptance-contract.md) → [`kernel/tables/acceptance-cases.yaml`](kernel/tables/acceptance-cases.yaml) |
| 理解生图模式差异 | [`kernel/tables/generation-modes.yaml`](kernel/tables/generation-modes.yaml) |
| 理解批量任务状态机 | [`kernel/tables/batch-states.yaml`](kernel/tables/batch-states.yaml) |
| 查看 UI 视图设计意图 | [`product-studio.md`](product-studio.md) → "UI 视图设计" 章节 |

## 文件树

```
spec/
├── AGENTS.md                        # AI agent 编写约定
├── INDEX.md                         # 本文件
├── product-studio.md                # 领域文档
└── kernel/
    ├── index.md                     # kernel 契约索引
    ├── domain-contract.md           # PS-DOM-001 ~ 007
    ├── pipeline-contract.md         # PS-PIPE-001 ~ 005
    ├── capability-contract.md       # PS-CAP-001 ~ 006
    ├── error-model.md               # PS-ERR-001 ~ 004
    ├── acceptance-contract.md       # PS-ACC-001 ~ 005
    └── tables/
        ├── entities.yaml            # 7 实体全字段定义
        ├── pipeline-states.yaml     # 5 条流水线步骤
        ├── capabilities.yaml        # 能力注册表
        ├── reason-codes.yaml        # 错误码注册表
        ├── acceptance-cases.yaml    # 验收用例
        ├── generation-modes.yaml    # 生图模式枚举
        └── batch-states.yaml        # 批量任务状态机
```

## 核心两步流程

```
用户意图 (自然语言 + 图片)
    ↓  PS-PIPE-002 Prompt 工坊
AI 优化 prompt
    ↓  PS-PIPE-003 单图预览
满意？
├── 是 → PS-PIPE-004 批量生成
└── 否 → 回到 Prompt 工坊
```
