# 管线合约

> Owner Domain: `BD-PIPE-*`

## BD-PIPE-001 文字对话管线

文字对话管线是确定性的，从输入到角色响应：

1. 接收用户输入（文字或 STT 转写文本）
2. 编译上下文包（system prompt + 对话历史 + 情绪指令）
3. `runtime.ai.text.stream()` 生成助手回复
4. 从回复中提取情绪标签 `[emotion:xxx]`
5. 文字气泡流式显示（剥离情绪标签后的纯文本）
6. 情绪标签传递给 AnimationController 驱动表情切换

## BD-PIPE-002 语音合成管线

TTS 合成与口型同步并行执行：

1. 在当前 TTS route / model 上查询 voice 目录，解析一个可用 voice（用户显式选择优先）
2. 助手回复文本提交到 `runtime.media.tts.stream()`；流式失败时回退到 `tts.synthesize()`
3. TTS 返回可播放音频后立即开始播放
4. 播放期间角色进入 speaking 状态，优先播放 speaking + emotion motion
5. 音频播放同时喂入 `AudioWorkletProcessor` 做 MFCC / 频带能量分析
6. Worklet 输出 `A/E/I/O/U/S` 音素权重，并实时驱动 `ParamMouthOpenY`
7. 当 Worklet 不可用时，允许回退到 `AnalyserNode` RMS 音量驱动
8. 播放结束后退出 speaking 状态并回到 idle
9. TTS 失败不阻塞文字显示（静默降级为纯文字）

## BD-PIPE-003 语音输入管线

语音输入使用浏览器 MediaRecorder + runtime STT：

1. 用户按住语音按钮开始录制（`getUserMedia({ audio: true })`）
2. MediaRecorder 以 250ms chunk 录制
3. 释放按钮后提交 `runtime.media.stt.transcribe(audioBlob)`
4. 转写文本进入 BD-PIPE-001 文字对话管线
5. STT 失败显示用户可读错误提示

## BD-PIPE-004 情绪提取管线

LLM 回复中的情绪标签使用确定性正则提取：

1. 匹配模式: `\[emotion:(happy|sad|surprised|thinking|excited|sleepy)\]`
2. 首个匹配的标签作为本轮情绪
3. 无匹配时默认为 `happy`（儿童陪伴场景默认积极）
4. 标签从显示文本中剥离，用户不可见
5. 情绪值传递给 `BD-ANIM-004 表情驱动`

## BD-PIPE-005 模型加载管线

Live2D 模型加载是异步的，有确定性状态机：

1. `idle` → 用户选择模型或使用默认模型
2. `loading` → 创建 PIXI.Application + 加载 .model3.json
3. `ready` → 模型就绪，启动动画插件
4. `error` → 加载失败，显示回退 UI + 重试按钮

状态转移：
- `idle → loading`: 触发模型选择
- `loading → ready`: 模型资源全部加载成功
- `loading → error`: 任何资源加载失败
- `error → loading`: 用户点击重试
- `ready → loading`: 用户切换模型

## BD-PIPE-006 对话会话管线

会话生命周期管理：

1. 进入 Buddy 页面自动创建或恢复上一个会话
2. 对话历史保留最近 20 轮（用户 + 助手各算一轮）
3. 会话数据持久化到 mod-state
4. 切换模型不清除对话历史
