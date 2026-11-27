// Classes, actions, sprite palettes and the two scenarios decided by the Scales of Conviction.

export const ACTIONS = {
  slash: { name: '斬擊', type: 'phys', power: 1.0, range: [1, 1], shape: 'single', target: 'enemy', tp: 0, desc: '基本近戰攻擊。' },
  bowshot: { name: '射擊', type: 'phys', power: 0.95, range: [2, 4], heightRange: true, ranged: true, shape: 'single', target: 'enemy', tp: 0, desc: '遠程攻擊。居高臨下（高 2 階以上）射程 +1。' },
  staffhit: { name: '杖擊', type: 'phys', power: 0.8, range: [1, 1], shape: 'single', target: 'enemy', tp: 0, desc: '以法杖敲擊。' },
  lancehit: { name: '刺擊', type: 'phys', power: 1.0, range: [1, 1], shape: 'single', target: 'enemy', tp: 0, desc: '基本長槍攻擊。' },
  thrust: { name: '破陣突刺', type: 'phys', power: 1.55, range: [1, 1], shape: 'single', target: 'enemy', tp: 2, desc: '灌注全力的突刺，1.55 倍威力。' },
  guard: { name: '守護架勢', type: 'buff', range: [0, 0], shape: 'single', target: 'self', tp: 1, desc: '直到下次行動前，受到的傷害減半。' },
  firearrow: { name: '火焰箭', type: 'phys', power: 1.0, element: 'fire', range: [2, 4], heightRange: true, ranged: true, shape: 'single', target: 'enemy', tp: 2, desc: '點燃目標所在的草地，站在火焰上會被灼傷。' },
  arrowrain: { name: '箭雨', type: 'phys', power: 0.7, range: [2, 5], heightRange: true, ranged: true, shape: 'plus', target: 'area', tp: 3, desc: '十字範圍的箭雨。' },
  fireball: { name: '火球術', type: 'mag', power: 1.15, element: 'fire', range: [1, 4], shape: 'plus', target: 'area', tp: 2, desc: '十字範圍火焰魔法，會點燃草地、融化冰面。' },
  icelance: { name: '冰晶槍', type: 'mag', power: 1.3, element: 'ice', range: [1, 4], shape: 'single', target: 'area', tp: 2, desc: '延遲目標行動，並凍結周圍水面，形成可通行的冰道。' },
  thunder: { name: '落雷', type: 'mag', power: 1.35, element: 'thunder', range: [1, 5], shape: 'single', target: 'area', tp: 3, desc: '雷電會沿著水面、淺灘與濕沙傳導，波及所有相連的敵人。' },
  heal: { name: '治癒之光', type: 'heal', range: [0, 3], shape: 'single', target: 'ally', tp: 1, desc: '回復一名友軍的 HP。' },
  haste: { name: '迅風祝福', type: 'haste', range: [1, 3], shape: 'single', target: 'ally', tp: 2, desc: '使一名友軍更快輪到行動。' },
  pierce: { name: '貫穿', type: 'phys', power: 1.2, range: [1, 1], shape: 'line2', target: 'enemy', tp: 2, desc: '貫穿目標，同時攻擊其後方一格。' },
  cleave: { name: '橫掃', type: 'phys', power: 1.1, range: [1, 1], shape: 'sweep', target: 'enemy', tp: 2, desc: '橫向掃擊三格。' },
};

