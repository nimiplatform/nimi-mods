import { useCallback, useState } from 'react';

export function useWorldStudioShellState() {
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);

  const toggleSettingsDrawer = useCallback(() => {
    setSettingsDrawerOpen((value) => !value);
  }, []);

  return {
    settingsDrawerOpen,
    setSettingsDrawerOpen,
    toggleSettingsDrawer,
  };
}
