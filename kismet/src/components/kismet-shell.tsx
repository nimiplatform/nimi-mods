import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKismetStore } from '../state/kismet-store.js';
import { useKismetController } from '../hooks/use-kismet-controller.js';
import { InputForm } from './input-form.js';
import { ModelSelector } from './model-selector.js';
import { PromptImportPanel } from './prompt-import-panel.js';
import { RouteStatusBadge } from './route-status-badge.js';
import { ResultView } from './result-view.js';
import { ErrorPanel } from './error-panel.js';
import { ModeSwitcher } from './mode-switcher.js';
import { DailyFortuneView } from './daily-fortune-view.js';
import { FortuneStickView } from './fortune-stick-view.js';

const KISMET_STYLES = `
.ks-serif { font-family: var(--font-serif); }
.ks-sans { font-family: var(--font-display); }
.gu-card {
  position: relative;
  background: #181615;
  border: 1px solid rgba(138, 114, 84, 0.2);
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  transition: border-color 0.3s;
}
.gu-card:hover { border-color: rgba(138, 114, 84, 0.5); }
.gu-card::before, .gu-card::after {
  content: ''; position: absolute; width: 8px; height: 8px;
  border: 1px solid #8A7254; opacity: 0.4; pointer-events: none;
}
.gu-card::before { top: 0; left: 0; border-right: none; border-bottom: none; }
.gu-card::after { bottom: 0; right: 0; border-left: none; border-top: none; }
.gu-tag::before { content: '\\3010'; color: #8A7254; opacity: 0.6; }
.gu-tag::after { content: '\\3011'; color: #8A7254; opacity: 0.6; }
.kismet-root {
  --ks-font-ui: var(--font-ui);
  --ks-font-display: var(--font-display);
  --ks-font-serif: var(--font-serif);
  background-color: #100f0d;
  background-image:
    radial-gradient(circle at 50% 0%, #201D1A 0%, transparent 70%),
    url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%25" height="100%25" filter="url(%23n)" opacity="0.03"/></svg>');
  color: #E8E3D7;
  font-family: var(--ks-font-ui);
}
.kismet-root ::-webkit-scrollbar { width: 6px; }
.kismet-root ::-webkit-scrollbar-track { background: transparent; }
.kismet-root ::-webkit-scrollbar-thumb { background: rgba(138, 114, 84, 0.3); border-radius: 10px; }
.kismet-root ::-webkit-scrollbar-thumb:hover { background: #8A7254; }
.kismet-root input, .kismet-root select, .kismet-root textarea {
  font-family: var(--ks-font-serif);
}
.ks-input {
  width: 100%; background: transparent; border: none;
  border-bottom: 1px solid rgba(138, 114, 84, 0.3);
  color: #E8E3D7; padding: 6px 0; font-size: 1.05rem;
  outline: none; transition: border-color 0.3s;
}
.ks-input:focus { border-bottom-color: #8A7254; }
.ks-input option { background: #181615; color: #E8E3D7; }
.ks-btn-seal {
  width: 100%; padding: 14px; background: transparent;
  border: 1px solid #A6382E; color: #A6382E;
  font-size: 1rem; font-weight: 600; letter-spacing: 6px;
  cursor: pointer; transition: all 0.4s;
  font-family: var(--ks-font-serif);
}
.ks-btn-seal:hover { background: #A6382E; color: #E8E3D7; box-shadow: 0 0 15px rgba(166,56,46,0.3); }
.ks-btn-seal:disabled { opacity: 0.5; pointer-events: none; }
@keyframes ks-spin { 100% { transform: rotate(360deg); } }
@keyframes ks-spin-rev { 100% { transform: rotate(-360deg); } }
@keyframes ks-breathe {
  0% { transform: translate(-50%,-50%) scale(0.9); opacity: 0.5; }
  100% { transform: translate(-50%,-50%) scale(1.1); opacity: 1; }
}
.ks-ring-outer {
  position: absolute; width: 100%; height: 100%;
  border: 1px dashed rgba(138,114,84,0.2); border-radius: 50%;
  animation: ks-spin 60s linear infinite;
}
.ks-ring-outer::before, .ks-ring-outer::after {
  content: ''; position: absolute; width: 100%; height: 100%;
  border: 1px solid rgba(138,114,84,0.1); border-radius: 50%;
  transform: scale(0.95);
}
.ks-ring-inner {
  position: absolute; width: 65%; height: 65%; top: 17.5%; left: 17.5%;
  border: 2px solid rgba(138,114,84,0.05); border-radius: 50%;
  animation: ks-spin-rev 40s linear infinite;
}
.ks-ring-inner::before, .ks-ring-inner::after {
  content: ''; position: absolute; left: 50%; transform: translateX(-50%);
  width: 6px; height: 6px; background: #8A7254; border-radius: 50%;
  box-shadow: 0 0 10px #8A7254;
}
.ks-ring-inner::before { top: -3px; }
.ks-ring-inner::after { bottom: -3px; }
.ks-core-glow {
  position: absolute; width: 300px; height: 300px; top: 50%; left: 50%;
  transform: translate(-50%,-50%);
  background: radial-gradient(circle, rgba(138,114,84,0.08) 0%, transparent 70%);
  border-radius: 50%;
  animation: ks-breathe 4s ease-in-out infinite alternate;
}
.ks-seal-line {
  width: 1px; background: linear-gradient(to bottom, transparent, #8B2620, transparent);
}
@keyframes ks-toast-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.ks-ritual-box {
  position: relative; z-index: 10;
  background: rgba(10,9,8,0.6); backdrop-filter: blur(8px);
  border: 1px solid rgba(138,114,84,0.2);
  padding: 50px 80px; text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 20px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}
.ks-ritual-box::before, .ks-ritual-box::after {
  content: ''; position: absolute; width: 15px; height: 15px;
  border: 1px solid #8A7254; opacity: 0.6; pointer-events: none;
}
.ks-ritual-box::before { top: -1px; left: -1px; border-right: none; border-bottom: none; }
.ks-ritual-box::after { bottom: -1px; right: -1px; border-left: none; border-top: none; }

/* ── Draft pillar animations ── */
@keyframes ks-pillar-in {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ks-name-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ks-day-breathe {
  0% { text-shadow: 0 0 5px rgba(166,56,46,0.1); opacity: 0.85; }
  100% { text-shadow: 0 0 20px rgba(166,56,46,0.6); opacity: 1; }
}
@keyframes ks-ring-expand {
  0% { transform: translate(-50%,-50%) scale(0.5); opacity: 0; border-width: 8px; }
  50% { opacity: 1; border-width: 2px; }
  100% { transform: translate(-50%,-50%) scale(5); opacity: 0; border-width: 0; }
}
@keyframes ks-flash {
  0% { opacity: 0; }
  60% { opacity: 0.8; background: #D4AF37; }
  100% { opacity: 0; background: #100f0d; }
}
.ks-pillar-char { transition: all 0.8s ease; }
.ks-activating .ks-pillar-char {
  color: #fff !important;
  text-shadow: 0 0 20px #D4AF37, 0 0 40px #D4AF37, 0 0 80px #D4AF37 !important;
  transform: scale(1.1);
}
.ks-activating .ks-day-char {
  color: #fff !important;
  text-shadow: 0 0 20px #ff4d40, 0 0 40px #D4AF37, 0 0 80px #ff4d40 !important;
  animation: none !important;
}
`;

