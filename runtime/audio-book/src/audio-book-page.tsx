// ---------------------------------------------------------------------------
// Audio Book page — top-level entry rendered inside the mod tab
// ---------------------------------------------------------------------------
import React from 'react';
import { useAudioBookPageController } from './controllers/audio-book-page-controller.js';
import { AudioBookShell } from './components/shell/audio-book-shell.js';
import { StepFooter } from './components/shell/step-footer.js';
import { ProjectListView } from './components/project/project-list-view.js';
import { ProjectHeader } from './components/project/project-header.js';
import { StepContent } from './components/step-content.js';
import { TooltipProvider } from './components/ui/tooltip.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
export function AudioBookPage() {
    const { t } = useModTranslation('audio-book');
    const controller = useAudioBookPageController();
    const { store, ui, navigation } = controller;
    // No active project -> show project list
    if (!store.activeProjectId) {
        return (<div data-nimi-mod-root="audio-book" className="flex h-full min-h-0 flex-col bg-gray-50">
        <header className="flex shrink-0 items-center border-b border-gray-200 bg-white px-4 py-2">
          <span className="text-sm font-semibold text-gray-900">{t('page.title')}</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <ProjectListView projects={store.projects} onOpen={(id) => store.openProject(id)} onCreate={(name) => store.createProject(name)} onDelete={(id) => store.deleteProject(id)}/>
        </main>
      </div>);
    }
    const prevStep = navigation.currentIndex > 0
        ? navigation.steps[navigation.currentIndex - 1]
        : undefined;
    const nextStep = navigation.currentIndex < navigation.steps.length - 1
        ? navigation.steps[navigation.currentIndex + 1]
        : undefined;
    // Active project -> step-based workflow
    return (<div data-nimi-mod-root="audio-book" className="h-full min-h-0">
      <TooltipProvider>
        <AudioBookShell header={<ProjectHeader projectName={store.project?.name ?? ''} onBack={() => store.closeProject()} steps={navigation.steps} currentStep={navigation.currentStep} currentIndex={navigation.currentIndex} canEnterStep={navigation.canEnterStep} onStepClick={navigation.goToStep}/>} content={<StepContent controller={controller}/>} footer={<StepFooter canRetreat={navigation.canRetreat} canAdvance={navigation.canAdvance} onPrev={navigation.goPrev} onNext={navigation.goNext} prevStep={prevStep} nextStep={nextStep}/>} error={ui.error} onDismissError={ui.clearError} confirmDialog={ui.confirmDialog} onDismissConfirm={() => ui.setConfirmDialog(null)}/>
      </TooltipProvider>
    </div>);
}
