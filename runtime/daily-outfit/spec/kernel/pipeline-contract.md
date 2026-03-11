# Daily Outfit 流水线契约

> 所有者领域: `DO-PIPE-*`

---

## DO-PIPE-001 Onboarding 流水线

用户首次使用时的画像建立流程。

1. **基础信息采集** (`onboarding-basics`): 收集 gender 和 ageGroup。
2. **自拍上传** (`onboarding-selfie`): 用户上传自拍照片，AI 分析肤色和体型特征作为推荐参考。
3. **风格测试** (`onboarding-style-test`): 根据 gender 和 ageGroup 筛选 10-20 个 StyleSample 展示，用户逐一做 like/dislike/skip 选择。
4. **场景频率** (`onboarding-scene-freq`): 用户选择日常高频场景并设定频率权重。
5. **画像生成** (`onboarding-profile-gen`): 聚合测试结果，生成 UserProfile 的 styleWeights 和 sceneFrequencies 初始值。

- 每一步均可回退到上一步修改。
- 用户可跳过风格测试和场景频率步骤，此时 styleWeights 和 sceneFrequencies 均为空映射，AI 推荐时不附加偏好权重。
- Onboarding 完成后可随时在设置中重新进行。

## DO-PIPE-002 衣物录入流水线

用户拍照录入衣物到衣橱的流程。

1. **照片上传** (`garment-photo-upload`): 用户拍照或从相册选择，支持单张或多张。
2. **AI 视觉分类** (`garment-ai-classify`): 调用视觉模型分析照片，输出分类建议（category、subcategory、colors、material、styleTags、seasons、formalityLevel）。
3. **去背景处理** (`garment-thumbnail-gen`): 对识别的衣物区域做去背景处理，生成 thumbnailUrl。
4. **用户确认/修正** (`garment-user-confirm`): 展示 AI 分类结果，用户可修正任意字段。
5. **入库** (`garment-save`): 确认后创建 GarmentItem 写入本地存储。

- 单张照片可包含多件衣物（如平铺拍摄），AI 应逐件识别并为每件生成独立的 GarmentItem。
- 分类失败时保留原始照片，允许用户全手动填写分类。

## DO-PIPE-003 穿搭推荐流水线

从场景输入到生成搭配方案的流程。

1. **场景输入** (`recommend-scene-input`): 用户输入场景描述文本（如"见客户"、"爬山"）。
2. **场景分析** (`recommend-scene-analyze`): AI 解析场景，提取结构化标签（正式程度、场合类型、天气/环境暗示等）。
3. **衣橱筛选** (`recommend-wardrobe-filter`): 根据场景标签和季节，从 active 衣物中筛选候选池。
4. **AI 搭配** (`recommend-ai-match`): AI 结合候选池、UserProfile styleWeights（软权重）、场景分析结果，生成 1-3 套搭配方案。每套方案包含 itemIds、推荐理由 (aiReasoning)。
5. **拼图预览** (`recommend-collage-gen`): 客户端拼接选中单品的 thumbnailUrl 生成拼图式预览。
6. **方案输出** (`recommend-output`): 展示方案列表供用户选择。

- 衣橱中衣物不足以覆盖完整搭配时（如无合适鞋子），AI 应在 aiReasoning 中说明缺失项。
- 候选池筛选后为空时，返回 `DAILY_OUTFIT_WARDROBE_INSUFFICIENT` 错误并建议放宽条件。

## DO-PIPE-004 虚拟试穿流水线

在用户自拍上叠加穿搭方案的预览图生成。

1. **试穿请求** (`tryon-request`): 用户对某个 OutfitCombo 点击「虚拟试穿」。
2. **素材准备** (`tryon-prepare`): 收集 UserProfile.selfieUrl 和方案中各 GarmentItem 的 thumbnailUrl。
3. **AI 图像生成** (`tryon-generate`): 调用图像生成能力，输入自拍 + 衣物缩略图，生成虚拟试穿效果图。
4. **结果展示** (`tryon-display`): 展示生成的试穿图，写入 OutfitCombo.tryOnImageUrl。

- 虚拟试穿为可选步骤，不是推荐流水线的必经路径。
- 生成失败时展示错误提示，保留拼图预览作为降级方案。

## DO-PIPE-005 迭代调整流水线

对已生成的方案进行局部替换。

1. **锁定选择** (`refine-lock`): 用户选择要保留的单品（如"这件上衣不错"），记入 OutfitCombo.lockedItemIds。
2. **替换请求** (`refine-request`): 用户指定要替换的 category 或具体单品。
3. **AI 重新搭配** (`refine-ai-rematch`): AI 在 lockedItemIds 约束下，从候选池中为未锁定位置重新搭配。
4. **预览更新** (`refine-preview-update`): 重新生成拼图预览和/或虚拟试穿图。

- 锁定的单品在重新搭配时不可被替换。
- 可多轮迭代，每轮的 lockedItemIds 可累加或减少。

## DO-PIPE-006 收藏与日志流水线

方案收藏和穿搭记录的流程。

1. **收藏方案** (`collection-favorite`): 用户标记 OutfitCombo.isFavorite = true。收藏时自动更新 UserProfile.styleWeights（对应风格 +0.1）。
2. **记录穿搭** (`log-wear`): 用户确认今天实际穿了某个方案（或手动选择衣物），创建 WearLog。
3. **数据更新** (`log-update-stats`): 日志确认后自动递增衣物 wearCount、更新 lastWornAt、更新 sceneFrequencies。
4. **拒绝方案** (`collection-reject`): 用户明确拒绝某方案时，对应风格 styleWeights -0.05。

## DO-PIPE-007 洞察分析流水线

衣橱数据分析的查询流程。

1. **触发查询** (`insight-trigger`): 用户进入洞察页面。
2. **数据聚合** (`insight-aggregate`): 扫描所有 active 衣物的 wearCount、lastWornAt，聚合统计。
3. **淘汰候选** (`insight-retire-candidates`): 筛选超过阈值未穿的衣物。
4. **风格分布** (`insight-style-distribution`): 统计衣橱 styleTags 分布，对比 UserProfile.styleWeights。
5. **缺口检测** (`insight-gap-detection`): 检测高频场景所需但衣橱中缺乏覆盖的 category/styleTags。
6. **结果展示** (`insight-display`): 以可视化方式呈现洞察结果。

## DO-PIPE-008 云端同步流水线

本地优先存储下的可选云端同步流程。

1. **同步触发** (`sync-trigger`): 用户开启云端同步或数据变更后触发同步检查。
2. **同步资格校验** (`sync-eligibility-check`): 校验云端同步开关和隐私同意状态，未满足条件时直接停留本地。
3. **云端同步** (`cloud-sync`): 将允许同步的数据上传到云端存储。
4. **结果落账** (`sync-settle`): 成功时记录最近同步状态；失败时保留本地数据并等待下次重试。

- 云端同步为可选链路，关闭开关时不得发起任何云端请求。
- 未同意隐私协议时不得进入 `cloud-sync`。
- `cloud-sync` 失败为非阻塞错误，不能回滚已存在的本地数据。