export const CLASSES = {
  lord: { name: '劍士', hp: 58, atk: 23, def: 15, mag: 6, res: 10, spd: 9, mov: 4, jump: 2, basic: 'slash', skills: ['thrust', 'guard'] },
  lancer: { name: '槍騎士', hp: 52, atk: 22, def: 16, mag: 5, res: 8, spd: 8, mov: 4, jump: 3, basic: 'lancehit', skills: ['pierce', 'guard'] },
  archer: { name: '弓箭手', hp: 40, atk: 21, def: 9, mag: 6, res: 9, spd: 10, mov: 4, jump: 2, basic: 'bowshot', skills: ['firearrow', 'arrowrain'] },
  mage: { name: '元素術士', hp: 36, atk: 8, def: 7, mag: 25, res: 16, spd: 8, mov: 3, jump: 2, basic: 'staffhit', skills: ['fireball', 'icelance', 'thunder'] },
  healer: { name: '治療師', hp: 38, atk: 9, def: 9, mag: 19, res: 17, spd: 9, mov: 4, jump: 2, basic: 'staffhit', skills: ['heal', 'haste'] },
  soldier: { name: '帝國兵', hp: 38, atk: 18, def: 11, mag: 4, res: 6, spd: 8, mov: 4, jump: 2, basic: 'slash', skills: [] },
  eLancer: { name: '帝國槍兵', hp: 44, atk: 20, def: 13, mag: 4, res: 6, spd: 7, mov: 4, jump: 2, basic: 'lancehit', skills: ['pierce'] },
  eArcher: { name: '帝國弓手', hp: 32, atk: 18, def: 7, mag: 5, res: 7, spd: 9, mov: 4, jump: 2, basic: 'bowshot', skills: ['firearrow'] },
  eMage: { name: '帝國術士', hp: 30, atk: 6, def: 6, mag: 20, res: 13, spd: 7, mov: 3, jump: 2, basic: 'staffhit', skills: ['fireball', 'thunder'] },
  general: { name: '黑鋼將軍', hp: 90, atk: 25, def: 17, mag: 8, res: 12, spd: 8, mov: 3, jump: 2, basic: 'slash', skills: ['cleave', 'guard'] },
};

export const SPECS = {
  seren: { face: { eyes: 'round', brows: 'normal', mouth: 'smile', nose: 'normal', jaw: 'normal' }, weapon: 'sword', cape: true, pauldrons: true, hairStyle: 'spiky', ahoge: true, colors: { hair: '#6a4030', iris: '#3a78c8', skin: '#f1c9a5', armor: '#3c5a8e', armor2: '#c9a24a', cape: '#24386a', pants: '#2b2734', boots: '#4a3020', gem: '#7ad8ff' } },
  roland: { face: { eyes: 'sharp', brows: 'angry', mouth: 'flat', nose: 'long', jaw: 'square', marks: ['stubble', 'mustache'] }, weapon: 'spear', helmet: true, plume: true, pauldrons: true, colors: { hair: '#7a5236', iris: '#4a8a4a', skin: '#d9a77e', armor: '#8a3030', armor2: '#d0b060', metal: '#b9c0ca', plume: '#e8e0d0', pants: '#3a2a2a', boots: '#3a2618', gem: '#ffd060' } },
  fid: { face: { eyes: 'sleepy', brows: 'thin', mouth: 'smirk', nose: 'normal', jaw: 'sharp', marks: ['freckles'] }, weapon: 'bow', hood: true, scarf: '#b85a2a', emblem: false, colors: { hair: '#a8582e', iris: '#c88a2a', skin: '#e6b48a', armor: '#4f7a3a', armor2: '#8a6a3f', hood: '#3a5e2e', pants: '#4a3b2a', boots: '#5a3b22', wood: '#7a5230' } },
  corti: { face: { eyes: 'almond', brows: 'arched', mouth: 'small', nose: 'dot', jaw: 'sharp', marks: ['mole'], lip: '#b8586a' }, weapon: 'staff', robe: true, hairStyle: 'long', fem: true, circlet: '#d4b35a', colors: { hair: '#e2dcf0', iris: '#c8402a', skin: '#f6e0d2', armor: '#5e3a88', armor2: '#d4b35a', boots: '#2e2236', wood: '#5a3a22', gem: '#ff7a3a' } },
  ely: { face: { eyes: 'droopy', brows: 'worried', mouth: 'gentle', nose: 'dot', jaw: 'round' }, weapon: 'staff', robe: true, hairStyle: 'long', fem: true, circlet: '#9ac8e8', colors: { hair: '#ecc96a', iris: '#3a9ad8', skin: '#f6d6bc', armor: '#ece6d8', armor2: '#5a9ec8', boots: '#8a7a62', wood: '#c8b07a', gem: '#8ff0ff' } },
  benny: { face: { eyes: 'closed', brows: 'bushy', mouth: 'none', nose: 'big', jaw: 'long', marks: ['wrinkles'] }, weapon: 'none', beard: true, hairStyle: 'slick', monocle: true, emblem: false, colors: { hair: '#c9c9cf', iris: '#5a6a7a', skin: '#e8c4a4', armor: '#2a2a33', armor2: '#e6e1d8', pants: '#22222a', boots: '#1a1a20' } },
  soldier: { weapon: 'sword', helmet: true, visor: true, emblem: false, colors: { skin: '#d9b08c', armor: '#4a4a55', armor2: '#8e2020', metal: '#9aa0aa', pants: '#2a2a30', boots: '#222228', gem: '#ff4a3a' } },
  eLancer: { weapon: 'spear', helmet: true, visor: true, pauldrons: true, emblem: false, colors: { skin: '#d9b08c', armor: '#3e3e48', armor2: '#8e2020', metal: '#8f96a2', pants: '#2a2a30', boots: '#222228', gem: '#ff4a3a' } },
  eArcher: { face: { eyes: 'sharp', brows: 'thick', mouth: 'frown', nose: 'normal', jaw: 'square', marks: ['stubble'] }, weapon: 'bow', helmet: true, emblem: false, colors: { hair: '#4a3020', iris: '#7a5a3a', skin: '#c99a74', armor: '#5a4a3a', armor2: '#8e2020', metal: '#8f96a2', pants: '#2a2a30', boots: '#222228', gem: '#ff4a3a' } },
  eMage: { face: { eyes: 'slit', brows: 'none', mouth: 'flat', nose: 'long', jaw: 'sharp', marks: ['tattoo'], lip: '#4a1030' }, weapon: 'staff', robe: true, hood: true, colors: { skin: '#b8a0a0', iris: '#ff3a5a', armor: '#3a1e2e', armor2: '#b0302a', hood: '#2a1420', boots: '#1a1418', wood: '#3a2a22', gem: '#ff3a5a' } },
  general: { face: { eyes: 'fierce', brows: 'thick', mouth: 'grit', nose: 'big', jaw: 'square', marks: ['scar', 'stubble'] }, weapon: 'axe', helmet: true, horns: true, pauldrons: true, cape: true, colors: { hair: '#2a2020', iris: '#d8402a', skin: '#c08a68', armor: '#26262e', armor2: '#a01818', metal: '#6e7380', cape: '#6a0e12', pants: '#1a1a20', boots: '#141418', wood: '#4a3020', gem: '#ff3a2a' } },
};

