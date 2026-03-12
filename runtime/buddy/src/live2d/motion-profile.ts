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
    calm: ['Idle', 'Flick'],
    shy: ['FlickLeft', 'Tap'],
    confused: ['FlickRight', 'Idle'],
    playful: ['Flick3', 'Tap'],
    caring: ['Flick', 'Idle'],
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
    calm: [''],
    shy: [''],
    confused: [''],
    playful: [''],
    caring: [''],
  },
  ambient: [''],
};

const HIYORI_PROFILE: BuddyMotionProfile = {
  idle: ['Idle'],
  greet: ['Tap', 'Flick', 'FlickUp'],
  tap: ['Tap', 'Tap@Body', 'Flick'],
  speak: ['Tap', 'Tap@Body', 'FlickUp'],
  emotion: {
    happy: ['Tap', 'Flick'],
    excited: ['Tap@Body', 'FlickUp', 'Tap'],
    sad: ['Idle', 'FlickDown'],
    surprised: ['FlickUp', 'Tap@Body'],
    thinking: ['Idle', 'Flick', 'FlickDown'],
    sleepy: ['Idle'],
    calm: ['Idle', 'Flick'],
    shy: ['Tap', 'FlickDown'],
    confused: ['Flick', 'FlickDown'],
    playful: ['Tap@Body', 'Tap'],
    caring: ['Idle', 'FlickUp'],
  },
  ambient: ['Flick', 'FlickDown', 'FlickUp', 'Tap@Body'],
};

export function getBuddyMotionProfile(modelId: BuddyModelId): BuddyMotionProfile {
  if (modelId === 'haru_greeter') {
    return HARU_GREETER_PROFILE;
  }
  if (modelId === 'hiyori') {
    return HIYORI_PROFILE;
  }
  return HARU_PROFILE;
}
