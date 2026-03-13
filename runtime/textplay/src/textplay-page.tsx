import React from 'react';
import { TextplayShell } from './components/textplay-shell.js';
import { TextplayVisualStyles } from './components/textplay-visual-styles.js';
import { useTextplayController } from './hooks/use-textplay-controller.js';

export function TextplayPage() {
  const props = useTextplayController();
  return (
    <div
      data-nimi-mod-root="textplay"
      className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      <TextplayVisualStyles />
      <TextplayShell {...props} />
    </div>
  );
}
