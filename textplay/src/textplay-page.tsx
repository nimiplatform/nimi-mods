import React from 'react';
import { TextplayShell } from './components/textplay-shell.js';
import { useTextplayController } from './hooks/use-textplay-controller.js';

export function TextplayPage() {
  const props = useTextplayController();
  return <TextplayShell {...props} />;
}
