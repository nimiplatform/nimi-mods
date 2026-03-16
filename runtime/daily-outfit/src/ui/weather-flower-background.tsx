import React, { useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Watercolor flower animation – 1:1 port of watercolor-flower-animation.html  */
/* ------------------------------------------------------------------ */

interface HSL { h: number; s: number; l: number }

const STAMEN_COLOR: HSL = { h: 45, s: 80, l: 55 };
const FLOWER_TYPE_COUNT = 6;
const VASE_HEIGHT = 168;
const VASE_WIDTH = 68;
const VASE_MOUTH_RATIO = 0.32;

const PALETTE = {
  stems: [
    { h: 140, s: 30, l: 35 },
    { h: 130, s: 25, l: 40 },
    { h: 145, s: 20, l: 30 },
  ] as HSL[],
  flowers: [
    { h: 348, s: 72, l: 58 },
    { h: 332, s: 64, l: 64 },
    { h: 12, s: 72, l: 62 },
    { h: 286, s: 40, l: 58 },
    { h: 218, s: 48, l: 61 },
    { h: 198, s: 62, l: 58 },
    { h: 44, s: 62, l: 74 },
    { h: 312, s: 44, l: 62 },
  ] as HSL[],
  calyx: { h: 132, s: 34, l: 30 } as HSL,
  vase: { h: 0, s: 20, l: 92 } as HSL,
  hearts: { h: 350, s: 100, l: 65 } as HSL,
};

function pickFlowerType(): number {
  const r = Math.random();
  if (r < 0.22) return 0;
  if (r < 0.36) return 1;
  if (r < 0.56) return 2;
  if (r < 0.74) return 3;
  if (r < 0.90) return 4;
  return FLOWER_TYPE_COUNT - 1;
}

/* ---------- Brush ---------- */

class Brush {
  private ctx: CanvasRenderingContext2D;
  constructor(ctx: CanvasRenderingContext2D) { this.ctx = ctx; }

  stroke(x1: number, y1: number, x2: number, y2: number, color: HSL, width: number, opacity: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    const h = color.h + (Math.random() * 10 - 5);
    const l = color.l + (Math.random() * 10 - 5);
    this.ctx.strokeStyle = `hsla(${h}, ${color.s}%, ${l}%, ${opacity})`;
    this.ctx.lineWidth = width * (0.8 + Math.random() * 0.4);
    this.ctx.stroke();
  }

  wash(x: number, y: number, radius: number, color: HSL, opacity: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = `hsla(${color.h}, ${color.s}%, ${color.l}%, ${opacity})`;
    this.ctx.fill();
  }

  blob(x: number, y: number, radius: number, color: HSL, opacity: number, angle?: number | null, stretch?: number | null) {
    const baseAngle = angle == null ? Math.random() * Math.PI : angle;
    const baseStretch = stretch == null ? (1.1 + Math.random() * 0.35) : stretch;
    for (let i = 0; i < 2; i++) {
      const jx = (Math.random() - 0.5) * radius * 0.34;
      const jy = (Math.random() - 0.5) * radius * 0.34;
      const r = Math.max(0.8, radius * (0.76 + Math.random() * 0.42));
      const rx = r * baseStretch;
      const ry = r * (0.65 + Math.random() * 0.35);
      const h = color.h + (Math.random() * 8 - 4);
      const l = color.l + (Math.random() * 10 - 5);
      const a = baseAngle + (Math.random() - 0.5) * 0.28;
      this.ctx.beginPath();
      this.ctx.ellipse(x + jx, y + jy, rx, ry, a, 0, Math.PI * 2);
      this.ctx.fillStyle = `hsla(${h}, ${color.s}%, ${l}%, ${opacity})`;
      this.ctx.fill();
    }
  }
}

/* ---------- Stem ---------- */

interface StemSegment { x: number; y: number; angle: number; cos: number; sin: number }
interface LeafData { angle: number; cos: number; sin: number; length: number; radius: number; drawn: boolean }

class Stem {
  x: number;
  y: number;
  targetHeight: number;
  angle: number;
  currentHeight = 0;
  segments: StemSegment[] = [];
  growSpeed: number;
  done = false;
  leavesBySegment: (LeafData[] | undefined)[] = [];
  leafDensity: number;
  tip: { x: number; y: number };
  hasFlower = false;
  flowerTypeHint = 0;

  constructor(x: number, y: number, height: number, angle: number) {
    this.x = x;
    this.y = y;
    this.targetHeight = height;
    this.angle = angle;
    this.growSpeed = 2 + Math.random() * 2;
    this.leafDensity = 0.14 + Math.random() * 0.08;

    let cx = x, cy = y, ca = angle;
    const stepSize = 5;
    const totalSteps = Math.floor(height / stepSize);

    for (let i = 0; i < totalSteps; i++) {
      ca += (-Math.PI / 2 - ca) * 0.02 + (Math.random() - 0.5) * 0.05;
      const nx = cx + Math.cos(ca) * stepSize;
      const ny = cy + Math.sin(ca) * stepSize;
      this.segments.push({ x: nx, y: ny, angle: ca, cos: Math.cos(ca), sin: Math.sin(ca) });

      if (i > totalSteps * 0.18 && i < totalSteps * 0.92 && Math.random() < this.leafDensity) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const leafAngle = ca + side * (0.65 + Math.random() * 0.55);
        const leaf: LeafData = {
          angle: leafAngle,
          cos: Math.cos(leafAngle),
          sin: Math.sin(leafAngle),
          length: 18 + Math.random() * 22,
          radius: 4.4 + Math.random() * 4.4,
          drawn: false,
        };
        if (!this.leavesBySegment[i]) this.leavesBySegment[i] = [];
        this.leavesBySegment[i]!.push(leaf);
      }
      cx = nx;
      cy = ny;
    }
    this.tip = { x: cx, y: cy };
  }

  update(): boolean {
    if (this.currentHeight < this.segments.length) {
      this.currentHeight += this.growSpeed;
      if (this.currentHeight >= this.segments.length) {
        this.currentHeight = this.segments.length;
        this.done = true;
      }
    }
    return this.done;
  }

  draw(brush: Brush) {
    const maxIndex = Math.floor(this.currentHeight);
    if (maxIndex < 1) return;
    const drawEnd = this.hasFlower ? Math.max(1, maxIndex - 1) : maxIndex;
    const startIdx = Math.max(1, drawEnd - ((this.growSpeed + 0.999999) | 0) - 1);
    const segmentCount = this.segments.length;

    for (let i = startIdx; i < drawEnd; i++) {
      const prev = this.segments[i - 1]!;
      const curr = this.segments[i]!;
      const width = 3.2 * (1 - i / segmentCount) + 0.85;

      brush.stroke(prev.x, prev.y, curr.x, curr.y, PALETTE.stems[1]!, width, 0.15);
      brush.stroke(prev.x, prev.y, curr.x, curr.y, PALETTE.stems[2]!, width * 0.55, 0.18);

      const leaves = this.leavesBySegment[i];
      if (leaves) {
        for (let j = 0; j < leaves.length; j++) {
          const leaf = leaves[j]!;
          if (!leaf.drawn) {
            this.drawLeaf(brush, curr.x, curr.y, leaf, width);
            leaf.drawn = true;
          }
        }
      }
    }
  }

  private drawLeaf(brush: Brush, x: number, y: number, leaf: LeafData, stemWidth: number) {
    const tipX = x + leaf.cos * leaf.length;
    const tipY = y + leaf.sin * leaf.length;
    const midScale = leaf.length * 0.55;
    const midX = x + leaf.cos * midScale;
    const midY = y + leaf.sin * midScale;
    const nx = -leaf.sin;
    const ny = leaf.cos;
    const lobeOffset = leaf.radius * 0.55;
    const rootX = x - leaf.cos * (leaf.radius * 0.35);
    const rootY = y - leaf.sin * (leaf.radius * 0.35);

    brush.blob(midX, midY, leaf.radius * 1.15, PALETTE.stems[0]!, 0.11, leaf.angle, 2.15);
    brush.blob(midX + nx * lobeOffset, midY + ny * lobeOffset, leaf.radius * 0.82, PALETTE.stems[1]!, 0.085, leaf.angle + 0.14, 1.9);
    brush.blob(midX - nx * lobeOffset, midY - ny * lobeOffset, leaf.radius * 0.78, PALETTE.stems[2]!, 0.07, leaf.angle - 0.12, 1.8);

    brush.stroke(rootX, rootY, tipX, tipY, PALETTE.stems[2]!, Math.max(0.45, stemWidth * 0.26), 0.15);
    brush.stroke(midX, midY, tipX, tipY, PALETTE.stems[2]!, 0.3, 0.08);
  }
}

