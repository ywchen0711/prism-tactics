// Which picture each character shows in the HUD and dialogue: a chosen painting from
// public/portraits when there is one, otherwise the procedural pixel portrait.
import { portraitURL } from './pixelart.js';
import { SPECS, PORTRAIT_RES, PAINTED } from './data.js';

export function portraitOf(specKey) {
  const p = PAINTED[specKey];
  if (p) return { src: `portraits/${specKey}${p === 'px' ? '-px.png' : '.webp'}`, smooth: p !== 'px' };
  return { src: portraitURL(SPECS[specKey], PORTRAIT_RES), smooth: false };
}
