export function buildPhase1Prompt(sourceText: string): string {
  return [
    'You are a worldbuilding extraction engine.',
    'Read the source text and output STRICT JSON only.',
    'JSON schema:',
    '{',
    '  "startTimeOptions":[{"id":"t1","label":"...","description":"...","weight":0.0}],',
    '  "characterCandidates":[{"name":"...","summary":"...","significance":0.0}]',
    '}',
    'Rules:',
    '- startTimeOptions length >= 1 and <= 8.',
    '- characterCandidates length >= 1 and <= 20.',
    '- significance/weight are numbers in [0,1].',
    '- No markdown, no explanation, JSON only.',
    '',
    'SOURCE:',
    sourceText,
  ].join('\n');
}

export function buildPhase2Prompt(input: {
  sourceText: string;
  selectedStartTimeId: string;
  selectedCharacters: string[];
}): string {
  return [
    'You are a world generation engine.',
    'Generate publish-ready world draft JSON ONLY.',
    'JSON schema:',
    '{',
    '  "world": {',
    '    "name":"...",',
    '    "description":"...",',
    '    "genre":"...",',
    '    "themes":["..."],',
    '    "era":"...",',
    '    "status":"ACTIVE",',
    '    "timeFlowRatio":1',
    '  },',
    '  "worldview": {',
    '    "lifecycle": {},',
    '    "timeModel": {},',
    '    "spaceTopology": {},',
    '    "causality": {},',
    '    "coreSystem": {"rules": {}},',
    '    "existences": {},',
    '    "resources": {},',
    '    "structures": {},',
    '    "visualGuide": {},',
    '    "narrativeHooks": {}',
    '  },',
    '  "worldLorebooks":[{"key":"location:capital:name","value":{},"provenance":{}}]',
    '}',
    'Rules:',
    '- worldview must include required modules: timeModel/spaceTopology/causality/coreSystem.',
    '- Do NOT include deprecated worldview modules.',
    '- Keep output concise but valid and coherent.',
    '- No markdown, no explanation, JSON only.',
    '',
    `CHECKPOINT_START_TIME_ID: ${input.selectedStartTimeId}`,
    `CHECKPOINT_CHARACTERS: ${input.selectedCharacters.join(', ')}`,
    '',
    'SOURCE:',
    input.sourceText,
  ].join('\n');
}
