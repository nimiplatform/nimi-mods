# Acceptance Contract

> Owner Domain: `LC-ACC-*`

## LC-ACC-001 Table-Driven Acceptance

Acceptance matrix is authoritative in `tables/acceptance-cases.yaml`.

## LC-ACC-002 Required Coverage

Minimum acceptance coverage must include:

1. first session auto-create
2. assistant turn audit persistence
3. route override local scope
4. speech failure non-blocking behavior
5. single-session recovery after re-entry or history clear
6. proactive policy guard when user setting disables proactive contact
7. proactive policy allow path when wake strategy and idle window are eligible
8. fallback stream parser deterministic segmentation (explicit delimiter + double newline fallback + max 4)
9. first-beat delivery lifecycle (generic pending only before firstBeat text appears; transient firstBeat stream must seal into finalized text and never persist)
10. NSFW guardrail policy (restrained disables + natural local allow + non-local local-only enforcement)
11. media intent parser coverage (explicit tag + marker-only cleanup/fallback)
12. media async delivery lifecycle (text first, media appended later)
13. media soft-cancel behavior on thread/context change
14. media cache write/read roundtrip with deterministic cache key
15. explicit media request parser (CN + EN + negation + video priority)
16. media planner auto path and silent degrade path
17. automatic media cooldown blocks planner invocation
18. stale or not-ready media dependency cache blocks automatic media execution
19. planner timeout degrades to text-only while preserving diagnostics
20. context compiler derives interaction profile and beat pacing from target DNA/world input
21. interaction snapshot compiler runs after delivery and does not block first-beat persistence
22. relation memory slots and recall index are rebuilt from exact turns/beats
23. turn-mode resolution must not escalate neutral or emotional user turns to `intimate` based only on persona flirt affinity
24. derived voice availability must be strict-off only when `voiceAutonomy=off` and `voiceConversationMode=off`, and `voiceConversationMode=on` must re-enable voice even if trigger policy stays off
25. multi-turn send-flow continuity must persist user preference/promise state across follow-up turns and expose it back to next-turn context assembly
26. user-managed memory slot override must survive later automatic slot regeneration when slot identity is stable
27. proactive heartbeat must persist assistant turn, prompt trace, snapshot, and relation memory through the same continuity chain as user-initiated turns
28. voice trigger policy and visual trigger policy must remain symmetrical (`off | explicit-only | natural`)
29. `voiceConversationMode=on` must preserve explicit media requests instead of hijacking them into voice-only turns
30. `restrained` visual style must disable NSFW media while `natural` visual style may allow it on local routes only
31. incremental snapshot merge must preserve unresolved continuity and prevent neutral follow-up turns from regressing relationship warmth
32. context compile must select continuity-relevant top-K recall instead of injecting the full recall index
33. internal delivery style must derive from interaction profile plus snapshot continuity and drive `allowMultiReply`
34. derived relationship boundary must block automatic high-risk visual planner paths without altering explicit media hard-gate behavior
35. tail planner failure must degrade to firstBeat-only success without reviving legacy full-text post-segmentation
36. context compile must not duplicate the just-persisted current user turn across both `recentTurns` and the dedicated `userInput` lane
