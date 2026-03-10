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
  --lc-shadow-button: 0 8px 18px rgba(15, 23, 42, 0.08);
  --lc-shadow-button-hover: 0 12px 24px rgba(15, 23, 42, 0.12);
  --lc-pane-enter-dur: 380ms;
}
@keyframes chat-slide-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes chat-drift-in {
  from { opacity: 0; transform: translate3d(-8px, 18px, 0) scale(0.985); }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
@keyframes chat-scale-in {
  from { opacity: 0; transform: translateY(18px) scale(0.92); }
  to { opacity: 1; transform: translateY(0) scale(1); }
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
@keyframes typing-bubble-breathe {
  0%, 100% {
    transform: translateY(0);
    opacity: 0.98;
  }
  50% {
    transform: translateY(-1px);
    opacity: 1;
  }
}
@keyframes typing-caret-pulse {
  0%, 100% {
    opacity: 0.32;
    transform: scaleY(0.82);
  }
  50% {
    opacity: 1;
    transform: scaleY(1);
  }
}
@keyframes typing-trail-flow {
  0%, 100% {
    opacity: 0.28;
    transform: translateX(0) scaleX(0.92);
  }
  50% {
    opacity: 0.68;
    transform: translateX(1px) scaleX(1);
  }
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
@keyframes lc-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes lc-bubble-float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
@keyframes lc-preview-float {
  0%, 100% {
    transform: translate(-50%, 0);
  }
  50% {
    transform: translate(-50%, -6px);
  }
}
@keyframes lc-bubble-ring-pulse {
  0%, 100% {
    opacity: 0.44;
    transform: scale(1);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.04);
  }
}
@keyframes lc-current-turn-glow {
  0%, 100% {
    opacity: 0.22;
  }
  50% {
    opacity: 0.42;
  }
}
@keyframes lc-current-turn-aura {
  0%, 100% {
    opacity: 0.18;
  }
  50% {
    opacity: 0.34;
  }
}
@keyframes lc-current-turn-edge {
  0%, 100% {
    opacity: 0.16;
  }
  50% {
    opacity: 0.28;
  }
}
@keyframes lc-stage-breathe {
  0%, 100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-2px) scale(1.015);
  }
}
@keyframes lc-stage-aura-glow {
  0%, 100% {
    opacity: 0.5;
    transform: scale(0.98);
  }
  50% {
    opacity: 0.82;
    transform: scale(1.03);
  }
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
.local-chat-root .lc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 14px;
  border: 1px solid transparent;
  transition:
    transform 180ms cubic-bezier(0.2, 0.7, 0.2, 1),
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease;
}
.local-chat-root .lc-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}
.local-chat-root .lc-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.985);
}
.local-chat-root .lc-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  box-shadow: none;
}
.local-chat-root .lc-btn-secondary {
  border-color: rgba(203, 213, 225, 0.95);
  background: rgba(255, 255, 255, 0.96);
  color: #475569;
  box-shadow: var(--lc-shadow-1);
}
.local-chat-root .lc-btn-secondary:hover:not(:disabled) {
  border-color: rgba(134, 239, 172, 0.95);
  background: #ffffff;
  color: #0f766e;
  box-shadow: var(--lc-shadow-button);
}
.local-chat-root .lc-stage-dialogue-shell {
  animation: panel-expand 280ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
.local-chat-root .lc-stage-avatar-frame {
  animation: lc-stage-breathe 5.4s ease-in-out infinite;
}
.local-chat-root .lc-stage-aura {
  animation: lc-stage-aura-glow 6s ease-in-out infinite;
}
.local-chat-root .lc-btn-primary {
  border-color: rgba(20, 184, 166, 0.15);
  background: linear-gradient(135deg, #34d399 0%, #2dd4bf 46%, #22c55e 100%);
  color: #ffffff;
  box-shadow: 0 10px 24px rgba(20, 184, 166, 0.24);
}
.local-chat-root .lc-btn-primary:hover:not(:disabled) {
  box-shadow: 0 14px 28px rgba(20, 184, 166, 0.3);
  filter: saturate(1.03);
}
.local-chat-root .lc-btn-warning {
  border-color: rgba(251, 191, 36, 0.45);
  background: rgba(255, 251, 235, 0.92);
  color: #b45309;
  box-shadow: 0 8px 18px rgba(217, 119, 6, 0.08);
}
.local-chat-root .lc-btn-warning:hover:not(:disabled) {
  border-color: rgba(245, 158, 11, 0.6);
  background: rgba(255, 247, 237, 0.98);
  color: #92400e;
}
.local-chat-root .lc-btn-ghost {
  border-color: rgba(203, 213, 225, 0.75);
  background: rgba(248, 250, 252, 0.8);
  color: #64748b;
}
.local-chat-root .lc-btn-ghost:hover:not(:disabled) {
  border-color: rgba(148, 163, 184, 0.85);
  background: rgba(255, 255, 255, 0.96);
  color: #334155;
}
.local-chat-root .lc-target-card {
  transition:
    transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
    box-shadow 220ms ease,
    border-color 220ms ease,
    background-color 220ms ease;
}
.local-chat-root .lc-target-card-active {
  box-shadow: 0 16px 28px rgba(16, 185, 129, 0.14);
}
.local-chat-root .lc-bubble-ring {
  animation: lc-bubble-ring-pulse 2.4s ease-in-out infinite;
}
.local-chat-root .lc-input-shell {
  border: 1px solid rgba(203, 213, 225, 0.82);
  background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
}
.local-chat-root .lc-input-shell:focus-within {
  border-color: rgba(94, 234, 212, 0.85);
  box-shadow:
    0 18px 38px rgba(15, 23, 42, 0.1),
    0 0 0 4px rgba(94, 234, 212, 0.12);
}
.local-chat-root .lc-sidebar-skeleton {
  border-left: 1px solid var(--lc-border);
  background: linear-gradient(180deg, #f6fafb 0%, #eff5f7 100%);
}
.local-chat-root .lc-skeleton-bar,
.local-chat-root .lc-skeleton-pill,
.local-chat-root .lc-skeleton-card {
  background: linear-gradient(90deg, rgba(226, 232, 240, 0.88) 0%, rgba(241, 245, 249, 0.98) 50%, rgba(226, 232, 240, 0.88) 100%);
  background-size: 200% 100%;
  animation: lc-shimmer 1.4s linear infinite;
}
.local-chat-root .lc-media-skeleton {
  background:
    linear-gradient(135deg, rgba(255,255,255,0.78), rgba(255,255,255,0.18)),
    linear-gradient(90deg, rgba(226, 232, 240, 0.82) 0%, rgba(241, 245, 249, 0.98) 50%, rgba(226, 232, 240, 0.82) 100%);
  background-size: 100% 100%, 200% 100%;
  animation: lc-shimmer 1.5s linear infinite;
}
.local-chat-root .lc-skeleton-pill {
  border-radius: 9999px;
}
.local-chat-root .lc-skeleton-card {
  border-radius: 22px;
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
.local-chat-root .lc-message-group {
  position: relative;
}
.local-chat-root .lc-message-group-history {
  content-visibility: auto;
  contain-intrinsic-size: 240px;
}
.local-chat-root .lc-current-turn-shell {
  position: relative;
  isolation: isolate;
}
.local-chat-root .lc-current-turn-halo {
  position: absolute;
  inset: -7px -9px;
  border-radius: 30px;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(108% 112% at 50% 50%, rgba(220, 252, 231, 0.3) 0%, rgba(187, 247, 208, 0.22) 38%, rgba(94, 234, 212, 0.1) 58%, rgba(94, 234, 212, 0) 78%),
    radial-gradient(40% 42% at 16% 22%, rgba(52, 211, 153, 0.12), rgba(52, 211, 153, 0) 82%),
    radial-gradient(38% 40% at 84% 18%, rgba(45, 212, 191, 0.1), rgba(45, 212, 191, 0) 82%);
  animation: lc-current-turn-aura 6.4s ease-in-out infinite;
  will-change: opacity;
}
.local-chat-root .lc-current-turn-halo-pending {
  opacity: 0.82;
  animation-duration: 5.1s;
}
.local-chat-root .lc-current-turn-card {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  contain: paint;
  transform: translateZ(0);
  z-index: 1;
  border-color: rgba(187, 247, 208, 0.76);
  box-shadow:
    0 12px 28px rgba(15, 23, 42, 0.06),
    0 0 0 1px rgba(255, 255, 255, 0.78),
    0 0 0 6px rgba(167, 243, 208, 0.06);
}
.local-chat-root .lc-current-turn-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.46) 0%, rgba(255, 255, 255, 0.12) 42%, rgba(236, 253, 245, 0.34) 74%, rgba(220, 252, 231, 0.24) 100%),
    radial-gradient(circle at 12% 14%, rgba(167, 243, 208, 0.18) 0%, rgba(167, 243, 208, 0) 40%),
    radial-gradient(circle at 86% 16%, rgba(94, 234, 212, 0.12) 0%, rgba(94, 234, 212, 0) 42%);
  animation: lc-current-turn-glow 6.4s ease-in-out infinite;
  z-index: 0;
  will-change: opacity;
}
.local-chat-root .lc-current-turn-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: radial-gradient(circle at 50% 50%, rgba(167, 243, 208, 0.1), rgba(167, 243, 208, 0) 72%);
  animation: lc-current-turn-edge 6.4s ease-in-out infinite;
  z-index: 0;
  will-change: opacity;
}
.local-chat-root .lc-current-turn-card > * {
  position: relative;
  z-index: 1;
}
.local-chat-root .lc-current-turn-card-pending {
  border-color: rgba(167, 243, 208, 0.84);
  box-shadow:
    0 12px 26px rgba(15, 23, 42, 0.06),
    0 0 0 1px rgba(148, 163, 184, 0.06);
}
.local-chat-root .lc-current-turn-card-pending::before {
  opacity: 0.5;
}
.local-chat-root .lc-current-turn-card-pending::after {
  opacity: 0.3;
}
.local-chat-root .lc-current-turn-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid rgba(94, 234, 212, 0.3);
  border-radius: 9999px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(244, 253, 250, 0.92) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}
