# VideoPlay Spec

VideoPlay spec uses a kernel + domain two-layer model.

Load order:

1. `INDEX.md`
2. `kernel/*.md` (rule contracts)
3. `kernel/tables/*.yaml` (authoritative facts)
4. `kernel/generated/*.md` (generated views)
5. `videoplay.md` (domain increments)

Verification:

1. `pnpm -C nimi-mods run generate:spec:videoplay-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:videoplay-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:videoplay-kernel-consistency`