/* ---------- Flower ---------- */

interface PetalData {
  angle: number; cos: number; sin: number;
  distance: number; radius: number; layer: number;
  stretch: number; jitter: number;
}
interface CenterDot {
  cos: number; sin: number;
  distance: number; size: number; color: HSL;
}

class Flower {
  x: number;
  y: number;
  scale: number;
  type: number;
  age = 0;
  maxAge: number;
  petals: PetalData[] = [];
  centerDots: CenterDot[] = [];
  colorBias: number;
  baseColor: HSL;
  altColor: HSL;
  darkColor: HSL;
  lightColor: HSL;
  petalDrawChance: number;
  speckChance: number;
  coreSize: number;
  calyxSize: number;
  capWidth: number;
  capHeight: number;
  capLobes: number;
  headTilt: number;
  headLift: number;
  capMode: string;

  constructor(x: number, y: number, type: number, scale?: number) {
    this.x = x;
    this.y = y;
    this.scale = scale || 1;
    this.type = type == null ? pickFlowerType() : type;
    this.maxAge = 96 + Math.random() * 46;
    this.colorBias = Math.floor(Math.random() * PALETTE.flowers.length);
    this.baseColor = PALETTE.flowers[this.colorBias]!;
    this.altColor = PALETTE.flowers[(this.colorBias + 1 + ((Math.random() * 2) | 0)) % PALETTE.flowers.length]!;
    this.darkColor = { h: this.baseColor.h, s: Math.min(100, this.baseColor.s + 10), l: Math.max(16, this.baseColor.l - 24) };
    this.lightColor = { h: this.baseColor.h, s: Math.max(20, this.baseColor.s - 8), l: Math.min(84, this.baseColor.l + 14) };

    this.petalDrawChance = 0.64;
    this.speckChance = 0.28;
    this.coreSize = 7 * this.scale;
    this.calyxSize = 8.5 * this.scale;
    this.capWidth = 28 * this.scale;
    this.capHeight = 20 * this.scale;
    this.capLobes = 8;
    this.headTilt = (Math.random() - 0.5) * 0.65;
    this.headLift = 11 * this.scale;
    this.capMode = 'fan';
    this.initShape();
  }

