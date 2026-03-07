import type { KismetNatalAnalysisResult } from '../types.js';
import { HORSE_BG_BASE64 } from '../assets/horse-bg.js';

export type ShareCardInput = {
  name: string;
  result: KismetNatalAnalysisResult;
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function splitFortune(text: string): string[] {
  const parts = text.split(/(?<=[。，；！？、])/);
  const lines: string[] = [];
  let buf = '';
  for (const p of parts) {
    if (buf.length + p.length > 12 && buf.length > 0) {
      lines.push(buf);
      buf = p;
    } else {
      buf += p;
    }
  }
  if (buf) lines.push(buf);
  return lines.slice(0, 3);
}

function buildShareCardDocument(input: ShareCardInput): string {
  const { canonicalProfile, analysis } = input.result;
  const pillars = canonicalProfile.pillars;
  const fortune = analysis.zodiacYearFortune;

  const fortuneTitle = fortune ? `【${fortune.year}流年总批】` : '';
  const fortuneLines = splitFortune(analysis.summary);

  // Build fortune HTML — strict reference: row-reverse flex, each line vertical-rl
  let fortuneHtml = '';
  if (fortuneTitle) {
    fortuneHtml += `<div class="ft-line" style="color: #dcb347; font-size: 0.95rem;">${esc(fortuneTitle)}</div>`;
  }
  fortuneLines.forEach((line, i) => {
    const mt = i > 0 ? ` style="margin-top: ${30 * i}px;"` : '';
    fortuneHtml += `<div class="ft-line"${mt}>${esc(line)}</div>`;
  });

  // Reference shows 3 pillars: 日(highlight) 月 年, flex row-reverse
  const pillarCols = [
    { chars: pillars.day, highlight: true },
    { chars: pillars.month, highlight: false },
    { chars: pillars.year, highlight: false },
  ];
  const pillarHtml = pillarCols.map((col) => {
    const cls = col.highlight ? 'bazi-col highlight' : 'bazi-col';
    return `<div class="${cls}"><span>${esc(col.chars[0] || '')}</span><span>${esc(col.chars[1] || '')}</span></div>`;
  }).join('\n                    ');

  // ---- Strict copy of reference HTML ----
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #1a1a1a;
            display: flex; justify-content: center; align-items: center;
            min-height: 100vh; margin: 0; font-family: 'Noto Serif SC', serif;
        }

        .bookmark-card {
            position: relative;
            width: 375px; height: 667px;
            background-color: #0c0908;
            color: #E8E3D7;
            padding: 30px; box-sizing: border-box;
            box-shadow: 0 20px 50px rgba(0,0,0,0.8);
            overflow: hidden;
        }

        .bg-noise {
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%25" height="100%25" filter="url(%23noiseFilter)" opacity="0.06"/></svg>');
            pointer-events: none; z-index: 1;
        }

        .golden-horse-bg {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -45%);
            width: 140%; height: 140%;
            background-image: url('${HORSE_BG_BASE64}');
            background-size: cover;
            background-position: center;
            mix-blend-mode: screen;
            opacity: 0.35;
            filter: contrast(1.2) brightness(1.1) grayscale(0.2);
            z-index: 2; pointer-events: none;
            mask-image: radial-gradient(circle at center, black 40%, transparent 70%);
            -webkit-mask-image: radial-gradient(circle at center, black 40%, transparent 70%);
        }

        .border-frame {
            position: absolute; top: 15px; left: 15px; right: 15px; bottom: 15px;
            border: 1px solid rgba(222, 184, 110, 0.3); z-index: 3; pointer-events: none;
        }

        .content { position: relative; z-index: 10; display: flex; flex-direction: column; height: 100%; }

        .seal-group {
            display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
            margin-bottom: 20px;
        }

        .gold-seal-block {
            background-color: #dcb347;
            color: #4a040b;
            width: 70px; height: 70px;
            display: grid; grid-template-columns: 1fr 1fr;
            font-size: 1.6rem; font-weight: 900;
            font-family: '隶书', '楷体', serif;
            text-align: center; align-items: center;
            line-height: 1;
            filter: url(#stone-carving);
            box-shadow: inset 0 0 5px rgba(74, 4, 11, 0.4);
        }
        .gold-seal-block span { transform: scaleY(1.1); }

        .seal-text-cn {
            color: #dcb347; font-size: 1.1rem; letter-spacing: 2px; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.8);
        }
        .seal-text-en {
            color: #dcb347; font-size: 0.75rem; font-family: sans-serif; line-height: 1.2; text-shadow: 0 2px 4px rgba(0,0,0,0.8);
        }

        .bazi-section { align-self: flex-end; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; margin-top: -100px; }
        .subject-name { font-size: 1rem; color: #dcb347; letter-spacing: 2px; }
        .bazi-grid {
            display: flex; flex-direction: row-reverse; gap: 20px;
            padding: 10px 0; border-bottom: 1px solid rgba(222, 184, 110, 0.3);
        }
        .bazi-col { display: flex; flex-direction: column; gap: 8px; font-size: 1.5rem; color: rgba(232, 227, 215, 0.9); }
        .bazi-col.highlight { color: #dcb347; font-weight: 600; text-shadow: 0 0 10px rgba(220, 179, 71, 0.3); }

        .fortune-text {
            display: flex; flex-direction: row-reverse; justify-content: flex-start; gap: 15px;
            margin-top: auto; margin-bottom: 60px; margin-right: 20px;
        }
        .ft-line {
            writing-mode: vertical-rl; text-orientation: upright;
            font-size: 1.15rem; color: #E8E3D7; letter-spacing: 5px; line-height: 2;
            text-shadow: 0 2px 5px rgba(0,0,0,0.9);
        }

        .footer-area { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; }
        .qr-wrap { display: flex; align-items: center; gap: 10px; }
        .qr-mock { width: 40px; height: 40px; border: 1px solid rgba(222, 184, 110, 0.5); background: rgba(0,0,0,0.5); }
        .qr-text { display: flex; flex-direction: column; gap: 2px; }
    </style>
</head>
<body>

    <svg style="width:0;height:0;position:absolute;">
        <filter id="stone-carving">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
    </svg>

    <div class="bookmark-card">
        <div class="bg-noise"></div>
        <div class="golden-horse-bg"></div>
        <div class="border-frame"></div>

        <div class="content">
            <div class="seal-group">
                <div class="gold-seal-block">
                    <span>運</span><span>時</span>
                    <span>轉</span><span>來</span>
                </div>
                <div class="seal-text-cn">時來運轉</div>
                <div class="seal-text-en">Fortunes turn<br>for the better</div>
            </div>

            <div class="bazi-section">
                <div class="subject-name">
                    <span style="color: #736b60; font-size: 0.8rem; margin-right: 8px;">命主</span> ${esc(input.name)}
                </div>
                <div class="bazi-grid">
                    ${pillarHtml}
                </div>
            </div>

            <div class="fortune-text">
                ${fortuneHtml}
            </div>

            <div class="footer-area">
                <div class="qr-wrap">
                    <div class="qr-mock"></div>
                    <div class="qr-text">
                        <span style="color: #dcb347; font-size: 0.8rem; letter-spacing: 2px;">扫码测算天机</span>
                        <span style="font-size: 0.6rem; color: #736b60; font-family: sans-serif;">KISMET V2</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

</body>
</html>`;
}

export function createShareCardElement(input: ShareCardInput): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.style.width = '375px';
  iframe.style.height = '667px';
  iframe.style.border = 'none';
  iframe.style.display = 'block';
  iframe.srcdoc = buildShareCardDocument(input);
  return iframe;
}

export async function downloadShareCard(input: ShareCardInput): Promise<void> {
  const html = buildShareCardDocument(input);

  // Open in new window and let user save/screenshot
  const win = window.open('', '_blank', `width=420,height=720`);
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
