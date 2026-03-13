# music-score Mod AGENTS

## Scope

This AGENTS.md covers `nimi-mods/runtime/music-score/`.

## Rules

1. Follow `nimi-mods/AGENTS.md` for shared mod development rules.
2. This mod has **no runtime AI dependencies** — all processing is client-side.
3. The processing pipeline is: AudioBuffer → NoteEvent[] → QuantizedScore → MusicXML → OSMD render.
4. Keep services stateless — all state lives in the React page component.
5. Do not add backend/server dependencies; this mod runs entirely in the browser.
