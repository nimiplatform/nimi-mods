import type { LocalChatTarget } from '../../data/index.js';
import { resolveLocalChatTargetReferenceImageUrl } from '../../data/index.js';
import { deriveInteractionProfile } from './interaction-profile.js';

export type CharacterVisualAnchor = {
  subject: string;
  styleHints: string[];
  continuityRefs: string[];
  plannerSummary: string;
  referenceImageUrl: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter(Boolean);
}

function compactText(value: string, maxLength: number): string {
  const normalized = asString(value);
  if (!normalized || normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function joinUnique(values: unknown[], separator: string, maxLength: number): string {
  const normalized = Array.from(new Set(
    values
      .map((value) => asString(value))
      .filter(Boolean),
  ));
  const joined = normalized.join(separator).trim();
  return compactText(joined, maxLength);
}

function readPath(record: Record<string, unknown>, path: string[]): string {
  let current: unknown = record;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return asString(current);
}

function collectAppearanceDescriptors(target: LocalChatTarget): string[] {
  const profile = asRecord(target.agentProfile);
  const metadata = asRecord(target.agentMetadata);
  const dna = asRecord(profile.dna);
  const appearance = asRecord(dna.appearance);
  const biological = asRecord(dna.biological);
  const identity = asRecord(dna.identity);

  const appearanceTags = [
    ...asStringArray(appearance.tags),
    ...asStringArray(appearance.features),
  ].slice(0, 4);

  const structuredDescriptors = [
    joinUnique([appearance.summary, appearance.description, appearance.look, appearance.signatureLook], ' ', 72),
    joinUnique([appearance.hairColor, appearance.hairStyle, appearance.hair], ' ', 42),
    joinUnique([appearance.eyeColor, appearance.eyes], ' ', 32),
    joinUnique([appearance.skinTone, appearance.complexion], ' ', 32),
    joinUnique([appearance.bodyType, appearance.build, appearance.physique], ' ', 40),
    joinUnique([appearance.defaultOutfit, appearance.outfit, appearance.clothing, appearance.wardrobe], ' ', 56),
    joinUnique([appearance.accessories, appearance.signatureAccessory], ' ', 40),
    joinUnique([biological.genderPresentation, biological.ageAppearance, biological.species], ' ', 40),
    compactText(asString(identity.summary), 56),
    compactText(asString(profile.look), 56),
    compactText(asString(metadata.look), 56),
  ];

  return Array.from(new Set(
    [...structuredDescriptors, ...appearanceTags]
      .map((value) => compactText(asString(value), 72))
      .filter(Boolean),
  )).slice(0, 6);
}

export function buildCharacterVisualAnchor(target: LocalChatTarget): CharacterVisualAnchor {
  const profile = asRecord(target.agentProfile);
  const metadata = asRecord(target.agentMetadata);
  const dna = asRecord(profile.dna);
  const appearance = asRecord(dna.appearance);
  const interactionProfile = deriveInteractionProfile(target);
  const descriptors = collectAppearanceDescriptors(target);
  const fashionStyle = asString(appearance.fashionStyle || metadata.fashionStyle || interactionProfile.visual.fashionStyle);
  const artStyle = asString(appearance.artStyle || metadata.artStyle || interactionProfile.visual.artStyle);
  const personaCue = compactText(asString(
    readPath(dna, ['personality', 'summary'])
    || readPath(dna, ['identity', 'summary'])
    || profile.persona
    || metadata.persona
    || target.bio,
  ), 64);

  const subject = joinUnique([
    target.displayName,
    descriptors.length > 0 ? descriptors.join('，') : '外观保持与该角色设定一致',
  ], '，', 220);

  const styleHints = Array.from(new Set([
    fashionStyle ? `${fashionStyle} 穿搭` : '',
    artStyle ? `${artStyle} 视觉倾向` : '',
    personaCue ? `${personaCue} 的气质` : '',
  ].filter(Boolean))).slice(0, 4);

  const continuityRefs = Array.from(new Set([
    `保持 ${target.displayName} 的固定外观`,
    descriptors.length > 0 ? `固定特征: ${descriptors.slice(0, 3).join('、')}` : '',
    fashionStyle ? `穿搭延续: ${fashionStyle}` : '',
    artStyle ? `视觉风格延续: ${artStyle}` : '',
  ].filter(Boolean))).slice(0, 4);

  const plannerSummary = joinUnique([
    target.displayName,
    descriptors.length > 0 ? `外观=${descriptors.slice(0, 4).join(' / ')}` : '',
    fashionStyle ? `穿搭=${fashionStyle}` : '',
    artStyle ? `视觉=${artStyle}` : '',
    personaCue ? `气质=${personaCue}` : '',
  ], '; ', 280);

  return {
    subject,
    styleHints,
    continuityRefs,
    plannerSummary,
    referenceImageUrl: resolveLocalChatTargetReferenceImageUrl(target),
  };
}
