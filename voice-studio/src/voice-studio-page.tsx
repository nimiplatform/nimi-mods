// ---------------------------------------------------------------------------
// Voice Studio page — top-level entry rendered inside the mod tab
// ---------------------------------------------------------------------------

import React from 'react';
import { useVoiceStudioPageController } from './controllers/voice-studio-page-controller.js';
import { VoiceStudioShell } from './components/shell/voice-studio-shell.js';
import { StepFooter } from './components/shell/step-footer.js';
import { ProjectListView } from './components/project/project-list-view.js';
import { ProjectHeader } from './components/project/project-header.js';
import { StepContent } from './components/step-content.js';

export function VoiceStudioPage() {
  const controller = useVoiceStudioPageController();
  const { store, ui, navigation } = controller;

  // No active project → show project list
  if (!store.activeProjectId) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-gray-50">
        <header className="flex shrink-0 items-center border-b border-gray-200 bg-white px-4 py-2">
          <span className="text-sm font-semibold text-gray-900">Voice Studio</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <ProjectListView
            projects={store.projects}
            onOpen={(id) => store.openProject(id)}
            onCreate={(name) => store.createProject(name)}
            onDelete={(id) => store.deleteProject(id)}
          />
        </main>
      </div>
    );
  }

  // Active project → step-based workflow
  return (
    <VoiceStudioShell
      header={
        <ProjectHeader
          projectName={store.project?.name ?? ''}
          onBack={() => store.closeProject()}
          steps={navigation.steps}
          currentStep={navigation.currentStep}
          currentIndex={navigation.currentIndex}
          canEnterStep={navigation.canEnterStep}
          onStepClick={navigation.goToStep}
        />
      }
      content={<StepContent controller={controller} />}
      footer={
        <StepFooter
          canRetreat={navigation.canRetreat}
          canAdvance={navigation.canAdvance}
          onPrev={navigation.goPrev}
          onNext={navigation.goNext}
        />
      }
      error={ui.error}
      onDismissError={ui.clearError}
      confirmDialog={ui.confirmDialog}
      onDismissConfirm={() => ui.setConfirmDialog(null)}
    />
  );
}
