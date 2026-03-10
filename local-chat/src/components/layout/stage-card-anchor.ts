type RectLike = {
  top: number;
  height: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolveStageCardAnchorOffset(input: {
  avatarRect: RectLike;
  stageRect: RectLike;
}): number {
  const avatarCenter = input.avatarRect.top + (input.avatarRect.height / 2);
  const rawOffset = avatarCenter - input.stageRect.top;
  const stageHeight = Math.max(input.stageRect.height, 1);
  const safetyMargin = Math.min(160, Math.max(96, stageHeight * 0.18));
  const maxOffset = Math.max(safetyMargin, stageHeight - safetyMargin);
  return clamp(rawOffset, safetyMargin, maxOffset);
}