const PILLAR_LABELS = [
  ['year', '年'],
  ['month', '月'],
  ['day', '日'],
  ['hour', '时'],
] as const;

const PILLAR_DELAYS = { year: '0.2s', month: '0.4s', day: '0.6s', hour: '0.8s' } as const;

function DraftProfileCard(props: {
  subjectName: string;
  pillars: { year: string; month: string; day: string; hour: string };
  onPillarChange: (key: 'year' | 'month' | 'day' | 'hour', value: string) => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [activating, setActivating] = useState(false);

  function handleConfirm() {
    setActivating(true);
    setTimeout(() => {
      setActivating(false);
      props.onGenerate();
    }, 2200);
  }

  return (
    <div className={activating ? 'ks-activating' : ''} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Subject name */}
      <div
        style={{
          alignSelf: 'center',
          marginBottom: 20,
          opacity: activating ? 0 : 1,
          transition: 'opacity 0.5s',
          animation: 'ks-name-in 1.2s ease forwards',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 1, background: 'linear-gradient(to right, transparent, #8A7254)' }} />
          <span className="ks-serif" style={{ fontSize: '0.75rem', color: '#8C857B', letterSpacing: 4 }}>命 主</span>
          <div style={{ width: 28, height: 1, background: 'linear-gradient(to left, transparent, #8A7254)' }} />
        </div>
        <div
          className="ks-serif"
          style={{
            fontSize: '1.4rem',
            fontWeight: 600,
            letterSpacing: 6,
            background: 'linear-gradient(135deg, #C9A96E 0%, #8A7254 40%, #D4AF37 60%, #8A7254 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: 'none',
            filter: 'drop-shadow(0 0 6px rgba(138,114,84,0.3))',
          }}
        >
          {props.subjectName || '—'}
        </div>
      </div>

      {/* Dashed separator */}
      <div style={{ width: '100%', borderTop: '1px dashed rgba(138,114,84,0.3)', marginBottom: 40 }} />

      {/* Magic ring (hidden, activated on confirm) */}
      <div style={{
        position: 'absolute', top: '45%', left: '50%',
        transform: 'translate(-50%,-50%) scale(0)',
        width: 160, height: 160, borderRadius: '50%',
        border: '2px solid #D4AF37',
        boxShadow: '0 0 40px #D4AF37, inset 0 0 40px #D4AF37',
        opacity: 0, pointerEvents: 'none', zIndex: 0,
        ...(activating ? { animation: 'ks-ring-expand 2.2s cubic-bezier(0.25,1,0.5,1) forwards' } : {}),
      }} />

      {/* Pillars */}
      <div style={{ display: 'flex', gap: 60, marginBottom: 24, position: 'relative', zIndex: 2 }}>
        {PILLAR_LABELS.map(([key, label]) => {
          const isDay = key === 'day';
          return (
            <div
              key={key}
              className="flex flex-col items-center"
              style={{
                gap: 12,
                opacity: 0,
                animation: `ks-pillar-in 0.8s ease forwards ${PILLAR_DELAYS[key]}`,
              }}
            >
              <div
                className="ks-serif"
                style={{
                  fontSize: '0.8rem',
                  color: isDay ? '#A6382E' : '#8C857B',
                  borderBottom: `1px solid ${isDay ? 'rgba(166,56,46,0.4)' : 'rgba(138,114,84,0.4)'}`,
                  paddingBottom: 4,
                  width: '100%',
                  textAlign: 'center',
                }}
              >
                {label}
              </div>
              {editing ? (
                <input
                  type="text"
                  value={props.pillars[key]}
                  onChange={(e) => props.onPillarChange(key, e.target.value)}
                  className="ks-serif"
                  style={{ width: 48, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(138,114,84,0.4)', outline: 'none', textAlign: 'center', fontSize: '1.6rem', color: '#8A7254' }}
                  disabled={props.loading || activating}
                />
              ) : (
                <div
                  className={`ks-serif ks-pillar-char${isDay ? ' ks-day-char' : ''}`}
                  style={{
                    fontSize: '2rem',
                    lineHeight: 1.4,
                    fontWeight: isDay ? 500 : 400,
                    color: isDay ? '#A6382E' : '#E8E3D7',
                    textAlign: 'center',
                    letterSpacing: 2,
                    ...(isDay && !activating ? { animation: 'ks-day-breathe 4s infinite alternate ease-in-out' } : {}),
                  }}
                >
                  {props.pillars[key].charAt(0)}
                  <br />
                  {props.pillars[key].charAt(1) || ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modify link */}
      <div
        style={{
          alignSelf: 'flex-end', marginBottom: 30,
          opacity: activating ? 0 : 1,
          transition: 'opacity 0.5s',
        }}
      >
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          disabled={props.loading || activating}
          className="ks-serif"
          style={{ background: 'none', border: 'none', color: '#8C857B', cursor: 'pointer', fontSize: '0.9rem', letterSpacing: 2 }}
        >
          {editing ? '完成' : '修改'}
        </button>
      </div>

      {/* Action button */}
      <div
        style={{
          width: '100%',
          opacity: activating ? 0 : 1,
          transition: 'opacity 0.5s',
          pointerEvents: activating ? 'none' : 'auto',
        }}
      >
        <button
          type="button"
          onClick={handleConfirm}
          disabled={props.loading || activating}
          className="ks-serif"
          style={{
            width: '100%', padding: '15px 0', background: 'transparent',
            border: '1px solid rgba(166,56,46,0.4)', color: '#A6382E',
            fontSize: '1rem', letterSpacing: 4, cursor: 'pointer',
            borderRadius: 2, transition: 'all 0.3s',
          }}
        >
          {activating ? '天 机 衍 算 中 …' : props.loading ? '推 演 中 …' : '确 认 生 成'}
        </button>
      </div>

      {/* Screen flash overlay */}
      {activating && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          pointerEvents: 'none', zIndex: 9999, mixBlendMode: 'overlay',
          animation: 'ks-flash 2.2s ease-in forwards 0.3s',
        }} />
      )}
    </div>
  );
}

export function KismetShell() {
  const { t } = useTranslation('kismet');
  const store = useKismetStore();
  const controller = useKismetController();
  const { route } = controller;
  const [routeExpanded, setRouteExpanded] = useState(false);
  const [dailySubTab, setDailySubTab] = useState<'fortune' | 'stick'>('fortune');

  const showPromptPanel = Boolean(store.generatedPrompt && store.error);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KISMET_STYLES }} />
      {/* Share toast */}
      {store.shareMessage && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 10000,
            padding: '12px 24px',
            background: 'rgba(138,114,84,0.95)',
            color: '#E8E3D7',
            fontSize: '0.85rem',
            fontFamily: 'var(--font-serif)',
            letterSpacing: 2,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            animation: 'ks-toast-in 0.3s ease',
          }}
        >
          {t('Share.copiedToast')}
        </div>
      )}
      <div className="kismet-root flex h-full min-h-0">
        {/* Sidebar */}
        <div className="w-[320px] shrink-0 overflow-y-auto p-6" style={{ borderRight: '1px solid rgba(138,114,84,0.2)' }}>
          <div className="mb-6 flex justify-center">
            <div
              className="ks-serif"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'upright',
                fontSize: '2rem',
                fontWeight: 600,
                color: '#8A7254',
                letterSpacing: '6px',
                borderLeft: '2px solid #A6382E',
                paddingLeft: 12,
                height: 140,
                textShadow: '0 0 10px rgba(138,114,84,0.2)',
              }}
            >
              天机·司命
            </div>
          </div>

          <div className="mb-5">
            <ModeSwitcher activeTab={store.activeTab} onTabChange={store.setActiveTab} />
          </div>

          <div className="mb-5">
            <button
              type="button"
              onClick={() => setRouteExpanded(!routeExpanded)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
              }}
            >
              <RouteStatusBadge source={route.routeSource} />
              <span style={{ fontSize: '0.7rem', color: '#8C857B', transition: 'transform 0.2s', transform: routeExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
            </button>
            {routeExpanded && (
              <div className="mt-3 space-y-3">
                <ModelSelector
                  routeBinding={route.routeBinding}
                  chatRouteOptions={route.chatRouteOptions}
                  routeOptionsLoading={route.routeOptionsLoading}
                  routeOptionsError={route.routeOptionsError}
                  onSourceChange={route.handleSourceChange}
                  onConnectorChange={route.handleConnectorChange}
                  onModelChange={route.handleModelChange}
                  onClear={route.clearOverride}
                  onReload={() => {
                    void route.reloadRouteOptions();
                  }}
                />
              </div>
            )}
          </div>

          {store.primaryProfile && (
            <div style={{ padding: '10px 14px', background: 'rgba(138,114,84,0.08)', border: '1px solid rgba(138,114,84,0.15)' }}>
              <div className="ks-serif text-xs" style={{ color: '#8A7254' }}>当前命主</div>
              <div className="ks-serif mt-1" style={{ fontSize: '0.9rem', color: '#E8E3D7' }}>
                {store.primaryProfile.birthInput.name || store.primaryProfile.canonicalProfile.dayMaster.label} · {store.primaryProfile.canonicalProfile.zodiac}
              </div>
              {!store.natalResult && store.primaryProfile.natalResult && (
                <button
                  type="button"
                  onClick={() => {
                    if (store.primaryProfile) {
                      store.setNatalResult(store.primaryProfile.natalResult!);
                      store.setConfirmedProfile(store.primaryProfile.canonicalProfile);
                      store.setActiveTab('natal-profile');
                    }
                  }}
                  disabled={store.loading}
                  className="ks-serif"
                  style={{ marginTop: 10, width: '100%', padding: '8px 0', background: 'transparent', border: '1px solid rgba(138,114,84,0.3)', color: '#8A7254', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: 2, transition: 'all 0.3s' }}
                >
                  加载上次命盘
                </button>
              )}
            </div>
          )}

          {store.activeTab === 'natal-profile' && (
            <InputForm
              title={t('InputForm.natalTitle')}
              value={store.birthInput}
              onChange={store.setBirthInput}
              onSubmit={() => { store.setNatalResult(null); controller.deriveBirthProfile(); }}
              submitLabel={t('InputForm.deriveButton')}
              disabled={store.loading}
            />
          )}

          {store.activeTab === 'daily-fortune' && (
            <div className="space-y-4">
              <div className="gu-card" style={{ padding: 20 }}>
                <h3 className="ks-serif text-sm" style={{ color: '#8A7254', fontWeight: 600 }}>{t('DailyFortune.title')}</h3>
                <p className="mt-2 text-sm" style={{ lineHeight: 1.8, color: '#8C857B' }}>{t('DailyFortune.description')}</p>
                {store.confirmedProfile && (
                  <div className="mt-3" style={{ padding: '10px 14px', background: 'rgba(138,114,84,0.08)', border: '1px solid rgba(138,114,84,0.15)' }}>
                    <div className="ks-serif text-xs" style={{ color: '#8A7254' }}>
                      {t('DailyFortune.savedProfileLabel')}
                    </div>
                    <div className="ks-serif mt-1" style={{ fontSize: '0.9rem', color: '#E8E3D7' }}>
                      {store.birthInput.name || store.confirmedProfile.dayMaster.label} · {store.confirmedProfile.zodiac}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={controller.generateDailyFortune}
                  disabled={store.loading || !store.confirmedProfile}
                  className="ks-btn-seal mt-4"
                  style={{ letterSpacing: '4px' }}
                >
                  {t('DailyFortune.generateButton')}
                </button>
                {!store.confirmedProfile && (
                  <p className="mt-3 text-xs" style={{ color: '#A6382E' }}>{t('DailyFortune.blocked')}</p>
                )}
              </div>
            </div>
          )}

          {store.activeTab === 'compatibility' && (
            <div className="gu-card" style={{ padding: 28 }}>
              <h3 className="ks-serif text-sm" style={{ color: '#8A7254', fontWeight: 600 }}>{t('Compatibility.title')}</h3>
              <p className="ks-serif mt-3" style={{ fontSize: '0.95rem', lineHeight: 1.8, color: '#8C857B' }}>
                {t('Compatibility.comingSoonHint')}
              </p>
            </div>
          )}
        </div>

        {/* Main content */}
        {store.activeTab === 'compatibility' ? (
          <div className="flex-1 overflow-hidden" style={{ position: 'relative' }}>
            {/* Header overlay */}
            <div
              className="ks-serif"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                padding: '30px 40px',
                zIndex: 2,
                fontSize: '1.1rem',
                color: '#736b60',
                letterSpacing: 2,
              }}
            >
              {t('Compatibility.title')} / Matchmaking
            </div>

            {/* Ritual container */}
            <div
              className="flex items-center justify-center"
              style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                background: 'radial-gradient(circle at 50% 50%, rgba(20,18,17,1) 0%, #100f0d 80%)',
              }}
            >
              {/* Astrolabe array */}
              <div style={{ position: 'absolute', width: 600, height: 600, pointerEvents: 'none' }}>
                <div className="ks-ring-outer" />
                <div className="ks-ring-inner" />
                <div className="ks-core-glow" />
              </div>

              {/* Message box */}
              <div className="ks-ritual-box ks-serif">
                <div className="ks-seal-line" style={{ height: 40 }} />
                <div style={{ fontSize: '2.2rem', fontWeight: 500, color: '#8A7254', letterSpacing: 12, textShadow: '0 0 15px rgba(138,114,84,0.3)' }}>
                  {t('Compatibility.ritualTitle')}
                </div>
                <div style={{ fontSize: '1rem', color: '#736b60', lineHeight: 2, maxWidth: 400, letterSpacing: 2 }}>
                  {t('Compatibility.ritualLine1Pre')}
                  <span style={{ color: '#8B2620', fontWeight: 600 }}>{t('Compatibility.ritualLine1Highlight')}</span>
                  {t('Compatibility.ritualLine1Post')}
                  <br />
                  {t('Compatibility.ritualLine2')}
                </div>
                <div className="ks-seal-line" style={{ height: 20 }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6" style={{ maxWidth: 1200 }}>
            <div className="mb-5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(138,114,84,0.2)', paddingBottom: 12 }}>
              {store.activeTab === 'daily-fortune' ? (
                <div className="flex" style={{ gap: 0 }}>
                  {([['fortune', t('DailyFortune.subTabFortune')], ['stick', t('DailyFortune.subTabStick')]] as const).map(([key, label]) => {
                    const active = dailySubTab === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDailySubTab(key)}
                        className="ks-serif"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '0 16px 0 0', fontSize: '0.85rem', letterSpacing: 2,
                          color: active ? '#8A7254' : '#8C857B',
                          borderBottom: active ? '2px solid #8A7254' : '2px solid transparent',
                          paddingBottom: 2, marginRight: 16,
                          transition: 'all 0.3s',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm" style={{ color: '#8C857B', letterSpacing: 2 }}>{t(`Tabs.${store.activeTab}`)}</div>
              )}
            </div>

            {store.error && (
              <div className="mb-4">
                <ErrorPanel
                  error={store.error}
                  onRetry={
                    store.activeTab === 'natal-profile'
                      ? controller.generateNatalAnalysis
                      : controller.generateDailyFortune
                  }
                />
              </div>
            )}

            {showPromptPanel && store.generatedPrompt && (
              <div className="mb-6">
                <PromptImportPanel
                  title={store.generatedPrompt.title}
                  systemPrompt={store.generatedPrompt.systemPrompt}
                  userPrompt={store.generatedPrompt.userPrompt}
                  onCopyAll={controller.copyPrompts}
                  onImport={controller.importResult}
                  loading={store.loading}
                />
              </div>
            )}

            {store.activeTab === 'natal-profile' && store.natalResult && <ResultView result={store.natalResult} />}
            {store.activeTab === 'natal-profile' && !store.natalResult && store.draftProfile && (
              <div className="flex items-start justify-center" style={{ paddingTop: 40 }}>
                <div style={{ width: '100%', maxWidth: 480 }}>
                  <DraftProfileCard
                    subjectName={store.birthInput.name || ''}
                    pillars={store.draftProfile.pillars}
                    onPillarChange={(key, value) => {
                      if (store.draftProfile) {
                        store.setDraftProfile({
                          ...store.draftProfile,
                          pillars: { ...store.draftProfile.pillars, [key]: value },
                        });
                      }
                    }}
                    onGenerate={controller.generateNatalAnalysis}
                    loading={store.loading}
                  />
                </div>
              </div>
            )}
            {store.activeTab === 'natal-profile' && !store.natalResult && !store.draftProfile && !store.loading && !store.error && (
              <div className="gu-card flex items-center justify-center" style={{ minHeight: 320, color: '#8C857B', fontSize: '0.9rem' }}>
                {t('EmptyState.natal')}
              </div>
            )}
            {/* Daily fortune sub-tab: fortune */}
            {store.activeTab === 'daily-fortune' && dailySubTab === 'fortune' && store.dailyResult && (
              <DailyFortuneView
                result={store.dailyResult}
                loading={store.loading}
                onDrawFortuneStick={() => { controller.generateFortuneStick(); setDailySubTab('stick'); }}
                onShare={controller.shareContent}
              />
            )}
            {store.activeTab === 'daily-fortune' && dailySubTab === 'fortune' && !store.dailyResult && store.confirmedProfile && (
              <div className="flex items-start justify-center" style={{ paddingTop: 40 }}>
                <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 28, height: 1, background: 'linear-gradient(to right, transparent, #8A7254)' }} />
                      <span className="ks-serif" style={{ fontSize: '0.75rem', color: '#8C857B', letterSpacing: 4 }}>命 主</span>
                      <div style={{ width: 28, height: 1, background: 'linear-gradient(to left, transparent, #8A7254)' }} />
                    </div>
                    <div
                      className="ks-serif"
                      style={{
                        fontSize: '1.4rem', fontWeight: 600, letterSpacing: 6,
                        background: 'linear-gradient(135deg, #C9A96E 0%, #8A7254 40%, #D4AF37 60%, #8A7254 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        filter: 'drop-shadow(0 0 6px rgba(138,114,84,0.3))',
                      }}
                    >
                      {store.birthInput.name || store.primaryProfile?.birthInput.name || store.confirmedProfile.dayMaster.label}
                    </div>
                  </div>
                  <div style={{ width: '100%', borderTop: '1px dashed rgba(138,114,84,0.3)', marginBottom: 40 }} />
                  {store.draftProfile && (
                    <div style={{ display: 'flex', gap: 60, marginBottom: 24 }}>
                      {PILLAR_LABELS.map(([key, label]) => {
                        const isDay = key === 'day';
                        return (
                          <div key={key} className="flex flex-col items-center" style={{ gap: 12 }}>
                            <div className="ks-serif" style={{ fontSize: '0.8rem', color: isDay ? '#A6382E' : '#8C857B', borderBottom: `1px solid ${isDay ? 'rgba(166,56,46,0.4)' : 'rgba(138,114,84,0.4)'}`, paddingBottom: 4, width: '100%', textAlign: 'center' }}>{label}</div>
                            <div className={`ks-serif${isDay ? ' ks-day-char' : ''}`} style={{ fontSize: '2rem', lineHeight: 1.4, fontWeight: isDay ? 500 : 400, color: isDay ? '#A6382E' : '#E8E3D7', textAlign: 'center', letterSpacing: 2, ...(isDay ? { animation: 'ks-day-breathe 4s infinite alternate ease-in-out' } : {}) }}>
                              {store.draftProfile!.pillars[key].charAt(0)}<br />{store.draftProfile!.pillars[key].charAt(1) || ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="ks-serif" style={{ fontSize: '0.9rem', color: '#8C857B', letterSpacing: 2, marginTop: 8 }}>
                    {store.confirmedProfile.dayMaster.label} · {store.confirmedProfile.zodiac}
                  </div>
                </div>
              </div>
            )}
            {!store.loading && !store.error && store.activeTab === 'daily-fortune' && dailySubTab === 'fortune' && !store.dailyResult && !store.confirmedProfile && (
              <div className="gu-card flex items-center justify-center" style={{ minHeight: 320, color: '#8C857B', fontSize: '0.9rem' }}>
                {t('EmptyState.daily')}
              </div>
            )}

            {/* Daily fortune sub-tab: stick */}
            {store.activeTab === 'daily-fortune' && dailySubTab === 'stick' && store.fortuneStickResult && (
              <FortuneStickView
                result={store.fortuneStickResult}
                onShare={controller.shareContent}
              />
            )}
            {store.activeTab === 'daily-fortune' && dailySubTab === 'stick' && !store.fortuneStickResult && (
              <div className="flex items-center justify-center" style={{ minHeight: 320 }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="ks-serif" style={{ fontSize: '1.2rem', color: '#8C857B', letterSpacing: 4, marginBottom: 24 }}>
                    {store.confirmedProfile ? t('FortuneStick.readyHint') : t('FortuneStick.needProfileHint')}
                  </div>
                  <button
                    type="button"
                    onClick={controller.generateFortuneStick}
                    disabled={store.loading || !store.confirmedProfile}
                    className="ks-btn-seal"
                    style={{ letterSpacing: 4, padding: '14px 48px' }}
                  >
                    {store.loading ? t('FortuneStick.generating') : t('FortuneStick.drawButton')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
