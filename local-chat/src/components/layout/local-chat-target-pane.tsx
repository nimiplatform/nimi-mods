import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { getTargetInitial } from '../../services/index.js';
import { resolvePresenceTheme } from './presence-theme.js';
import type { LocalChatTargetItem } from './types.js';

type LocalChatTargetPaneProps = {
  visibleTargets: LocalChatTargetItem[];
  loadingTargets: boolean;
  selectedTargetId: string;
  setSelectedTargetId: (value: string) => void;
  targetSearchText: string;
  setTargetSearchText: (value: string) => void;
  onOpenSettings: () => void;
  searchIcon: React.ReactNode;
};

type BubbleLayout = {
  left: number;
  top: number;
  size: number;
  labelTop: number;
  zIndex: number;
};

type BubbleLayoutResult = {
  items: Record<string, BubbleLayout>;
  height: number;
};

const STAGE_DECORATIONS = [
  { top: '8%', left: '7%', size: 72, opacity: 0.14 },
  { top: '18%', left: '79%', size: 48, opacity: 0.12 },
  { top: '62%', left: '14%', size: 64, opacity: 0.1 },
  { top: '74%', left: '81%', size: 84, opacity: 0.08 },
];

const BASE_SIZE = 120;
const LABEL_HEIGHT = 44;
const JITTER_MAX = 10;
const GAP = 14;
const CELL = BASE_SIZE + GAP;
const ROW_HEIGHT_FACTOR = 0.8660254; // sqrt(3)/2
const HOVER_SCALE = 1.45;
const PUSH_RADIUS = CELL * 2.0;
const PUSH_STRENGTH = 26;
const FISHEYE_RADIUS = CELL * 3.5;
const FISHEYE_MIN_SCALE = 0.78;
const FISHEYE_IDLE_SCALE = 0.88;

const ICON_SETTINGS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10.91 3H11a2 2 0 1 1 4 0h.09a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolveUnreadBadge(
  unreadCount: LocalChatTargetItem['unreadCount'],
): string | null {
  if (typeof unreadCount !== 'number' || unreadCount <= 0) return null;
  return unreadCount > 99 ? '99+' : String(unreadCount);
}

export function resolveOnlineBadgeState(
  isOnline: LocalChatTargetItem['isOnline'],
): 'online' | 'offline' | null {
  if (typeof isOnline !== 'boolean') return null;
  return isOnline ? 'online' : 'offline';
}

/**
 * Scrollable honeycomb cloud — Apple Watch style.
 * Odd rows (0, 2, 4…): fewer columns (narrow). Even rows (1, 3, 5…): +1 column (wide).
 * First row is short, second is wide — classic honeycomb interlock.
 * Bubble SIZE is uniform; fisheye is done via CSS transform: scale() at render
 * time so it reacts to scroll position (GPU-composited, no reflow).
 */
function buildBubbleSpaceLayout(input: {
  targets: LocalChatTargetItem[];
  stageWidth: number;
}): BubbleLayoutResult {
  const targetCount = input.targets.length;
  if (targetCount === 0) {
    return { items: {}, height: 400 };
  }

  const topPadding = 48;
  const bottomPadding = 96;
  const safeWidth = Math.max(input.stageWidth, 600);

  // Narrow cloud: ~60 % of width.
  const cloudWidth = Math.min(safeWidth * 0.62, safeWidth - 180);
  const wideCols = clamp(Math.floor(cloudWidth / CELL), 3, 7);
  const narrowCols = wideCols - 1;

  const rowHeight = Math.round(CELL * ROW_HEIGHT_FACTOR) + LABEL_HEIGHT;

  // Assign targets: row 0 = narrow, row 1 = wide, row 2 = narrow …
  type CellAssignment = { row: number; col: number; rowCount: number };
  const cells: CellAssignment[] = [];
  let cursor = 0;
  let row = 0;
  while (cursor < targetCount) {
    const maxCols = row % 2 === 0 ? narrowCols : wideCols;
    const rowCount = Math.min(maxCols, targetCount - cursor);
    for (let col = 0; col < rowCount; col++) {
      cells.push({ row, col, rowCount });
      cursor++;
    }
    row++;
  }

  const centerX = safeWidth / 2;
  const items: Record<string, BubbleLayout> = {};
  let maxBottom = topPadding;

  input.targets.forEach((target, index) => {
    const cell = cells[index];
    if (!cell) return;

    // Each row centred independently; narrow/wide difference creates interlock.
    const rowMid = (cell.rowCount - 1) / 2;
    const cellX = (cell.col - rowMid) * CELL;
    const cellY = cell.row * rowHeight;

    const seed = hashSeed(target.id || `${target.displayName}-${index}`);

    // Subtle jitter.
    const jx = ((seed % 9) - 4) * 1.2;
    const jy = ((Math.floor(seed / 13) % 9) - 4) * 1.2;

    const bubbleLeft = centerX + cellX - BASE_SIZE / 2 + jx;
    const bubbleTop = topPadding + cellY + jy;
    const labelTop = bubbleTop + BASE_SIZE + 8;

    items[target.id] = {
      left: bubbleLeft,
      top: bubbleTop,
      size: BASE_SIZE,
      labelTop,
      zIndex: 20 + (seed % 3),
    };
    maxBottom = Math.max(maxBottom, labelTop + LABEL_HEIGHT);
  });

  return {
    items,
    height: Math.ceil(maxBottom + bottomPadding),
  };
}