// choice 'A' = dawn frontal assault, 'B' = new-moon night raid.
export function makeScenario(choice) {
  const night = choice === 'B';
  const rnd = () => Math.random() * 25;
  const allies = (
    night
      ? [
          ['賽倫', 'lord', 'seren', 2, 7, true],
          ['羅蘭', 'lancer', 'roland', 1, 7],
          ['菲德', 'archer', 'fid', 0, 8],
          ['寇蒂', 'mage', 'corti', 1, 8],
          ['伊莉', 'healer', 'ely', 0, 7],
        ]
      : [
          ['賽倫', 'lord', 'seren', 6, 9, true],
          ['羅蘭', 'lancer', 'roland', 8, 9],
          ['菲德', 'archer', 'fid', 4, 10],
          ['寇蒂', 'mage', 'corti', 7, 10],
          ['伊莉', 'healer', 'ely', 6, 11],
        ]
  ).map(([name, cls, spec, x, z, leader]) => ({ name, cls, spec, x, z, leader: !!leader, team: 'ally', dir: 3, ct: night ? 60 + rnd() : rnd() }));

  const enemies = [
    ['帝國兵 甲', 'soldier', 6, 4],
    ['帝國兵 乙', 'soldier', 7, 4],
    ['帝國兵 丙', 'soldier', 11, 4],
    ['帝國槍兵', 'eLancer', 4, 3],
    ['帝國弓手 甲', 'eArcher', 2, 2, 'hold'],
    ['帝國弓手 乙', 'eArcher', 12, 1, 'hold'],
    ['帝國術士', 'eMage', 5, 1, 'hold'],
    ['黑鋼將軍 巴德', 'general', 2, 0, 'boss'],
  ].map(([name, cls, x, z, ai]) => ({
    name,
    cls,
    spec: cls === 'general' ? 'general' : cls,
    x,
    z,
    ai: ai || 'aggressive',
    boss: cls === 'general',
    team: 'enemy',
    dir: 1,
    ct: rnd(),
    sleep: night && cls !== 'general' ? 3 : 0,
  }));

  return { night, choice, units: [...allies, ...enemies] };
}