.local-chat-root .lc-typing-bubble {
  position: relative;
  overflow: hidden;
  contain: paint;
  border: 1px solid rgba(203, 213, 225, 0.94);
  border-radius: 24px;
  background:
    radial-gradient(circle at top left, rgba(167, 243, 208, 0.22), transparent 46%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  animation: typing-bubble-breathe 2.6s ease-in-out infinite;
}
.local-chat-root .lc-typing-bubble::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0) 0%, rgba(94, 234, 212, 0.12) 48%, rgba(255, 255, 255, 0) 100%);
  transform: translateX(-110%);
  animation: lc-shimmer 2.8s linear infinite;
  opacity: 0.75;
}
.local-chat-root .lc-typing-row {
  position: relative;
  z-index: 1;
}
.local-chat-root .lc-typing-label {
  color: #475569;
}
.local-chat-root .lc-typing-dot {
  background: linear-gradient(180deg, #5eead4 0%, #34d399 100%);
  box-shadow: 0 0 0 1px rgba(45, 212, 191, 0.14);
}
.local-chat-root .lc-typing-caret {
  display: inline-block;
  height: 16px;
  width: 2px;
  border-radius: 9999px;
  background: linear-gradient(180deg, rgba(45, 212, 191, 0.35) 0%, rgba(20, 184, 166, 0.95) 100%);
  animation: typing-caret-pulse 1.15s ease-in-out infinite;
}
.local-chat-root .lc-typing-trail {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 26px;
}
.local-chat-root .lc-typing-trail > span {
  display: inline-block;
  height: 2px;
  border-radius: 9999px;
  background: linear-gradient(90deg, rgba(45, 212, 191, 0.2) 0%, rgba(45, 212, 191, 0.72) 100%);
  animation: typing-trail-flow 1.6s ease-in-out infinite;
}
.local-chat-root .lc-typing-trail > span:first-child {
  width: 16px;
}
.local-chat-root .lc-typing-trail > span:last-child {
  width: 10px;
  animation-delay: 180ms;
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
