const zhLocale = {
  page: {
    title: 'VideoPlay',
    subtitle: '分集生产工作台',
    loading: 'VideoPlay 加载中...',
  },
  action: {
    runPipeline: '运行产线',
    refresh: '刷新',
    publish: '发布',
    applyOperation: '执行操作',
  },
  label: {
    storyId: '故事 ID',
    ingestCursorStart: '起始游标',
    status: '状态',
    route: '路由',
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
  },
} as const;

export default zhLocale;
