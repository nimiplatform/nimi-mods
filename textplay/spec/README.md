# TextPlay Spec

Executable contract layer for TextPlay.

Load order:

1. `index.yaml` (import map)
2. `contracts/*.yaml` (normative contracts)
3. `golden/cases.yaml` (acceptance behavior)

Validation:

1. `node /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/scripts/check-textplay-spec.mjs`
2. `pnpm -C /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods run check:spec:textplay`