export function LocalChatTargetPane({
  visibleTargets,
  loadingTargets,
  selectedTargetId,
  setSelectedTargetId,
  targetSearchText,
  setTargetSearchText,
  onOpenSettings,
  searchIcon,
}: LocalChatTargetPaneProps) {
  const { t } = useModTranslation('local-chat');
  const [transitioningTargetId, setTransitioningTargetId] = React.useState<string | null>(null);
  const transitionTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageViewportRef = React.useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = React.useState(1280);
  // Fisheye state in refs — direct DOM manipulation, no React re-render.
  const mousePosRef = React.useRef<{ x: number; y: number } | null>(null);
  const hoveredIdRef = React.useRef<string | null>(null);
  const transitioningIdRef = React.useRef<string | null>(null);
  const mousePosRafRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      if (mousePosRafRef.current) {
        cancelAnimationFrame(mousePosRafRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    const element = stageViewportRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const SNAP = 60;
    const snap = (value: number) => Math.max(720, Math.round(value / SNAP) * SNAP);
    setStageWidth(snap(element.clientWidth));
    const observer = new ResizeObserver(() => {
      const snapped = snap(element.clientWidth);
      setStageWidth((previous) => (previous === snapped ? previous : snapped));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const bubbleLayout = React.useMemo(() => buildBubbleSpaceLayout({
    targets: visibleTargets,
    stageWidth,
  }), [stageWidth, visibleTargets]);
  const bubbleLayoutRef = React.useRef(bubbleLayout);
  bubbleLayoutRef.current = bubbleLayout;

  // Apply fisheye transforms directly to DOM — bypasses React entirely.
  const applyFisheyeTransforms = React.useCallback(() => {
    const viewport = stageViewportRef.current;
    if (!viewport) return;
    const items = bubbleLayoutRef.current.items;
    const mousePos = mousePosRef.current;
    const hoveredId = hoveredIdRef.current;
    const tid = transitioningIdRef.current;
    const outers = viewport.querySelectorAll<HTMLElement>('[data-bubble-id]');
    outers.forEach((outerEl) => {
      const id = outerEl.dataset.bubbleId || '';
      const innerEl = outerEl.firstElementChild as HTMLElement | null;
      if (!innerEl || !items[id]) return;
      const item = items[id];
      const isHovered = hoveredId === id;
      const isTransitioning = tid === id;
      const isMuted = Boolean(tid && !isTransitioning);
      const cx = item.left + item.size / 2;
      const cy = item.top + item.size / 2;
      let fisheyeScale: number;
      if (mousePos) {
        const dx = cx - mousePos.x;
        const dy = cy - mousePos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        fisheyeScale = 1 - clamp(dist / FISHEYE_RADIUS, 0, 1) * (1 - FISHEYE_MIN_SCALE);
      } else {
        fisheyeScale = FISHEYE_IDLE_SCALE;
      }
      let tx = 0;
      let ty = 0;
      let scaleBoost = 1;
      if (hoveredId && !isHovered) {
        const hl = items[hoveredId];
        if (hl) {
          const dx = cx - (hl.left + hl.size / 2);
          const dy = cy - (hl.top + hl.size / 2);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < PUSH_RADIUS && dist > 0) {
            const pf = 1 - dist / PUSH_RADIUS;
            const pd = PUSH_STRENGTH * pf * pf;
            tx = (dx / dist) * pd;
            ty = (dy / dist) * pd;
            scaleBoost = 1 - pf * 0.08;
          }
        }
      }
      const scale = isTransitioning
        ? 1.06
        : isHovered
          ? fisheyeScale * HOVER_SCALE
          : isMuted
            ? fisheyeScale * 0.92 * scaleBoost
            : fisheyeScale * scaleBoost;
      const translate = (tx !== 0 || ty !== 0) ? `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) ` : '';
      innerEl.style.transform = `${translate}scale(${scale.toFixed(3)})`;
      innerEl.style.opacity = isMuted ? '0' : '1';
      outerEl.style.zIndex = String(isHovered ? item.zIndex + 30 : isTransitioning ? item.zIndex + 20 : item.zIndex);
    });
  }, []);

  const handleStageMouseMove = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (mousePosRafRef.current) return;
    mousePosRafRef.current = requestAnimationFrame(() => {
      mousePosRafRef.current = 0;
      const el = stageViewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top + el.scrollTop;
      mousePosRef.current = { x: mx, y: my };
      // Hit-test: determine which bubble the mouse is over.
      const items = bubbleLayoutRef.current.items;
      const hitRadius = BASE_SIZE / 2 + 12;
      let bestId: string | null = null;
      for (const id of Object.keys(items)) {
        const item = items[id]!;
        const dx = mx - (item.left + item.size / 2);
        const dy = my - (item.top + item.size / 2);
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          bestId = id;
          break;
        }
      }
      hoveredIdRef.current = bestId;
      applyFisheyeTransforms();
    });
  }, [applyFisheyeTransforms]);

  const handleStageMouseLeave = React.useCallback(() => {
    mousePosRef.current = null;
    hoveredIdRef.current = null;
    applyFisheyeTransforms();
  }, [applyFisheyeTransforms]);

  // Sync transitioning state to ref and reapply transforms.
  React.useEffect(() => {
    transitioningIdRef.current = transitioningTargetId;
    applyFisheyeTransforms();
  }, [transitioningTargetId, applyFisheyeTransforms]);

  // Reapply when layout changes (targets added/removed/resized).
  React.useEffect(() => {
    applyFisheyeTransforms();
  }, [bubbleLayout, applyFisheyeTransforms]);

  const handleSelectTarget = React.useCallback((targetId: string) => {
    if (!targetId || transitioningTargetId) {
      return;
    }
    setTransitioningTargetId(targetId);
    transitionTimerRef.current = setTimeout(() => {
      setSelectedTargetId(targetId);
      setTransitioningTargetId(null);
      transitionTimerRef.current = null;
    }, 220);
  }, [setSelectedTargetId, transitioningTargetId]);

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(94,234,212,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(125,211,252,0.12),_transparent_28%),linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(239,246,247,0.92))]" />

      <div
        className={`relative z-10 flex min-h-0 flex-1 flex-col gap-6 px-6 pb-6 pt-7 transition-opacity duration-200 ${
          transitioningTargetId ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-mint-700/80">
              {t('TargetPane.heroEyebrow')}
            </p>
            <h1 className="mt-3 text-[42px] font-black tracking-tight text-slate-900 sm:text-[56px] sm:leading-[1.02]">
              {t('TargetPane.heroTitle')}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
              {t('TargetPane.heroDescription')}
            </p>
            {t('TargetPane.heroHint') ? (
              <p className="mt-4 inline-flex rounded-full border border-white/80 bg-white/78 px-3 py-1 text-xs font-medium text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                {t('TargetPane.heroHint')}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex h-12 min-w-[240px] items-center rounded-full border border-white/80 bg-white/90 px-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] sm:min-w-[320px]">
              <span className="text-slate-400">{searchIcon}</span>
              <input
                className="ml-3 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                placeholder={t('TargetPane.searchPlaceholder')}
                value={targetSearchText}
                onChange={(event) => setTargetSearchText(event.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="lc-btn lc-btn-secondary h-12 w-12 rounded-full text-slate-700"
              aria-label={t('Header.openSettings')}
              title={t('Header.openSettings')}
            >
              {ICON_SETTINGS}
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[34px] border border-white/80 bg-white/44 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.42),transparent)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-[linear-gradient(0deg,rgba(255,255,255,0.42),transparent)]" />
          <div
            ref={stageViewportRef}
            className="h-full overflow-y-scroll overflow-x-hidden overscroll-contain px-4 py-6"
            onMouseMove={handleStageMouseMove}
            onMouseLeave={handleStageMouseLeave}
          >
            {visibleTargets.length === 0 ? (
              <div className="flex h-full min-h-[360px] items-center justify-center">
                <div className="lc-card max-w-md rounded-[28px] border-dashed bg-white/82 px-6 py-8 text-center">
                  <p className="text-lg font-semibold text-slate-900">{t('TargetPane.noResultsTitle')}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{t('TargetPane.noResults')}</p>
                </div>
              </div>
            ) : (
              <div
                className="relative min-h-[680px] w-full"
                style={{ height: `${bubbleLayout.height}px` }}
              >
                {visibleTargets.map((target, index) => {
                  const layout = bubbleLayout.items[target.id];
                  if (!layout) {
                    return null;
                  }
                  const theme = resolvePresenceTheme({
                    seed: target.id || `${target.displayName}-${index}`,
                    emotionalTemperature: Number(target.unreadCount || 0) > 0 ? 'warm' : 'steady',
                  });
                  const bubbleSeed = hashSeed(target.id || `${target.displayName}-${index}`);
                  const floatDuration = 5.6 + ((bubbleSeed % 4) * 0.5);
                  const floatDelay = (bubbleSeed % 7) * 160;
                  const onlineState = resolveOnlineBadgeState(target.isOnline);
                  const unreadBadge = resolveUnreadBadge(target.unreadCount);
                  const isSelected = selectedTargetId === target.id;

                  return (
                    <div
                      key={target.id}
                      data-bubble-id={target.id}
                      className="absolute"
                      style={{
                        left: `${layout.left}px`,
                        top: `${layout.top}px`,
                        width: `${layout.size + 24}px`,
                        height: `${layout.size + LABEL_HEIGHT + 24}px`,
                        zIndex: layout.zIndex,
                        animation: `lc-bubble-float ${floatDuration}s ease-in-out ${floatDelay}ms infinite`,
                      }}
                    >
                    {/* Inner div: transform managed by applyFisheyeTransforms via DOM. */}
                    <div
                      className="h-full w-full"
                      style={{
                        transform: `scale(${FISHEYE_IDLE_SCALE})`,
                        transition: 'transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease',
                        willChange: 'transform',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectTarget(target.id)}
                        className="group relative flex items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-mint-200"
                        style={{
                          width: `${layout.size}px`,
                          height: `${layout.size}px`,
                        }}
                        aria-label={target.displayName}
                        aria-pressed={isSelected}
                      >
                        <span
                          className="pointer-events-none absolute inset-[-10px] rounded-full opacity-70 transition-[opacity,transform] duration-200 ease-out group-hover:opacity-100 group-hover:scale-[1.05] group-focus-visible:opacity-100"
                          style={{
                            background: `radial-gradient(circle, ${theme.accentSoft} 0%, transparent 68%)`,
                          }}
                        />
                        <span
                          className={`pointer-events-none absolute inset-[-3px] rounded-full border transition-[opacity,transform,box-shadow] duration-200 ease-out ${
                            unreadBadge ? 'lc-bubble-ring' : ''
                          }`}
                          style={{
                            borderColor: theme.border,
                            boxShadow: unreadBadge
                              ? `0 0 0 1px ${theme.border}, 0 0 20px ${theme.accentSoft}`
                              : isSelected
                                ? `0 0 0 1px ${theme.border}, 0 12px 24px ${theme.accentSoft}`
                                : '0 10px 20px rgba(15, 23, 42, 0.06)',
                          }}
                        />
                        <span
                          className="pointer-events-none absolute inset-0 rounded-full border border-white/80 shadow-[0_8px_16px_rgba(15,23,42,0.06)]"
                          style={{
                            background: theme.bubbleSurface,
                          }}
                        />
                        <span className="absolute inset-[8px] overflow-hidden rounded-full border border-white/80 bg-white/90">
                          {target.avatarUrl ? (
                            <img
                              src={target.avatarUrl}
                              alt={target.displayName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span
                              className="flex h-full w-full items-center justify-center text-3xl font-black"
                              style={{ color: theme.text }}
                            >
                              {getTargetInitial(target)}
                            </span>
                          )}
                        </span>
                        {onlineState ? (
                          <span
                            className={`absolute bottom-[16%] right-[15%] h-4 w-4 rounded-full border-2 border-white ${
                              onlineState === 'online' ? 'bg-mint-500' : 'bg-slate-300'
                            }`}
                          />
                        ) : null}
                        {unreadBadge ? (
                          <span className="absolute -right-2 top-2 inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-slate-900 px-2 text-[11px] font-bold text-white shadow-[0_10px_20px_rgba(15,23,42,0.2)]">
                            {unreadBadge}
                          </span>
                        ) : null}
                      </button>

                      <p
                        className="absolute left-1/2 -translate-x-1/2 truncate text-center text-xs font-semibold text-slate-700"
                        style={{
                          top: `${layout.labelTop - layout.top}px`,
                          maxWidth: `${layout.size + 22}px`,
                        }}
                      >
                        {target.displayName}
                      </p>
                    </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
