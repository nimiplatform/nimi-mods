# Synthesis Contract

> Owner Domain: `VS-SYNTH-*`
> Authoritative fact source: `tables/job-states.yaml`, `tables/error-codes.yaml`

本合约定义批量 TTS 合成的执行策略、并发控制与错误处理规则。

---

## VS-SYNTH-001 — 批量合成执行策略

- 合成以 **segment** 为最小执行单位，每个 segment 独立调用 `hook.llm.speech.synthesize()`。
- 合成顺序：按章节顺序 → 章节内按 segment 顺序。
- 每个 segment 的合成参数由其 speaker 关联的 VoiceCasting 决定：
  - `voiceId` / `providerId` / `speakingRate` / `pitch` / `emotion`
  - segment 自身的 `emotion` 字段（如有）覆盖角色默认 emotion。

## VS-SYNTH-002 — 并发控制

- 最大并发合成数：**3**（可配置，默认 3）。
- 使用滑动窗口模式：一个 segment 完成后立即启动下一个 pending segment。
- 同一 provider 的并发请求不超过 provider 限制（依赖 runtime 的 provider 层限流）。
- 用户可暂停/恢复合成任务，暂停时等待当前执行中的 segment 完成后停止。

## VS-SYNTH-003 — 失败重试与错误分类

错误分为两类，决定是否重试：

| 分类 | 描述 | 重试策略 | 示例 |
|------|------|---------|------|
| **transient** | 瞬态错误，可能自行恢复 | 自动重试，指数退避 | 网络超时、provider 暂时不可用、rate limit |
| **permanent** | 永久错误，重试无意义 | 立即标记 failed，不重试 | 无效 voiceId、文本超长、provider 不支持该 voice |

- transient 错误：最大重试次数 **2**（共 3 次尝试），退避间隔 `1s → 3s`。
- rate limit 错误（VS_SYNTH_PROVIDER_RATE_LIMITED）：退避间隔加长至 `5s → 15s`。
- permanent 错误：`retryCount` 不递增，直接 `failed`。
- 超过重试上限后，该 segment 标记为 `failed`，不阻塞后续 segment 合成。
- 全部 segment 执行完毕后，若存在 failed 项：
  - 任务状态为 `done_with_errors`（而非 `failed`）。
  - 用户可一键「重试全部失败项」。

## VS-SYNTH-004 — 音频存储

- 合成成功的音频以 **Blob** 对象存储于 IndexedDB（非 base64 字符串，避免 ~33% 体积膨胀）。
- 存储 key 格式：`vs:audio:{projectId}:{segmentId}`。
- 播放时从 IndexedDB 读取 Blob → `URL.createObjectURL()` → 传给 Audio API。
- 播放完毕后 `URL.revokeObjectURL()` 释放内存。
- 音频格式默认 `mp3`（体积与质量的平衡）。
- 单个项目的音频总存储量可能达到数百 MB，IndexedDB 容量由浏览器动态分配（通常上限 > 1GB）。

## VS-SYNTH-005 — 增量合成

- 修改某个角色的声线后，仅需重新合成该角色的全部 segment。
- 修改某个 segment 的文本后，仅需重新合成该单个 segment。
- 增量合成时，未受影响的 segment 音频保留不动。
- 重新合成的 segment 覆盖 IndexedDB 中的旧音频。

## VS-SYNTH-006 — 进度追踪

- 合成进度通过 `hook.event.publish('vs:synthesis:progress', payload)` 实时推送。
- Payload 格式：
  ```
  { projectId, completed, total, failed, currentChapterIndex, estimatedRemainingMs }
  ```
- `estimatedRemainingMs` 基于已完成 segment 的平均合成耗时计算。
- UI 展示：总进度条 + 章节级进度 + 失败计数。

## VS-SYNTH-007 — 合成取消

- 用户可随时取消正在执行的合成任务。
- 取消时：
  - 正在执行的 segment 请求尝试中止（通过 AbortSignal）。
  - 已完成的 segment 音频保留。
  - pending 的 segment 保持 pending 状态。
  - 任务状态转为 `cancelled`。
- 取消后可从断点恢复（重新开始合成，跳过已完成的 segment）。
