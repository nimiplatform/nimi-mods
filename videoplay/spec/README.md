# VideoPlay Spec

This directory is the executable contract layer for VideoPlay.

Load order:

1. `index.yaml` (import map)
2. `contracts/*.yaml` (normative contracts)
3. `golden/cases.yaml` (acceptance behavior)

Validation:

1. `node /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/scripts/check-videoplay-spec.mjs`
2. `pnpm -C /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods run check:spec:videoplay`
