# MS-CAP: Capability Contract

## MS-CAP-001: UI-only capability scope

The music-score mod declares only UI registration capabilities. It does NOT
consume any `runtime.ai.*` or `runtime.media.*` capabilities. All audio
processing runs client-side via bundled libraries.

## MS-CAP-002: Sidebar and route registration

The mod registers exactly two UI extension slots:
- `ui-extension.app.sidebar.mods` — sidebar navigation entry
- `ui-extension.app.content.routes` — tab-page route with immersive shell mode

See [tables/capabilities.yaml](tables/capabilities.yaml) for the authoritative list.
