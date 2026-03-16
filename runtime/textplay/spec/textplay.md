# TextPlay Domain Spec

> Status: Draft
> Date: 2026-03-13
> Scope: Text renderer increments only.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`T-CAP-*`)
- Fact projection: `kernel/fact-projection-contract.md` (`T-FACT-*`)
- Render pipeline: `kernel/pipeline-contract.md` (`T-PIPE-*`)
- Run orchestration and recovery: `kernel/run-orchestration-contract.md` (`T-RUN-*`)
- Visibility and POV: `kernel/visibility-pov-contract.md` (`T-VIS-*`)
- Presence state machine: `kernel/presence-contract.md` (`T-PRES-*`)
- Error semantics: `kernel/error-model.md` (`T-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`T-ACC-*`)

## 1. Domain Invariants

- `TXT-001`: TextPlay is a renderer. It cannot create or rewrite narrative facts.
- `TXT-002`: TextPlay loads Narrative-Engine as a shared module and performs compile + projection read in-process.
- `TXT-003`: Visibility and POV constraints are both mandatory.
- `TXT-004`: Persistence failure is non-blocking for returned render output.
- `TXT-005`: Presence transitions must emit auditable report events.
- `TXT-006`: Run recovery must preserve idempotent side effects and terminal-state monotonicity.
- `TXT-007`: `WorldEvent` is entry material only; runtime story instance identity is `story_${ulid}` generated on explicit `Start`.
- `TXT-008`: TextPlay uses `userId` as account identity. `playerName` and `playerIdentity` describe the user's in-story persona only.

## 2. Domain Increments

- `TXT-010`: Input normalization runs before any visibility filter.
- `TXT-011`: Narrative compile context assembly uses TextPlay-declared world/agent read capabilities only.
- `TXT-012`: Prompt building operates only on filtered event set.
- `TXT-013`: Route-unavailable is fail-close and returns blocking reason code.
- `TXT-014`: Render output must always include `text` and `meta`.
- `TXT-015`: Initiative events reset idle/away timers in presence state machine.
- `TXT-016`: Resume with checkpoint hash mismatch is fail-close.
- `TXT-017`: Player-facing entry catalog is derived from `data-api.world.events.list`, keeps `PRIMARY` events only, sorts by upstream `timelineSeq` ascending, preserves upstream `eventHorizon` as canonical target-event metadata, and excludes `FUTURE` events from direct player-facing selection by default.
- `TXT-018`: `Start` generates fresh `storyId = story_${ulid}` and `sessionId = session_${ulid}`. `entryEventId` is preserved separately and never reused as runtime story identity.
- `TXT-019`: Entry agent is user-selected from `characterRefs`. When only one character ref exists it auto-selects; when none exist `Start` is disabled. TextPlay does not resolve fallback primary-agent chains.
- `TXT-020`: Story startup package is assembled from entry detail, scenes, narrative-contexts, lorebooks, agent memory recall, and startup policy/material diagnostics.
- `TXT-021`: TextPlay persists active drafts locally first through TextPlay-scoped host storage. 若持久化失败，仅降级当前会话，不阻塞 play。
- `TXT-022`: `Start`, `Resume`, and draft switching must auto-save the previously active story as `paused` before hydrating another draft. UI exposes at most one active session at a time.
- `TXT-023`: `Restart` resets only the current story draft and narrative-engine story state, preserves the same `storyId`, `sessionId`, `agentId`, and `startupPackage`, then reruns opening.
- `TXT-024`: `Stop` performs a single fire-and-forget publish to `data-api.world.spine.publish`; publish success or failure cannot block session teardown. Local draft and story state are always cleared afterwards.
- `TXT-025`: Published realm archive is not used as the continue source for current UI. Continue/resume truth comes only from local drafts.
- `TXT-026`: Story startup package must include `startupPolicy` and snapshot `contextCoverage/gapWarnings` diagnostics.
- `TXT-027`: Frontend auto tick may trigger `AgentInitiative` only when presence/cooldown/maxConsecutive policies are satisfied.
- `TXT-027A`: Initiative scheduler must evaluate `idle`, `paused`, `high-tension idle`, and `away` thresholds from startup policy and map them to `AgentInitiative` or `SystemEvent` without blocking local draft persistence.
- `TXT-028`: Missing `CANON/STORY` context is fail-close; missing `SUBJECT/RELATION/scene` is degraded with warnings. STORY-context lookup still uses template story ids derived from `WorldEvent`.
- `TXT-029`: Fresh story requires explicit `Start` action that triggers one opening `SystemEvent` render before player input is accepted; fresh entry starts from the selected target event's pre-threshold rather than treating canonical event details as already happened opening facts.
- `TXT-030`: Route Config moves into a right-side settings drawer; `Session Health`, `Debug Trace`, and remote history panels are not part of the main TextPlay workspace.
- `TXT-031`: Desktop route registration must request `immersive` shell mode so the two-column TextPlay workspace renders without nested host chrome collapse after the zero-bundle mod host split.
- `TXT-032`: Tension pacing constraints are injected into render prompt based on `pacingContext.tensionBand` (HIGH/MODERATE/LOW).
- `TXT-033`: Event type rendering guidance is appended per-event as `Rendering hint` when the event carries a recognized `type` field.
- `TXT-034`: Unknown or missing event `type` degrades gracefully — no rendering hint appended, event renders with visibility tag only.
- `TXT-035`: Entry card presentation is teaser-only: it renders a single lightweight `entryBackdrop` sentence derived from canonical materials, but does not expose full canonical result/process dumps, repeated cut-in hook copy, or internal horizon terminology to the player.
- `TXT-036`: Composer UX uses `Enter` to submit and `Shift+Enter` to insert a newline.
- `TXT-037`: UserTurn submission is optimistic in the workspace: input clears immediately, a pending player-action card appears in timeline, and failed submissions restore the original text back into the composer.
- `TXT-038`: Timeline auto-scrolls to the newest locally added card for the active session.
- `TXT-039`: Renderer fallback copy must follow the active UI locale. Current supported render locales are `en|zh`; any other locale degrades to `en`.
- `TXT-040`: Projection render-input parsing may tolerate malformed non-critical branches by degrading them to empty values, but only if strict shadow validation emits diagnostics. Missing required story/turn identity fields remain fail-close.
- `TXT-041`: Route Config drawer uses modal dialog semantics with focus containment and trigger-focus restore; dialog accessibility must not change workspace layout.
- `TXT-042`: `promptLanguage` is resolved from the active UI locale, normalized to `en|zh`, and is used only for prompt shell/briefing copy. It does not change Start/Resume/Restart flow semantics.
- `TXT-043`: `storyLanguage` is resolved once on explicit `Start` as `worldPrimaryLanguage ?? agentLanguage ?? promptLanguage`, is persisted in draft/startup/render records, and is reused unchanged by Resume, Restart, and draft switching.
- `TXT-044`: World primary language outranks agent language for player-facing TextPlay narration. Agent language is only a fallback when the selected world has no recognized primary language.
- `TXT-045`: Prompt shell language may differ from player-facing output language. Render prompts must explicitly lock final narrative output to `storyLanguage`.
- `TXT-046`: Language governance must not introduce new user-visible language settings, new start-form fields, or any control-flow changes to Start, Resume, Restart, Stop, presence handling, initiative scheduling, optimistic submit, or locale-aware fallback.

## 3. No Over-Design Guard

- `TXT-050`: No renderer-side world fact persistence contract is introduced outside the single publish endpoint.
- `TXT-051`: No model vendor-specific binding is introduced in domain doc.
- `TXT-052`: No fallback compatibility path is introduced.
