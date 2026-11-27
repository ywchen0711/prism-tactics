// Battlefield: the Salt Bridge Fortress. Heights are in half-unit levels.
export const LV = 0.5;
export const topY = (h) => 0.25 + h * LV;
export const DIRS = [
  [1, 0], // 0: east  (+x)
  [0, 1], // 1: south (+z)
  [-1, 0], // 2: west  (-x)
  [0, -1], // 3: north (-z)
];

// G grass · D dirt · S stone · A wet sand · W deep water · F shallow ford · B wooden bridge
const HEIGHTS = [
  '55555544333322',
  '55555544333222',
  '44444443322222',
  '33333333222211',
  '11122222111111',
  '00000011000000',
  '00000011000000',
  '11111111111111',
  '11122111111222',
  '11233211112233',
  '11222111111222',
  '11111111111111',
];
const TYPES = [
  'SSSSSSSSGGGGGG',
  'SSSSSSSSGGGGGG',
  'SSSSSSSDGGGGGG',
  'GGGDDDDDGGGGGG',
  'AAADDDDDAAAAAA',
  'FFFWWWBBWWFFWW',
  'FFFWWWBBWWFFWW',
  'AAAAAADDAAAAAA',
  'GGGGGGDDGGGGGG',
  'GGGGGGDDGGGGGG',
  'GGGGGGDDGGGGGG',
  'GGGGGGDDGGGGGG',
];

const DECOS = [
  [0, 3, 'tree', 'oak'],
  [0, 10, 'tree', 'oak'],
  [1, 11, 'tree', 'pine'],
  [9, 11, 'tree', 'oak'],
  [12, 10, 'tree', 'pine'],
  [13, 11, 'tree', 'oak'],
  [13, 3, 'tree', 'pine'],
  [12, 0, 'tree', 'oak'],
  [10, 1, 'tree', 'oak'],
  [13, 8, 'tree', 'oak'],
  [9, 8, 'rock'],
  [3, 8, 'rock'],
  [11, 7, 'rock'],
];

// Out-of-grid geometry for the fortress walls (visual only).
export const EXTRAS = (() => {
  const list = [];
  for (let x = 0; x <= 7; x++) list.push({ x, z: -1, h: x % 2 === 0 ? 8 : 7, type: 'S' });
  list.push({ x: -1, z: -1, h: 9, type: 'S' }, { x: 8, z: -1, h: 9, type: 'S' });
  for (let z = 0; z <= 2; z++) list.push({ x: -1, z, h: z % 2 === 0 ? 7 : 6, type: 'S' });
  return list;
})();

export class GameMap {
  constructor() {
    this.W = 14;
    this.H = 12;
    this.reset();
  }
  reset() {
    this.tiles = [];
    for (let z = 0; z < this.H; z++)
      for (let x = 0; x < this.W; x++)
        this.tiles.push({ x, z, h: +HEIGHTS[z][x], type: TYPES[z][x], deco: null, fire: 0, frozen: 0 });
    let seed = 1;
    for (const [x, z, kind, variant] of DECOS) this.tile(x, z).deco = { kind, variant, block: true, seed: seed++ };
  }
  tile(x, z) {
    return x >= 0 && z >= 0 && x < this.W && z < this.H ? this.tiles[z * this.W + x] : null;
  }
  walkable(t) {
    return !!t && !(t.deco && t.deco.block) && (t.type !== 'W' || t.frozen > 0);
  }
  standY(t) {
    if (t.frozen > 0) return 0.26;
    if (t.type === 'W') return 0.02;
    if (t.type === 'F') return 0.1;
    return topY(t.h);
  }
  conductive(t) {
    return !!t && !t.frozen && (t.type === 'W' || t.type === 'F' || t.type === 'A');
  }
}
