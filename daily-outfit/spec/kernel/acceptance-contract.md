# Daily Outfit 验收契约

> 所有者领域: `DO-ACC-*`

## DO-ACC-001 表驱动验收

验收矩阵的权威数据在 `tables/acceptance-cases.yaml` 中维护。

## DO-ACC-002 必要覆盖范围

最低验收覆盖必须包括:

1. Onboarding 完成后生成有效的 UserProfile
2. 拍照上传后 AI 分类产出合理的 GarmentItem 字段
3. 场景输入后生成至少一套可用的 OutfitCombo
4. 迭代调整时锁定单品不被替换
5. 收藏方案后 isFavorite 持久化且 styleWeights 更新
6. 穿搭日志确认后 wearCount 和 lastWornAt 正确更新
7. 虚拟试穿失败时降级到拼图预览不阻塞流程
8. 衣橱洞察正确识别超过阈值未穿的衣物
9. 数据本地存储且云端同步开关生效
10. 隐私协议未同意时不启动云端同步
