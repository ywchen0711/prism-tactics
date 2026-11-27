import './style.css';
import { World } from './world.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { GameMap } from './map.js';
import { Battle } from './battle.js';
import { makeScenario } from './data.js';
import { updateTweens, timeScale } from './util.js';
import { sfx, audio } from './audio.js';
import * as Story from './story.js';

const $ = (id) => document.getElementById(id);

const world = new World($('view'));
const map = new GameMap();
world.build(map);
world.setMood(false);
const fx = new FX(world, $('labels'));
const ui = new UI(world);

let battle = null;
let mode = 'title';
let lastChoice = 'A';
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ frame loop
let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (mode === 'title') world.goal.yaw += dt * 0.06;
  updateTweens(dt * timeScale.v);
  fx.update(dt);
  world.render(dt);
  ui.updateLabels();
  for (const k of held) {
    const s = dt * 9;
    if (k === 'w' || k === 'arrowup') world.pan(0, -s);
    if (k === 's' || k === 'arrowdown') world.pan(0, s);
    if (k === 'a' || k === 'arrowleft') world.pan(-s, 0);
    if (k === 'd' || k === 'arrowright') world.pan(s, 0);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ input
const canvas = $('view');
const held = new Set();
let drag = null;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, button: e.button, moved: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x;
    drag.moved += Math.abs(dx) + Math.abs(e.clientY - drag.y);
    if (drag.button === 2 || drag.button === 1 || (drag.button === 0 && drag.moved > 8 && e.pointerType !== 'mouse')) world.rotateFree(dx);
    drag.x = e.clientX;
    drag.y = e.clientY;
    return;
  }
  if (battle) battle.onHover(world.pick(e.clientX, e.clientY));
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.moved > 8) {
    world.goal.yaw = Math.round((world.goal.yaw - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
    return;
  }
  if (!battle) return;
  const pick = world.pick(e.clientX, e.clientY);
  if (d.button === 0) {
    battle.onHover(pick);
    battle.onClick(pick);
  } else if (d.button === 2) battle.cancel();
});
canvas.addEventListener('wheel', (e) => world.zoom(e.deltaY > 0 ? 1.1 : 0.9), { passive: true });

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) held.add(k);
  if (mode !== 'battle' || !battle) return;
  if (k === 'q') world.rotate(-1);
  else if (k === 'e') world.rotate(1);
  else if (k === 'escape' || k === 'backspace') battle.cancel();
  else if (k === 'enter') battle.confirm();
  else if (k === 'f') toggleSpeed();
  else if (/^[1-9]$/.test(k)) ui.pressHotkey(+k);
});
window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => held.clear());

function toggleSpeed() {
  timeScale.v = timeScale.v === 1 ? 2 : 1;
  $('speedBtn').textContent = timeScale.v === 1 ? '速度 ×1' : '速度 ×2';
}
$('speedBtn').addEventListener('click', toggleSpeed);
$('muteBtn').addEventListener('click', () => {
  audio.muted = !audio.muted;
  $('muteBtn').textContent = audio.muted ? '音效 關' : '音效 開';
});
$('rotL').addEventListener('click', () => world.rotate(-1));
$('rotR').addEventListener('click', () => world.rotate(1));

// ------------------------------------------------------------------ flow
function show(id, on) {
  $(id).classList.toggle('show', on);
}

async function startStory(skip) {
  sfx('select');
  show('title', false);
  mode = 'story';
  world.goal.dist = 20;
  Story.setSkip(skip);
  await Story.play(Story.INTRO);
  const choice = skip ? await quickChoice() : await Story.scales();
  lastChoice = choice;
  await Story.play(Story.AFTER_VOTE[choice]);
  Story.setSkip(false);
  startBattle(choice);
}

function quickChoice() {
  return new Promise((resolve) => {
    show('quick', true);
    $('quick').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        sfx('select');
        show('quick', false);
        resolve(b.dataset.c);
      }, { once: true }),
    );
  });
}

async function startBattle(choice) {
  mode = 'battle';
  const scenario = makeScenario(choice);
  world.setMood(scenario.night);
  world.goal.yaw = Math.PI / 4;
  world.goal.dist = 22;
  show('hud', true);
  battle = new Battle({ map, world, fx, ui, scenario, auto: params.get('auto') === '1' });
  const result = await battle.run();
  await new Promise((r) => setTimeout(r, 600));
  if (result === 'victory') {
    sfx('victory');
    await ui.banner('勝利', '鹽橋要塞已被奪回');
    await Story.play(Story.VICTORY);
  } else {
    sfx('defeat');
    await ui.banner('敗北', '賽倫倒下了……');
    await Story.play(Story.DEFEAT);
  }
  showResult(result, battle);
}

function showResult(result, b) {
  mode = 'result';
  const el = $('result');
  const survivors = b.allies.length;
  el.innerHTML = `
    <div class="panel res-wrap">
      <div class="res-title ${result}">${result === 'victory' ? '勝利' : '敗北'}</div>
      <div class="res-sub">${b.scenario.night ? '新月夜襲' : '黎明突破'}</div>
      <div class="res-stats">
        <div><span>經過行動數</span><b>${b.turn}</b></div>
        <div><span>擊破敵軍</span><b>${b.stats.kills}</b></div>
        <div><span>存活同伴</span><b>${survivors} / 5</b></div>
        <div><span>造成總傷害</span><b>${b.stats.damage}</b></div>
      </div>
      <div class="res-btns">
        <button id="again">再戰一次</button>
        <button id="other">改選另一條路</button>
        <button id="toTitle">回到標題</button>
      </div>
    </div>`;
  show('result', true);
  const reset = () => {
    show('result', false);
    battle.dispose();
    battle = null;
    fx.clearTiles();
    map.reset();
    ui.clearAll();
  };
  $('again').onclick = () => {
    reset();
    startBattle(lastChoice);
  };
  $('other').onclick = () => {
    reset();
    lastChoice = lastChoice === 'A' ? 'B' : 'A';
    startBattle(lastChoice);
  };
  $('toTitle').onclick = () => {
    reset();
    show('hud', false);
    world.setMood(false);
    mode = 'title';
    show('title', true);
  };
}

$('startBtn').addEventListener('click', () => startStory(false));
$('skipBtn').addEventListener('click', () => startStory(true));
show('title', true);

// Debug hook for automated screenshots: ?battle=A or ?battle=B jumps straight into combat.
const qp = params.get('battle');
if (qp === 'A' || qp === 'B') {
  show('title', false);
  lastChoice = qp;
  startBattle(qp);
}
window.__game = { world, ui, timeScale, get battle() { return battle; } };
