import type { KismetInput } from '../types.js';

export function buildKismetUserPrompt(input: KismetInput): string {
  const lines = [
    '请根据以下八字信息生成完整的人生 K 线分析报告：',
    '',
    `性别：${input.gender === 'Male' ? '男' : '女'}`,
    `出生年份：${input.birthYear}`,
    `年柱：${input.yearPillar}`,
    `月柱：${input.monthPillar}`,
    `日柱：${input.dayPillar}`,
    `时柱：${input.hourPillar}`,
    `起运岁数：${input.startAge}`,
    `首步大运：${input.firstDaYun}`,
  ];
  if (input.name) {
    lines.splice(2, 0, `姓名：${input.name}`);
  }
  lines.push('', '请严格按照系统指令要求的 JSON 格式输出完整结果。');
  return lines.join('\n');
}
