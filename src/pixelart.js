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
  iris: '#3a6ab0',
  metal: '#c8ced8',
  wood: '#6a4528',
  gem: '#9ff0ff',
  hair: '#3a2c28',
  hood: '#444450',
  cape: '#333344',
  plume: '#eeeeee',
  pants: '#333038',
  boots: '#2a2020',
  gold: '#e8c860',
};

const WHITE = '#f6f2ea';
const blush = (skin) => {
  const [r, g, b] = hexToRgb(skin);
  return rgbToHex(r * 0.7 + 255 * 0.3, g * 0.72 + 120 * 0.28, b * 0.72 + 130 * 0.28);
};

// ---------------------------------------------------------------- faces
// Each character's face is described by spec.face so that nobody shares the same features:
//   eyes:  round | droopy | sharp | sleepy | almond | closed | fierce | slit
//   brows: normal | thick | angry | thin | arched | worried | bushy | none
//   mouth: smile | small | open | smirk | frown | flat | grit | none
//   nose:  dot | normal | long | big
//   jaw:   normal | round | square | sharp | long
//   marks: freckles, mole, stubble, wrinkles, scar, tattoo, mustache
export function faceOf(spec) {
  return {
    eyes: 'round',
    brows: 'normal',
    mouth: spec.fem ? 'small' : 'flat',
    nose: spec.fem ? 'dot' : 'normal',
    jaw: 'normal',
    marks: [],
    ...spec.face,
  };
}

const mix = (a, b, t) => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};

