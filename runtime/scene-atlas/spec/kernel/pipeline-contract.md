# Scene-Atlas 流水线契约

> Rule ID 前缀: `SA-PIPE-*`
> 步骤事实源: [`tables/pipeline-states.yaml`](tables/pipeline-states.yaml)

---

## SA-PIPE-001 — Pack-first 图片到 SceneCard 流水线

Scene-Atlas 的默认流程是 pack-first，而不是 card-first。

**步骤**: 见 `pipeline-states.yaml` -> `pipeline: scene-atlas-flow`

**规则**:
- 每次只处理一张导入图片。
- 导入图片不会自动触发生成；用户必须显式执行一次 `Generate Scene`。
- 首次导图时隐式创建 `ScenePack draft`。
- 一次 `Generate Scene` 只生成一个 `SceneCard`，并自动加入当前 pack。
- 生成后的文本语义字段允许编辑；文本编辑不触发重新生成。

## SA-PIPE-002 — style selection 与 lock 流水线

Scene-Atlas 的风格控制是 pack-level，不是 card-level 自由漂移。

**步骤**: 见 `pipeline-states.yaml` -> `style_policy`

**规则**:
- 导入图片后，系统先提供一个 recommended style。
- 用户可在首次生成前接受推荐 style、切换推荐 style 或补充自定义风格描述。
- 首次成功生成后，当前 style 被写入 `ScenePack.defaultStyle`。
- 一旦 pack 内存在任意 `SceneCard`，`defaultStyle` 锁定。

## SA-PIPE-003 — SceneCard 结果替换策略

Scene-Atlas 不保留生成历史版本。

**规则**:
- `Regenerate` 在当前 style 下直接替换当前 `SceneCard` 结果。
- 若用户希望切换 pack style，必须先移除当前 pack 内全部 `SceneCard`，再回到 style selection 阶段以新 style 继续生成。
- `Remove` 只执行从当前 pack 中移除 `SceneCard`，不引入 scene-level archived 状态。

## SA-PIPE-004 — readiness 与发布交接

`ScenePack` readiness 是自动派生结果，不是手动阶段。

**步骤**: 见 `pipeline-states.yaml` -> `publish_readiness`

**规则**:
- 只有当 readiness 硬条件满足时，pack 才可发布。
- `isReady` 与 `readinessIssues[]` 由系统自动计算。
- 发布动作的主体是 `ScenePack`，不是 `SceneCard`。

## SA-PIPE-005 — 空 draft pack 清理

空 draft pack 允许在当前操作上下文中临时存在，但不应长期残留。

**步骤**: 见 `pipeline-states.yaml` -> `empty_draft_cleanup`

**规则**:
- 若用户仍处于当前 pack 编辑上下文中，空 draft pack 可暂时保留。
- 当用户离开该上下文时，空的 draft pack 应自动删除。

## SA-PIPE-006 — 发布后编辑与再发布

发布后继续编辑的是 `ScenePack` 工作态，不是 asset。

**步骤**: 见 `pipeline-states.yaml` -> `published_edit_policy`

**规则**:
- 已发布 pack 仍可继续编辑。
- Scene-Atlas 内不直接编辑 asset。
- 若后续修改需要反映到上层市场结果，必须通过新的发布动作进入同一 asset 的新发布结果。
