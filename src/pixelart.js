// Procedural pixel art: every sprite and tile texture in the game is drawn here at runtime,
// so the project ships with zero third-party art assets.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// Lighten toward warm highlights, darken toward cool shadows (classic pixel-art hue shifting).
export function adjust(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt * 0.9, b + (255 - b) * amt * 0.7);
  const k = 1 + amt;
  return rgbToHex(r * k * 0.9, g * k * 0.95, b * k + 18 * -amt);
}

export class PixelCanvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
    this.locked = new Set();
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }
  set(x, y, c, lock = false) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.px[i] = c;
    if (lock) this.locked.add(i);
    else this.locked.delete(i);
  }
  rect(x0, y0, x1, y1, c, lock) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c, lock);
  }
  disc(cx, cy, r, c, pred, lock) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r && (!pred || pred(x, y))) this.set(x, y, c, lock);
      }
  }
  line(x0, y0, x1, y1, c, lock) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c, lock);
  }
  // Light from the top-left: edges facing empty space get highlight or shadow.
  shade(light = 0.18, dark = 0.22) {
    const { w, h } = this;
    const src = this.px.slice();
    const g = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : src[y * w + x]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const c = src[i];
        if (!c || this.locked.has(i)) continue;
        let a = 0;
        if (!g(x - 1, y) || !g(x, y - 1)) a += light;
        if (!g(x + 1, y) || !g(x, y + 1)) a -= dark;
        if (a) this.px[i] = adjust(c, a);
      }
  }
  // Selective outline: each outline pixel is a dark version of the colour it borders.
  outline(amt = -0.68) {
    const { w, h } = this;
    const src = this.px.slice();
    const g = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : src[y * w + x]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (src[y * w + x]) continue;
        const n = g(x - 1, y) || g(x + 1, y) || g(x, y - 1) || g(x, y + 1);
        if (n) this.px[y * w + x] = adjust(n, amt);
      }
  }
  alphaAt(u, v) {
    const x = Math.floor(u * this.w);
    const y = Math.floor((1 - v) * this.h);
    return !!this.get(x, y);
  }
  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) {
      const c = this.px[i];
      if (!c) continue;
      const [r, g, b] = hexToRgb(c);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

export function pixelTex(cv, { mip = false, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = mip ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = mip;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- characters

const DEFAULT_COLORS = {
  eye: '#2a1d33',
  metal: '#c8ced8',
  wood: '#6a4528',
  gem: '#9ff0ff',
  hair: '#3a2c28',
  hood: '#444450',
  cape: '#333344',
  plume: '#eeeeee',
  pants: '#333038',
  boots: '#2a2020',
};

// 24x32 chibi-proportioned humanoid. view: 'front' (facing camera, turned left) | 'back'.
// frame: 0 | 1 (idle bob) | 'atk'.
export function drawCharacter(spec, view, frame) {
  const p = new PixelCanvas(24, 32);
  const C = { ...DEFAULT_COLORS, ...spec.colors };
  const back = view === 'back';
  const bob = frame === 1 ? 1 : 0;
  const atk = frame === 'atk';
  const mx = (x) => (back ? 23 - x : x);
  const hy = 9 + bob;
  const ty = 15 + bob;
  const handY = ty + 8;

  if (back) drawWeapon(p, spec, C, mx, hy, handY, atk);
  if (spec.cape && !back) p.rect(7, ty + 1, 16, 26, adjust(C.cape, -0.25));

  if (spec.robe) {
    for (let y = ty + 6; y <= 29; y++) {
      const hw = Math.min(6, Math.floor(4 + (y - ty - 6) * 0.25));
      p.rect(12 - hw, y, 11 + hw, y, y >= 28 ? C.armor2 : C.armor);
    }
    p.rect(9, 30, 10, 30, C.boots);
    p.rect(13, 30, 14, 30, C.boots);
  } else {
    p.rect(9, ty + 8, 10, 27, C.pants);
    p.rect(13, ty + 8, 14, 27, C.pants);
    p.rect(8, 28, 10, 30, C.boots);
    p.rect(13, 28, 15, 30, C.boots);
  }

  p.rect(6, ty + 1, 7, handY - 1, C.armor2);
  p.rect(16, ty + 1, 17, handY - 1, C.armor2);
  p.rect(6, handY, 7, handY, C.skin);
  p.rect(16, handY, 17, handY, C.skin);

  p.rect(8, ty, 15, ty + 8, C.armor);
  p.rect(8, ty + 7, 15, ty + 7, C.belt || C.armor2);
  if (!back) p.rect(11, ty + 1, 12, ty + 4, C.armor2);
  if (spec.pauldrons) {
    p.rect(5, ty, 8, ty + 1, C.metal);
    p.rect(15, ty, 18, ty + 1, C.metal);
  }
  if (spec.cape && back) {
    p.rect(7, ty, 16, 27, C.cape);
    p.line(10, ty + 2, 9, 27, adjust(C.cape, -0.2));
    p.line(14, ty + 2, 15, 27, adjust(C.cape, -0.2));
  }

  p.rect(11, ty - 1, 12, ty - 1, C.skin);
  p.disc(12, hy, 4.6, C.skin);

  if (spec.helmet) {
    if (!back) {
      p.disc(12, hy - 0.4, 5.0, C.metal, (x, y) => y <= hy - 1);
      p.rect(7, hy - 1, 7, hy + 3, C.metal);
      p.rect(15, hy - 1, 16, hy + 3, C.metal);
      p.rect(8, hy - 1, 15, hy - 1, adjust(C.metal, -0.25));
    } else {
      p.disc(12, hy - 0.2, 5.0, C.metal, (x, y) => y <= hy + 3);
    }
    if (spec.plume) p.rect(11, hy - 8, 12, hy - 5, C.plume);
  } else if (spec.hood) {
    p.disc(12, hy - 0.2, 5.3, C.hood, (x, y) => y <= hy + 4);
    if (!back) p.disc(11.5, hy + 1.0, 3.3, C.skin, (x, y) => y >= hy - 1);
  } else if (!back) {
    const len = spec.longHair ? 6 : 2;
    p.disc(12, hy - 0.8, 5.0, C.hair, (x, y) => y <= hy - 1);
    p.rect(7, hy - 1, 7, hy + len, C.hair);
    p.rect(15, hy - 1, 16, hy + len, C.hair);
    p.set(9, hy, C.hair);
    p.set(13, hy, C.hair);
    p.set(14, hy, C.hair);
  } else {
    p.disc(12, hy - 0.5, 5.0, C.hair, (x, y) => y <= hy + 3);
    if (spec.longHair) p.rect(8, hy + 3, 15, hy + 8, C.hair);
  }
  if (spec.beard && !back) p.rect(9, hy + 3, 13, hy + 4, C.hair);

  if (!back) {
    p.set(9, hy + 1, C.eye, true);
    p.set(12, hy + 1, C.eye, true);
  }

  if (!back) drawWeapon(p, spec, C, mx, hy, handY, atk);
  p.shade();
  p.outline();
  return p;
}

function drawWeapon(p, spec, C, mx, hy, handY, atk) {
  const W = C.wood;
  const M = C.metal;
  const set = (x, y, c, l) => p.set(mx(x), y, c, l);
  const line = (x0, y0, x1, y1, c, l) => p.line(mx(x0), y0, mx(x1), y1, c, l);
  const rect = (x0, y0, x1, y1, c, l) => p.rect(Math.min(mx(x0), mx(x1)), y0, Math.max(mx(x0), mx(x1)), y1, c, l);
  const blade = '#e8eef7';
  switch (spec.weapon) {
    case 'sword':
      if (!atk) {
        line(18, handY - 10, 18, handY - 1, blade);
        rect(17, handY, 19, handY, C.armor2);
        set(18, handY + 1, W);
      } else {
        line(18, handY - 1, 22, handY - 9, blade);
        rect(16, handY, 18, handY, C.armor2);
        set(17, handY + 1, W);
      }
      break;
    case 'spear':
      if (!atk) {
        line(19, 5, 19, 29, W);
        rect(18, 2, 20, 4, M);
        set(19, 1, M);
      } else {
        line(4, handY, 20, handY, W);
        rect(20, handY - 1, 21, handY + 1, M);
        set(22, handY, M);
      }
      break;
    case 'bow':
      for (let i = 0; i <= 14; i++) {
        const y = handY - 8 + i;
        set(19 + Math.round(2 * Math.sin((Math.PI * i) / 14)), y, W);
      }
      line(19, handY - 8, 19, handY + 6, '#e9e2c8');
      if (atk) {
        line(12, handY - 1, 21, handY - 1, '#d9c9a0');
        set(22, handY - 1, M);
      }
      break;
    case 'staff':
      line(19, hy - 3, 19, 29, W);
      p.disc(mx(19) + 0.5, hy - 4.5, atk ? 2.4 : 1.7, C.gem, null, true);
      if (atk) {
        set(16, hy - 8, '#ffffff', true);
        set(22, hy - 3, '#ffffff', true);
        set(21, hy - 9, '#ffffff', true);
      }
      break;
    case 'axe':
      if (!atk) {
        line(19, handY - 9, 19, handY + 3, W);
        rect(20, handY - 9, 22, handY - 5, M);
        set(20, handY - 4, M);
      } else {
        line(14, handY - 1, 20, handY - 9, W);
        rect(19, handY - 13, 22, handY - 9, M);
      }
      break;
    default:
      break;
  }
}

export function characterFrames(spec) {
  const make = (view) => [drawCharacter(spec, view, 0), drawCharacter(spec, view, 1), drawCharacter(spec, view, 'atk')];
  return { front: make('front'), back: make('back') };
}

// ---------------------------------------------------------------- props

export function drawTree(seed, kind = 'oak') {
  const r = mulberry32(seed);
  const p = new PixelCanvas(32, 48);
  const trunk = '#6a4528';
  p.rect(14, 30, 17, 46, trunk);
  p.rect(12, 45, 19, 46, trunk);
  p.set(13, 44, trunk);
  p.set(18, 44, trunk);
  if (kind === 'pine') {
    const g = ['#2f5f3a', '#3b7344', '#468250'];
    for (let layer = 0; layer < 4; layer++) {
      const y0 = 3 + layer * 7;
      for (let y = 0; y < 11; y++) {
        const hw = Math.min(3 + layer * 2 + y * 0.8, 13);
        p.rect(Math.round(16 - hw), y0 + y, Math.round(15 + hw), y0 + y, g[y < 3 ? 2 : y < 7 ? 1 : 0]);
      }
    }
  } else {
    const greens = ['#3d7a3a', '#4a8c41', '#5ea64c'];
    for (let i = 0; i < 9; i++) p.disc(16 + (r() - 0.5) * 10, 17 + (r() - 0.5) * 12, 5 + r() * 3, greens[1]);
    for (let i = 0; i < 6; i++) p.disc(11 + r() * 8, 9 + r() * 8, 2 + r() * 2.5, greens[2]);
    for (let i = 0; i < 5; i++) p.disc(15 + r() * 9, 21 + r() * 7, 2 + r() * 2.5, greens[0]);
  }
  for (let i = 0; i < 40; i++) {
    const x = (r() * 32) | 0;
    const y = (r() * 34) | 0;
    const c = p.get(x, y);
    if (c && c !== trunk) p.set(x, y, r() < 0.5 ? adjust(c, 0.15) : adjust(c, -0.18));
  }
  p.shade(0.1, 0.2);
  p.outline(-0.6);
  return p;
}

export function drawTuft(seed) {
  const r = mulberry32(seed);
  const p = new PixelCanvas(8, 7);
  const greens = ['#4e8c3a', '#5fa147', '#71b552'];
  for (let i = 0; i < 4; i++) {
    const x = 1 + ((r() * 6) | 0);
    const h = 2 + ((r() * 4) | 0);
    p.line(x, 6, x + (r() < 0.5 ? -1 : 1), 6 - h, greens[(r() * 3) | 0]);
  }
  if (r() < 0.35) {
    const fx = 2 + ((r() * 4) | 0);
    p.line(fx, 6, fx, 3, '#4e8c3a');
    p.set(fx, 2, ['#f3e38a', '#f2a6c4', '#ffffff', '#b9a6ff'][(r() * 4) | 0]);
  }
  return p;
}

export function drawRock(seed) {
  const r = mulberry32(seed);
  const p = new PixelCanvas(16, 12);
  p.disc(8, 7.5, 5.5, '#8d8a92');
  p.disc(6, 6, 3, '#a19ea6');
  for (let i = 0; i < 5; i++) {
    const x = 3 + ((r() * 10) | 0);
    const y = 3 + ((r() * 4) | 0);
    if (p.get(x, y)) p.set(x, y, '#6f9a4a');
  }
  p.rect(2, 11, 13, 11, null);
  p.shade(0.15, 0.25);
  p.outline(-0.6);
  return p;
}

export function drawFlames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const r = mulberry32(77 + f * 13);
    const p = new PixelCanvas(10, 14);
    p.disc(5, 10, 3.6, '#ff6a1f');
    for (let i = 0; i < 4; i++) p.disc(5 + (r() - 0.5) * 3, 7 + r() * 2 - i * 1.4, 2.3 - i * 0.4, '#ff8c2a');
    p.disc(5, 10, 2.4, '#ffc24a');
    p.disc(5, 10.6, 1.3, '#fff2b0');
    p.set(4 + ((r() * 3) | 0), 1 + ((r() * 2) | 0), '#ff8c2a');
    frames.push(p);
  }
  return frames;
}

export function drawTorch() {
  const p = new PixelCanvas(8, 18);
  p.rect(3, 6, 4, 17, '#5a3a22');
  p.rect(1, 3, 6, 5, '#3a3440');
  p.rect(2, 6, 5, 6, '#3a3440');
  p.shade();
  p.outline();
  return p;
}

export function drawBanner(seed = 1) {
  const p = new PixelCanvas(12, 24);
  const red = '#8a1c22';
  p.rect(0, 1, 11, 1, '#c9a55a');
  p.rect(1, 2, 10, 19, red);
  for (let x = 1; x <= 10; x++) if (x % 3 !== 0) p.rect(x, 20, x, 21 - (x % 3), red);
  // Prism emblem: a golden triangle
  for (let y = 6; y <= 13; y++) {
    const hw = Math.floor((y - 6) * 0.55);
    p.rect(6 - hw - 1, y, 5 + hw + 1, y, '#e0b85a');
  }
  p.rect(5, 10, 6, 12, '#fff0c0');
  p.shade(0.12, 0.2);
  p.outline(-0.6);
  return p;
}

// ---------------------------------------------------------------- tile textures (16x16)

export function tileCanvas(kind, seed = 1) {
  const r = mulberry32(seed * 7919 + kind.length * 31);
  const p = new PixelCanvas(16, 16);
  const pick = (pal) => pal[(r() * pal.length) | 0];
  const fill = (pal) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, pick(pal));
  };
  const dirtPal = ['#7b5535', '#714d30', '#845d3a', '#6d4a2e'];
  switch (kind) {
    case 'grass_top':
      fill(['#5c9a44', '#62a148', '#56923f', '#68a74c', '#5c9a44']);
      for (let i = 0; i < 12; i++) {
        const x = (r() * 16) | 0;
        const y = (r() * 15) | 0;
        p.set(x, y, '#4a8236');
        p.set(x, y + 1, '#4a8236');
      }
      for (let i = 0; i < 6; i++) p.set((r() * 16) | 0, (r() * 16) | 0, '#7bbb5a');
      if (r() < 0.7) p.set((r() * 16) | 0, (r() * 16) | 0, pick(['#f3e38a', '#f2a6c4', '#ffffff']));
      break;
    case 'grass_side':
      fill(dirtPal);
      for (let x = 0; x < 16; x++) {
        const d = 3 + ((r() * 3) | 0);
        for (let y = 0; y < d; y++) p.set(x, y, pick(['#5c9a44', '#56923f', '#4f8a3c']));
        p.set(x, d, '#4a3522');
      }
      for (let i = 0; i < 5; i++) p.set((r() * 16) | 0, 6 + ((r() * 10) | 0), '#9a7a5a');
      break;
    case 'dirt_top':
      fill(['#8f6a43', '#86623d', '#97714a', '#8a6640']);
      for (let i = 0; i < 6; i++) p.set((r() * 16) | 0, (r() * 16) | 0, '#a88a66');
      for (let i = 0; i < 6; i++) p.set((r() * 16) | 0, (r() * 16) | 0, '#6e5032');
      break;
    case 'dirt_side':
      fill(dirtPal);
      for (let x = 0; x < 16; x++) p.set(x, 0, '#9a7650');
      for (let i = 0; i < 6; i++) p.set((r() * 16) | 0, (r() * 16) | 0, '#9a7a5a');
      break;
    case 'deep':
      fill(['#5e412a', '#563b26', '#664730', '#5a3e28']);
      for (let i = 0; i < 5; i++) p.set((r() * 16) | 0, (r() * 16) | 0, '#7a6048');
      break;
    case 'stone_top':
    case 'stone_side':
    case 'stone_deep': {
      const dark = kind === 'stone_deep' ? -0.25 : 0;
      const tones = ['#9b97a3', '#a29eaa', '#928e9a', '#97939f'].map((c) => (dark ? adjust(c, dark) : c));
      const mortar = adjust('#55505c', dark);
      const top = kind === 'stone_top';
      const bw = 8;
      const bh = top ? 8 : 4;
      const blockTone = {};
      for (let y = 0; y < 16; y++) {
        const row = Math.floor(y / bh);
        const off = row % 2 ? bw / 2 : 0;
        for (let x = 0; x < 16; x++) {
          const col = Math.floor((x + off) / bw);
          const bk = row + ':' + col;
          if (!(bk in blockTone)) blockTone[bk] = tones[(r() * tones.length) | 0];
          const edge = y % bh === 0 || (x + off) % bw === 0;
          p.set(x, y, edge ? mortar : r() < 0.15 ? adjust(blockTone[bk], r() < 0.5 ? 0.08 : -0.1) : blockTone[bk]);
        }
      }
      if (top) for (let i = 0; i < 3; i++) p.set((r() * 16) | 0, (r() * 16) | 0, '#6f9a4a');
      break;
    }
    case 'sand_top':
      fill(['#b9a172', '#b29a6b', '#c0a879', '#ab9466']);
      for (let i = 0; i < 4; i++) {
        const x = (r() * 14) | 0;
        const y = (r() * 16) | 0;
        p.rect(x, y, x + 2, y, '#9c875e');
      }
      break;
    case 'sand_side':
      fill(['#a08a60', '#988258', '#a89266']);
      for (let x = 0; x < 16; x++) p.set(x, 0, '#c4ad80');
      break;
    case 'wood_top':
      for (let y = 0; y < 16; y++) {
        const plank = y >> 2;
        const base = ['#9a6a3e', '#8f613a', '#a37244', '#946640'][plank];
        for (let x = 0; x < 16; x++) p.set(x, y, y % 4 === 3 ? '#4a2f1c' : r() < 0.12 ? adjust(base, -0.15) : base);
      }
      for (let pl = 0; pl < 4; pl++) {
        p.set(1, pl * 4 + 1, '#3a3036');
        p.set(14, pl * 4 + 1, '#3a3036');
      }
      break;
    case 'wood_side':
      fill(['#7a5030', '#734b2c', '#80553a']);
      for (let x = 0; x < 16; x++) {
        p.set(x, 0, '#a37244');
        p.set(x, 15, '#4a2f1c');
      }
      break;
    case 'bed':
      fill(['#6b6a52', '#5f5e49', '#77755b', '#666650']);
      for (let i = 0; i < 6; i++) p.set((r() * 16) | 0, (r() * 16) | 0, '#8f8c72');
      break;
    case 'ground':
      fill(['#4f8a3c', '#548f40', '#4a8238', '#518c3e']);
      for (let i = 0; i < 6; i++) p.set((r() * 16) | 0, (r() * 16) | 0, '#3f7230');
      break;
    default:
      fill(['#ff00ff']);
  }
  return p;
}