function drawPortraitFeatures(p, spec, F, C, S, H) {
  const has = (m) => F.marks.includes(m);
  const ink = C.eye;
  const dark = (amt) => adjust(S, amt);
  const browCol = adjust(spec.colors.hair ? H : '#4a3a30', -0.28);
  const ey = 21;

  const eye = (ex, flip) => {
    const at = (i) => (flip ? ex + 4 - i : ex + i);
    const put = (i, r, c) => p.set(at(i), ey + r, c, true);
    const glint = (r) => p.set(ex + 1, ey + r, '#ffffff', true);
    const iris = (rows, cols = [1, 2, 3]) =>
      rows.forEach((r, k) => {
        const c = k === 0 ? adjust(C.iris, -0.4) : k === rows.length - 1 && rows.length > 2 ? adjust(C.iris, 0.3) : C.iris;
        cols.forEach((i) => put(i, r, c));
      });
    switch (F.eyes) {
      case 'droopy': // big gentle eyes, outer corners turned down
        for (let i = 1; i <= 4; i++) put(i, 0, ink);
        put(0, 1, ink);
        put(-1, 2, ink);
        iris([1, 2, 3, 4]);
        put(4, 1, WHITE);
        put(4, 2, WHITE);
        put(0, 2, WHITE);
        put(2, 2, adjust(C.iris, -0.55));
        glint(1);
        p.set(ex + 3, ey + 3, '#ffffff', true);
        for (let i = 1; i <= 3; i++) put(i, 5, dark(-0.12));
        break;
      case 'sharp': // narrow, outer corners lifted
        put(-1, -1, ink);
        put(0, -1, ink);
        for (let i = 1; i <= 4; i++) put(i, 0, ink);
        put(0, 0, ink);
        iris([1, 2]);
        put(4, 1, WHITE);
        put(0, 1, WHITE);
        put(2, 1, adjust(C.iris, -0.6));
        glint(1);
        for (let i = 0; i <= 3; i++) put(i, 3, dark(-0.2));
        break;
      case 'sleepy': // heavy lids, iris half hidden
        for (let i = 0; i <= 4; i++) put(i, -1, dark(-0.16));
        for (let i = 0; i <= 4; i++) put(i, 0, ink);
        for (let i = 0; i <= 4; i++) put(i, 1, adjust(ink, 0.15));
        iris([2, 3]);
        put(0, 2, WHITE);
        put(4, 2, WHITE);
        p.set(ex + 1, ey + 2, '#ffffff', true);
        for (let i = 1; i <= 3; i++) put(i, 4, dark(-0.14));
        break;
      case 'almond': // long lashes and a flick at the outer corner
        for (let i = 0; i <= 4; i++) put(i, 0, ink);
        put(-1, 0, ink);
        put(-2, -1, ink);
        put(-1, 2, ink);
        iris([1, 2, 3]);
        put(0, 1, WHITE);
        put(4, 1, WHITE);
        put(4, 2, WHITE);
        put(2, 2, adjust(C.iris, -0.55));
        glint(1);
        for (let i = 1; i <= 3; i++) put(i, 4, dark(-0.18));
        break;
      case 'closed': // kind smiling arcs
        put(0, 2, ink);
        put(1, 1, ink);
        put(2, 1, ink);
        put(3, 1, ink);
        put(4, 2, ink);
        break;
      case 'fierce': // small iris ringed with white, heavy shadow above
        for (let i = -1; i <= 4; i++) put(i, -1, dark(-0.28));
        for (let i = -1; i <= 4; i++) put(i, 0, ink);
        for (let i = 0; i <= 4; i++) {
          put(i, 1, WHITE);
          put(i, 2, WHITE);
        }
        put(2, 1, adjust(C.iris, -0.3));
        put(2, 2, C.iris);
        put(3, 1, adjust(C.iris, -0.3));
        put(3, 2, C.iris);
        for (let i = 0; i <= 4; i++) put(i, 3, dark(-0.3));
        break;
      case 'slit': // thin glowing line
        for (let i = -1; i <= 4; i++) put(i, 0, ink);
        for (let i = 0; i <= 4; i++) put(i, 1, adjust(C.iris, 0.15));
        put(2, 1, '#fff0f0');
        for (let i = 0; i <= 3; i++) put(i, 2, ink);
        break;
      default: // round
        for (let i = 0; i <= 4; i++) put(i, 0, ink);
        iris([1, 2, 3]);
        put(0, 1, WHITE);
        put(0, 2, WHITE);
        put(4, 1, WHITE);
        put(4, 2, WHITE);
        put(2, 2, adjust(C.iris, -0.55));
        glint(1);
        for (let i = 1; i <= 3; i++) put(i, 4, dark(-0.14));
    }

    const by = spec.helmet ? 20 : 18;
    const b = (i, y, c = browCol) => p.set(at(i), y, c, true);
    switch (F.brows) {
      case 'thick':
        for (let i = 0; i <= 4; i++) {
          b(i, by);
          if (!spec.helmet) b(i, by - 1);
        }
        break;
      case 'angry':
        // outer end high, inner end pulled down toward the nose
        for (const [i, y] of [[0, -1], [1, -1], [1, 0], [2, 0], [3, 0], [4, 0]]) b(i, by + y);
        if (!spec.helmet) for (const [i, y] of [[0, -2], [2, -1], [3, 1], [4, 1]]) b(i, by + y);
        break;
      case 'thin':
        for (let i = 1; i <= 3; i++) b(i, by, adjust(browCol, 0.15));
        break;
      case 'arched':
        b(0, by + 1);
        b(1, by);
        b(2, by - 1);
        b(3, by - 1);
        b(4, by);
        break;
      case 'worried':
        b(0, by + 1);
        b(1, by + 1);
        b(2, by);
        b(3, by - 1);
        break;
      case 'bushy':
        for (let i = -1; i <= 4; i++) {
          b(i, by, H);
          if (i % 2 === 0 || i === 4) b(i, by - 1, H);
        }
        b(-2, by + 1, H);
        break;
      case 'none':
        break;
      default:
        for (let i = 0; i <= 3; i++) b(i, by);
    }
  };
  eye(16, false);
  eye(27, true);

  // nose
  const n = (x, y, a) => p.set(x, y, dark(a), true);
  if (F.nose === 'dot') n(24, 26, -0.2);
  else if (F.nose === 'long') {
    for (let y = 23; y <= 26; y++) n(25, y, -0.1);
    n(25, 27, -0.3);
    n(23, 27, -0.2);
  } else if (F.nose === 'big') {
    for (let y = 23; y <= 26; y++) n(25, y, -0.12);
    n(22, 27, -0.25);
    n(23, 28, -0.3);
    n(25, 28, -0.3);
    n(26, 27, -0.25);
    n(24, 27, -0.14);
  } else {
    n(24, 26, -0.2);
    n(25, 27, -0.26);
  }

  // mouth
  const lip = F.lip || dark(-0.4);
  const m = (x, y, c = lip) => p.set(x, y, c, true);
  switch (F.mouth) {
    case 'smile':
      m(21, 28);
      for (let x = 22; x <= 25; x++) m(x, 29);
      m(26, 28);
      m(23, 30, dark(-0.12));
      m(24, 30, dark(-0.12));
      break;
    case 'small':
      m(23, 29);
      m(24, 29);
      break;
    case 'open':
      for (let x = 22; x <= 25; x++) m(x, 28, '#5a2028');
      m(22, 29, '#5a2028');
      m(23, 29, '#d0606a');
      m(24, 29, '#d0606a');
      m(25, 29, '#5a2028');
      m(23, 30, '#5a2028');
      m(24, 30, '#5a2028');
      break;
    case 'smirk':
      for (let x = 21; x <= 24; x++) m(x, 29);
      m(25, 28);
      m(26, 27);
      m(27, 27, dark(-0.18));
      break;
    case 'frown':
      m(21, 30);
      for (let x = 22; x <= 25; x++) m(x, 29);
      m(26, 30);
      break;
    case 'grit':
      for (let x = 20; x <= 27; x++) {
        m(x, 28, '#3a1a1a');
        m(x, 30, '#3a1a1a');
        m(x, 29, x === 20 || x === 27 ? '#3a1a1a' : x === 23 || x === 25 ? '#b8b0a0' : '#f0ece0');
      }
      break;
    case 'none':
      break;
    default:
      for (let x = 21; x <= 26; x++) m(x, 29);
  }

  // marks
  if (spec.fem && !has('freckles')) {
    p.rect(15, 26, 17, 26, blush(S), true);
    p.rect(30, 26, 32, 26, blush(S), true);
  }
  if (has('freckles')) for (const [x, y] of [[16, 26], [18, 27], [17, 25], [29, 25], [31, 26], [30, 27], [22, 26], [26, 25]]) p.set(x, y, mix(S, '#9a4a22', 0.45), true);
  if (has('mole')) p.set(31, 28, '#4a2a2a', true);
  if (has('stubble'))
    for (let y = 27; y <= 33; y++)
      for (let x = 15; x <= 32; x++) {
        const i = y * 48 + x;
        if (p.px[i] === S && !p.locked.has(i) && (x + y) % 2 === 0 && (y >= 30 || x < 20 || x > 27)) p.set(x, y, mix(S, '#4a5a6a', 0.3), true);
      }
  if (has('wrinkles')) {
    for (const [x, y] of [[14, 22], [14, 24], [15, 25], [33, 22], [33, 24], [32, 25], [20, 27], [20, 28], [27, 27], [27, 28]]) p.set(x, y, dark(-0.2), true);
    for (let x = 17; x <= 30; x++) if (x !== 23 && x !== 24) p.set(x, 16, dark(-0.12), true);
    for (let x = 17; x <= 19; x++) p.set(x, 25, dark(-0.12), true);
    for (let x = 28; x <= 30; x++) p.set(x, 25, dark(-0.12), true);
  }
  if (has('scar')) {
    p.line(29, 17, 32, 27, dark(-0.4), true);
    p.line(30, 17, 33, 27, mix(S, '#e8b0a0', 0.5), true);
  }
  if (has('tattoo')) for (const [x, y] of [[17, 26], [17, 27], [18, 28], [30, 26], [30, 27], [29, 28], [24, 15], [23, 16], [25, 16]]) p.set(x, y, '#c02848', true);
  if (has('mustache')) {
    const mc = adjust(spec.colors.hair || '#5a4030', -0.1);
    for (let x = 20; x <= 27; x++) p.set(x, 28, mc, true);
    p.set(19, 29, mc, true);
    p.set(28, 29, mc, true);
  }
}

