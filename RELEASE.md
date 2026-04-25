# Nimi Mods Release Guide

This document is the maintainer-facing release playbook for official mods that live in `nimi-mods/`.

It covers:

- versioning a first-party mod
- running local release verification
- triggering the official release workflow
- checking catalog PR output after publish

It does not define Desktop governance or third-party catalog policy. Those stay in the main repo:

- [`../docs/guides/mod-release.md`](../docs/guides/mod-release.md)
- [`../RELEASE.md`](../RELEASE.md)

## Scope

Use this guide only when all of the following are true:

1. the mod source lives under `nimi-mods/runtime/<mod-name>/`
2. the package is Nimi-maintained
3. the target trust tier is `official`

If the package is third-party, do not use this workflow as the source-of-truth path. Third-party packages should publish from their own repository and go through catalog review.

## Release outputs

An official mod release must produce:

1. one immutable `.zip` package
2. one sidecar `release.manifest.json`
3. one GitHub Release entry in the main `nimiplatform/nimi` repository
4. one catalog PR against the standalone mod catalog repo

Desktop users only see the release after the catalog PR is merged and the catalog host serves the updated `index/v1/**`.

## Before you start

Confirm all of the following:

1. the mod version in `mod.manifest.yaml` is correct
2. the mod still builds from its package-local scripts
3. the workspace root passes the checks you need for confidence
4. the release signer and publisher metadata are configured in GitHub Actions
5. the catalog repo already has `signers.json`, `index/v1/revocations.json`, and `index/v1/advisories.json`

Minimum local checks for a single mod:

```bash
pnpm --dir "nimi-mods/runtime/<mod-name>" run verify
pnpm --dir "nimi-mods/runtime/<mod-name>" run pack
```

Recommended workspace checks when touching shared infra or multiple mods:

```bash
pnpm --dir nimi-mods run check
pnpm --dir nimi-mods run check:spec
pnpm --dir nimi-mods run typecheck
```

## Local release smoke

Before invoking GitHub Actions, confirm the package output looks correct.

From the mod directory:

```bash
pnpm run verify
pnpm run pack
```

Expected result:

1. `dist/packages/*.zip` exists
2. `dist/packages/release.manifest.json` exists
3. the manifest version matches `mod.manifest.yaml`
4. the package still declares the intended capabilities

## CI release workflow

Official mod publishing is performed by:

- [`.github/workflows/release-mod-package.yml`](../.github/workflows/release-mod-package.yml)

The workflow runs in the main monorepo because it needs both:

1. access to the `nimi-mods/` source workspace
2. access to the platform-level catalog update scripts and release automation

### Required workflow inputs

- `mod_path`: the relative path under `nimi-mods/`, for example `runtime/kismet`
- `release_channel`: `stable` or `beta`
- `publish`: whether to create/update GitHub Release assets and open/update the catalog PR
- `publish_assets`: whether to upload workflow artifacts
- `catalog_repo`: target catalog repo, usually `nimiplatform/nimi-mod-catalog`
- `catalog_base_branch`: usually `main`
- `catalog_path`: catalog root, usually `.`

Optional inputs:

- `artifact_url`
- `catalog_pr_title_prefix`
- `catalog_pr_body`

### Required secrets and variables

Expected GitHub Actions configuration:

- secret: `NIMI_MOD_SIGNING_KEY`
- secret: `NIMI_MOD_CATALOG_REPO_TOKEN` for cross-repo private catalog operations
- variable: `NIMI_MOD_SIGNER_ID`
- variable: `NIMI_MOD_PUBLISHER_ID`
- variable: `NIMI_MOD_PUBLISHER_NAME`
- variable: `NIMI_MOD_TRUST_TIER`
- variable: `NIMI_MOD_MIN_DESKTOP_VERSION`
- variable: `NIMI_MOD_MIN_HOOK_API_VERSION`

## Dry-run procedure

Always do this first.

Trigger `release-mod-package.yml` with:

- `publish=false`
- `publish_assets=true`

Dry-run does:

1. verifies the mod exists
2. resolves package metadata
3. runs the mod's `verify`
4. runs the mod's `pack`
5. updates a temporary catalog working tree
6. validates signer and catalog structure
7. uploads the package artifacts and patch preview

Dry-run does not:

1. create a GitHub Release
2. upload release assets to a GitHub Release
3. open a catalog PR

Do not move to publish until dry-run is green.

## Publish procedure

Trigger the same workflow again with:

- `publish=true`

Publish does:

1. create or reuse release tag `mods/<packageId>/v<version>`
2. upload the package zip and `release.manifest.json` to the GitHub Release
3. checkout the catalog repo
4. update `packages.json`, `packages/<packageId>.json`, and `releases/<packageId>/<version>.json`
5. validate signer and catalog consistency
6. push `codex/catalog-<packageId>-<version>`
7. create or update the catalog PR

Reruns are idempotent:

- the same catalog branch is reused
- an existing open PR is edited instead of duplicated

## Merge checklist

After the workflow completes, check:

1. the GitHub Release has both the zip and `release.manifest.json`
2. the catalog PR only touches the intended package files
3. the PR base branch is correct
4. the channel pointer and version look correct
5. the package signer and trust tier are correct

The release is not considered listed until the catalog PR merges.

## Post-merge checklist

After the catalog PR merges:

1. confirm the catalog host serves the new `index/v1/**`
2. confirm Desktop can see the mod from catalog discovery
3. confirm install works from the intended channel
4. confirm update behavior matches expectations
5. confirm there is no unexpected consent escalation

Useful follow-up commands from the main repo:

```bash
pnpm check:mod-catalog-signers
pnpm --filter @nimiplatform/desktop typecheck
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Common failure cases

### Release assets uploaded but Desktop cannot see the mod

Cause:

- the catalog PR is not merged yet
- the catalog host has not published the updated `index/v1/**`

### Dry-run passes but publish cannot open the catalog PR

Cause:

- missing or insufficient `NIMI_MOD_CATALOG_REPO_TOKEN`
- wrong `catalog_repo`, `catalog_base_branch`, or `catalog_path`

### Catalog PR opens with the wrong version

Cause:

- `mod.manifest.yaml` version was not updated before packing

### Package installs but unexpectedly asks for consent again

Cause:

- capability set increased
- trust tier changed
- advisory review is active

Those behaviors are governed by Desktop policy and are not a packaging bug by themselves.

## Ownership boundary reminder

`nimi-mods/` is only the official source workspace.

It is not:

- the public catalog repo
- the Desktop Marketplace truth source
- the intake workflow for third-party package listing

For those topics, use the main repo platform guide:

- [`../docs/guides/mod-release.md`](../docs/guides/mod-release.md)
