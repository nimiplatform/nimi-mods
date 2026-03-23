const headlineFont = 'Manrope, Avenir Next, Segoe UI, sans-serif';
const bodyFont = 'Inter, SF Pro Text, Segoe UI, sans-serif';

export function createProductStudioArtwork(title: string, subtitle: string, start: string, end: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${start}" />
          <stop offset="100%" stop-color="${end}" />
        </linearGradient>
      </defs>
      <rect width="640" height="420" rx="36" fill="url(#g)" />
      <circle cx="532" cy="82" r="96" fill="rgba(255,255,255,0.12)" />
      <circle cx="118" cy="346" r="116" fill="rgba(255,255,255,0.10)" />
      <rect x="42" y="42" width="144" height="28" rx="14" fill="rgba(255,255,255,0.16)" />
      <text x="42" y="226" font-size="52" font-family="${headlineFont}" font-weight="800" fill="white">${title}</text>
      <text x="42" y="270" font-size="20" font-family="${bodyFont}" fill="rgba(255,255,255,0.86)">${subtitle}</text>
      <text x="42" y="360" font-size="16" font-family="${bodyFont}" fill="rgba(255,255,255,0.70)">Product Studio</text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
