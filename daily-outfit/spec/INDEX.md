---
mod_id: world.nimi.daily-outfit
status: Draft
version: 0.1.0
---

# Daily Outfit Spec 索引

> AI 驱动的个人衣橱管理与穿搭推荐 mod。
> 拍照录入 → AI 分类 → 场景推荐 → 虚拟试穿 → 收藏复用 → 衣橱洞察。

## 架构概览

```
[Onboarding] ──→ [UserProfile]
                      │
[拍照] → [AI 分类] → [衣橱 GarmentItem]
                           │
[场景输入] → [AI 推荐] ←──┤←── [UserProfile]
                 │
          [拼图预览 collage]
                 │
          [迭代调整 refine]
                 │
          [虚拟试穿 try-on]
                 │
          [收藏/穿搭日志]
                 │
          [衣橱洞察 insights]
```

## Spec 结构

### 内核契约（权威事实）

| 文档 | 规则 ID | 说明 |
|------|---------|------|
| `kernel/index.md` | — | 规则 ID 格式、所有权、事实源 |
| `kernel/domain-contract.md` | DO-DOM-001 ~ 009 | 5 核心实体 + 衣橱状态 + 洞察 + 隐私 |
| `kernel/pipeline-contract.md` | DO-PIPE-001 ~ 008 | 8 条流水线（Onboarding → 录入 → 推荐 → 试穿 → 调整 → 收藏 → 洞察 → 云同步） |
| `kernel/capability-contract.md` | DO-CAP-001 ~ 007 | AI 能力治理 + SDK 边界 + 数据 API |
| `kernel/error-model.md` | DO-ERR-001 ~ 004 | 阻塞/非阻塞错误 + 错误信封 + 上游透传 |
| `kernel/acceptance-contract.md` | DO-ACC-001 ~ 002 | 表驱动验收 + 覆盖范围 |

### 内核表

| 表 | 内容 |
|----|------|
| `kernel/tables/entities.yaml` | 5 实体定义（GarmentItem、UserProfile、StyleSample、OutfitCombo、WearLog） |
| `kernel/tables/capabilities.yaml` | 19 能力注册 + SDK 允许/禁止清单 |
| `kernel/tables/pipeline-states.yaml` | 8 条流水线状态链 |
| `kernel/tables/reason-codes.yaml` | 14 错误码 + 阶段 + 恢复建议 |
| `kernel/tables/acceptance-cases.yaml` | 31 验收用例 |

### 领域文档

| 文档 | 范围 |
|------|------|
| `daily-outfit.md` | 产品定位、架构概览、功能域、非目标、阅读路径 |

## 阅读路径

### 「理解 Daily Outfit 全貌」

1. `daily-outfit.md` → 产品定位与架构
2. `kernel/domain-contract.md` → 5 核心实体
3. `kernel/pipeline-contract.md` → 8 条流水线
4. `kernel/capability-contract.md` → AI 能力依赖

### 「修改衣物实体」

1. `kernel/tables/entities.yaml` → 编辑 GarmentItem 字段
2. `kernel/domain-contract.md` → 对齐 DO-DOM-001
3. 运行验证命令

### 「修改推荐流水线」

1. `kernel/tables/pipeline-states.yaml` → 编辑 recommendation_chain
2. `kernel/pipeline-contract.md` → 对齐 DO-PIPE-003
3. 运行验证命令

### 「修改能力」

1. `kernel/tables/capabilities.yaml` → 编辑能力列表
2. `kernel/capability-contract.md` → 对齐规则
3. `mod.manifest.yaml` → 对齐清单
4. 运行验证命令

### 「添加错误码」

1. `kernel/tables/reason-codes.yaml` → 添加新 code
2. `kernel/error-model.md` → 对齐规则
3. `kernel/tables/acceptance-cases.yaml` → 添加对应验收用例
4. 运行验证命令

## 验证命令

1. `pnpm -C nimi-mods run generate:spec:daily-outfit-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:daily-outfit-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:daily-outfit-kernel-consistency`

## 设计决策

| 决策 | 理由 |
|------|------|
| 本地优先存储 | V1 隐私敏感（照片、体型），默认不上云 |
| 拼图预览 + AI 试穿双轨 | 拼图快速（客户端拼接），试穿精准但慢（AI 生成），两者互补 |
| 画像演化而非固定 | 用户品味随时间变化，收藏/拒绝行为自然反映偏好漂移 |
| 软权重非硬过滤 | 场景可能需要非偏好风格（如商务场合穿正装），不应硬排除 |
| 预置风格样本 | 避免 Onboarding 依赖 AI 图像生成，降低首次使用门槛 |
| 云端本地双轨 AI | mod 不感知底层引擎，统一通过 SDK runtime facade 调用 |

## V1 范围

| 功能 | V1 |
|------|-----|
| Onboarding 画像建立 | Y |
| 拍照录入 + AI 分类 | Y |
| 场景驱动推荐 | Y |
| 拼图预览 | Y |
| 虚拟试穿 | Y |
| 迭代调整（锁定替换） | Y |
| 收藏方案 | Y |
| 穿搭日志 | Y |
| 衣橱洞察（淘汰/风格/缺口） | Y |
| 本地存储 | Y |
| 云端同步（可选） | Y |
| 跨 mod 集成 | N |
| 社交分享 | N |
| 电商推荐 | N |
