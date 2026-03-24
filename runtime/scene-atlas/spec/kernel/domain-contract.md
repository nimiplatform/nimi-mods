# Scene-Atlas 领域契约

> Rule ID 前缀: `SA-DOM-*`
> 字段事实源: [`tables/entities.yaml`](tables/entities.yaml)

---

## SA-DOM-001 — SceneCard（场景素材卡）

`SceneCard` 是单图场景素材卡，是 `MaterialPack` 内的最小 material item。

**字段**: 见 `entities.yaml` -> `entity: SceneCard`

**不变量**:
- `SceneCard` 必须保留 `originImage`，不得脱离来源图存在。
- `SceneCard` 的主体图为 `coverImage`；文本语义层允许生成后编辑，但图像结果不通过手工替换编辑。
- `SceneCard` 不定义正式生命周期状态字段；删除语义通过从所属 `MaterialPack` 中移除实现。
- `storyHook` 为可选字段，不构成 `SceneCard` 成立前提。

## SA-DOM-002 — MaterialPack（素材包）

`MaterialPack` 是一组可被整理、发布、流通的 material items 的集合，也是 Scene-Atlas 的主要产出物。

**字段**: 见 `entities.yaml` -> `entity: MaterialPack`

**不变量**:
- `MaterialPack` 使用 `ownerId` 作为归属标识，不同时维护 `creatorId`。
- `MaterialPack` 内 item 必须保持稳定顺序；该顺序具有展示和叙事语义，不得被当作无序集合。
- `coverImage` 可自动推导，但在发布前必须已确认；默认取第一张 `SceneCard.coverImage`。
- `MaterialPack` 不定义 `visibility` 字段；Scene-Atlas 内部 material 默认处于 owner-private 工作态。

## SA-DOM-003 — material / asset 边界

Scene-Atlas 中的 `SceneCard` 与 `MaterialPack` 均属于 material，不属于 Realm `asset`。

**规则**:
- 只有 `MaterialPack` 可进入发布交接。
- `SceneCard` 不得作为独立发布对象。
- Scene-Atlas 不直接编辑上层 `asset`，也不持有市场 listing 语义。

## SA-DOM-004 — implicit draft pack

Scene-Atlas 采用 pack-first 模型。

**规则**:
- 导入第一张图片时，系统隐式创建当前 `MaterialPack draft`。
- 用户无需在导图前完成 `title / description` 填写。
- pack metadata 可在后续整理阶段补齐。

## SA-DOM-005 — pack-level style lock

`MaterialPack` 必须拥有一个 pack-level `defaultStyle`。

**规则**:
- `defaultStyle` 在首次成功生成 `SceneCard` 时确定。
- 当 pack 中存在任意 `SceneCard` 时，`defaultStyle` 锁定，不允许直接修改。
- 若需更换 `defaultStyle`，必须先移除 pack 内全部 `SceneCard`，再以新 style 继续生成。
- pack 内所有 `SceneCard` 必须服从当前 `defaultStyle`。

## SA-DOM-006 — derived readiness

`MaterialPack` 的就绪性由系统派生，不通过手动状态切换表达。

**规则**:
- `isReady` 为只读派生字段。
- `readinessIssues[]` 为只读缺失项清单，用于解释不可发布原因。
- readiness 判定基于结构完整性，不引入主观质量评分。

## SA-DOM-007 — ordered scene sequence

`MaterialPack` 中 `SceneCard` 的顺序具有真实业务语义。

**规则**:
- pack 内顺序必须被保留到浏览、导出和下游消费环节。
- 该顺序不仅服务于 UI 排列，也可承载叙事推进顺序。

## SA-DOM-008 — editable material after publish

已发布 pack 之后，继续编辑的对象是 `MaterialPack`，不是上层 `asset`。

**规则**:
- `MaterialPack` 发布后仍可继续编辑。
- Scene-Atlas 中不存在对 `asset` 本体的直接编辑。
- 对已发布 pack 的后续修改，只有经过新的发布动作，才会进入上层已发布结果。

## SA-DOM-009 — one-pack-one-asset

一个 `MaterialPack` 只对应一个 `asset`。

**规则**:
- 不支持同一个 `MaterialPack` 派生多个独立 `asset`。
- 后续发布动作更新的是同一 `asset` 的新发布结果，而不是生成新的资产身份。
