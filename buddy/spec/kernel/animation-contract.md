# 动画合约

> Owner Domain: `BD-ANIM-*`

## BD-ANIM-001 动画插件架构

AnimationController 采用插件式帧更新管线，每帧按优先级顺序执行：

1. 插件通过 `register(plugin)` 注册，声明 `priority` 和 `update(dt)` 方法
2. 高优先级插件先执行（priority 数值越小越先执行）
3. 插件可标记参数更新为 "handled"，阻止低优先级插件覆盖同一参数
4. 所有插件在 `requestAnimationFrame` 循环中执行

内置插件执行顺序：

| 优先级 | 插件 | 参数 |
|--------|------|------|
| 10 | LipSync | ParamMouthOpenY |
| 20 | ExpressionDriver | 多参数（见 BD-ANIM-004） |
| 30 | AutoBlink | ParamEyeLOpen, ParamEyeROpen |
| 40 | EyeSaccade | ParamEyeBallX, ParamEyeBallY |
| 50 | IdleBreath | ParamBreath |

## BD-ANIM-002 自动眨眼

自动眨眼插件模拟自然眨眼节律：

1. 眨眼间隔: 3-6 秒随机（均匀分布）
2. 闭合阶段: 80ms（EyeOpen 1.0 → 0.0，easeInQuad）
3. 保持阶段: 40ms（EyeOpen = 0.0）
4. 打开阶段: 120ms（EyeOpen 0.0 → 1.0，easeOutQuad）
5. 左右眼同步眨眼（ParamEyeLOpen 和 ParamEyeROpen 同值）
6. 当 ExpressionDriver 设置 EyeSmile > 0 时，眨眼上限为 EyeSmile 值（不完全闭合）

## BD-ANIM-003 眼球微动

眼球微动插件模拟自然注视漂移：

1. 注视点在 [-0.5, 0.5] 范围内随机生成
2. 切换间隔: 800ms-3000ms 随机（偏向短间隔的指数分布）
3. 插值方式: `lerp(current, target, 0.08)` 每帧平滑过渡
4. 驱动参数: ParamEyeBallX, ParamEyeBallY
5. 当用户鼠标/触摸在 Canvas 内时，注视点偏向指针位置（权重 0.3）

## BD-ANIM-004 表情驱动

表情驱动插件根据情绪标签设置参数组合：

1. 情绪到参数的映射定义在 `tables/emotion-map.yaml`
2. 切换过渡时间: 300ms（easeInOutCubic）
3. 所有参数通过 `lerp(current, target, progress)` 平滑过渡
4. 瞬时情绪（surprised、excited）在持续时间后自动回退到 happy
5. 持续情绪（happy、sad、thinking、sleepy）保持直到下一个情绪标签

## BD-ANIM-005 呼吸动画

呼吸动画提供持续的生命感：

1. 驱动参数: ParamBreath
2. 波形: `sin(t * 2π / period) * 0.5 + 0.5`
3. 周期: 3.5 秒
4. 始终运行，不受其他插件影响

## BD-ANIM-006 口型同步

口型同步插件将音频分析结果映射到嘴型参数：

1. wLipSync MFCC 分析输出 6 类音素权重: A, E, I, O, U, S (silence)
2. 取最大权重音素，映射到 ParamMouthOpenY:
   - A: 1.0, E: 0.7, I: 0.5, O: 0.8, U: 0.6, S: 0.0
3. 平滑窗口: 攻击 50ms, 释放 80ms（指数插值）
4. 音量归一化: 低于阈值时 MouthOpenY 强制为 0（消除噪声）
5. 无音频输入时自动归零

## BD-ANIM-007 物理模拟委托

头发/配饰物理由 Live2D Cubism SDK 内置物理引擎驱动：

1. 物理参数定义在模型的 .physics3.json 中
2. 输入源: ParamAngleX/Y/Z（头部角度变化触发物理响应）
3. Buddy 不自行实现物理模拟，完全委托给 SDK
4. 不同模型的物理链数量和行为由模型文件决定
