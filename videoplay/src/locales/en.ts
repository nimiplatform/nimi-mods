const enLocale = {
  page: {
    title: 'VideoPlay',
    subtitle: 'Episode Production Workbench',
    loading: 'VideoPlay loading...',
  },
  action: {
    runPipeline: 'Run Pipeline',
    refresh: 'Refresh',
    reloadPackage: 'Reload Package',
    publish: 'Publish',
    applyOperation: 'Apply Operation',
  },
  label: {
    worldId: 'World ID',
    projectId: 'Project ID',
    story: 'Story',
    sourceMode: 'Source Mode',
    storyId: 'Story ID',
    ingestCursorStart: 'Ingest Cursor Start',
    status: 'Status',
    route: 'Route',
    storyPackage: 'Story Package',
    quality: 'Quality Gates',
    fallbackAudit: 'Fallback Audit',
    runEvents: 'Run Events',
    episodes: 'Episodes',
    shots: 'Shots',
    release: 'Release',
  },
  hint: {
    sourceTraceability: 'Every beat/shot keeps sourceEventIds for canonical traceability.',
    failClose: 'Failed quality gates block release package generation.',
    enrichedGate: 'Enriched source requires UserTurn or AgentInitiative in the selected turn window.',
    packageGuard: 'Pipeline is blocked until selected story package is fully ready.',
  },
} as const;

export default enLocale;
