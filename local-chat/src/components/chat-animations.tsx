import React from 'react';

const KEYFRAMES = `
.local-chat-root {
  --lc-shell-bg: linear-gradient(145deg, #f8fbfb 0%, #f3f7f7 55%, #eef4f4 100%);
  --lc-surface: #ffffff;
  --lc-surface-muted: #f7fafb;
  --lc-surface-raised: #fcfefe;
  --lc-border: #dbe4e8;
  --lc-border-strong: #c8d4d9;
  --lc-text-main: #1f2937;
  --lc-text-sub: #556275;
  --lc-text-soft: #7b8795;
  --lc-gap-xs: 6px;
  --lc-gap-sm: 10px;
  --lc-gap-md: 14px;
  --lc-gap-lg: 18px;
  --lc-r-sm: 10px;
  --lc-r-md: 14px;
  --lc-r-lg: 18px;
  --lc-r-xl: 24px;
  --lc-shadow-1: 0 2px 8px rgba(15, 23, 42, 0.05);
  --lc-shadow-2: 0 8px 24px rgba(15, 23, 42, 0.08);
  --lc-shadow-3: 0 16px 32px rgba(15, 23, 42, 0.1);
  --lc-pane-enter-dur: 380ms;
}
@keyframes chat-slide-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pane-fade-up {
  from { opacity: 0; transform: translateY(14px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes panel-slide-in-left {
  from { opacity: 0; transform: translateX(-14px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes panel-slide-in-right {
  from { opacity: 0; transform: translateX(14px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes panel-expand {
  from { opacity: 0; transform: translateY(-4px) scale(0.99); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes typing-dot-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}
@keyframes voice-bar {
  0%, 100% { height: 4px; }
  50% { height: 16px; }
}
@keyframes recording-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.7; }
}
@keyframes panel-scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes send-press {
  0% { transform: scale(1); }
  50% { transform: scale(0.9); }
  100% { transform: scale(1); }
}
.local-chat-root .lc-pane-stage {
  animation: pane-fade-up var(--lc-pane-enter-dur) cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
.local-chat-root .lc-pane-stage-main {
  animation-delay: 80ms;
}
.local-chat-root .lc-pane-stage-right {
  animation-delay: 140ms;
}
.local-chat-root .lc-pane-slide-left {
  animation-name: panel-slide-in-left;
}
.local-chat-root .lc-pane-slide-right {
  animation-name: panel-slide-in-right;
}
.local-chat-root .lc-card {
  border: 1px solid var(--lc-border);
  border-radius: var(--lc-r-lg);
  background: var(--lc-surface-raised);
  box-shadow: var(--lc-shadow-1);
}
.local-chat-root .lc-panel-expand {
  animation: panel-expand 220ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
.local-chat-root .lc-pill-divider {
  border: 1px solid var(--lc-border);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.86);
  color: var(--lc-text-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
@media (prefers-reduced-motion: reduce) {
  .local-chat-root,
  .local-chat-root * {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
`;

export function ChatAnimationStyles() {
  return <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />;
}
