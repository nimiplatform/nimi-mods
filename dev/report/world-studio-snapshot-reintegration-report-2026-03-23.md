# World Studio Snapshot Reintegration Report

Generated: 2026-03-23
Scope: `nimi-mods/runtime/world-studio`
Snapshot branch: `snapshot/world-studio-maintain-optimization`
Related upstream branch: `origin/runtime_refactory`
Mode: snapshot archive; reintegration on top of runtime_refactory

## 1. Summary

本报告归档 `snapshot/world-studio-maintain-optimization` 中的 world-studio 本地优化，并记录为什么这批修改当前不适合直接并到 `origin/runtime_refactory`，以及后续应该如何在新的 world-studio 骨架上重新整合。

这次本地优化的重心不是重新定义 world-studio 的 create pipeline，而是继续打磨 `MAINTAIN` 工作台，主要目标包括：

- 让维护工作台的信息架构更稳定
- 让维护动作从“模块内零散按钮”收敛为“工作区级节奏”
- 让 `World / Agents / Assets / Releases` 四个维护域的浏览与编辑路径更清晰
- 让 `World > Base / Worldview / WorldEvents / Lorebooks` 的 inspect/focus 体验更一致
- 让 event-graph 与维护面板更像一个连续工作台，而不是松散拼接的维护组件

这批工作和 `runtime_refactory` 不是方向相反，而是已经进入 **同一业务面、不同骨架同时演化** 的状态。因此后续更合适的策略不是“直接 merge”或“完全推倒重写”，而是：

- 先保留这次优化的 snapshot
- 再基于 `runtime_refactory` 已经改出的新骨架做 selective reintegration

## 2. Snapshot Branch And Local Scope

- Snapshot branch: `snapshot/world-studio-maintain-optimization`
- Snapshot commit:
  - `b2e756d feat(world-studio): snapshot maintain optimization`

本次 snapshot 主要覆盖以下区域：

- `runtime/world-studio/spec/**`
- `runtime/world-studio/src/contracts/types/workspace.ts`
- `runtime/world-studio/src/controllers/**`
- `runtime/world-studio/src/hooks/actions/maintain/**`
- `runtime/world-studio/src/hooks/hydration/**`
- `runtime/world-studio/src/hooks/use-world-studio-maintain-actions.ts`
- `runtime/world-studio/src/state/workspace/**`
- `runtime/world-studio/src/ui/maintain/**`
- `runtime/world-studio/src/ui/create/event-graph/**`
- `runtime/world-studio/src/ui/shared/event-graph-workbench.tsx`
- `runtime/world-studio/test/**`

这批修改是从 `develop` 上的本地工作树直接归档到 snapshot 分支的，目的是先保存维护工作台的当前优化结果，而不是把它当作当前待合并分支。

## 3. What Was Changed In The Snapshot

从代码与 spec 变化看，这次 snapshot 主要做了四类事情。

第一类是维护信息架构的收口：

- 在 `spec/world-studio.md` 中新增并收紧了：
  - `WS-DOM-024a`
  - `WS-DOM-026a`
  - `WS-DOM-033a`
  - `WS-DOM-033b`
  - `WS-DOM-033c`
- 这些规则把 maintain 的节奏进一步明确为：
  - lorebooks entry-first
  - agents roster-first
  - sticky action bar 只保留 workspace-level actions
  - create review 与 maintain 在相同 canonical modules 上应尽量复用编辑内核

第二类是维护工作台动作模型的重构：

- `use-world-studio-maintain-actions.ts` 新增了 `syncWorkspaceToRemote`
- 维护动作从“分散在不同 section 的单项 destructive/action buttons”转向“工作区级保存/同步节奏”
- 删除了：
  - `delete-first-event.ts`
  - `delete-first-lorebook.ts`
- `maintain-workbench.tsx` 也同步把底部 action bar 收敛为：
  - `Save Local`
  - `Sync To Remote`
  - `Reload From Remote`

第三类是维护 UI 的重组与聚焦：

- `world-base-panel.tsx` 被重构成更强的 summary + common fields + details disclosure 结构
- `events-panel.tsx` 从 `EventGraphMaintenance` 切到新的 `MaintainEventsWorkbench`
- `agents-panel.tsx`、`assets-panel.tsx`、`lorebooks-panel.tsx`、`releases-panel.tsx`、`worldview-panel.tsx` 都做了明显的维护体验重组
- 新增：
  - `runtime/world-studio/src/ui/maintain/events/events-workbench.tsx`
  - `runtime/world-studio/src/ui/maintain/world-base/world-base-components.tsx`
  - `runtime/world-studio/src/ui/shared/event-graph-workbench.tsx`

第四类是配套的 workspace / controller / locale / test 对齐：

- `workspace.ts`、`defaults.ts`、`normalize.ts`、`screen-model*.ts` 一起跟着新的 maintain rhythm 调整
- `en.json`、`zh.json` 大量更新
- `world-studio-maintain-regressions.test.mjs`
- `world-studio-ui-contract.test.mjs`

## 4. Why Direct Merge Into Runtime Refactory Is High-Risk

