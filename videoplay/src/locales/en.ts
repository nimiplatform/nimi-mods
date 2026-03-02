const enLocale = {
  page: {
    title: 'VideoPlay',
    subtitle: 'Episode Production Workbench',
    loading: 'VideoPlay loading...',
  },
  action: {
    runPipeline: 'Run Pipeline',
    refresh: 'Refresh',
    publish: 'Publish',
    applyOperation: 'Apply Operation',
  },
  label: {
    storyId: 'Story ID',
    ingestCursorStart: 'Ingest Cursor Start',
    status: 'Status',
    route: 'Route',
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
  },
} as const;

export default enLocale;