export function waterCanvas() {
  const r = mulberry32(99);
  const p = new PixelCanvas(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, r() < 0.5 ? '#3f86b0' : '#3b80aa');
  for (let i = 0; i < 26; i++) {
    const x = (r() * 30) | 0;
    const y = (r() * 32) | 0;
    p.rect(x, y, x + 1 + ((r() * 3) | 0), y, '#6fb3d6');
  }
  for (let i = 0; i < 6; i++) p.set((r() * 32) | 0, (r() * 32) | 0, '#d8f4ff');
  return p;
}

// ---------------------------------------------------------------- UI-ish textures (smooth)

function canvas(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'));
  return cv;
}

export function highlightTex() {
  const t = pixelTex(
    canvas(32, 32, (c) => {
      c.fillStyle = 'rgba(255,255,255,0.42)';
      c.fillRect(2, 2, 28, 28);
      c.strokeStyle = 'rgba(255,255,255,1)';
      c.lineWidth = 2;
      c.strokeRect(3, 3, 26, 26);
    }),
  );
  return t;
}

export function cursorTex() {
  return pixelTex(
    canvas(32, 32, (c) => {
      c.fillStyle = '#ffffff';
      const L = 9;
      for (const [x, y, sx, sy] of [
        [1, 1, 1, 1],
        [31, 1, -1, 1],
        [1, 31, 1, -1],
        [31, 31, -1, -1],
      ]) {
        c.fillRect(Math.min(x, x + sx * L), Math.min(y, y + sy * 3), L, 3);
        c.fillRect(Math.min(x, x + sx * 3), Math.min(y, y + sy * L), 3, L);
      }
    }),
  );
}

export function ringTex() {
  const cv = canvas(64, 64, (c) => {
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(32, 32, 24, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fill();
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function blobTex() {
  const cv = canvas(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.7)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  return new THREE.CanvasTexture(cv);
}

export function skyTex(top, mid, bottom) {
  const cv = canvas(4, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 256);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
