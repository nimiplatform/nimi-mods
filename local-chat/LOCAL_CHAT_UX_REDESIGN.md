# Local-Chat 体验重设计方案

## 给 Codex 的执行指引

本文档描述 local-chat 的**目标交互体验**。你的任务是对照当前代码现状，将 UI 层改造到本文描述的状态。

**核心原则**：
- 不改动底层引擎（hooks/turn-send/、hooks/runtime-route/、services/ 等保持不动）
- 只改 UI 组件层（components/ 下的文件）和 shell 编排
- 所有数据和能力已经存在，只是展示方式需要重新设计
- 每个角色的数据结构见 `components/layout/types.ts` 中的 `LocalChatTargetItem`，包含 id、displayName、handle、avatarUrl、bio、isOnline、latestLocalMessage、unreadCount 等

---

## 一、产品定位

Local-chat 不是即时通讯工具，是**私密的 AI 角色互动空间**。用户打开它，应该感觉自己走进了一个有角色存在的地方，而不是打开了一个收发消息的工具。

---

## 二、页面状态

整个 local-chat 只有两个主状态：

### 状态 A：角色选择（selectedTargetId 为空）

用户还没选择要和谁聊。这是 local-chat 的**首屏**。

**体验目标**：
- 用户看到一群角色，每个角色以**头像气泡**的形式呈现，不是传统列表
- 气泡带有柔和的荧光呼吸动画，像在"活着"
- 鼠标 hover 到气泡上时，气泡响应（放大、变亮），浮出角色名字和简介
- 有未读消息的角色，气泡边缘有呼吸光环，在呼唤用户
- 有主动联系消息的角色，气泡旁浮出消息预览片段
- 点击气泡，过渡进入该角色的聊天空间
- 聊过的角色气泡可以更大或更亮，体现亲密度
- 页面有简短引导文案

**不要做的**：
- 不要自动选中任何角色（即使 runtimeFields.agentId 存在，首屏也应该让用户自己选）
- 不要显示 4 步 onboarding 卡片
- 不要显示 runtime 状态检查
- 不要出现空白聊天区域或输入框

**可用数据**：
- `visibleTargets` 数组提供所有角色
- 每个角色有 `avatarUrl`、`displayName`、`bio`、`isOnline`、`unreadCount`、`latestLocalMessage`
- 角色的关系深度可以从 `activeInteractionSnapshot.relationshipState` 衍生（如果有的话），也可以简单用 `latestLocalMessageAt` 是否存在来区分"聊过/没聊过"

### 状态 B：角色聊天空间（selectedTargetId 非空）

用户已经选了一个角色，进入了这个角色的"空间"。

**从状态 A 到状态 B 的过渡**：
- 点击的气泡应有一个扩展/过渡动画，引导用户视觉焦点从气泡移动到聊天空间
- 不要硬切，要有连续感

---

## 三、聊天空间布局

进入角色空间后，用户应该感觉自己在这个角色的"房间"里，不是在一个通用的消息窗口。

### 顶部：角色在场区

当前的 header 是一个 44px 的功能条。需要改造为一个有**角色存在感**的区域：

**体验目标**：
- 角色头像显著地展示（比现在的 32px 大得多），居中或偏上
- 角色名字在头像附近
- 头像下方有角色的**拟人状态文案**：
  - 角色空闲时："安静地在这里"（或类似的、符合角色个性的文案）
  - 用户正在输入时："正在听你说..."
  - 角色正在生成回复时（isSending=true）："正在想..."
  - 角色正在生成图片时："正在画..."
  - 角色正在生成语音时："正在说..."
- 头像区域带有柔和的氛围光/底光，延续气泡选择页的荧光风格
- 返回按钮（回到气泡选择页）放在左上角
- 设置齿轮和会话切换放在右上角，视觉权重要轻

**关于氛围感**：
- 在场区域的氛围可以随对话状态微妙变化（颜色温度、光晕强度等），让用户感受到关系在演进
- 这不是必须的，但如果实现了会大大提升"角色活着"的感觉

**不要做的**：
- 不要在 header 区域放 voice mode 切换按钮
- 不要在 header 区域放 inspect/runtime sidebar 按钮（移到设置 drawer 底部）
- 不要显示技术信息（model name、route source 等）

### 中部：对话流

消息列表区域，但需要有更好的视觉表现。

**体验目标**：
- 对话内容不需要铺满整个宽度，保持聚焦的阅读宽度
- 角色消息从左侧出现，用户消息从右侧出现（这个已实现）
- 消息入场动画应该有节奏感，不是所有消息都用同一个 slide-up：
  - 文本消息：slide-up（当前行为，保留）
  - 图片/视频：scale-in（从略小放大到正常，带 fade）
  - 多拍连续消息：stagger 延迟（第 1 拍正常，后续拍依次延迟入场）
- 多拍投递是 local-chat 的核心差异化体验：
  - `deliveryStyle=natural` 时，各拍逐条投递，拍间应该重新出现 typing indicator
  - 用户应该能感受到"角色在一句一句地说"
- 媒体消息（图片/视频）应该比文字气泡更突出——可以用卡片形式、更大的展示面积
- 媒体生成中的状态应该用 shimmer 骨架卡片，不是简单的 spinner + 文字

**关于"首次对话"（无聊天历史时）**：
- 不显示 4 步 onboarding 卡片
- 显示角色的欢迎态：角色在场区域 + 一句引导文案（如"试试打个招呼？"）
- 输入框可用，用户直接开始聊