function drawSpriteFeatures(p, spec, F, C, hy) {
  const has = (m) => F.marks.includes(m);
  const S = C.skin;
  const ink = C.eye;
  // i = 0 is the outer corner; left eye spans x 11..13, right eye 16..18
  const both = (i, r, c) => {
    p.set(11 + i, hy + 1 + r, c, true);
    p.set(18 - i, hy + 1 + r, c, true);
  };
  const lash = (from, to, r = 0) => {
    for (let i = from; i <= to; i++) both(i, r, ink);
  };
  switch (F.eyes) {
    case 'droopy':
      lash(1, 2);
      both(0, 1, ink);
      both(1, 1, C.iris);
      both(2, 1, adjust(C.iris, -0.3));
      both(1, 0, adjust(C.iris, -0.35));
      break;
    case 'sharp':
      both(0, -1, ink);
      lash(1, 2);
      both(1, 1, C.iris);
      both(2, 1, adjust(C.iris, -0.4));
      break;
    case 'sleepy':
      lash(0, 2);
      both(1, 1, adjust(C.iris, 0.1));
      both(2, 1, C.iris);
      both(0, -1, adjust(S, -0.2));
      both(1, -1, adjust(S, -0.2));
      break;
    case 'almond':
      lash(0, 2);
      both(-1, -1, ink);
      both(0, 1, WHITE);
      both(1, 1, C.iris);
      both(2, 1, adjust(C.iris, -0.35));
      break;
    case 'closed':
      both(0, 1, ink);
      both(1, 0, ink);
      both(2, 1, ink);
      break;
    case 'fierce':
      lash(0, 2);
      both(0, 1, WHITE);
      both(1, 1, C.iris);
      both(2, 1, WHITE);
      both(0, -1, adjust(S, -0.3));
      both(1, -1, adjust(S, -0.3));
      both(2, -1, adjust(S, -0.3));
      break;
    case 'slit':
      lash(0, 2, -1);
      lash(0, 2, 0);
      both(1, 0, adjust(C.iris, 0.2));
      both(2, 0, adjust(C.iris, 0.2));
      break;
    default:
      lash(0, 2);
      both(0, 1, WHITE);
      both(1, 1, C.iris);
      both(2, 1, adjust(C.iris, -0.35));
  }
  const bc = adjust(spec.colors.hair || '#4a3a30', -0.3);
  if (F.brows === 'thick' || F.brows === 'angry') {
    both(1, -1, bc);
    both(2, -1, bc);
    both(0, F.brows === 'angry' ? -2 : -1, bc);
  } else if (F.brows === 'bushy') {
    for (let i = -1; i <= 2; i++) both(i, -1, C.hair);
  }

  const lip = F.lip || adjust(S, -0.35);
  const m = (x, y, c = lip) => p.set(x, hy + y, c, true);
  if (!spec.beard)
    switch (F.mouth) {
      case 'smile':
        m(14, 4);
        m(15, 5);
        m(16, 4);
        break;
      case 'open':
        m(14, 4, '#5a2028');
        m(15, 4, '#5a2028');
        m(14, 5, '#d0606a');
        m(15, 5, '#d0606a');
        break;
      case 'smirk':
        m(14, 5);
        m(15, 5);
        m(16, 4);
        break;
      case 'frown':
        m(14, 5);
        m(15, 4);
        m(16, 5);
        break;
      case 'grit':
        m(13, 4, '#3a1a1a');
        m(14, 4, '#f0ece0');
        m(15, 4, '#f0ece0');
        m(16, 4, '#f0ece0');
        m(17, 4, '#3a1a1a');
        break;
      case 'flat':
        m(14, 4);
        m(15, 4);
        m(16, 4);
        break;
      case 'none':
        break;
      default:
        m(15, 4);
    }
  if (spec.fem && !has('freckles')) {
    p.set(10, hy + 3, blush(S), true);
    p.set(19, hy + 3, blush(S), true);
  }
  if (has('freckles')) for (const x of [11, 13, 17, 19]) p.set(x, hy + 3, mix(S, '#9a4a22', 0.5), true);
  if (has('mole')) p.set(19, hy + 3, '#4a2a2a', true);
  if (has('stubble')) for (let x = 11; x <= 20; x += 2) p.get(x, hy + 5) === S && p.set(x, hy + 5, mix(S, '#4a5a6a', 0.35), true);
  if (has('scar')) p.line(18, hy, 19, hy + 3, adjust(S, -0.4), true);
  if (has('tattoo')) {
    p.set(12, hy + 3, '#c02848', true);
    p.set(17, hy + 3, '#c02848', true);
  }
  if (has('wrinkles')) {
    p.set(10, hy + 2, adjust(S, -0.22), true);
    p.set(21, hy + 2, adjust(S, -0.22), true);
  }
  if (has('mustache')) {
    const mc = adjust(spec.colors.hair || '#5a4030', -0.1);
    for (let x = 13; x <= 17; x++) p.set(x, hy + 3, mc, true);
  }
}