  private addPetal(angle: number, distance: number, radius: number, layer?: number, stretch?: number) {
    this.petals.push({
      angle,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      distance: distance * this.scale,
      radius: radius * this.scale,
      layer: layer || 0,
      stretch: (stretch == null ? 1.45 : stretch) + (Math.random() - 0.5) * 0.24,
      jitter: (Math.random() - 0.5) * 0.35,
    });
  }

  private addCenterDots(count: number, minDist: number, maxDist: number, minSize: number, maxSize: number, color?: HSL) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      this.centerDots.push({
        cos: Math.cos(a),
        sin: Math.sin(a),
        distance: (minDist + Math.random() * (maxDist - minDist)) * this.scale,
        size: (minSize + Math.random() * (maxSize - minSize)) * this.scale,
        color: color || STAMEN_COLOR,
      });
    }
  }

  private initShape() {
    if (this.type === 0) {
      this.petalDrawChance = 0.6;
      this.maxAge = 112 + Math.random() * 40;
      this.coreSize = 8.6 * this.scale;
      this.calyxSize = 9 * this.scale;
      this.capWidth = 30 * this.scale;
      this.capHeight = 24 * this.scale;
      this.capLobes = 9;
      this.capMode = 'cluster';
      this.headLift = 9 * this.scale;

      for (let layer = 0; layer < 4; layer++) {
        const count = 5 + layer * 2;
        const arc = 2.1 + layer * 0.12;
        for (let i = 0; i < count; i++) {
          const t = count > 1 ? i / (count - 1) : 0;
          const a = -Math.PI / 2 + (t - 0.5) * arc + (Math.random() - 0.5) * 0.22;
          this.addPetal(a, 6 + layer * 5 + Math.random() * 3, 7.5 + layer * 2.8 + Math.random() * 2.3, layer, 1.34 + layer * 0.08);
        }
      }
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
        this.addPetal(a, 3 + Math.random() * 3, 4 + Math.random() * 2, 0, 1.15);
      }
      this.addCenterDots(6, 0.8, 4.2, 1.2, 2.2, this.darkColor);

    } else if (this.type === 1) {
      this.petalDrawChance = 0.56;
      this.coreSize = 6.8 * this.scale;
      this.calyxSize = 8 * this.scale;
      this.capWidth = 32 * this.scale;
      this.capHeight = 22 * this.scale;
      this.capLobes = 7;
      this.capMode = 'wing';
      this.headLift = 12 * this.scale;

      const base = -Math.PI / 2 + (Math.random() - 0.5) * 0.24;
      this.addPetal(base - 0.95, 15, 10.5, 1, 1.5);
      this.addPetal(base - 0.35, 19, 13, 1, 1.35);
      this.addPetal(base + 0.35, 19, 13, 1, 1.35);
      this.addPetal(base + 0.95, 15, 10.5, 1, 1.5);
      this.addPetal(base + Math.PI, 11, 14.5, 0, 1.08);
      this.addPetal(base + Math.PI + 0.15, 8, 9.5, 0, 1.02);
      this.addCenterDots(5, 1, 4.8, 1.2, 2.4, PALETTE.hearts);

    } else if (this.type === 2) {
      this.petalDrawChance = 0.58;
      this.coreSize = 6.2 * this.scale;
      this.calyxSize = 9.4 * this.scale;
      this.capWidth = 25 * this.scale;
      this.capHeight = 22 * this.scale;
      this.capLobes = 6;
      this.capMode = 'cup';
      this.headLift = 14 * this.scale;

      const base = -Math.PI / 2 + (Math.random() - 0.5) * 0.2;
      this.addPetal(base - 0.33, 15, 14, 1, 1.3);
      this.addPetal(base, 18, 16, 2, 1.22);
      this.addPetal(base + 0.33, 15, 14, 1, 1.3);
      this.addPetal(base - 0.7, 11, 8.2, 0, 1.14);
      this.addPetal(base + 0.7, 11, 8.2, 0, 1.14);
      this.addCenterDots(4, 1, 3.8, 1.1, 1.8, STAMEN_COLOR);

    } else if (this.type === 3) {
      this.petalDrawChance = 0.55;
      this.maxAge = 106 + Math.random() * 36;
      this.coreSize = 8.4 * this.scale;
      this.calyxSize = 8.6 * this.scale;
      this.capWidth = 40 * this.scale;
      this.capHeight = 18 * this.scale;
      this.capLobes = 10;
      this.capMode = 'fan';
      this.headLift = 12 * this.scale;

      const count = 7 + ((Math.random() * 3) | 0);
      for (let i = 0; i < count; i++) {
        const t = count > 1 ? i / (count - 1) : 0;
        const a = -Math.PI + t * Math.PI + (Math.random() - 0.5) * 0.2;
        this.addPetal(a, 15 + Math.random() * 12, 11 + Math.random() * 4.5, 1, 1.58);
      }
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
        this.addPetal(a, 9 + Math.random() * 5, 7.5 + Math.random() * 3, 0, 1.3);
      }
      this.addCenterDots(8, 1.2, 5.4, 1, 2, this.darkColor);

    } else if (this.type === 4) {
      this.petalDrawChance = 0.58;
      this.maxAge = 112 + Math.random() * 42;
      this.coreSize = 8 * this.scale;
      this.calyxSize = 9 * this.scale;
      this.capWidth = 34 * this.scale;
      this.capHeight = 24 * this.scale;
      this.capLobes = 11;
      this.capMode = 'cluster';
      this.headLift = 10 * this.scale;

      for (let layer = 0; layer < 4; layer++) {
        const count = 6 + layer * 3;
        const arc = 2.35 + layer * 0.12;
        for (let i = 0; i < count; i++) {
          const t = count > 1 ? i / (count - 1) : 0;
          const a = -Math.PI / 2 + (t - 0.5) * arc + (Math.random() - 0.5) * 0.32;
          this.addPetal(a, 5 + layer * 4.8 + Math.random() * 2.8, 6.4 + layer * 2.4 + Math.random() * 2.2, layer, 1.24 + layer * 0.08);
        }
      }
      this.addCenterDots(7, 1, 4.8, 1.4, 2.5, this.darkColor);

    } else {
      this.petalDrawChance = 0.54;
      this.coreSize = 6.8 * this.scale;
      this.calyxSize = 8.2 * this.scale;
      this.capWidth = 35 * this.scale;
      this.capHeight = 19 * this.scale;
      this.capLobes = 7;
      this.capMode = 'star';
      this.headLift = 13 * this.scale;

      const count = 6;
      const off = -Math.PI / 2 + (Math.random() - 0.5) * 0.18;
      for (let i = 0; i < count; i++) {
        const a = off + (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.2;
        this.addPetal(a, 17 + Math.random() * 8, 8.5 + Math.random() * 3, i % 2, 1.5);
      }
      this.addCenterDots(6, 1.1, 4.8, 1.1, 2, STAMEN_COLOR);
    }
  }

  draw(brush: Brush) {
    if (this.age > this.maxAge) return;
    this.age += 1;

    const growth = this.age < 68 ? this.age / 68 : 1;
    const bloom = 0.2 + growth * 0.8;

    const headX = this.x + this.headTilt * this.headLift * 0.18 * bloom;
    const headY = this.y - this.headLift * bloom;
    const flowerBaseX = headX + this.headTilt * 4 * this.scale * bloom;
    const flowerBaseY = headY + this.capHeight * (this.capMode === 'cup' ? 0.6 : 0.52);

    if (this.age > 3) {
      const capGrowth = Math.min(1, (this.age - 3) / 34);
      const capWidth = this.capWidth * capGrowth;
      const capHeight = this.capHeight * capGrowth;

      if (this.capMode === 'cluster') {
        for (let i = 0; i < this.capLobes; i++) {
          if (Math.random() > 0.8) continue;
          const a = (Math.PI * 2 / this.capLobes) * i + this.headTilt * 0.3;
          const ring = capHeight * (0.2 + Math.random() * 0.55);
          const cx = headX + Math.cos(a) * ring * (0.95 + Math.random() * 0.3);
          const cy = headY + Math.sin(a) * ring * 0.72;
          const c = Math.random() > 0.6 ? this.lightColor : this.baseColor;
          brush.blob(cx, cy, capHeight * (0.34 + Math.random() * 0.2), c, 0.032, a, 1.45);
        }
      } else if (this.capMode === 'star') {
        for (let i = 0; i < this.capLobes; i++) {
          const a = (Math.PI * 2 / this.capLobes) * i + this.headTilt * 0.25;
          const r = capHeight * (0.46 + Math.random() * 0.3);
          const cx = headX + Math.cos(a) * r;
          const cy = headY + Math.sin(a) * r * 0.82;
          brush.blob(cx, cy, capHeight * 0.28, this.baseColor, 0.032, a, 2.15);
        }
      } else if (this.capMode === 'wing') {
        brush.blob(headX - capWidth * 0.26, headY - capHeight * 0.18, capHeight * 0.5, this.lightColor, 0.03, -0.35, 1.9);
        brush.blob(headX + capWidth * 0.26, headY - capHeight * 0.18, capHeight * 0.5, this.lightColor, 0.03, 0.35, 1.9);
        brush.blob(headX, headY - capHeight * 0.26, capHeight * 0.48, this.baseColor, 0.034, 0, 1.7);
        brush.blob(headX, headY + capHeight * 0.15, capHeight * 0.42, this.baseColor, 0.034, 0, 1.35);
      } else {
        const spread = this.capMode === 'cup' ? 0.9 : 1.0;
        for (let i = 0; i < this.capLobes; i++) {
          if (Math.random() > 0.76) continue;
          const t = this.capLobes > 1 ? i / (this.capLobes - 1) : 0.5;
          const tiltShift = this.headTilt * (0.5 - Math.abs(t - 0.5)) * capHeight * 1.25;
          const cx = headX + (t - 0.5) * capWidth * spread + tiltShift + (Math.random() - 0.5) * capWidth * 0.08;
          const cy = headY - Math.sin(t * Math.PI) * capHeight + this.headTilt * (t - 0.5) * capHeight * 0.2 + (Math.random() - 0.5) * capHeight * 0.12;
          const c = Math.random() > 0.6 ? this.lightColor : this.baseColor;
          brush.blob(cx, cy, capHeight * (0.42 + Math.random() * 0.26), c, 0.034, this.headTilt * 0.35, 1.92);
        }
      }
    }

    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i]!;
      if (Math.random() > this.petalDrawChance) continue;
      const dist = p.distance * bloom;
      const radius = p.radius * bloom * (1.02 + p.layer * 0.02);
      const px = headX + p.cos * dist;
      const py = headY + p.sin * dist;
      const mx = headX + p.cos * dist * 0.58;
      const my = headY + p.sin * dist * 0.58;
      const bx = headX + p.cos * dist * 0.24;
      const by = headY + p.sin * dist * 0.24;
      const nx = -p.sin;
      const ny = p.cos;
      const side = radius * 0.18;

      let tone = this.baseColor;
      if (p.layer === 0) tone = this.darkColor;
      else if (p.layer >= 3) tone = this.lightColor;
      else if (Math.random() > 0.68) tone = this.altColor;

      const axis = (this.type === 1 || this.type === 5)
        ? p.angle + p.jitter
        : this.headTilt * 0.35 + (Math.random() - 0.5) * 0.12;

      brush.blob(mx, my, radius * 0.95, tone, 0.05, axis, p.stretch);
      brush.blob(px, py, radius * 0.72, this.lightColor, 0.034, axis + 0.08, p.stretch * 0.9);
      brush.blob(bx, by, radius * 0.46, this.darkColor, 0.045, axis - 0.06, p.stretch * 0.84);

      if (Math.random() > 0.64) {
        brush.blob(mx + nx * side, my + ny * side, radius * 0.65, this.lightColor, 0.03, p.angle + 0.3, p.stretch * 0.92);
      }
      if (Math.random() > 0.76) {
        brush.stroke(flowerBaseX, flowerBaseY, px, py, this.darkColor, 0.3 * this.scale, 0.04);
      }
    }

    if (this.age > 4) {
      const coreGrowth = Math.min(1, (this.age - 4) / 22);
      for (let i = 0; i < 3; i++) {
        brush.blob(
          headX + (Math.random() - 0.5) * 3.5 * this.scale,
          headY + 0.9 * this.scale + (Math.random() - 0.5) * 2 * this.scale,
          this.coreSize * coreGrowth * (0.65 + Math.random() * 0.45),
          this.darkColor, 0.055, 0, 1.25,
        );
      }
    }
    if (this.age > 6) {
      const calyxGrowth = Math.min(1, (this.age - 6) / 24);
      brush.blob(flowerBaseX, flowerBaseY, this.calyxSize * calyxGrowth, PALETTE.calyx, 0.052, 0, 1.35);
      if (Math.random() > 0.52) {
        const sx = flowerBaseX + (Math.random() - 0.5) * 4 * this.scale;
        const sy = flowerBaseY + (Math.random() - 0.5) * 2 * this.scale;
        brush.stroke(sx, sy, sx + (Math.random() - 0.5) * 10 * this.scale, sy - (3 + Math.random() * 5) * this.scale, PALETTE.calyx, 0.45 * this.scale, 0.06);
      }
    }

    if (this.age > 10 && this.centerDots.length > 0) {
      const dotGrowth = Math.min(1, (this.age - 10) / 26);
      for (let i = 0; i < this.centerDots.length; i++) {
        const d = this.centerDots[i]!;
        if (Math.random() > this.speckChance) continue;
        const dist = d.distance * dotGrowth;
        const dx = headX + d.cos * dist + (Math.random() - 0.5) * 1.5 * this.scale;
        const dy = headY + d.sin * dist + (Math.random() - 0.5) * 1.5 * this.scale;
        brush.wash(dx, dy, d.size * dotGrowth, d.color, 0.075);
      }
    }
  }
}

