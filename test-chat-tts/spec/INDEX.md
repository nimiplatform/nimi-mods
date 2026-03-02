# Test-Chat-TTS Spec Index

> Status: Draft
> Date: 2026-03-02

## Structure

- Kernel rules: `spec/kernel/*.md`
- Fact tables: `spec/kernel/tables/*.yaml`
- Generated views: `spec/kernel/generated/*.md`
- Domain increments: `spec/test-chat-tts.md`

## Task-Oriented Read Path

### Change diagnostics capability contract

1. `spec/kernel/capability-contract.md`
2. `spec/kernel/tables/capabilities.yaml`
3. `spec/test-chat-tts.md`

### Change minimal chat/tts flow

1. `spec/kernel/pipeline-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml`
3. `spec/test-chat-tts.md`

### Change error semantics and acceptance

1. `spec/kernel/error-model.md`
2. `spec/kernel/acceptance-contract.md`
3. `spec/kernel/tables/reason-codes.yaml`
4. `spec/kernel/tables/acceptance-cases.yaml`

## Verification

1. `pnpm -C nimi-mods run generate:spec:test-chat-tts-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:test-chat-tts-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:test-chat-tts-kernel-consistency`
