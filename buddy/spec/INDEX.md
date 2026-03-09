# Buddy Spec Index

> Status: Draft
> Date: 2026-03-09

## 概述

Buddy 是一个 Live2D 儿童互动陪伴 mod，在桌面端渲染卡通角色，通过文字和语音与儿童用户互动。角色具备眨眼、眼球微动、呼吸、口型同步和情绪表情等动画能力。

## 结构

- Kernel 规则: `spec/kernel/*.md`
- 事实表: `spec/kernel/tables/*.yaml`
- 生成视图: `spec/kernel/generated/*.md`
- 领域增量: `spec/buddy.md`

## 任务导向阅读路径

### 修改能力和 SDK 边界

1. `spec/kernel/capability-contract.md`
2. `spec/kernel/tables/capabilities.yaml`
3. `spec/buddy.md`

### 修改对话/语音管线

1. `spec/kernel/pipeline-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml`
3. `spec/buddy.md`

### 修改动画系统

1. `spec/kernel/animation-contract.md`
2. `spec/kernel/tables/animation-params.yaml`
3. `spec/kernel/tables/emotion-map.yaml`
4. `spec/buddy.md`

### 修改模型目录

1. `spec/kernel/tables/model-catalog.yaml`
2. `spec/kernel/capability-contract.md` (BD-CAP-005)
3. `spec/buddy.md`

### 修改儿童安全规则

1. `spec/kernel/safety-contract.md`
2. `spec/buddy.md`

### 修改失败语义

1. `spec/kernel/error-model.md`
2. `spec/kernel/tables/reason-codes.yaml`
3. `spec/buddy.md`

### 修改验收门控

1. `spec/kernel/acceptance-contract.md`
2. `spec/kernel/tables/acceptance-cases.yaml`

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 角色渲染方案 | Live2D (Pixi.js + pixi-live2d-display) | 2D 卡通适合儿童，资源轻量，表现力足够 |
| 口型同步方案 | wLipSync (WASM + AudioWorklet) | 浏览器原生运行，AIRI 项目验证过，无需 GPU |
| 情绪提取方式 | LLM 回复内嵌标签 + 正则提取 | 确定性强，不需要额外模型调用 |
| 语音方案 | runtime TTS/STT（不用模型自带 .wav） | 可说任意内容，不受预录音频限制 |
| 物理模拟 | 委托 Cubism SDK 内置引擎 | 模型自带 physics3.json 已定义好物理链 |
| 动画架构 | 插件式帧更新管线 | 可扩展、可独立测试、优先级可控 |
| 样例模型 | Haru 完整版（开发阶段） | 43 参数 + 8 表情 + 物理 + 动作，功能覆盖全 |
| 默认情绪 | happy | 儿童陪伴场景应默认积极 |

## 验证

1. `pnpm -C nimi-mods run generate:spec:buddy-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:buddy-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:buddy-kernel-consistency`
