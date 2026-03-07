import React from 'react';

const STYLE_TEXT = `
.ui-sync-root {
  --ui-shell-bg: linear-gradient(145deg, #f8fbfb 0%, #f3f7f7 55%, #eef4f4 100%);
  --ui-surface: #ffffff;
  --ui-surface-muted: #f7fafb;
  --ui-surface-raised: #fcfefe;
  --ui-border: #dbe4e8;
  --ui-border-strong: #c8d4d9;
  --ui-text-main: #1f2937;
  --ui-text-sub: #556275;
  --ui-text-soft: #7b8795;
  --ui-shadow-1: 0 2px 8px rgba(15, 23, 42, 0.05);
  --ui-shadow-2: 0 10px 28px rgba(15, 23, 42, 0.08);
  --ui-shadow-3: 0 18px 38px rgba(15, 23, 42, 0.1);
  --ui-shadow-button: 0 8px 18px rgba(15, 23, 42, 0.08);
  --ui-shadow-button-hover: 0 14px 28px rgba(15, 23, 42, 0.12);
  background: var(--ui-shell-bg);
  color: var(--ui-text-main);
}

@keyframes ui-pane-fade-up {
  from { opacity: 0; transform: translateY(14px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes ui-pane-slide-left {
  from { opacity: 0; transform: translateX(-14px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes ui-pane-slide-right {
  from { opacity: 0; transform: translateX(14px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes ui-panel-expand {
  from { opacity: 0; transform: translateY(-4px) scale(0.99); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.ui-sync-root .ui-sync-pane {
  animation: ui-pane-fade-up 360ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}

.ui-sync-root .ui-sync-pane-side {
  animation-name: ui-pane-slide-left;
}

.ui-sync-root .ui-sync-pane-main {
  animation-delay: 70ms;
}

.ui-sync-root .ui-sync-pane-right {
  animation-delay: 130ms;
  animation-name: ui-pane-slide-right;
}

.ui-sync-root .ui-sync-card {
  border: 1px solid var(--ui-border);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(248, 250, 252, 0.97) 100%);
  box-shadow: var(--ui-shadow-1);
}

.ui-sync-root .ui-sync-soft-card {
  border: 1px solid rgba(203, 213, 225, 0.72);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(250, 252, 252, 0.98) 0%, rgba(242, 247, 247, 0.98) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.ui-sync-root .ui-sync-card-inset {
  animation: ui-panel-expand 220ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}

.ui-sync-root .ui-sync-pill {
  border: 1px solid var(--ui-border);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--ui-text-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.ui-sync-root button {
  transition:
    transform 180ms cubic-bezier(0.2, 0.7, 0.2, 1),
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease,
    filter 180ms ease;
  will-change: transform;
}

.ui-sync-root button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.ui-sync-root button:active:not(:disabled) {
  transform: translateY(0) scale(0.985);
}

.ui-sync-root button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  box-shadow: none;
}

.ui-sync-root .ui-sync-btn {
  box-shadow: var(--ui-shadow-button);
}

.ui-sync-root .ui-sync-btn-secondary {
  border-color: rgba(203, 213, 225, 0.95) !important;
  background: rgba(255, 255, 255, 0.96) !important;
  color: #475569 !important;
  box-shadow: var(--ui-shadow-1);
}

.ui-sync-root .ui-sync-btn-secondary:hover:not(:disabled) {
  border-color: rgba(134, 239, 172, 0.95) !important;
  background: #ffffff !important;
  color: #0f766e !important;
  box-shadow: var(--ui-shadow-button);
}

.ui-sync-root .ui-sync-btn-ghost {
  border-color: rgba(203, 213, 225, 0.8) !important;
  background: rgba(248, 250, 252, 0.82) !important;
  color: #64748b !important;
}

.ui-sync-root .ui-sync-btn-ghost:hover:not(:disabled) {
  border-color: rgba(148, 163, 184, 0.86) !important;
  background: rgba(255, 255, 255, 0.96) !important;
  color: #334155 !important;
}

.ui-sync-root .ui-sync-btn-primary,
.ui-sync-root button[class*="bg-[#4ECCA3]"],
.ui-sync-root button[class*="bg-brand-500"] {
  border-color: rgba(20, 184, 166, 0.15) !important;
  background: linear-gradient(135deg, #34d399 0%, #2dd4bf 46%, #22c55e 100%) !important;
  color: #ffffff !important;
  box-shadow: 0 10px 24px rgba(20, 184, 166, 0.24) !important;
}

.ui-sync-root .ui-sync-btn-primary:hover:not(:disabled),
.ui-sync-root button[class*="bg-[#4ECCA3]"]:hover:not(:disabled),
.ui-sync-root button[class*="bg-brand-500"]:hover:not(:disabled) {
  box-shadow: 0 14px 28px rgba(20, 184, 166, 0.3) !important;
  filter: saturate(1.03);
}

.ui-sync-root .ui-sync-btn-selected,
.ui-sync-root button[class*="border-[#4ECCA3]"][class*="text-[#4ECCA3]"],
.ui-sync-root button[class*="border-brand-200"][class*="text-brand-700"] {
  border-color: rgba(45, 212, 191, 0.58) !important;
  background: rgba(236, 253, 245, 0.92) !important;
  color: #0f766e !important;
  box-shadow: 0 8px 18px rgba(45, 212, 191, 0.12) !important;
}

.ui-sync-root :is(input, select, textarea) {
  border-color: rgba(203, 213, 225, 0.86) !important;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%) !important;
  color: var(--ui-text-main);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    transform 180ms ease;
}

.ui-sync-root :is(input, select, textarea):focus {
  outline: none;
  border-color: rgba(94, 234, 212, 0.88) !important;
  box-shadow:
    0 0 0 4px rgba(94, 234, 212, 0.12),
    0 14px 32px rgba(15, 23, 42, 0.08) !important;
}

.ui-sync-root textarea {
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.ui-sync-root .ui-sync-input-shell {
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
}

.ui-sync-root .ui-sync-input-shell:focus-within {
  border-color: rgba(94, 234, 212, 0.85);
  box-shadow:
    0 18px 38px rgba(15, 23, 42, 0.1),
    0 0 0 4px rgba(94, 234, 212, 0.12);
}

.ui-sync-root :is(section, article, aside, div, details)[class*="bg-white"][class*="border"] {
  border-color: var(--ui-border);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(248, 250, 252, 0.97) 100%);
  box-shadow: var(--ui-shadow-1);
}

.ui-sync-root :is(section, article, div, details)[class*="bg-gray-50"][class*="border"],
.ui-sync-root :is(section, article, div, details)[class*="bg-slate-50"][class*="border"] {
  border-color: rgba(214, 226, 232, 0.9);
  background: linear-gradient(180deg, rgba(248, 251, 252, 0.96) 0%, rgba(241, 246, 247, 0.96) 100%);
}

.ui-sync-root :is(header, aside)[class*="bg-white"] {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 252, 252, 0.97) 100%);
}

@media (prefers-reduced-motion: reduce) {
  .ui-sync-root .ui-sync-pane,
  .ui-sync-root .ui-sync-card-inset,
  .ui-sync-root button,
  .ui-sync-root :is(input, select, textarea) {
    animation: none !important;
    transition: none !important;
    transform: none !important;
  }
}
`;

export function TextplayVisualStyles(): React.ReactElement {
  return <style>{STYLE_TEXT}</style>;
}
