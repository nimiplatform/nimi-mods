/**
 * Dumps the exact system prompt + user prompt that kismet sends to the LLM
 * for the natal profile generation, using the real derivation pipeline.
 *
 * Usage: npx tsx nimi-mods/runtime/kismet/scripts/dump-natal-prompt.ts
 */

import { deriveCanonicalProfile } from '../src/services/bazi/derive-profile.js';
import { buildLocationContext } from '../src/services/city-affinity.js';
import { buildNatalSystemPrompt } from '../src/prompt/system-prompt.js';
import { buildNatalUserPrompt } from '../src/prompt/user-prompt.js';
import type { KismetBirthInputV2 } from '../src/types.js';

// Same input as the screenshot: Male, 1995-03-09, 16:30, Asia/Macau
const birthInput: KismetBirthInputV2 = {
  name: 'J',
  gender: 'male',
  birthDate: '1995-03-09',
  birthTime: '16:30',
  birthPlaceLabel: '澳门',
  birthPlaceId: 'cn-macau',
  timezone: 'Asia/Macau',
  consent: {
    allowLocalProfilePersist: true,
    allowLocalProfileMatchUse: true,
    allowCityAffinityUse: true,
  },
};

const canonicalProfile = deriveCanonicalProfile(birthInput);
const locationResult = buildLocationContext({
  profile: canonicalProfile,
  birthPlaceId: birthInput.birthPlaceId,
  birthPlaceLabel: birthInput.birthPlaceLabel,
});

if (!locationResult.ok) {
  console.error('Location context failed:', locationResult.error);
  process.exit(1);
}

const systemPrompt = buildNatalSystemPrompt();
const userPrompt = buildNatalUserPrompt({
  canonicalProfile,
  locationContext: locationResult.data,
});

console.log('═══════════════ SYSTEM PROMPT ═══════════════');
console.log(systemPrompt);
console.log(`\n[System prompt: ${systemPrompt.length} chars]\n`);

console.log('═══════════════ USER PROMPT ═══════════════');
console.log(userPrompt);
console.log(`\n[User prompt: ${userPrompt.length} chars]\n`);

console.log('\n═══════════════ STATS ═══════════════');
const totalChars = systemPrompt.length + userPrompt.length;
console.log(`System prompt: ${systemPrompt.length} chars`);
console.log(`User prompt: ${userPrompt.length} chars`);
console.log(`Total input: ${totalChars} chars`);
