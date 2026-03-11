/**
 * Module-level holder for SDK runtime context.
 * Deliberately separate from buddy-page.tsx to avoid pulling in the
 * Live2D / pixi import chain at mod-registration time.
 */
let _sdkRuntimeContext: unknown = null;

export function setSdkRuntimeContext(ctx: unknown) {
  _sdkRuntimeContext = ctx;
}

export function getSdkRuntimeContext(): unknown {
  return _sdkRuntimeContext;
}

export function clearSdkRuntimeContext() {
  _sdkRuntimeContext = null;
}
