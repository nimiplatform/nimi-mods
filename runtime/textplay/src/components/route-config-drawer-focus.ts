export type RouteConfigDrawerFocusable = {
  focus: (options?: { preventScroll?: boolean }) => void;
};

export function focusRouteConfigDrawerTarget(target: RouteConfigDrawerFocusable | null | undefined): void {
  if (!target || typeof target.focus !== 'function') {
    return;
  }
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

export function resolveRouteConfigDrawerFocusTarget(input: {
  focusableElements: RouteConfigDrawerFocusable[];
  activeElement: RouteConfigDrawerFocusable | null;
  shiftKey: boolean;
}): RouteConfigDrawerFocusable | null {
  if (input.focusableElements.length === 0) {
    return null;
  }

  const currentIndex = input.activeElement
    ? input.focusableElements.indexOf(input.activeElement)
    : -1;

  if (currentIndex < 0) {
    return input.shiftKey
      ? (input.focusableElements[input.focusableElements.length - 1] || null)
      : (input.focusableElements[0] || null);
  }

  const nextIndex = input.shiftKey
    ? (currentIndex - 1 + input.focusableElements.length) % input.focusableElements.length
    : (currentIndex + 1) % input.focusableElements.length;

  return input.focusableElements[nextIndex] || null;
}
