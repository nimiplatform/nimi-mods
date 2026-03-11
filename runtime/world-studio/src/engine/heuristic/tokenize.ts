import { canonicalizeCharacterNames, normalizeZhCharacterName } from '../character/normalize-zh.js';

const CHINESE_STOPWORDS = new Set([
  // Generic nouns
  '世界', '时间', '地点', '人物', '事件', '关系', '历史', '文明',
  '科技', '系统', '项目', '计划', '任务', '东西', '地方', '方面',
  '情况', '问题', '方法', '样子', '意思', '时候', '功夫', '消息',
  // Pronouns & demonstratives
  '我们', '他们', '自己', '这个', '那个', '这些', '那些', '什么',
  '怎么', '如何', '哪里', '多少', '大家', '对方', '别人',
  // Conjunctions & adverbs
  '因为', '所以', '然后', '已经', '没有', '可以', '不是', '以及',
  '但是', '如果', '为了', '虽然', '虽说', '虽是', '不过', '只是',
  '而且', '或者', '还是', '于是', '并且', '因此', '而是', '即使',
  // Common verb fragments (prevent partial-sentence extraction)
  '发现', '知道', '觉得', '看到', '听到', '想到', '感到', '认为',
  '开始', '继续', '终于', '突然', '居然', '竟然', '果然', '立刻',
  '马上', '渐渐', '慢慢', '顿时', '只见', '便是', '正是', '却是',
  // Descriptive fragments (common noise in extraction)
  '一个', '一位', '一名', '一声', '一下', '一番', '一阵', '一片',
  '两个', '几个', '此人', '此地', '此时', '那人', '心中', '身上',
  '之中', '之后', '之前', '之间', '其中', '周围', '旁边', '上面',
  // State words
  '皮肤', '黑黑', '身材', '修长', '魁梧', '瘦弱', '年轻', '苍老',
]);

const LOCATION_SUFFIX_RE =
  /[\u4e00-\u9fff]{2,14}(?:市|省|国|洲|基地|站|城|村|岛|河|山|区|港|镇|县|府|宫|堡|学院|研究所|舰队|舰|号)/g;

const COMPOUND_SURNAMES = new Set([
  '欧阳',
  '司马',
  '上官',
  '诸葛',
  '夏侯',
  '皇甫',
  '尉迟',
  '公孙',
  '慕容',
  '宇文',
  '长孙',
  '令狐',
  '东方',
  '南宫',
  '独孤',
  '拓跋',
]);

const SINGLE_SURNAMES = new Set(Array.from(
  '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜谢邹喻柏窦章云苏潘葛范彭郎鲁韦马苗凤方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万支柯管卢莫房裘解应宗丁宣邓郁单杭洪包左石崔吉龚程嵇邢裴陆荣翁荀羊惠甄封芮储靳汲邴松井段富巫乌焦巴弓牧隗山车侯班秋仲伊宫宁仇栾甘厉戎祖武符刘景詹束龙叶司韶黎蓟薄印宿白蒲鄂索赖卓蔺屠乔阴胥苍双闻翟谭贡姬申扶堵冉宰雍桑桂濮牛寿通边扈燕冀浦尚农温别庄晏柴瞿阎连茹习艾鱼容向古易慎戈廖庾终居衡步都耿满弘匡国文寇广禄阙东沃利蔚越夔隆师巩聂晁勾敖融冷辛阚那简饶空曾沙养鞠须丰巢关蒯相查后荆红游竺权盖益桓公',
));

function countTokens(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  tokens.forEach((token) => {
    const key = token.trim();
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function topItems(freq: Map<string, number>, limit: number): string[] {
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function isLikelyChineseName(token: string): boolean {
  const value = String(token || '').trim();
  if (value.length < 2 || value.length > 4) return false;
  if (CHINESE_STOPWORDS.has(value)) return false;
  const firstTwo = value.slice(0, 2);
  if (COMPOUND_SURNAMES.has(firstTwo)) return true;
  const first = value.charAt(0);
  return Boolean(first) && SINGLE_SURNAMES.has(first);
}

export function splitHeuristicSentences(text: string): string[] {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/[\n。！？!?；;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 10);
}

export function extractHeuristicTimelineRefs(chunk: string): string[] {
  const years = String(chunk || '').match(/(?:18|19|20)\d{2}年?/g) || [];
  const clean = years.map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set(clean)).slice(0, 16);
}

export function extractHeuristicLocationNames(chunk: string): string[] {
  const matches = String(chunk || '').match(LOCATION_SUFFIX_RE) || [];
  const cleaned = matches
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 2 && !CHINESE_STOPWORDS.has(entry));
  return Array.from(new Set(cleaned)).slice(0, 20);
}

export function extractHeuristicCharacterNames(chunk: string): string[] {
  const chineseTokens = String(chunk || '').match(/[\u4e00-\u9fff]{2,4}/g) || [];
  const chineseCandidates = chineseTokens
    .map((token) => normalizeZhCharacterName(token) || token)
    .filter((token) => isLikelyChineseName(token));
  const latinCandidates = String(chunk || '').match(/\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\b/g) || [];
  const freq = countTokens([...chineseCandidates, ...latinCandidates]);
  // Require at least 2 occurrences to filter out noise
  for (const [name, count] of freq) {
    if (count < 2) freq.delete(name);
  }
  const ranked = topItems(freq, 36);
  const normalized = canonicalizeCharacterNames(ranked);
  return normalized.canonicalNames.slice(0, 20);
}