export const CHAR_W = 32;
export const CHAR_H = 44;

// 32x44 chibi-proportioned humanoid. view: 'front' (facing camera, turned left) | 'back'.
// frame: 0 | 1 (idle breath) | 'atk'.
export function drawCharacter(spec, view, frame) {
  const p = new PixelCanvas(CHAR_W, CHAR_H);
  const C = { ...DEFAULT_COLORS, ...spec.colors };
  const back = view === 'back';
  const bob = frame === 1 ? 1 : 0;
  const atk = frame === 'atk';
  const mx = (x) => (back ? CHAR_W - 1 - x : x);
  const hy = 13 + bob;
  const ty = 20 + bob;
  const handY = ty + 8;
  const hairStyle = spec.hairStyle || (spec.longHair ? 'long' : 'short');

  // --- behind the body
  if (back) drawWeapon(p, spec, C, mx, hy, handY, atk);
  if (spec.cape && !back) {
    p.rect(10, ty + 1, 21, 40, adjust(C.cape, -0.3));
    p.rect(9, ty + 6, 9, 39, adjust(C.cape, -0.3));
    p.rect(22, ty + 6, 22, 39, adjust(C.cape, -0.3));
  }
  if (!back && !spec.helmet && !spec.hood && hairStyle === 'long') p.rect(9, hy, 22, hy + 12, adjust(C.hair, -0.28));

  // --- legs / robe
  if (spec.robe) {
    for (let y = ty + 6; y <= 41; y++) {
      const hw = Math.min(8, Math.floor(5 + (y - ty - 6) * 0.22));
      p.rect(16 - hw, y, 15 + hw, y, y >= 40 ? C.armor2 : C.armor);
    }
    if (!back) {
      p.rect(15, ty + 7, 16, 39, C.armor2);
      p.line(12, ty + 10, 10, 39, adjust(C.armor, -0.18));
      p.line(19, ty + 10, 21, 39, adjust(C.armor, -0.18));
    } else {
      p.line(15, ty + 8, 14, 39, adjust(C.armor, -0.18));
    }
    p.rect(12, 42, 14, 42, C.boots);
    p.rect(17, 42, 19, 42, C.boots);
  } else {
    p.rect(12, ty + 9, 14, 38, C.pants);
    p.rect(17, ty + 9, 19, 38, C.pants);
    p.set(12, 33, adjust(C.pants, 0.18));
    p.set(17, 33, adjust(C.pants, 0.18));
    p.rect(11, 38, 14, 42, C.boots);
    p.rect(17, 38, 20, 42, C.boots);
    p.rect(11, 38, 14, 38, adjust(C.boots, 0.2));
    p.rect(17, 38, 20, 38, adjust(C.boots, 0.2));
    p.rect(11, 42, 14, 42, adjust(C.boots, -0.35));
    p.rect(17, 42, 20, 42, adjust(C.boots, -0.35));
  }

  // --- arms and torso
  p.rect(9, ty + 1, 10, handY - 1, C.armor2);
  p.rect(21, ty + 1, 22, handY - 1, C.armor2);
  p.rect(9, ty + 4, 10, ty + 4, adjust(C.armor2, -0.2));
  p.rect(21, ty + 4, 22, ty + 4, adjust(C.armor2, -0.2));
  p.rect(9, handY, 10, handY + 1, C.skin);
  p.rect(21, handY, 22, handY + 1, C.skin);

  p.rect(11, ty, 20, ty + 9, C.armor);
  p.rect(10, ty, 21, ty + 1, C.armor);
  for (let y = ty + 2; y <= ty + 7; y++) {
    p.set(12, y, adjust(C.armor, 0.14));
    p.set(19, y, adjust(C.armor, -0.16));
  }
  p.rect(11, ty + 8, 20, ty + 8, C.belt || adjust(C.armor2, -0.3));
  if (!back) {
    p.line(13, ty, 15, ty + 3, C.armor2);
    p.line(18, ty, 16, ty + 3, C.armor2);
    p.set(14, ty, C.skin);
    p.set(15, ty, C.skin);
    p.set(16, ty, C.skin);
    p.set(17, ty, C.skin);
    p.set(15, ty + 1, C.skin);
    p.set(16, ty + 1, C.skin);
    if (spec.emblem !== false) p.rect(15, ty + 5, 16, ty + 6, C.armor2);
    p.rect(15, ty + 8, 16, ty + 8, C.gold, true);
  }
  if (spec.scarf) {
    p.rect(12, ty - 1, 19, ty + 1, spec.scarf);
    if (back) p.rect(17, ty + 2, 18, ty + 7, spec.scarf);
    else p.rect(18, ty + 2, 19, ty + 5, spec.scarf);
  }
  if (spec.pauldrons) {
    for (const cx of [10, 21]) {
      p.disc(cx + 0.5, ty + 1.5, 2.6, C.metal, (x, y) => y <= ty + 3);
      p.set(cx - 1, ty, adjust(C.metal, 0.35), true);
    }
  }
  if (spec.cape && back) {
    for (let y = ty; y <= 40; y++) {
      const hw = Math.min(7, 6 + Math.floor((y - ty) / 12));
      p.rect(16 - hw, y, 15 + hw, y, C.cape);
    }
    p.line(12, ty + 3, 11, 40, adjust(C.cape, -0.22));
    p.line(16, ty + 3, 16, 40, adjust(C.cape, -0.22));
    p.line(19, ty + 3, 20, 40, adjust(C.cape, -0.22));
    p.rect(10, ty, 21, ty, C.armor2);
  }

  // --- head
  p.rect(15, ty - 1, 16, ty - 1, C.skin);
  p.disc(16, hy, 6.4, C.skin);

  const H = C.hair;
  const hl = adjust(H, 0.32);
  if (spec.helmet) {
    const M = C.metal;
    if (!back) {
      p.disc(16, hy - 0.6, 7.0, M, (x, y) => y <= hy - 1);
      p.rect(9, hy - 1, 22, hy - 1, adjust(M, -0.3));
      p.rect(9, hy, 10, hy + 4, M);
      p.rect(21, hy, 22, hy + 4, M);
      p.set(12, hy - 5, adjust(M, 0.4), true);
      p.set(13, hy - 6, adjust(M, 0.4), true);
      if (spec.visor) {
        p.rect(11, hy, 20, hy + 2, adjust(M, -0.15));
        p.rect(11, hy + 1, 20, hy + 1, '#141018', true);
        p.set(13, hy + 1, '#ff5a3a', true);
        p.set(17, hy + 1, '#ff5a3a', true);
      }
    } else {
      p.disc(16, hy - 0.3, 7.0, M, (x, y) => y <= hy + 4);
      p.set(19, hy - 5, adjust(M, 0.4), true);
    }
    if (spec.horns) {
      const bone = '#e6dcc4';
      p.line(9, hy - 2, 6, hy - 5, bone);
      p.line(6, hy - 5, 6, hy - 8, bone);
      p.line(22, hy - 2, 25, hy - 5, bone);
      p.line(25, hy - 5, 25, hy - 8, bone);
    }
    if (spec.plume) {
      p.rect(15, hy - 10, 16, hy - 7, C.plume);
      p.rect(17, hy - 11, 19, hy - 9, C.plume);
      p.set(20, hy - 10, C.plume);
    }
  } else if (spec.hood) {
    p.disc(16, hy - 0.2, 7.2, C.hood, (x, y) => y <= hy + 6);
    if (!back) {
      p.disc(15.5, hy + 1.4, 4.5, C.skin, (x, y) => y >= hy - 2);
      p.rect(12, hy - 2, 19, hy - 2, spec.colors.hair ? H : adjust(C.hood, -0.35));
      p.set(13, hy - 1, spec.colors.hair ? H : adjust(C.skin, -0.3));
      p.set(18, hy - 1, spec.colors.hair ? H : adjust(C.skin, -0.3));
    } else {
      p.line(16, hy - 6, 16, hy + 5, adjust(C.hood, -0.2));
    }
  } else if (!back) {
    // front hair: cap, jagged fringe and side locks
    p.disc(16, hy - 1.2, 7.0, H, (x, y) => y <= hy - 1);
    const fringe = [2, 1, 3, 1, 2, 0, 2, 3, 1, 2, 1, 2];
    if (hairStyle !== 'slick') for (let x = 10; x <= 21; x++) p.rect(x, hy - 1, x, hy - 1 + Math.min(fringe[x - 10], x > 12 && x < 19 ? 1 : 3), H);
    const len = hairStyle === 'long' ? 11 : hairStyle === 'bob' ? 5 : hairStyle === 'slick' ? 0 : 3;
    p.rect(9, hy - 2, 10, hy + len, H);
    p.rect(21, hy - 2, 22, hy + len, H);
    if (hairStyle === 'spiky') {
      p.line(11, hy - 6, 9, hy - 9, H);
      p.line(15, hy - 7, 14, hy - 10, H);
      p.line(20, hy - 6, 22, hy - 9, H);
    }
    if (spec.ahoge) {
      p.line(17, hy - 7, 18, hy - 10, H);
      p.set(19, hy - 10, H);
    }
    p.line(12, hy - 5, 15, hy - 6, hl, true);
    p.set(16, hy - 6, hl, true);
  } else {
    p.disc(16, hy - 0.8, 7.0, H, (x, y) => y <= hy + 4);
    if (hairStyle === 'long') p.rect(10, hy + 4, 21, hy + 11, H);
    else if (hairStyle === 'bob') p.rect(10, hy + 4, 21, hy + 6, H);
    if (hairStyle === 'spiky') {
      p.line(11, hy - 6, 9, hy - 9, H);
      p.line(17, hy - 7, 18, hy - 10, H);
      p.line(21, hy - 6, 23, hy - 9, H);
    }
    p.line(17, hy - 5, 20, hy - 4, hl, true);
    p.line(14, hy - 2, 14, hy + 3, adjust(H, -0.2));
    p.line(18, hy - 2, 18, hy + 3, adjust(H, -0.2));
  }
  if (spec.circlet) {
    p.rect(10, hy - 3, 21, hy - 3, spec.circlet);
    if (!back) p.set(15, hy - 3, C.gem, true);
  }

  if (!back) {
    if (spec.beard) {
      p.rect(13, hy + 3, 18, hy + 3, H);
      p.rect(12, hy + 4, 19, hy + 5, H);
      p.rect(14, hy + 6, 17, hy + 6, H);
      p.rect(15, hy + 4, 16, hy + 4, adjust(C.skin, -0.3));
    }
    if (!spec.visor) drawSpriteFeatures(p, spec, faceOf(spec), C, hy);
  }

  if (!back) drawWeapon(p, spec, C, mx, hy, handY, atk);
  p.shade(0.16, 0.2);
  p.outline(-0.7);
  return p;
}