/* ---------- Vase ---------- */

class Vase {
  x: number;
  y: number;
  drawn = false;

  constructor(x: number, y: number) { this.x = x; this.y = y; }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.drawn) return;
    const totalStrokes = 80;
    const c = PALETTE.vase;
    for (let i = 0; i < totalStrokes; i++) {
      const t = i / (totalStrokes - 1);
      const yPos = this.y + (1 - t) * VASE_HEIGHT;
      const profile = Math.sin(t * Math.PI);
      const w = VASE_WIDTH * (VASE_MOUTH_RATIO + profile * 0.68);

      ctx.beginPath();
      ctx.moveTo(this.x - w, yPos);
      ctx.lineTo(this.x + w, yPos);
      ctx.lineWidth = 2.6 + Math.random() * 1.8;
      ctx.strokeStyle = `hsla(${c.h}, ${c.s}%, ${c.l - (Math.random() * 10)}%, 0.1)`;
      ctx.stroke();

      if (Math.random() > 0.35) {
        ctx.beginPath();
        ctx.moveTo(this.x - w, yPos);
        ctx.lineTo(this.x - w + 10, yPos);
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = `hsla(${c.h}, ${c.s}%, ${c.l - 30}%, 0.09)`;
        ctx.stroke();
      }
      if (Math.random() > 0.35) {
        ctx.beginPath();
        ctx.moveTo(this.x + w - 10, yPos);
        ctx.lineTo(this.x + w, yPos);
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = `hsla(${c.h}, ${c.s}%, ${c.l - 30}%, 0.09)`;
        ctx.stroke();
      }
    }
    this.drawn = true;
  }

  stop() { this.drawn = true; }
}

