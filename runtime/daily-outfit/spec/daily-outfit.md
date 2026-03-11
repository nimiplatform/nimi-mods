---
mod_id: world.nimi.daily-outfit
status: Draft
version: 0.1.0
---

# Daily Outfit 领域规格

> 状态: 草案
> 日期: 2026-03-10
> 范围: Daily Outfit 业务增量。

## 0. 规范性导入

- 能力边界: `kernel/capability-contract.md` (`DO-CAP-*`)
- 推荐流水线: `kernel/pipeline-contract.md` (`DO-PIPE-*`)
- 实体契约: `kernel/domain-contract.md` (`DO-DOM-*`)
- 错误语义: `kernel/error-model.md` (`DO-ERR-*`)
- 验收门: `kernel/acceptance-contract.md` (`DO-ACC-*`)

## 1. 产品定位

Daily Outfit 是一个 AI 驱动的个人衣橱管理与穿搭推荐 mod。用户通过拍照录入衣物，AI 自动分类；根据场景描述从衣橱中智能匹配搭配方案，支持虚拟试穿预览、迭代调整和收藏复用。

### 核心价值

- **拍照即录入**: 拍照上传，AI 视觉识别自动完成分类，减少手动输入
- **场景驱动推荐**: 不是随机搭配，而是基于「今天要做什么」来推荐
- **虚拟试穿**: 把搭配方案叠加到用户自拍上预览效果
- **画像演化**: Onboarding 建立初始画像，日常使用中持续学习偏好
- **衣橱洞察**: 发现闲置衣物、识别风格盲区、优化衣橱结构

## 2. 架构概览

```
[Onboarding] → [用户画像]
                    ↓
[拍照录入] → [AI 分类] → [衣橱]
                              ↓
[场景输入] → [AI 推荐引擎] ← [衣橱] + [用户画像]
                    ↓
            [拼图快速预览]
                    ↓
            [迭代调整/局部替换]
                    ↓
            [AI 虚拟试穿生成]
                    ↓
            [收藏/穿搭日志]
                    ↓
            [衣橱洞察分析]
```

## 3. 功能域

| 功能域 | 相关规则 | 说明 |
|--------|---------|------|
| 衣橱管理 | DO-DOM-001 ~ 003, DO-PIPE-002 | 衣物录入、AI 分类、手动修正、状态管理 |
| 用户画像 | DO-DOM-004 ~ 005, DO-PIPE-001 | Onboarding 风格测试、画像演化 |
| 穿搭推荐 | DO-DOM-006, DO-PIPE-003 | 场景分析、衣橱匹配、方案生成 |
| 虚拟试穿 | DO-DOM-006, DO-PIPE-004 | 拼图预览、AI 试穿图生成 |
| 迭代调整 | DO-DOM-006, DO-PIPE-005 | 局部锁定替换、方案再生成 |
| 收藏与历史 | DO-DOM-006 ~ 007, DO-PIPE-006 | 方案收藏、穿搭日志 |
| 衣橱洞察 | DO-DOM-008, DO-PIPE-007 | 频率统计、淘汰建议、风格分析 |
| 数据同步与隐私 | DO-DOM-009, DO-PIPE-008 | 本地优先、同意前不云同步、失败本地保留 |

## 4. 非目标

- 不做电商推荐（不推荐购买新衣服的链接）
- 不做社交分享（不发布到社交平台）
- 不做跨用户协作（单用户衣橱，不共享）
- 不做与其他 mod 集成（V1 独立运行）

## 5. 阅读路径

### 「理解全貌」

1. 本文档 → 产品定位与架构
2. `kernel/domain-contract.md` → 5 核心实体
3. `kernel/pipeline-contract.md` → 8 条流水线
4. `kernel/capability-contract.md` → AI 能力依赖

### 「修改衣物实体」

1. `kernel/tables/entities.yaml` → 编辑字段
2. `kernel/domain-contract.md` → 对齐规则
3. 运行验证命令

### 「修改推荐流水线」

1. `kernel/tables/pipeline-states.yaml` → 编辑状态
2. `kernel/pipeline-contract.md` → 对齐规则
3. 运行验证命令

### 「修改能力」

1. `kernel/tables/capabilities.yaml` → 编辑能力
2. `kernel/capability-contract.md` → 对齐规则
3. `mod.manifest.yaml` → 对齐清单
4. 运行验证命令
