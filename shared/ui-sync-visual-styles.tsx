import React from 'react';

const STYLE_TEXT = `
.ui-sync-root {
  --ui-shell-bg:
    radial-gradient(circle at top left, rgba(78, 204, 163, 0.14), transparent 34%),
    radial-gradient(circle at top right, rgba(0, 184, 219, 0.1), transparent 28%),
    linear-gradient(160deg, #fbfffe 0%, #f4fbf8 54%, #eef7f5 100%);
  --ui-surface: rgba(255, 255, 255, 0.98);
  --ui-surface-muted: rgba(246, 250, 251, 0.96);
  --ui-surface-raised: rgba(252, 255, 255, 0.98);
  --ui-border: rgba(203, 213, 225, 0.88);
  --ui-border-strong: rgba(148, 163, 184, 0.36);
  --ui-text-main: #1f2937;
  --ui-text-sub: #475569;
  --ui-text-soft: #64748b;
  --ui-shadow-1: 0 8px 24px rgba(15, 23, 42, 0.06);
  --ui-shadow-2: 0 18px 42px rgba(15, 23, 42, 0.09);
  --ui-shadow-3: 0 28px 72px rgba(15, 23, 42, 0.14);
  --ui-shadow-button: 0 10px 22px rgba(15, 23, 42, 0.08);
  --ui-shadow-button-hover: 0 16px 32px rgba(15, 23, 42, 0.12);
  --ui-shadow-warning: 0 10px 24px rgba(217, 119, 6, 0.1);
  --ui-shadow-danger: 0 10px 24px rgba(239, 68, 68, 0.12);
  background: var(--ui-shell-bg);
  color: var(--ui-text-main);
  font-family: var(--font-ui);
}

@keyframes ui-pane-fade-up {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes ui-pane-slide-left {
  from {
    opacity: 0;
    transform: translateX(-14px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes ui-pane-slide-right {
  from {
    opacity: 0;
    transform: translateX(14px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes ui-panel-expand {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
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

.ui-sync-root .ui-sync-shell-header {
  background:
    radial-gradient(circle at top left, rgba(167, 243, 208, 0.22), transparent 38%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 252, 251, 0.96) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.86),
    0 8px 24px rgba(15, 23, 42, 0.05);
}

.ui-sync-root .ui-sync-shell-title {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1;
}

.ui-sync-root .ui-sync-shell-subtitle {
  color: var(--ui-text-soft);
}

.ui-sync-root .ui-sync-shell-main {
  background:
    radial-gradient(ellipse at top, rgba(78, 204, 163, 0.1) 0%, rgba(78, 204, 163, 0) 44%),
    linear-gradient(180deg, rgba(251, 255, 254, 0.98) 0%, rgba(244, 251, 248, 0.96) 58%, rgba(238, 247, 245, 0.96) 100%);
}

.ui-sync-root .ui-sync-shell-sidebar-left,
.ui-sync-root .ui-sync-shell-sidebar-right {
  background: linear-gradient(180deg, rgba(243, 249, 247, 0.96) 0%, rgba(237, 246, 244, 0.96) 100%);
}

.ui-sync-root .ui-sync-card,
.ui-sync-root .ui-sync-empty-card {
  border: 1px solid var(--ui-border);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(248, 251, 252, 0.97) 100%);
  box-shadow: var(--ui-shadow-1);
  transition:
    border-color 220ms ease,
    box-shadow 220ms ease,
    background-color 220ms ease;
}

.ui-sync-root .ui-sync-soft-card,
.ui-sync-root .ui-sync-metric-card,
.ui-sync-root .ui-sync-toolbar,
.ui-sync-root .ui-sync-tabbar,
.ui-sync-root .ui-sync-code-panel {
  border: 1px solid rgba(214, 226, 232, 0.92);
  background: linear-gradient(180deg, rgba(250, 252, 252, 0.98) 0%, rgba(242, 247, 247, 0.98) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 8px 20px rgba(15, 23, 42, 0.05);
}

.ui-sync-root .ui-sync-soft-card {
  border-radius: 16px;
}

.ui-sync-root .ui-sync-toolbar,
.ui-sync-root .ui-sync-tabbar,
.ui-sync-root .ui-sync-code-panel {
  border-radius: 18px;
}

.ui-sync-root .ui-sync-metric-card {
  border-radius: 16px;
}

.ui-sync-root .ui-sync-empty-card {
  color: var(--ui-text-soft);
}

.ui-sync-root .ui-sync-card-inset,
.ui-sync-root details[open] {
  animation: ui-panel-expand 220ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}

.ui-sync-root .ui-sync-pill,
.ui-sync-root .ui-sync-status-info,
.ui-sync-root .ui-sync-status-success,
.ui-sync-root .ui-sync-status-warning,
.ui-sync-root .ui-sync-status-danger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 9999px;
  border: 1px solid var(--ui-border);
  background: rgba(255, 255, 255, 0.88);
  color: var(--ui-text-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.ui-sync-root .ui-sync-status-info {
  border-color: rgba(125, 211, 252, 0.82);
  background: rgba(240, 249, 255, 0.96);
  color: #0369a1;
}

.ui-sync-root .ui-sync-status-success {
  border-color: rgba(167, 243, 208, 0.82);
  background: rgba(236, 253, 245, 0.96);
  color: #047857;
}

.ui-sync-root .ui-sync-status-warning {
  border-color: rgba(253, 224, 71, 0.72);
  background: rgba(255, 251, 235, 0.96);
  color: #b45309;
}

.ui-sync-root .ui-sync-status-danger {
  border-color: rgba(252, 165, 165, 0.82);
  background: rgba(254, 242, 242, 0.97);
  color: #b91c1c;
}

.ui-sync-root .ui-sync-node-card {
  border: 1px solid rgba(214, 226, 232, 0.92);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.97) 100%);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
  transition:
    transform 180ms cubic-bezier(0.2, 0.7, 0.2, 1),
    border-color 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.ui-sync-root .ui-sync-node-card:hover {
  transform: translateY(-1px);
  border-color: rgba(78, 204, 163, 0.45);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08);
}

.ui-sync-root .ui-sync-node-card-selected {
  border-color: rgba(78, 204, 163, 0.5) !important;
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.96) 0%, rgba(245, 255, 250, 0.94) 100%) !important;
  box-shadow: 0 16px 30px rgba(78, 204, 163, 0.14) !important;
}

.ui-sync-root .ui-sync-alert {
  border-radius: 16px;
  border: 1px solid transparent;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.ui-sync-root .ui-sync-alert-success {
  border-color: rgba(167, 243, 208, 0.82) !important;
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.96) 0%, rgba(240, 253, 250, 0.96) 100%) !important;
  color: #047857 !important;
}

.ui-sync-root .ui-sync-alert-warning {
  border-color: rgba(253, 224, 71, 0.72) !important;
  background: linear-gradient(180deg, rgba(255, 251, 235, 0.96) 0%, rgba(255, 247, 237, 0.96) 100%) !important;
  color: #b45309 !important;
}

.ui-sync-root .ui-sync-alert-danger {
  border-color: rgba(252, 165, 165, 0.82) !important;
  background: linear-gradient(180deg, rgba(254, 242, 242, 0.97) 0%, rgba(254, 226, 226, 0.95) 100%) !important;
  color: #b91c1c !important;
}

.ui-sync-root .ui-sync-alert-info {
  border-color: rgba(125, 211, 252, 0.82) !important;
  background: linear-gradient(180deg, rgba(240, 249, 255, 0.97) 0%, rgba(224, 242, 254, 0.95) 100%) !important;
  color: #0369a1 !important;
}

.ui-sync-root .ui-sync-code-panel :is(textarea, pre) {
  background: rgba(255, 255, 255, 0.72) !important;
}

.ui-sync-root summary {
  transition: color 180ms ease;
}

.ui-sync-root summary:hover {
  color: #334155;
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
  border-color: rgba(78, 204, 163, 0.52) !important;
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
  border-color: rgba(78, 204, 163, 0.18) !important;
  background: linear-gradient(135deg, #4ECCA3 0%, #3DBB96 46%, #00b8db 100%) !important;
  color: #ffffff !important;
  box-shadow: 0 12px 26px rgba(78, 204, 163, 0.26) !important;
}

.ui-sync-root .ui-sync-btn-primary:hover:not(:disabled),
.ui-sync-root button[class*="bg-[#4ECCA3]"]:hover:not(:disabled),
.ui-sync-root button[class*="bg-brand-500"]:hover:not(:disabled) {
  box-shadow: 0 16px 32px rgba(78, 204, 163, 0.3) !important;
  filter: saturate(1.03);
}

.ui-sync-root .ui-sync-btn-selected,
.ui-sync-root button[class*="border-[#4ECCA3]"][class*="text-[#4ECCA3]"],
.ui-sync-root button[class*="border-brand-200"][class*="text-brand-700"],
.ui-sync-root button[class*="bg-brand-50"][class*="text-brand-700"] {
  border-color: rgba(78, 204, 163, 0.56) !important;
  background: rgba(236, 253, 245, 0.94) !important;
  color: #0f766e !important;
  box-shadow: 0 8px 18px rgba(78, 204, 163, 0.12) !important;
}

.ui-sync-root button[class*="border-amber-300"][class*="bg-white"],
.ui-sync-root button[class*="border-amber-400"][class*="bg-white"],
.ui-sync-root button[class*="text-amber-800"][class*="bg-white"] {
  border-color: rgba(251, 191, 36, 0.45) !important;
  background: rgba(255, 251, 235, 0.92) !important;
  color: #b45309 !important;
  box-shadow: var(--ui-shadow-warning) !important;
}

.ui-sync-root button[class*="border-amber-300"][class*="bg-white"]:hover:not(:disabled),
.ui-sync-root button[class*="border-amber-400"][class*="bg-white"]:hover:not(:disabled),
.ui-sync-root button[class*="text-amber-800"][class*="bg-white"]:hover:not(:disabled) {
  border-color: rgba(245, 158, 11, 0.6) !important;
  background: rgba(255, 247, 237, 0.98) !important;
  color: #92400e !important;
  box-shadow: 0 12px 24px rgba(217, 119, 6, 0.12) !important;
}

.ui-sync-root button[class*="border-red-300"][class*="bg-white"],
.ui-sync-root button[class*="text-red-700"][class*="bg-white"] {
  border-color: rgba(252, 165, 165, 0.72) !important;
  background: rgba(254, 242, 242, 0.96) !important;
  color: #b91c1c !important;
  box-shadow: var(--ui-shadow-danger) !important;
}

.ui-sync-root button[class*="border-red-300"][class*="bg-white"]:hover:not(:disabled),
.ui-sync-root button[class*="text-red-700"][class*="bg-white"]:hover:not(:disabled) {
  border-color: rgba(248, 113, 113, 0.82) !important;
  background: rgba(254, 226, 226, 0.98) !important;
  color: #991b1b !important;
  box-shadow: 0 12px 24px rgba(239, 68, 68, 0.14) !important;
}

.ui-sync-root :is(input:not([type="checkbox"]):not([type="radio"]), select, textarea) {
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

.ui-sync-root :is(input:not([type="checkbox"]):not([type="radio"]), select, textarea):focus {
  outline: none;
  border-color: rgba(78, 204, 163, 0.72) !important;
  box-shadow:
    0 0 0 4px rgba(78, 204, 163, 0.12),
    0 14px 32px rgba(15, 23, 42, 0.08) !important;
}

.ui-sync-root textarea {
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.ui-sync-root input[type="checkbox"],
.ui-sync-root input[type="radio"] {
  accent-color: #4ECCA3;
}

.ui-sync-root .ui-sync-input-shell {
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
}

.ui-sync-root .ui-sync-input-shell:focus-within {
  border-color: rgba(78, 204, 163, 0.72);
  box-shadow:
    0 18px 38px rgba(15, 23, 42, 0.1),
    0 0 0 4px rgba(78, 204, 163, 0.12);
}

.ui-sync-root :is(section, article, aside, div, details)[class*="bg-white"][class*="border"] {
  border-color: var(--ui-border);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(248, 250, 252, 0.97) 100%);
  box-shadow: var(--ui-shadow-1);
  transition:
    border-color 220ms ease,
    box-shadow 220ms ease,
    background-color 220ms ease;
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
  .ui-sync-root :is(input:not([type="checkbox"]):not([type="radio"]), select, textarea) {
    animation: none !important;
    transition: none !important;
    transform: none !important;
  }
}
`.trim();

export function UiSyncVisualStyles(): React.ReactElement {
  return <style>{STYLE_TEXT}</style>;
}