/* ---------- React component ---------- */

export function WeatherFlowerBackground(input?: { className?: string }) {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const svgFilterId = useRef(`wf-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const displayCanvas = displayRef.current;
    if (!displayCanvas) return;

    const parent = displayCanvas.parentElement;
    if (!parent) return;

    const displayCtx = displayCanvas.getContext('2d', { alpha: true }) || displayCanvas.getContext('2d');
    if (!displayCtx) return;

    const paintCanvas = document.createElement('canvas');
    const paintCtx = paintCanvas.getContext('2d', { alpha: true }) || paintCanvas.getContext('2d');
    if (!paintCtx) return;

    const COMPOSITE_FILTER = `url(#${svgFilterId}-wc) blur(0.5px)`;

    let width = 0;
    let height = 0;
    let animationId: number | null = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function resize() {
      const rect = parent!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      displayCanvas!.width = width * dpr;
      displayCanvas!.height = height * dpr;
      displayCanvas!.style.width = `${width}px`;
      displayCanvas!.style.height = `${height}px`;
      displayCtx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintCanvas.width = width * dpr;
      paintCanvas.height = height * dpr;
      paintCtx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintCtx!.lineCap = 'round';
      paintCtx!.lineJoin = 'round';
    }

    function renderFrame() {
      displayCtx!.clearRect(0, 0, width, height);
      displayCtx!.filter = COMPOSITE_FILTER;
      displayCtx!.drawImage(paintCanvas, 0, 0, width, height);
      displayCtx!.filter = 'none';
    }

    let stems: Stem[] = [];
    let flowers: Flower[] = [];
    let brush: Brush;
    let vase: Vase;

    function init() {
      if (cancelled) return;
      if (animationId !== null) cancelAnimationFrame(animationId);
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }

      resize();
      paintCtx!.clearRect(0, 0, width, height);
      renderFrame();

      brush = new Brush(paintCtx!);
      stems = [];
      flowers = [];

      const startX = width / 2;
      const startY = height * 0.66;

      vase = new Vase(startX, startY);
      vase.draw(paintCtx!);

      const count = width < 600 ? 11 : width < 1000 ? 14 : 16;
      const mouthHalf = VASE_WIDTH * VASE_MOUTH_RATIO * (width < 600 ? 1.02 : 1.12);

      const typeOrder = [0, 1, 2, 3, 4, 5];
      for (let i = typeOrder.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const tmp = typeOrder[i]!;
        typeOrder[i] = typeOrder[j]!;
        typeOrder[j] = tmp;
      }

      for (let i = 0; i < count; i++) {
        const fan = count > 1 ? (i / (count - 1) - 0.5) : 0;
        const baseOffset = fan * mouthHalf * 1.18 + (Math.random() - 0.5) * mouthHalf * 0.28;
        const baseX = startX + baseOffset;
        const angle = -Math.PI / 2 + fan * 0.14 + (Math.random() - 0.5) * 0.09;
        const h = height * 0.18 + Math.random() * (height * 0.15);

        const stem = new Stem(baseX, startY, h, angle);
        stem.flowerTypeHint = Math.random() > 0.82 ? pickFlowerType() : typeOrder[i % FLOWER_TYPE_COUNT]!;
        stems.push(stem);
      }
      loop();
    }

    function loop() {
      if (cancelled) return;

      let allStemsDone = true;
      for (let i = 0; i < stems.length; i++) {
        const stem = stems[i]!;
        const done = stem.update();
        stem.draw(brush);
        if (!done) allStemsDone = false;
        else {
          if (!stem.hasFlower) {
            const anchorIdx = Math.max(1, stem.segments.length - 2);
            const anchor = stem.segments[anchorIdx]!;
            flowers.push(new Flower(anchor.x, anchor.y, stem.flowerTypeHint, 0.58 + Math.random() * 0.16));
            if (stem.segments.length > 14 && Math.random() > 0.48) {
              const sideIdx = Math.max(4, stem.segments.length - (8 + ((Math.random() * 8) | 0)));
              const node = stem.segments[sideIdx]!;
              const side = Math.random() < 0.5 ? -1 : 1;
              const budX = node.x + (-node.sin * side) * (8 + Math.random() * 8);
              const budY = node.y + (node.cos * side) * (2 + Math.random() * 4) - (2 + Math.random() * 3);
              flowers.push(new Flower(
                budX, budY,
                (stem.flowerTypeHint + 2 + ((Math.random() * 2) | 0)) % FLOWER_TYPE_COUNT,
                0.36 + Math.random() * 0.12,
              ));
            }
            if (stem.segments.length > 18 && Math.random() > 0.58) {
              const sideIdx = Math.max(5, stem.segments.length - (12 + ((Math.random() * 10) | 0)));
              const node = stem.segments[sideIdx]!;
              const side = Math.random() < 0.5 ? -1 : 1;
              const budX = node.x + (-node.sin * side) * (9 + Math.random() * 10);
              const budY = node.y + (node.cos * side) * (2 + Math.random() * 5) - (4 + Math.random() * 4);
              flowers.push(new Flower(
                budX, budY,
                (stem.flowerTypeHint + 1 + ((Math.random() * 3) | 0)) % FLOWER_TYPE_COUNT,
                0.32 + Math.random() * 0.12,
              ));
            }
            stem.hasFlower = true;
          }
        }
      }

      let allFlowersDone = true;
      for (let i = 0; i < flowers.length; i++) {
        const flower = flowers[i]!;
        flower.draw(brush);
        if (flower.age < flower.maxAge) allFlowersDone = false;
      }

      renderFrame();

      if (!allStemsDone || !allFlowersDone) {
        animationId = requestAnimationFrame(loop);
      } else {
        animationId = null;
        restartTimer = setTimeout(() => {
          if (!cancelled) {
            init();
          }
        }, 1400);
      }
    }

    const resizeTimer = { id: null as number | null };
    function onResize() {
      if (resizeTimer.id !== null) cancelAnimationFrame(resizeTimer.id);
      resizeTimer.id = requestAnimationFrame(() => {
        resizeTimer.id = null;
        // On resize just re-init for simplicity in the card context
        init();
      });
    }

    window.addEventListener('resize', onResize);
    // Small delay to let the card finish its layout
    const initTimer = setTimeout(init, 300);

    return () => {
      cancelled = true;
      if (animationId !== null) cancelAnimationFrame(animationId);
      if (resizeTimer.id !== null) cancelAnimationFrame(resizeTimer.id);
      if (restartTimer) clearTimeout(restartTimer);
      clearTimeout(initTimer);
      window.removeEventListener('resize', onResize);
    };
  }, [svgFilterId]);

  return (
    <>
      {/* SVG filters for watercolor effect */}
      <svg
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
        aria-hidden="true"
      >
        <defs>
          <filter id={`${svgFilterId}-noise`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise" />
            <feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0.4 0" in="noise" result="coloredNoise" />
            <feComposite operator="in" in="coloredNoise" in2="SourceGraphic" result="composite" />
          </filter>
          <filter id={`${svgFilterId}-wc`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="5" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="10" />
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </defs>
      </svg>

      {/* Paper texture overlay */}
      <svg
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full opacity-60"
        style={{ filter: 'contrast(120%) brightness(100%)' }}
        aria-hidden="true"
      >
        <rect
          width="100%"
          height="100%"
          filter={`url(#${svgFilterId}-noise)`}
          opacity="0.3"
        />
      </svg>

      {/* Main canvas */}
      <canvas ref={displayRef} className={`pointer-events-none absolute inset-0 z-0 ${input?.className || ''}`} aria-hidden="true" />
    </>
  );
}
