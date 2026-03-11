import React from 'react';

export const LOCAL_CHAT_DESKTOP_LAYOUT_BREAKPOINT_PX = 960;
export const LOCAL_CHAT_DESKTOP_MEDIA_QUERY = `(min-width: ${LOCAL_CHAT_DESKTOP_LAYOUT_BREAKPOINT_PX}px)`;

export type LocalChatLayoutMode = 'desktop' | 'compact';

export function resolveLocalChatLayoutMode(width: number | null | undefined): LocalChatLayoutMode {
  return typeof width === 'number' && Number.isFinite(width) && width >= LOCAL_CHAT_DESKTOP_LAYOUT_BREAKPOINT_PX
    ? 'desktop'
    : 'compact';
}

export function useLocalChatLayoutMode(): LocalChatLayoutMode {
  const [layoutMode, setLayoutMode] = React.useState<LocalChatLayoutMode>(() => {
    if (typeof window === 'undefined') {
      return 'compact';
    }
    return resolveLocalChatLayoutMode(window.innerWidth);
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(LOCAL_CHAT_DESKTOP_MEDIA_QUERY);
    const sync = (matches: boolean) => {
      setLayoutMode(matches ? 'desktop' : 'compact');
    };

    sync(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      sync(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return layoutMode;
}