### 底部：输入区

**体验目标**：
- 简洁：麦克风按钮 + 输入框 + 发送按钮
- 附件/媒体快捷按钮可以收在输入框内的某个位置，不要占主要视觉
- 录音状态时，输入区域整体变化（红色脉冲边框 + 波形提示）
- 不要在输入区上方放 voice mode 切换条或 "Chatting with XXX" 信息——header 已经有了

---

## 四、侧边面板

### 设置 Drawer（点击齿轮图标，从右侧滑入）

当前实现基本合理，保持现有的分区结构（对话风格 / 语音 / 媒体 / 存在感）。

**需要改动**：
- 在设置 drawer **最底部**增加一个折叠区域"开发者工具"，里面放"打开 Inspect 面板"按钮
- Inspect/runtime sidebar 的入口从 header 移到这里
- 普通用户永远不需要看到 route/connector/model 这些概念

### 角色详情 Drawer（点击角色头像，从右侧滑入）

当前实现基本合理，保持现有结构（角色卡片 / 关系状态 / 记忆管理）。

### Runtime Inspect Sidebar（仅从设置 drawer 中的"开发者工具"进入）

**需要修复的崩溃问题**：
1. `media-route-panel.tsx` 中 `input.route` 可能为 null 但直接访问了 `.connectorId`——需要加空值保护
2. `runtime-status-sidebar.tsx` 中 `new Date(dependencyUpdatedAt).toLocaleTimeString()` 可能因无效日期值抛异常——需要 try-catch 或 fallback
3. 整个 RuntimeStatusSidebar 需要包一层 Error Boundary，任何子面板崩溃不应该影响主聊天区域

---

## 五、遮罩层与 Drawer 交互

当前任何 drawer 打开时会显示半透明遮罩，点击遮罩关闭所有 drawer。这个行为保留。

---

## 六、Runtime 未就绪的处理

**当前做法**（需要改掉）：在 onboarding 卡片中让用户主动检查 runtime 就绪状态。

**目标做法**：
- 用户正常选角色、正常打字、正常点发送
- 如果 runtime 没有就绪，在输入区域上方显示一条**内联提示**："本地运行时正在启动..."
- runtime 就绪后提示自动消失
- 用户永远不需要主动去"检查 runtime"
- 运行时的技术状态对用户透明

---

## 七、关系演进的可见性

当前关系状态（relationshipState、emotionalTemperature）藏在 Profile Drawer 深处，用户几乎不会打开。

**目标**：
- 通过角色在场区域的**氛围变化**（颜色、光晕强度）让用户感受到关系在变化
- 不需要显式显示"关系状态：温热"这样的文字，而是让氛围自然传达
- 在气泡选择页，聊过的角色气泡更大或更亮
- 如果用户好奇，点角色头像进详情 drawer 可以看到具体信息

---

## 八、自动选择角色的策略调整

当前 `use-local-chat-targets.ts` 中的 auto-selection 逻辑：
1. 如果 runtimeFields.agentId 存在 → 自动选中
2. 如果 localStorage 有记录 → 恢复上次的角色
3. 否则不选

**需要调整为**：
- **首次打开**（没有 localStorage 记录）：不自动选中，显示气泡选择页
- **回访用户**（有 localStorage 记录）：可以自动恢复上次角色，直接进入聊天空间
- **runtimeFields.agentId**：不应该作为自动选中的依据（这是技术配置，不是用户意图）

---

## 九、错误处理

- 发送失败：消息气泡上显示重试提示，不是全局 toast
- 媒体生成失败：骨架卡片变为错误卡片
- 语音识别失败：输入栏上方内联提示，几秒后消失
- 侧栏组件崩溃：Error Boundary 捕获，显示简单的错误提示，不影响主聊天区

---

## 十、不在本次范围内的事项

以下内容不需要在这次改动中处理：
- 底层 hooks 和服务层代码（turn-send pipeline、runtime-route、speech settings 等）
- 暗色主题
- 实时语音对话
- 消息微交互（长按菜单、消息反应、复制、重新生成）
- 全屏闪退问题（这是 Tauri Rust 层的问题，不在 local-chat 范围内）

---

## 现有代码结构参考

改动主要涉及以下文件：

| 文件 | 改动性质 |
|------|---------|
| `components/local-chat-shell.tsx` | 重构：两个主状态切换（气泡页 vs 聊天空间），drawer 编排调整 |
| `components/layout/local-chat-header.tsx` | 重构：从功能条改为角色在场区域 |
| `components/layout/local-chat-message-pane.tsx` | 重构：移除 onboarding 卡片，改造消息流视觉，简化输入区 |
| `components/layout/local-chat-target-pane.tsx` | 重构或替换：从列表改为气泡布局 |
| `components/chat-bubbles.tsx` | 增强：消息入场动画差异化 |
| `components/chat-animations.tsx` | 新增：气泡荧光、hover 响应、过渡动画、氛围光等动画定义 |
| `components/layout/local-chat-settings-drawer.tsx` | 小改：底部增加"开发者工具"折叠区 |
| `components/runtime-status-sidebar.tsx` | 修复：空值保护 + Error Boundary |
| `components/sidebar/media-route-panel.tsx` | 修复：input.route 空值保护 |
| `hooks/use-local-chat-targets.ts` | 小改：调整自动选择策略 |

Shell 层的 props 接口（`shell-props.ts`）可能需要扩展，但所有数据源已经存在于 `LocalChatShellProps` 中。
