import React from 'react';
import { useBuddyController } from './hooks/use-buddy-controller.js';
import { BuddyWorkbench } from './ui/buddy-workbench.js';
import { getSdkRuntimeContext } from './sdk-context.js';

export function BuddyPage() {
  const controller = useBuddyController(getSdkRuntimeContext());
  return <BuddyWorkbench {...controller} />;
}
