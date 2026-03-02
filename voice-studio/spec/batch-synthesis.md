# Batch Synthesis

> Domain: Voice Studio / Batch Synthesis
> Covers: Step 4 (Synthesize)

## 0. Normative Imports

| Kernel Location | Rule IDs |
|---|---|
| `kernel/entity-contract.md` | VS-ENT-007, VS-ENT-008, VS-ENT-009 |
| `kernel/pipeline-contract.md` | VS-PIPE-003 |
| `kernel/synthesis-contract.md` | VS-SYNTH-001 ~ VS-SYNTH-007 |
| `kernel/tables/job-states.yaml` | idle → running → done / done_with_errors |
| `kernel/tables/error-codes.yaml` | VS_SYNTH_* |

## 1. Scope

本文档描述批量 TTS 合成的执行引擎、并发调度、存储策略和 UI 交互。

## 2. 合成引擎

### 2.1 Job 初始化

点击「开始合成」时：

1. 创建 SynthesisJob，状态 = `idle`。
2. 为 Script 中的每个 ScriptSegment 创建一个 SegmentJob（状态 = `pending`）。
3. 对每个 SegmentJob，根据 segment.speaker 查找 VoiceCasting，绑定合成参数。
4. SynthesisJob 状态 → `running`，开始调度。

### 2.2 调度循环

```
while (有 pending 的 SegmentJob):
  if (当前运行中的 job 数 < maxConcurrency):
    取出下一个 pending SegmentJob（按 segment.index 顺序）
    执行合成（异步）
  else:
    等待任意一个运行中的 job 完成

当全部 SegmentJob 非 pending 且非 running:
  if (全部 done): SynthesisJob → done
  if (存在 failed): SynthesisJob → done_with_errors
```

### 2.3 单个 Segment 合成

```typescript
async function synthesizeSegment(segment: ScriptSegment, casting: VoiceCasting): Promise<void> {
  const result = await hook.llm.speech.synthesize({
    text: segment.text,
    voiceId: casting.voiceId,
    providerId: casting.providerId,
    format: 'mp3',
    speakingRate: casting.speakingRate,
    pitch: casting.pitch,
    emotion: segment.emotion ?? casting.emotion,
  });
  // Store result.audioUri to IndexedDB
  // Update SegmentJob: status = done, audioUri, durationMs
}
```

## 3. 并发控制 (VS-SYNTH-002)

| 参数 | 默认值 | 可配置 |
|------|--------|--------|
| maxConcurrency | 3 | 是（项目设置，1-5） |

- 滑动窗口模式：一个完成立即启动下一个。
- Provider 层限流由 runtime 处理，mod 不需要关心。

## 4. 失败重试 (VS-SYNTH-003)

| 参数 | 值 |
|------|---|
| maxRetries | 2（共 3 次尝试） |
| 退避策略 | 1s → 3s |

```
attempt 1: 立即执行
attempt 2: 等待 1s 后重试
attempt 3: 等待 3s 后重试
attempt 3 仍失败: SegmentJob → failed
```

失败后不阻塞队列，继续执行下一个 pending segment。

## 5. 存储 (VS-SYNTH-004)

### 5.1 音频存储

| Key 格式 | Value | 存储位置 |
|----------|-------|---------|
| `vs:audio:{projectId}:{segmentId}` | base64 data URI (mp3) | IndexedDB |

### 5.2 Job 状态存储

| Key 格式 | Value | 存储位置 |
|----------|-------|---------|
| `vs:job:{projectId}` | SynthesisJob JSON | IndexedDB |

### 5.3 存储空间估算

| 场景 | Segment 数 | 平均音频大小 | 总存储 |
|------|-----------|-------------|--------|
| 短篇 (5万字) | ~500 | 100KB | ~50MB |
| 中篇 (20万字) | ~2,000 | 100KB | ~200MB |
| 长篇 (50万字) | ~5,000 | 100KB | ~500MB |

IndexedDB 通常允许 1GB+ 存储，长篇小说在容量范围内。

## 6. 增量合成 (VS-SYNTH-005)

### 6.1 修改声线触发增量合成

用户从 Step 5 回到 Step 3 修改角色 A 的声线后：
1. 找到所有 `speaker = A` 的 SegmentJob。
2. 将这些 SegmentJob 状态重置为 `pending`。
3. 清空对应的 IndexedDB 音频数据。
4. 其他角色的 SegmentJob 和音频不受影响。
5. SynthesisJob 状态 → `running`，仅执行 pending 的 segment。

### 6.2 修改文本触发增量合成

用户修改某个 segment 的文本后：
1. 该 SegmentJob 状态重置为 `pending`。
2. 清空对应的 IndexedDB 音频数据。
3. SynthesisJob 状态 → `running`，仅执行该 segment。

## 7. 进度追踪 (VS-SYNTH-006)

### 7.1 事件推送

```typescript
hook.event.publish('vs:synthesis:progress', {
  projectId: string,
  completed: number,
  total: number,
  failed: number,
  currentChapterIndex: number,
  estimatedRemainingMs: number,
});
```

- 每完成/失败一个 segment 推送一次。
- `estimatedRemainingMs` = (remaining segments) × (average segment synthesis time)。

### 7.2 UI 展示

- 总进度条：`completed / total`
- 章节级进度：每章显示完成比例
- 失败计数 + 查看详情入口
- 预计剩余时间

## 8. 用户操作

| 操作 | 效果 |
|------|------|
| 暂停 | 等待当前执行中的 segment 完成后停止调度 |
| 恢复 | 继续调度 pending segment |
| 取消 | 中止全部调度，已完成的保留 |
| 重试失败项 | 将全部 failed SegmentJob 重置为 pending，恢复调度 |