function drawWeapon(p, spec, C, mx, hy, handY, atk) {
  const W = C.wood;
  const M = C.metal;
  const set = (x, y, c, l) => p.set(mx(x), y, c, l);
  const line = (x0, y0, x1, y1, c, l) => p.line(mx(x0), y0, mx(x1), y1, c, l);
  const rect = (x0, y0, x1, y1, c, l) => p.rect(Math.min(mx(x0), mx(x1)), y0, Math.max(mx(x0), mx(x1)), y1, c, l);
  const blade = '#e8eef7';
  const edge = '#a8b4c6';
  switch (spec.weapon) {
    case 'sword':
      if (!atk) {
        line(24, handY - 13, 24, handY - 2, blade);
        line(25, handY - 12, 25, handY - 2, edge);
        set(24, handY - 14, blade);
        rect(22, handY - 1, 27, handY - 1, C.gold);
        rect(24, handY, 25, handY + 2, W);
        set(24, handY + 3, C.gold);
      } else {
        line(24, handY - 2, 30, handY - 12, blade);
        line(25, handY - 2, 31, handY - 12, edge);
        rect(21, handY - 1, 25, handY - 1, C.gold);
        rect(22, handY, 23, handY + 1, W);
      }
      break;
    case 'spear':
      if (!atk) {
        line(24, 6, 24, 41, W);
        rect(23, 3, 25, 5, M);
        set(24, 1, M);
        set(24, 2, M);
        rect(23, 6, 25, 6, C.armor2);
      } else {
        line(4, handY, 26, handY, W);
        rect(26, handY - 1, 28, handY + 1, M);
        set(29, handY, M);
        set(30, handY, M);
        rect(25, handY - 1, 25, handY + 1, C.armor2);
      }
      break;
    case 'bow':
      for (let i = 0; i <= 20; i++) {
        const y = handY - 11 + i;
        set(24 + Math.round(3 * Math.sin((Math.PI * i) / 20)), y, W);
      }
      line(24, handY - 11, 24, handY + 9, '#e9e2c8');
      set(27, handY, C.armor2);
      if (atk) {
        line(14, handY - 1, 27, handY - 1, '#d9c9a0');
        set(28, handY - 1, M);
        set(29, handY - 1, M);
      }
      break;
    case 'staff':
      line(24, hy - 4, 24, 41, W);
      p.disc(mx(24) + 0.5, hy - 6, atk ? 3.0 : 2.2, C.gem, null, true);
      set(23, hy - 7, '#ffffff', true);
      rect(23, hy - 3, 25, hy - 3, C.gold);
      if (atk) {
        set(20, hy - 11, '#ffffff', true);
        set(28, hy - 4, '#ffffff', true);
        set(27, hy - 12, '#ffffff', true);
      }
      break;
    case 'axe':
      if (!atk) {
        line(24, handY - 12, 24, handY + 4, W);
        rect(25, handY - 12, 28, handY - 6, M);
        set(29, handY - 11, M);
        set(29, handY - 7, M);
        line(28, handY - 12, 28, handY - 6, adjust(M, 0.35));
      } else {
        line(18, handY - 1, 25, handY - 11, W);
        rect(24, handY - 16, 28, handY - 10, M);
        line(28, handY - 16, 28, handY - 10, adjust(M, 0.35));
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

// 48x48 bust portrait for the HUD and dialogue.
export function drawPortrait(spec) {
  const p = new PixelCanvas(48, 48);
  const C = { ...DEFAULT_COLORS, ...spec.colors };
  const H = C.hair;
  const S = C.skin;
  const hairStyle = spec.hairStyle || (spec.longHair ? 'long' : 'short');
  const bare = !spec.helmet && !spec.hood;

  // behind: cape and long hair
  if (spec.cape) p.rect(1, 37, 46, 47, adjust(C.cape, -0.1));
  if (bare && hairStyle === 'long') {
    for (let y = 14; y <= 47; y++) {
      const hw = Math.min(15, 12 + (y - 14) * 0.12);
      p.rect(Math.round(24 - hw), y, Math.round(23 + hw), y, adjust(H, -0.22));
    }
  }
  if (spec.hood) p.disc(24, 22, 15.5, C.hood, (x, y) => y <= 40);

  // torso
  for (let y = 34; y <= 47; y++) {
    const hw = Math.min(21, 10 + (y - 34) * 1.1);
    p.rect(Math.round(24 - hw), y, Math.round(23 + hw), y, C.armor);
  }
  for (let y = 37; y <= 47; y++) {
    p.set(Math.round(24 - Math.min(21, 10 + (y - 34) * 1.1)) + 3, y, adjust(C.armor, 0.12));
    p.set(Math.round(23 + Math.min(21, 10 + (y - 34) * 1.1)) - 3, y, adjust(C.armor, -0.15));
  }
  // neckline trim and emblem
  p.line(18, 34, 23, 41, C.armor2);
  p.line(29, 34, 24, 41, C.armor2);
  p.line(19, 34, 23, 40, C.armor2);
  p.line(28, 34, 24, 40, C.armor2);
  if (spec.robe) {
    p.rect(17, 33, 30, 35, C.armor2);
    p.rect(23, 36, 24, 47, C.armor2);
  }
  if (spec.emblem !== false) {
    p.disc(24, 44.5, 1.8, C.gem, null, true);
    p.set(23, 44, '#ffffff', true);
  }
  if (spec.pauldrons) {
    for (const cx of [10, 38]) {
      p.disc(cx, 40, 6.5, C.metal, (x, y) => y <= 44);
      p.line(cx - 4, 37, cx + 3, 36, adjust(C.metal, 0.35), true);
      p.rect(cx - 6, 43, cx + 6, 44, adjust(C.metal, -0.25));
    }
  }
  if (spec.hood) {
    for (let y = 31; y <= 39; y++) {
      const hw = 11 + (y - 31) * 1.3;
      p.rect(Math.round(24 - hw), y, Math.round(23 + hw), y, C.hood);
    }
    p.line(12, 38, 35, 38, adjust(C.hood, -0.25));
  }

  // neck and head
  p.rect(20, 29, 27, 35, S);
  p.rect(20, 31, 27, 32, adjust(S, -0.22));
  if (spec.scarf) {
    p.rect(16, 31, 31, 36, spec.scarf);
    p.line(16, 34, 31, 34, adjust(spec.scarf, -0.2));
    p.rect(27, 36, 31, 42, spec.scarf);
  }
  const F = faceOf(spec);
  const JAW = { normal: [10, 10.5, 31], round: [10.3, 10, 33], square: [10.5, 11, 34], sharp: [9.6, 10.5, 30], long: [10, 11.5, 32] }[F.jaw];
  const face = (x, y) => {
    const dx = (x + 0.5 - 24) / JAW[0];
    const dy = (y + 0.5 - 21) / (y > 21 ? JAW[1] : 11);
    return dx * dx + dy * dy <= 1 && !(y >= 29 && Math.abs(x + 0.5 - 24) > JAW[2] - y);
  };
  for (let y = 9; y <= 33; y++) for (let x = 13; x <= 34; x++) if (face(x, y)) p.set(x, y, S);
  if (bare) {
    p.rect(13, 21, 13, 24, S);
    p.rect(34, 21, 34, 24, S);
    p.set(13, 22, adjust(S, -0.2));
    p.set(34, 22, adjust(S, -0.2));
  }

  if (spec.beard) {
    for (let y = 27; y <= 35; y++) {
      const hw = y < 29 ? 9 : 9 - (y - 29) * 1.2;
      p.rect(Math.round(24 - hw), y, Math.round(23 + hw), y, H);
    }
    p.rect(21, 28, 26, 28, adjust(H, 0.2));
    p.rect(22, 30, 25, 30, adjust(S, -0.4), true);
    p.line(16, 31, 20, 34, adjust(H, -0.2));
    p.line(31, 31, 27, 34, adjust(H, -0.2));
  }

  // hair / headgear
  const hl = adjust(H, 0.35);
  if (spec.helmet) {
    const M = C.metal;
    p.disc(24, 18, 13, M, (x, y) => y <= 18);
    p.rect(11, 18, 36, 19, adjust(M, -0.3));
    p.rect(11, 20, 15, 31, M);
    p.rect(32, 20, 36, 31, M);
    p.rect(11, 29, 15, 31, adjust(M, -0.2));
    p.rect(32, 29, 36, 31, adjust(M, -0.2));
    p.rect(23, 6, 24, 18, adjust(M, 0.2));
    p.line(15, 11, 19, 7, adjust(M, 0.45), true);
    p.line(16, 12, 20, 8, adjust(M, 0.3), true);
    for (const x of [14, 33]) p.set(x, 24, adjust(M, 0.5), true);
    if (spec.visor) {
      p.rect(15, 20, 32, 27, adjust(M, -0.1));
      p.rect(16, 22, 31, 23, '#120e16', true);
      p.rect(18, 22, 20, 22, '#ff5a3a', true);
      p.rect(27, 22, 29, 22, '#ff5a3a', true);
      for (let x = 17; x <= 30; x += 3) p.set(x, 26, adjust(M, -0.4), true);
    }
    if (spec.horns) {
      const bone = '#e6dcc4';
      for (const s of [-1, 1]) {
        for (let i = 0; i < 9; i++) {
          const x = 24 + s * (12 + i * 0.7);
          const y = 14 - i * 1.1 - (i > 5 ? (i - 5) * 0.6 : 0);
          p.disc(x, y, Math.max(0.8, 2.2 - i * 0.18), i > 6 ? adjust(bone, -0.15) : bone);
        }
      }
    }
    if (spec.plume) {
      for (let i = 0; i < 10; i++) p.disc(25 + i * 1.4, 6 - Math.sin(i / 3) * 3 + i * 0.4, 2.6 - i * 0.12, C.plume);
      p.line(26, 4, 36, 6, adjust(C.plume, 0.3), true);
    }
  } else if (spec.hood) {
    if (spec.colors.hair) {
      const fr = [3, 5, 2, 6, 4, 3, 5, 2, 4, 6, 3, 4, 5, 2, 4, 3, 5, 2];
      for (let x = 15; x <= 32; x++) p.rect(x, 12, x, 13 + fr[x - 15], H);
      p.line(18, 13, 21, 13, hl, true);
    }
    p.disc(24, 22, 15.5, C.hood, (x, y) => {
      const dx = (x + 0.5 - 24) / 10.5;
      const dy = (y + 0.5 - 24) / 12;
      return y <= 34 && dx * dx + dy * dy > 1;
    });
    p.line(13, 10, 9, 33, adjust(C.hood, -0.2));
    p.line(34, 10, 38, 33, adjust(C.hood, -0.2));
    p.line(17, 8, 30, 8, adjust(C.hood, 0.25), true);
  } else {
    p.disc(24, 17, 12.2, H, (x, y) => y <= 15);
    const fr = [5, 3, 6, 2, 7, 4, 5, 3, 6, 2, 5, 7, 3, 5, 2, 6, 4, 6, 3, 5, 4, 6];
    if (hairStyle === 'slick') p.rect(13, 13, 34, 14, H);
    else
      for (let x = 13; x <= 34; x++) {
        const inner = x > 15 && x < 32;
        p.rect(x, 15, x, 15 + Math.min(fr[x - 13], inner ? 4 : 8), H);
      }
    const side = hairStyle === 'long' ? 44 : hairStyle === 'bob' ? 30 : hairStyle === 'slick' ? 21 : 25;
    for (let y = 14; y <= side; y++) {
      const w = y > 30 ? 3 + Math.floor((y - 30) / 5) : 3;
      p.rect(11, y, 11 + w - 1, y, H);
      p.rect(37 - w, y, 36, y, H);
    }
    if (hairStyle === 'spiky') {
      for (const [x0, h, lean] of [[14, 4, -1.2], [20, 5, -0.8], [27, 5, 0.6], [33, 4, 1.2]]) {
        for (let i = 0; i < h; i++) {
          const w = Math.max(0.5, 3.2 - i * 0.7);
          const cx = x0 + lean * i;
          p.rect(Math.round(cx - w), 7 - i, Math.round(cx + w), 7 - i, H);
        }
      }
    }
    if (spec.ahoge) {
      p.line(26, 5, 29, 0, H);
      p.line(27, 5, 30, 1, H);
      p.set(31, 1, H);
    }
    // strands and highlight band
    for (const x of [18, 23, 28]) p.line(x, 9, x - 1, 18, adjust(H, -0.2));
    p.line(16, 10, 21, 8, hl, true);
    p.line(17, 11, 22, 9, hl, true);
    p.set(26, 8, hl, true);
    p.set(27, 8, hl, true);
    if (hairStyle === 'long') {
      p.line(12, 26, 12, 44, adjust(H, 0.18));
      p.line(35, 26, 35, 44, adjust(H, -0.2));
    }
  }
  if (!spec.visor) drawPortraitFeatures(p, spec, F, C, S, H);
  if (spec.circlet) {
    p.line(13, 14, 34, 14, spec.circlet, true);
    p.disc(24, 14.5, 1.6, C.gem, null, true);
    p.set(23, 14, '#ffffff', true);
  }
  if (spec.monocle) {
    p.disc(29.5, 23.5, 3.6, C.gold, (x, y) => {
      const d = Math.hypot(x + 0.5 - 29.5, y + 0.5 - 23.5);
      return d > 2.6;
    }, true);
    p.line(33, 25, 34, 34, C.gold, true);
  }

  // soft shadow under hair, helmet brims and the chin
  const src = p.px.slice();
  for (let y = 1; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const i = y * 48 + x;
      if (src[i] !== S || p.locked.has(i)) continue;
      const up = src[i - 48];
      if (up && up !== S && !p.locked.has(i - 48)) p.px[i] = adjust(S, -0.16);
      else if (x >= 31) p.px[i] = adjust(S, -0.08);
    }
  p.shade(0.12, 0.16);
  p.outline(-0.72);
  return p;
}

const portraitCache = new Map();
export function portraitURL(spec) {
  if (!portraitCache.has(spec)) portraitCache.set(spec, drawPortrait(spec).toCanvas().toDataURL());
  return portraitCache.get(spec);
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
