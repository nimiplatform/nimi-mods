import type { BuddyModelId, EmotionType } from '../contracts.js';

export interface BuddyMotionProfile {
  idle: string[];
  greet: string[];
  tap: string[];
  speak: string[];
  emotion: Record<EmotionType, string[]>;
  ambient: string[];
}

const HARU_PROFILE: BuddyMotionProfile = {
  idle: ['Idle'],
  greet: ['Tap', 'Flick'],
  tap: ['Tap', 'Flick', 'Flick3'],
  speak: ['Tap', 'Flick'],
  emotion: {
    happy: ['Tap', 'Flick'],
    excited: ['Shake', 'Flick3', 'Tap'],
    sad: ['FlickLeft', 'Idle'],
    surprised: ['Flick3', 'Shake'],
    thinking: ['FlickRight', 'FlickLeft', 'Idle'],
    sleepy: ['Idle'],
  },
  ambient: ['Flick', 'FlickLeft', 'FlickRight', 'Flick3', 'Shake'],
};

const HARU_GREETER_PROFILE: BuddyMotionProfile = {
  idle: [''],
  greet: [''],
  tap: [''],
  speak: [''],
  emotion: {
    happy: [''],
    excited: [''],
    sad: [''],
    surprised: [''],
    thinking: [''],
    sleepy: [''],
  },
  ambient: [''],
};

export function getBuddyMotionProfile(modelId: BuddyModelId): BuddyMotionProfile {
  if (modelId === 'haru_greeter') {
    return HARU_GREETER_PROFILE;
  }
  return HARU_PROFILE;
}
