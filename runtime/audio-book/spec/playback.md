# Playback

> Domain: Audio Book / Playback
> Covers: Step 5 (Play)

## 0. Normative Imports

| Kernel Location | Rule IDs |
|---|---|
| `kernel/entity-contract.md` | VS-ENT-008, VS-ENT-009 |
| `kernel/pipeline-contract.md` | VS-PIPE-007 |
| `kernel/tables/reason-codes.yaml` | AB_PLAY_* |

## 1. Scope

本文档描述有声书播放器的行为规范，包括 segment 队列播放、文本跟读同步、章节导航和导出功能。

## 2. Segment 队列播放

### 2.1 播放引擎

播放器不预拼接音频，而是维护一个 segment 播放队列：

```
播放状态:
  currentChapterIndex: number
  currentSegmentIndex: number  (在当前章节内的位置)
  isPlaying: boolean
  playbackPosition: number     (当前 segment 内的播放进度, ms)

播放循环:
  1. 从 host files 读取当前 segment 的音频字节
  2. 用 Audio API 播放 (new Audio(audioUri))
  3. 播放结束时，自动前进到下一个 segment
  4. 当前章节全部 segment 播放完毕后，自动切换到下一章节
  5. 全书最后一个 segment 播放完毕后，停止
```

### 2.2 预加载

- 播放当前 segment 时，预加载下一个 segment 的 audioUri。
- 预加载仅限 1 个 segment ahead（避免内存占用过大）。

### 2.3 播放控制

| 控件 | 行为 |
|------|------|
| 播放/暂停 | 暂停当前 segment 播放，保持位置 |
| 上一段 | 跳到上一个 segment 开头 |
| 下一段 | 跳到下一个 segment 开头 |
| 进度条拖动 | 在当前章节内定位（按 segment 粒度跳转） |
| 章节选择 | 跳到目标章节的第一个 segment |

## 3. 文本跟读同步

### 3.1 显示规则

文本跟读区域按 segment 顺序渲染当前章节的全部文本：

文本来源规则（强约束）：
- 播放器渲染文本时，必须优先使用 `SourceChapter.rawText.slice(segment.startOffset, segment.endOffset)`。
- `segment.text` 仅作为冗余字段，不可作为唯一真值来源。
- 若 offset 缺失或越界，播放器应降级并提示数据异常（记录 `VS_TEXT_FIDELITY_MISMATCH` 上下文）。

```
[旁白段落]
  无角色标签，正常字体

[对话段落]
  ┌─ 角色名（带角色颜色标记）──────────┐
  │ "对话文本内容"                       │
  └─────────────────────────────────────┘

[内心独白段落]
  ┌─ 角色名（带角色颜色标记）──────────┐
  │ 斜体显示独白内容                     │
  └─────────────────────────────────────┘
```

### 3.2 高亮与滚动

- 当前播放的 segment 高亮显示（背景色变化）。
- 文本区域自动滚动，保持当前 segment 在视口中心偏上位置。
- 滚动行为：smooth scroll，避免跳跃感。

### 3.3 角色颜色

- 每个角色分配一个固定颜色（从预定义色板中按角色出场顺序分配）。
- 色板需保证：
  - 相邻角色颜色区分度高
  - 与背景色对比度充足
  - 至少支持 12 种不同颜色
- 旁白（narrator）使用默认文本颜色，无特殊标记。
- 页面底部显示角色颜色图例。

### 3.4 点击跳转

- 用户点击文本区域中的任意 segment → 跳转到该 segment 开始播放。
- 点击后自动开始播放（如果当前是暂停状态）。

## 4. 章节导航

### 4.1 章节列表

播放器侧边或下方显示章节列表：

| 信息 | 说明 |
|------|------|
| 章节标题 | SourceChapter.title |
| 时长 | AudioOutput.totalDurationMs 格式化 |
| 状态图标 | ● 当前播放 / ✓ 已完成 / ○ 未播放 / ⚠ 有失败段落 |

### 4.2 部分完成的章节

- 如果某章有 failed segment，该章仍可播放（跳过失败段落）。
- 跳过时在文本区域标记「此段落合成失败」占位。

## 5. 全书进度

| 指标 | 计算方式 |
|------|---------|
| 总时长 | 所有 done segment 的 durationMs 之和 |
| 当前位置 | 已播放章节时长 + 当前章节已播放时长 |
| 进度百分比 | 当前位置 / 总时长 |

## 6. 导出（可选，Web Audio 拼接）

### 6.1 章节导出

用户可选择导出单个章节的完整音频：

1. 从 host files 读取该章节全部 segment 的音频字节。
2. 使用 Web Audio API 依次 decode 为 AudioBuffer。
3. 创建合并的 AudioBuffer（按 segment 顺序拼接）。
4. Encode 为 mp3/wav。
5. 触发浏览器下载。

### 6.2 限制

- 长章节（> 100 个 segment）可能导致内存压力。
- 导出为 V1 的可选功能，核心体验基于在线播放。
- 全书导出暂不支持（内存限制），后续版本可分章节逐一导出。

## 7. 后续迭代方向

- 背景音乐层（低优先级）
- 段间停顿控制（角色切换时插入可配置的静音间隔）
- 播放速率调整（全局 0.5x - 2.0x）
- 书签功能（标记位置，下次打开从书签处继续）
