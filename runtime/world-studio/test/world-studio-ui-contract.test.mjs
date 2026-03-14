import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const modDir = path.resolve(testDir, '..');

function readModFile(relativePath) {
  return readFileSync(path.join(modDir, relativePath), 'utf8');
}

test('world-studio manifest declares css entry for UI runtime shell', () => {
  const manifest = readModFile('mod.manifest.yaml');
  assert.match(manifest, /^styles:\s*$/m);
  assert.match(manifest, /^\s*-\s+\.\/dist\/mods\/world-studio\/index\.css\s*$/m);
});

test('world-studio page root keeps the required mod root marker', () => {
  const pageSource = readModFile('src/world-studio-page.tsx');
  assert.match(pageSource, /data-nimi-mod-root="world-studio"/);
  assert.match(pageSource, /className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-\[#eef7f5\]"/);
});

test('world-studio route uses immersive shell mode and a standard in-flow shell root', () => {
  const indexSource = readModFile('src/index.ts');
  const shellSource = readModFile('src/ui/world-studio-shell.tsx');
  assert.match(indexSource, /shellMode:\s*'immersive'/);
  assert.match(shellSource, /data-ui-version="v5"/);
  assert.match(shellSource, /workflowSidebar: React\.ReactNode/);
  assert.match(shellSource, /shell\.settingsDrawer/);
  assert.match(shellSource, /absolute inset-y-0 right-0 z-30/);
  assert.match(shellSource, /className="ui-sync-root relative isolate flex h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden bg-\[#eef7f5\]"/);
  assert.doesNotMatch(shellSource, /fixed inset-x-0 bottom-0/);
  assert.doesNotMatch(shellSource, /viewportTop/);
});

test('create workbench implements import and review subviews with sticky action bar', () => {
  const workbenchSource = readModFile('src/ui/create/create-workbench.tsx');
  const stageNavSource = readModFile('src/ui/create/create-stage-nav.tsx');
  const builderSource = readModFile('src/controllers/world-studio-screen-model-builder.ts');
  assert.match(workbenchSource, /main\.importSubview === 'PREPARE'/);
  assert.match(workbenchSource, /main\.importSubview === 'RUNNING'/);
  assert.match(workbenchSource, /main\.reviewSubview === 'PUBLISH_REVIEW'/);
  assert.match(workbenchSource, /renderSourceInputPanel/);
  assert.match(workbenchSource, /<StickyActionBar>/);
  assert.match(stageNavSource, /disabled=\{disabled\}/);
  assert.match(builderSource, /buildCreateStageAccess/);
  assert.match(builderSource, /resolveRequestedCreateStage/);
});

test('maintain workbench removes mutations from the primary editor workflow', () => {
  const maintainSource = readModFile('src/ui/maintain/maintain-workbench.tsx');
  const workflowDrawerSource = readModFile('src/ui/workflow-drawer.tsx');
  const domainNavSource = readModFile('src/ui/maintain/domain-nav.tsx');
  const sectionNavSource = readModFile('src/ui/maintain/section-nav.tsx');
  const agentsPanelSource = readModFile('src/ui/maintain/agents-panel.tsx');
  const assetsPanelSource = readModFile('src/ui/maintain/assets-panel.tsx');
  const releasesPanelSource = readModFile('src/ui/maintain/releases-panel.tsx');
  const localeZh = readModFile('src/locales/zh.json');
  const workspaceTypes = readModFile('src/contracts/types/workspace.ts');
  const builderSource = readModFile('src/controllers/world-studio-screen-model-builder.ts');
  assert.doesNotMatch(maintainSource, /section === 'MUTATIONS'/);
  assert.match(maintainSource, /SectionNav/);
  assert.match(maintainSource, /Create Missing Draft Agents/);
  assert.match(maintainSource, /form="world-studio-agent-editor-form"/);
  assert.match(maintainSource, /Save Agent Metadata/);
  assert.match(maintainSource, /Sync World Assets/);
  assert.match(maintainSource, /refreshResources\(\)/);
  assert.match(maintainSource, /reloadRemote\(\)/);
  assert.match(workflowDrawerSource, /DomainNav/);
  assert.match(workflowDrawerSource, /statusSummary\.title/);
  assert.match(workflowDrawerSource, /workflow\.domainNavDescription/);
  assert.match(domainNavSource, /worldStudioMessage/);
  assert.match(sectionNavSource, /sectionNav\.worldEvents/);
  assert.match(sectionNavSource, /sectionNav\.worldAssets/);
  assert.match(sectionNavSource, /sectionNav\.agentAssets/);
  assert.match(maintainSource, /maintain\.saveAgentMetadata/);
  assert.match(maintainSource, /maintain\.syncWorldAssets/);
  assert.match(maintainSource, /releases\.publish\.openFlow/);
  assert.match(assetsPanelSource, /assets\.world\.generatedTitle/);
  assert.match(assetsPanelSource, /assets\.agent\.generatedTitle/);
  assert.match(releasesPanelSource, /releases\.drafts\.title/);
  assert.match(releasesPanelSource, /releases\.history\.title/);
  assert.equal((maintainSource.match(/Refresh Remote/g) || []).length, 1);
  assert.doesNotMatch(agentsPanelSource, /Save Agent Metadata/);
  assert.match(agentsPanelSource, /onDirtyChangeRef/);
  assert.match(builderSource, /unsavedChangesByPanel\[section\] === dirty/);
  assert.match(localeZh, /"agentRegistry": "角色总览"/);
  assert.match(localeZh, /"domainNavTitle": "维护域"/);
  assert.match(workspaceTypes, /activeDomain: WorldStudioMaintainDomain/);
  assert.match(workspaceTypes, /activeSection: WorldStudioMaintainSection/);
  assert.match(workspaceTypes, /selectedAgentId: string/);
  assert.match(workspaceTypes, /WorldStudioWorldSection = 'BASE' \| 'WORLDVIEW' \| 'WORLD_EVENTS' \| 'LOREBOOKS'/);
  assert.match(readModFile('src/hooks/actions/create/draft-publish.ts'), /activeDomain: 'WORLD'/);
  assert.match(readModFile('src/hooks/actions/create/draft-publish.ts'), /activeSection: 'BASE'/);
});
