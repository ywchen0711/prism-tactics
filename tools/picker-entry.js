// Bundle entry for the character look picker: exposes the procedural art and specs.
import { drawPortrait, drawCharacter, faceOf } from '../src/pixelart.js';
import { SPECS } from '../src/data.js';
window.PT = { drawPortrait, drawCharacter, faceOf, SPECS };
