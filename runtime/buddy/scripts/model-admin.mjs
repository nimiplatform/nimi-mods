import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_MODELS_DIR = path.join(ROOT_DIR, 'assets', 'models');
const CONTRACTS_FILE = path.join(ROOT_DIR, 'src', 'contracts.ts');
const PROMPT_TEMPLATE_FILE = path.join(ROOT_DIR, 'src', 'services', 'prompt-template.ts');

function fail(message) {
  console.error(`[buddy:model-admin] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[buddy:model-admin] ${message}`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = { _: [] };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      flags._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = 'true';
      continue;
    }
    flags[key] = next;
    index += 1;
  }

  return { command, flags };
}

function tsString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function parseCsv(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveModelFile(inputPath) {
  if (!inputPath) fail('缺少 --model 参数，例如 --model assets/models/hiyori/hiyori_pro_t11.model3.json');
  const candidate = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(ROOT_DIR, inputPath);
  if (!fs.existsSync(candidate)) {
    fail(`模型文件不存在：${candidate}`);
  }
  return candidate;
}

function validateModelFile(modelFile) {
  if (!modelFile.endsWith('.model3.json')) {
    fail(`模型文件必须是 .model3.json：${modelFile}`);
  }

  const normalizedModelsRoot = `${path.resolve(ASSETS_MODELS_DIR)}${path.sep}`;
  const normalizedModelFile = path.resolve(modelFile);
  if (!normalizedModelFile.startsWith(normalizedModelsRoot)) {
    fail(`模型文件必须放在 buddy/assets/models 下：${normalizedModelFile}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(normalizedModelFile, 'utf8'));
  } catch (error) {
    fail(`模型 JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const baseDir = path.dirname(normalizedModelFile);
  const relativePath = path.relative(ASSETS_MODELS_DIR, normalizedModelFile).replaceAll(path.sep, '/');
  const references = parsed?.FileReferences;

  if (!references || typeof references !== 'object') {
    fail('模型文件缺少 FileReferences，无法校验渲染资源。');
  }

  const missingFiles = [];
  const warnings = [];

  const mocPath = typeof references.Moc === 'string' ? path.resolve(baseDir, references.Moc) : '';
  if (!mocPath || !fs.existsSync(mocPath)) {
    missingFiles.push(`Moc: ${references.Moc || '(缺失字段)'}`);
  }

  const textures = Array.isArray(references.Textures) ? references.Textures : [];
  if (!textures.length) {
    missingFiles.push('Textures: (未声明贴图)');
  } else {
    for (const texture of textures) {
      const target = path.resolve(baseDir, texture);
      if (!fs.existsSync(target)) {
        missingFiles.push(`Texture: ${texture}`);
      }
    }
  }

  for (const optionalKey of ['Physics', 'Pose', 'DisplayInfo']) {
    const value = references[optionalKey];
    if (typeof value === 'string' && value.trim()) {
      const target = path.resolve(baseDir, value);
      if (!fs.existsSync(target)) {
        missingFiles.push(`${optionalKey}: ${value}`);
      }
    }
  }

  const motions = references.Motions && typeof references.Motions === 'object' ? references.Motions : {};
  const motionGroups = Object.keys(motions);
  for (const [groupName, groupEntries] of Object.entries(motions)) {
    if (!Array.isArray(groupEntries)) continue;
    for (const entry of groupEntries) {
      const file = entry && typeof entry === 'object' ? entry.File : '';
      if (typeof file === 'string' && file.trim()) {
        const target = path.resolve(baseDir, file);
        if (!fs.existsSync(target)) {
          missingFiles.push(`Motion(${groupName}): ${file}`);
        }
      }
    }
  }

  const groups = Array.isArray(parsed.Groups) ? parsed.Groups : [];
  const lipSyncGroup = groups.find((group) => group?.Name === 'LipSync');
  if (!lipSyncGroup) {
    warnings.push('模型未声明 LipSync 组，渲染可继续，但口型同步大概率需要额外适配。');
  }

  if (!motionGroups.includes('Idle')) {
    warnings.push('模型没有 Idle 动作组，Buddy 会退回默认动作策略，待机表现可能较弱。');
  }

  if (!motionGroups.includes('Tap') && !motionGroups.includes('Flick')) {
    warnings.push('模型没有标准 Tap/Flick 动作组，点击反馈可能需要手工调整 motion-profile.ts。');
  }

  if (missingFiles.length) {
    fail(`模型资源校验失败，缺少以下文件：\n- ${missingFiles.join('\n- ')}`);
  }

  return {
    parsed,
    relativePath,
    motionGroups,
    textures: textures.length,
    warnings,
  };
}

function insertBeforeMarker(filePath, marker, snippet, existsPattern) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (existsPattern.test(source)) {
    return false;
  }
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    fail(`未在 ${path.basename(filePath)} 里找到插入标记：${marker}`);
  }
  const nextSource = `${source.slice(0, markerIndex)}${snippet}${source.slice(markerIndex)}`;
  fs.writeFileSync(filePath, nextSource);
  return true;
}

function addModelToContracts({ id, label, relativePath }) {
  const snippet = `  {\n    id: ${tsString(id)},\n    label: ${tsString(label)},\n    relativePath: ${tsString(relativePath)},\n  },\n`;
  return insertBeforeMarker(
    CONTRACTS_FILE,
    '] as const;',
    snippet,
    new RegExp(`id:\\s*${tsString(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );
}

function addPromptProfile({
  id,
  label,
  characterName,
  role,
  relationship,
  traits,
  style,
  scenario,
  topics,
  fallbackEmotion,
}) {
  const snippet = [
    `  ${id}: {`,
    `    ipName: 'Buddy',`,
    `    characterName: ${tsString(characterName || label)},`,
    `    role: ${tsString(role || 'Live2D 陪伴角色')},`,
    `    relationship: ${tsString(relationship || '像一个会认真回应、愿意陪伴用户的小伙伴')},`,
    `    personalityTraits: [${traits.map((item) => tsString(item)).join(', ')}],`,
    `    speakingStyle: [${style.map((item) => tsString(item)).join(', ')}],`,
    `    scenario: ${tsString(scenario || '桌面陪伴、轻聊天、情绪回应和语音播报。')},`,
    `    preferredTopics: [${topics.map((item) => tsString(item)).join(', ')}],`,
    `    fallbackEmotion: ${tsString(fallbackEmotion || 'happy')},`,
    `  },`,
    '',
  ].join('\n');

  return insertBeforeMarker(
    PROMPT_TEMPLATE_FILE,
    '};\n\nexport function buildBuddySystemPrompt',
    snippet,
    new RegExp(`^\\s*${id}:\\s*\\{`, 'm'),
  );
}

function printUsage() {
  console.log(`Buddy 模型管理脚本

用法：
  pnpm --dir nimi-mods/runtime/buddy run model:validate -- --model assets/models/hiyori/hiyori_pro_t11.model3.json
  pnpm --dir nimi-mods/runtime/buddy run model:add -- --id hiyori --label "日和（Hiyori）" --model assets/models/hiyori/hiyori_pro_t11.model3.json

可选参数：
  --character-name  角色名（默认使用 label）
  --role            角色身份
  --relationship    与用户的关系设定
  --traits          逗号分隔的性格关键词
  --style           逗号分隔的说话风格
  --scenario        场景描述
  --topics          逗号分隔的偏好话题
  --fallback-emotion happy|sad|surprised|thinking|excited|sleepy
  --dry-run         只校验并输出结果，不写入代码
`);
}

function runValidate(flags) {
  const modelFile = resolveModelFile(flags.model);
  const result = validateModelFile(modelFile);

  info(`模型校验通过：${result.relativePath}`);
  info(`检测到 ${result.textures} 张贴图，动作组：${result.motionGroups.join(', ') || '(无)'}`);
  if (result.warnings.length) {
    for (const warning of result.warnings) {
      info(`警告：${warning}`);
    }
  }
}

function runAdd(flags) {
  const id = String(flags.id || '').trim();
  const label = String(flags.label || '').trim();
  if (!id) fail('缺少 --id，例如 --id hiyori');
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    fail('模型 id 只允许小写字母、数字和下划线，且必须以字母开头。');
  }
  if (!label) fail('缺少 --label，例如 --label "日和（Hiyori）"');

  const modelFile = resolveModelFile(flags.model);
  const result = validateModelFile(modelFile);
  const traits = parseCsv(flags.traits, ['温柔', '自然', '会接话', '有存在感']);
  const style = parseCsv(flags.style, ['中文自然口语', '避免机械客服腔', '句子短一点']);
  const topics = parseCsv(flags.topics, ['日常陪伴', '轻松聊天', '兴趣爱好', '鼓励和安慰']);
  const fallbackEmotion = String(flags['fallback-emotion'] || 'happy').trim();

  info(`模型校验通过：${result.relativePath}`);
  if (result.warnings.length) {
    for (const warning of result.warnings) {
      info(`警告：${warning}`);
    }
  }

  if (flags['dry-run'] === 'true') {
    info('dry-run 模式，不写入 contracts.ts / prompt-template.ts');
    return;
  }

  const addedContracts = addModelToContracts({
    id,
    label,
    relativePath: result.relativePath,
  });
  const addedProfile = addPromptProfile({
    id,
    label,
    characterName: String(flags['character-name'] || '').trim(),
    role: String(flags.role || '').trim(),
    relationship: String(flags.relationship || '').trim(),
    traits,
    style,
    scenario: String(flags.scenario || '').trim(),
    topics,
    fallbackEmotion,
  });

  info(addedContracts ? '已更新 contracts.ts' : 'contracts.ts 中已存在该模型，跳过写入');
  info(addedProfile ? '已更新 prompt-template.ts' : 'prompt-template.ts 中已存在该角色 profile，跳过写入');
  info('完成。下一步建议运行：pnpm --dir nimi-mods/runtime/buddy run verify');
}

const { command, flags } = parseArgs(process.argv.slice(2));

switch (command) {
  case 'validate':
    runValidate(flags);
    break;
  case 'add':
    runAdd(flags);
    break;
  default:
    printUsage();
    process.exit(command ? 1 : 0);
}