这批修改现在不适合直接并到 `runtime_refactory`，原因不是“内容没价值”，而是它已经和 `runtime_refactory` 的 world-studio 主线在核心骨架上发生了重叠。

`origin/runtime_refactory` 在 `world-studio` 上近期关键提交包括：

- `fc6b2a1 refactor(world-studio): redesign maintain workflow`
- `693ea6d refactor(world-studio): productize maintain workbench`
- `21a43fe refactor(world-studio): align latest realm truth`
- `7794057 feat(world-studio): edit rule truth drafts directly`

这些提交已经改到了与本地 snapshot 高度重叠的核心文件，例如：

- `src/contracts/types/workspace.ts`
- `src/controllers/world-studio-screen-model.ts`
- `src/state/workspace/defaults.ts`
- `src/state/workspace/normalize.ts`
- `src/ui/create/draft-editor-panel.tsx`
- `src/ui/maintain/maintain-workbench.tsx`
- `src/ui/maintain/world-base-panel.tsx`

因此当前风险不是“简单冲突一下”，而是：

- 双方都在重塑 maintain workflow
- 双方都在调整 workspace / screen model / panel contract
- `runtime_refactory` 还额外引入了 rule truth draft direct editing 路径

在这种情况下直接 merge，容易把新旧工作台节奏、truth draft 入口和局部 UI 结构混到一起。

## 5. What Runtime Refactory Changed In World Studio

`runtime_refactory` 在 world-studio 上不是小修，而是已经确定了几条新的结构方向：

1. `maintain workflow` 在重画
   - 不只是视觉整理，而是工作流与模块职责的重整。
2. `maintain workbench` 在产品化
   - 不是单个 panel patch，而是整体工作台骨架变化。
3. `rule truth drafts` 直接进入编辑路径
   - `7794057 feat(world-studio): edit rule truth drafts directly`
4. `realm truth` 对齐成为更强约束
   - `21a43fe refactor(world-studio): align latest realm truth`

这意味着后续 reintegration 的基础不是当前 `develop`，而是 `runtime_refactory` 已经成形的新 world-studio 骨架。

## 6. What Should Be Preserved Conceptually

虽然不能直接 merge，但这次本地优化里有几类方向值得保留：

1. **maintain 工作台应以工作区节奏为中心**
   - 本地保存、远端同步、远端重载是 workspace-level 行为，不应被每个 section 各自发明动作条。
2. **维护信息架构应是 roster-first / entry-first / inspect-first**
   - agents 不该走 detached editor mode
   - lorebooks 不该退回扁平字符串表格
3. **同一个 canonical module 在 create review 与 maintain 中应尽量复用编辑内核**
   - 不应无谓分裂成两套完全不同的编辑范式。
4. **world-studio 的 maintain 体验应更像连续工作台，而不是多个孤立面板**
   - event graph、world base、worldview、assets、releases 之间应有稳定节奏。
5. **世界基础信息与只读 runtime truth 应区分对待**
   - 例如 `clockConfig` 更适合作为折叠的只读 disclosure，而不是常驻可编辑卡片。

## 7. What Must Be Re-aligned Before Reintegration

后续如果要把这批优化带回 `runtime_refactory`，至少需要先重新对齐以下区域：

1. `workspace` 类型与默认值
   - `src/contracts/types/workspace.ts`
   - `src/state/workspace/defaults.ts`
   - `src/state/workspace/normalize.ts`
2. `screen model` 与 controller 组织
   - `src/controllers/**`
3. `maintain` 动作与 hydration
   - `src/hooks/actions/maintain/**`
   - `src/hooks/hydration/**`
   - `src/hooks/use-world-studio-maintain-actions.ts`
4. `maintain workbench` 与 `world-base` / `events` / `releases` 等主面板
   - `src/ui/maintain/**`
5. `rule truth drafts` 与 create/edit 交汇点
   - 尤其是 `draft-editor-panel.tsx` 与 related create surfaces
6. `spec / locale / tests`
   - 这些不能在 reintegration 时后补，必须跟着新骨架一起校准

## 8. Reintegration Notes After Cutover

后续正确的处理方式应为：

1. 先把 `runtime_refactory` 中的 world-studio 骨架视为 reintegration 基线。
2. 按模块逐项判断这次 snapshot 里的内容：
   - 哪些可以直接移植
   - 哪些需要改造后移植
   - 哪些应放弃旧实现、只保留设计意图
3. 优先保留这次 snapshot 的维护节奏与信息架构结论，而不是执着于原组件形态。
4. 对以下高冲突区域采用“新骨架下重整合”而不是“旧实现直接搬回”：
   - maintain workbench
   - world base
   - workspace normalize / defaults
   - draft editor / truth editing 交汇处

结论：`snapshot/world-studio-maintain-optimization` 应作为 world-studio maintain 优化的 **实现快照与 reintegration 依据** 保留。后续方向应是基于 `runtime_refactory` 的 world-studio 新骨架做 selective reintegration，而不是直接 merge snapshot，也不是把整个本地优化线当成纯重写项目。
