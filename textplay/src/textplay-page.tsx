import React from 'react';
import { TextplayShell } from './components/textplay-shell.js';
import { useTextplayController } from './hooks/use-textplay-controller.js';

export function TextplayPage() {
  const props = useTextplayController();
  return (
    <div data-nimi-mod-root="textplay" className="h-full min-h-0">
      <TextplayShell {...props} />
    </div>
  );
}
