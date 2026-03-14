# Daily Outfit 领域契约

> 所有者领域: `DO-DOM-*`
> 权威数据源: `tables/entities.yaml`

---

## DO-DOM-001 — GarmentItem（衣物单品）

衣橱中的每一件衣物。由用户拍照上传后 AI 自动分类生成。

- 每件衣物具有唯一 ULID 标识。
- `category` 为一级分类，枚举值: `top`（上衣）、`bottom`（下装）、`shoes`（鞋子）、`outerwear`（外套）、`accessory`（配饰）。
- `subcategory` 为二级分类，由 AI 根据图片识别自动填充（如 T恤、衬衫、牛仔裤、运动鞋等）。
- `colors` 为颜色标签数组，支持多色（如条纹衫可标记 `["白", "蓝"]`）。
- `material` 为材质标签（如棉、涤纶、羊毛、皮革、丝绸等）。
- `styleTags` 为风格标签数组（如 `["商务", "极简"]`），由 AI 识别并允许用户修正。
- `seasons` 为适用季节数组，枚举值: `spring`, `summer`, `autumn`, `winter`。
- `formalityLevel` 为正式程度，1-5 整数刻度（1=极休闲, 5=极正式）。
- `status` 标记衣物状态: `active`（在役）、`retired`（已淘汰）。
- `photoUrls` 存储用户上传的原始照片 URL 数组。
- `thumbnailUrl` 为 AI 处理后的去背景缩略图，用于拼图预览。
- `wearCount` 记录累计穿着次数，每次确认穿搭日志时递增。
- `lastWornAt` 记录最后一次穿着日期。
- 用户可以手动修正 AI 自动填充的所有分类字段。

## DO-DOM-002 — AI 衣物分类

拍照录入时 AI 视觉识别自动分类的业务规则。

- AI 分类使用 vision 能力模型分析上传照片。
- 单次上传支持一张照片包含多件衣物（如平铺拍摄），AI 应逐件识别。
- AI 分类结果为建议值，用户确认后才写入 GarmentItem。
- 分类维度包括: category、subcategory、colors、material、styleTags、seasons、formalityLevel。
- AI 还应从照片推断 `thumbnailUrl` 所需的去背景处理。

## DO-DOM-003 — 衣橱状态管理

衣橱整体管理的不变量。

- 衣橱为单用户私有，不跨用户共享。
- 衣物删除为软删除（status 设为 `retired`），已淘汰衣物不参与推荐但保留历史数据。
- 衣橱应支持按 category、styleTags、seasons、formalityLevel 筛选浏览。
- 衣物的 `wearCount` 和 `lastWornAt` 仅通过穿搭日志确认时更新，不允许手动修改。

## DO-DOM-004 — UserProfile（用户画像）

用户穿搭偏好画像。通过 Onboarding 建立初始画像，日常使用中持续演化。

- 每个用户具有唯一画像。
- `gender` 为性别，枚举值: `male`, `female`, `non-binary`。
- `ageGroup` 为年龄段，枚举值: `18-24`, `25-30`, `31-40`, `41-50`, `50+`。
- `selfieUrl` 为用户自拍照片 URL，用于虚拟试穿基底图。
- `styleWeights` 为风格偏好权重映射，key 为风格标签，value 为 -1.0 ~ 1.0 的浮点数（正值=喜欢，负值=不喜欢，0=中性）。
- `sceneFrequencies` 为场景频率映射，key 为场景标签，value 为 0.0 ~ 1.0 的权重。
- `styleWeights` 初始值来自 Onboarding 风格测试。
- `styleWeights` 在用户日常使用中演化：收藏方案时对应风格标签 +0.1，拒绝方案时 -0.05，自然衰减不实施。
- `sceneFrequencies` 初始值来自 Onboarding 场景频率调查。
- `sceneFrequencies` 随穿搭日志中的场景记录自动更新权重。
- 画像数据为 AI 推荐时的 prompt 软权重上下文，不作硬过滤条件。

## DO-DOM-005 — StyleSample（风格样本）

Onboarding 风格偏好测试中展示给用户的预置穿搭图。

- 每个样本具有唯一 ID。
- `imageUrl` 为预置穿搭图片 URL。
- `styleTags` 为该穿搭图对应的风格标签数组。
- `gender` 标记该样本适用的性别。
- `ageGroup` 标记该样本适用的年龄段（可为空表示通用）。
- 样本数据预置于 mod 资源包中，来源为公开时尚数据集。
- Onboarding 时根据用户的 gender 和 ageGroup 筛选 10-20 个样本展示。
- 用户对每个样本做 `like`（喜欢）、`dislike`（不喜欢）、`skip`（跳过）三选一。
- 测试结果聚合为 `styleWeights` 初始值写入 UserProfile。

## DO-DOM-006 — OutfitCombo（穿搭方案）

一次穿搭推荐生成的完整搭配方案。

- 每个方案具有唯一 ULID 标识。
- `itemIds` 引用衣橱中的 GarmentItem ID 数组，构成完整搭配。
- `occasion` 记录触发推荐的场景描述原文（用户输入）。
- `occasionTags` 为 AI 从场景描述中提取的结构化标签。
- `collageImageUrl` 为拼图式快速预览图的 URL。
- `tryOnImageUrl` 为 AI 虚拟试穿生成图的 URL（可为空，仅在用户请求时生成）。
- `aiReasoning` 记录 AI 选择这些单品的推荐理由。
- `isFavorite` 标记用户是否收藏了此方案。
- `lockedItemIds` 在迭代调整时，记录用户锁定不替换的单品 ID。
- 一次推荐可生成 1-3 个备选方案供对比。

## DO-DOM-007 — WearLog（穿搭日志）

用户确认今天实际穿着的搭配记录。

- 每条日志具有唯一 ULID 标识。
- `outfitComboId` 引用关联的 OutfitCombo（可为空，用户也可不基于推荐方案记录）。
- `itemIds` 记录实际穿着的衣物 ID 列表。
- `date` 为穿着日期。
- `occasion` 为场景描述。
- `notes` 为用户备注（可选）。
- 日志确认时自动递增关联 GarmentItem 的 `wearCount` 并更新 `lastWornAt`。
- 日志确认时自动更新 UserProfile 的 `sceneFrequencies`。

## DO-DOM-008 — 衣橱洞察

基于穿搭日志和衣物数据的分析洞察。

- **穿着频率统计**: 按 `wearCount` 和 `lastWornAt` 计算每件衣物的使用频率。
- **淘汰建议**: 超过 90 天未穿的 active 衣物标记为「建议淘汰」候选。90 天阈值可由用户自定义。
- **风格分析**: 统计衣橱中各 `styleTags` 的分布，与 UserProfile 的 `styleWeights` 对比。
- **缺口建议**: 当用户衣橱中某个高频场景所需的 category 或 styleTags 覆盖不足时，提示缺口（仅提示类型，不推荐购买链接）。
- **季节轮转**: 当季节变化时，提醒用户审视当季可用衣物。
- 洞察为被动查询，不主动推送通知（V1）。

## DO-DOM-009 — 数据存储与隐私

数据存储策略和隐私约束。

- V1 所有数据默认存储在本地（Daily Outfit 专属宿主 sqlite）。
- 用户可选择性开启云端同步，需先同意隐私协议。
- 隐私协议须明确告知: 自拍照片、衣物照片、穿搭记录将同步至云端。
- 云端同步开关为全局开关，不支持单项选择。
- 自拍照片和衣物照片存储为本地文件路径引用，云端同步时上传至对象存储。
