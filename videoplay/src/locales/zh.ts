const zhLocale = {
  page: {
    title: 'VideoPlay',
    subtitle: '分集生产工作台',
    loading: 'VideoPlay 加载中...',
  },
  action: {
    runPipeline: '运行产线',
    refresh: '刷新',
    reloadPackage: '重载故事包',
    publish: '发布',
    applyOperation: '执行操作',
  },
  label: {
    worldId: '世界 ID',
    projectId: '项目 ID',
    story: '故事',
    sourceMode: '来源模式',
    storyId: '故事 ID',
    ingestCursorStart: '起始游标',
    status: '状态',
    route: '路由',
    storyPackage: '故事包',
    quality: '质量门禁',
    fallbackAudit: '回退审计',
    runEvents: '运行事件',
    episodes: '分集',
    shots: '镜头',
    release: '发布',
  },
  hint: {
    sourceTraceability: '每个 beat/shot 都保留 sourceEventIds，支持 canonical 回溯。',
    failClose: '质量门禁失败会阻断 release package 生成。',
    enrichedGate: 'enriched 模式要求窗口内至少包含 UserTurn 或 AgentInitiative。',
    packageGuard: 'story package 未就绪时必须阻断流水线运行。',
  },
} as const;

export default zhLocale;
