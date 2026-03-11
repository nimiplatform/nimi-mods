const EVENT_KEYWORDS = [
  '危机',
  '战争',
  '战役',
  '行动',
  '计划',
  '项目',
  '实验',
  '试验',
  '任务',
  '事件',
  '爆发',
  '发现',
  '建立',
  '毁灭',
  '入侵',
  '对抗',
  '决战',
  '灾难',
  '革命',
  '启动',
  '失败',
  '胜利',
];

export function scoreHeuristicEventSentence(sentence: string): number {
  let score = 0;
  EVENT_KEYWORDS.forEach((keyword) => {
    if (sentence.includes(keyword)) score += 1;
  });
  if (/(?:18|19|20)\d{2}年?/.test(sentence)) score += 1;
  if (sentence.length > 28) score += 0.5;
  return score;
}
