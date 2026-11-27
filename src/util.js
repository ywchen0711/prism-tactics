export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const key = (x, z) => x + ',' + z;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const Ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
};

// Global time control. `instant` lets the headless simulator skip every animation.
export const timeScale = { v: 1, instant: false };
const tweens = [];

export function tween(duration, fn, ease = Ease.inOut) {
  return new Promise((resolve) => {
    if (duration <= 0 || timeScale.instant) {
      fn(1);
      resolve();
      return;
    }
    tweens.push({ t: 0, duration, fn, ease, resolve });
  });
}

export const wait = (s) => tween(s, () => {}, Ease.linear);

export function updateTweens(dt) {
  for (const tw of tweens.slice()) {
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.duration);
    tw.fn(tw.ease(k));
    if (k >= 1) {
      tweens.splice(tweens.indexOf(tw), 1);
      tw.resolve();
    }
  }
}
