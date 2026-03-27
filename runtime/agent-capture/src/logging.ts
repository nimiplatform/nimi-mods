export function emitAgentCaptureLog(message: string, details?: Record<string, unknown>): void {
  try {
    console.info('[agent-capture]', message, details || {});
  } catch {
    // Ignore logging sink failures in non-browser or test contexts.
  }
}
