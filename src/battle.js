// Rules, turn order, player input state machine and enemy AI.
// Rendering is reached only through `world`, `fx` and `ui`, so the headless simulator can stub them.
import { ACTIONS, CLASSES } from './data.js';
import { DIRS } from './map.js';
import { key, clamp, wait, tween, Ease } from './util.js';
import { sfx } from './audio.js';

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const manhattan = (ax, az, bx, bz) => Math.abs(ax - bx) + Math.abs(az - bz);

export function dirTo(fx, fz, tx, tz) {
  const dx = tx - fx;
  const dz = tz - fz;
  if (dx === 0 && dz === 0) return [0, 0];
  return Math.abs(dx) >= Math.abs(dz) ? [sign(dx), 0] : [0, sign(dz)];
}

export function dirIndex([dx, dz], fallback = 0) {
  const i = DIRS.findIndex((d) => d[0] === dx && d[1] === dz);
  return i < 0 ? fallback : i;
}

let UID = 0;

export class Unit {
  constructor(def) {
    const c = CLASSES[def.cls];
    this.id = UID++;
    this.def = def;
    this.name = def.name;
    this.cls = def.cls;
    this.className = c.name;
    this.team = def.team;
    this.maxHp = c.hp;
    this.hp = c.hp;
    for (const s of ['atk', 'def', 'mag', 'res', 'spd', 'mov', 'jump']) this[s] = c[s];
    this.basic = c.basic;
    this.skills = c.skills.slice();
    this.x = def.x;
    this.z = def.z;
    this.dir = def.dir ?? 0;
    this.tp = 1;
    this.ct = def.ct ?? 0;
    this.alive = true;
    this.leader = !!def.leader;
    this.boss = !!def.boss;
    this.ai = def.ai || 'aggressive';
    this.spec = def.spec;
    this.status = { guard: false, sleep: def.sleep || 0 };
    this.ranged = ACTIONS[this.basic].ranged || c.mag > c.atk;
  }
  get actions() {
    return [this.basic, ...this.skills].map((id) => ({ id, ...ACTIONS[id] }));
  }
}

export class Battle {
  constructor({ map, world, fx, ui, scenario, auto = false }) {
    this.map = map;
    this.world = world;
    this.fx = fx;
    this.ui = ui;
    this.auto = auto;
    this.scenario = scenario;
    this.units = scenario.units.map((d) => new Unit(d));
    for (const u of this.units) {
      u.view = world.addUnit(u);
      ui.addUnitLabel(u);
    }
    this.turn = 0;
    this.state = 'busy';
    this.ctx = null;
    this.result = null;
    this.stats = { kills: 0, damage: 0 };
  }

  // ------------------------------------------------------------ queries
  get allies() {
    return this.units.filter((u) => u.alive && u.team === 'ally');
  }
  get enemies() {
    return this.units.filter((u) => u.alive && u.team === 'enemy');
  }
  unitAt(x, z) {
    return this.units.find((u) => u.alive && u.x === x && u.z === z) || null;
  }
  // Occupant as if `self` stood at (fx, fz) — used by the AI to evaluate hypothetical positions.
  occupant(x, z, self, fx, fz) {
    if (x === fx && z === fz) return self;
    const o = this.unitAt(x, z);
    return o === self ? null : o;
  }
  tileH(x, z) {
    const t = this.map.tile(x, z);
    return t ? t.h : 0;
  }
  foesOf(u) {
    return this.units.filter((o) => o.alive && o.team !== u.team);
  }
  nearestFoe(u) {
    let best = null;
    let bd = Infinity;
    for (const o of this.foesOf(u)) {
      const d = manhattan(u.x, u.z, o.x, o.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  reachable(u) {
    const all = new Map();
    all.set(key(u.x, u.z), { x: u.x, z: u.z, d: 0, prev: null, pass: false });
    const q = [[u.x, u.z]];
    while (q.length) {
      const [x, z] = q.shift();
      const cur = all.get(key(x, z));
      if (cur.d >= u.mov) continue;
      const t = this.map.tile(x, z);
      for (const [dx, dz] of DIRS) {
        const nx = x + dx;
        const nz = z + dz;
        const k = key(nx, nz);
        if (all.has(k)) continue;
        const nt = this.map.tile(nx, nz);
        if (!this.map.walkable(nt)) continue;
        if (Math.abs(nt.h - t.h) > u.jump) continue;
        const o = this.unitAt(nx, nz);
        if (o && o.team !== u.team) continue;
        all.set(k, { x: nx, z: nz, d: cur.d + 1, prev: key(x, z), pass: !!o });
        q.push([nx, nz]);
      }
    }
    const dests = [...all.values()].filter((n) => !n.pass);
    return { all, dests, has: (x, z) => dests.find((n) => n.x === x && n.z === z) || null };
  }

  pathTo(reach, x, z) {
    const path = [];
    let n = reach.all.get(key(x, z));
    while (n) {
      path.unshift({ x: n.x, z: n.z });
      n = n.prev ? reach.all.get(n.prev) : null;
    }
    return path;
  }

  rangeTiles(a, fx, fz) {
    const out = [];
    const [mn, mx] = a.range;
    const hf = this.tileH(fx, fz);
    const R = mx + (a.heightRange ? 1 : 0);
    for (let x = fx - R; x <= fx + R; x++)
      for (let z = fz - R; z <= fz + R; z++) {
        const t = this.map.tile(x, z);
        if (!t) continue;
        const d = manhattan(x, z, fx, fz);
        if (d < mn) continue;
        let lim = mx;
        if (a.heightRange && hf - t.h >= 2) lim += 1;
        if (d > lim) continue;
        if (mx === 1 && d === 1 && Math.abs(hf - t.h) > 3) continue;
        out.push({ x, z });
      }
    return out;
  }

  targetValid(u, a, x, z, fx = u.x, fz = u.z) {
    const o = this.occupant(x, z, u, fx, fz);
    switch (a.target) {
      case 'self':
        return x === fx && z === fz;
      case 'enemy':
        return !!o && o.team !== u.team;
      case 'ally':
        return !!o && o.team === u.team && (a.type !== 'haste' || o !== u);
      default:
        return true;
    }
  }

  aoeTiles(a, x, z, fx, fz) {
    const [dx, dz] = dirTo(fx, fz, x, z);
    let list;
    switch (a.shape) {
      case 'plus':
        list = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([ox, oz]) => ({ x: x + ox, z: z + oz }));
        break;
      case 'line2':
        list = [{ x, z }, { x: x + dx, z: z + dz }];
        break;
      case 'sweep':
        list = [{ x, z }, { x: x + dz, z: z + dx }, { x: x - dz, z: z - dx }];
        break;
      default:
        list = [{ x, z }];
    }
    return list.filter((t) => this.map.tile(t.x, t.z));
  }

  // Lightning travels across every connected conductive tile.
  conductiveRegion(x, z) {
    const start = this.map.tile(x, z);
    if (!this.map.conductive(start)) return [];
    const seen = new Set([key(x, z)]);
    const out = [{ x, z }];
    const q = [[x, z]];
    while (q.length) {
      const [cx, cz] = q.shift();
      for (const [dx, dz] of DIRS) {
        const nx = cx + dx;
        const nz = cz + dz;
        const k = key(nx, nz);
        if (seen.has(k) || !this.map.conductive(this.map.tile(nx, nz))) continue;
        seen.add(k);
        out.push({ x: nx, z: nz });
        q.push([nx, nz]);
      }
    }
    return out;
  }

  affected(u, a, x, z, fx = u.x, fz = u.z) {
    const list = [];
    const friendly = a.target === 'ally' || a.target === 'self';
    for (const t of this.aoeTiles(a, x, z, fx, fz)) {
      const o = this.occupant(t.x, t.z, u, fx, fz);
      if (!o) continue;
      if (friendly ? o.team === u.team : o.team !== u.team) list.push({ u: o, chain: false });
    }
    if (a.element === 'thunder') {
      for (const t of this.conductiveRegion(x, z)) {
        const o = this.occupant(t.x, t.z, u, fx, fz);
        if (o && o.team !== u.team && !list.some((e) => e.u === o)) list.push({ u: o, chain: true });
      }
    }
    return list;
  }

  relDir(def, fx, fz) {
    const vx = fx - def.x;
    const vz = fz - def.z;
    const len = Math.hypot(vx, vz);
    if (!len) return 'front';
    const [dx, dz] = DIRS[def.dir];
    const dot = (vx * dx + vz * dz) / len;
    return dot > 0.5 ? 'front' : dot < -0.5 ? 'back' : 'side';
  }

  calc(att, def, a, fx = att.x, fz = att.z, chain = false) {
    const phys = a.type === 'phys';
    const A = phys ? att.atk : att.mag;
    const D = phys ? def.def : def.res;
    const dh = this.tileH(fx, fz) - this.tileH(def.x, def.z);
    const hMul = 1 + clamp(dh, -3, 3) * 0.08;
    const rel = this.relDir(def, fx, fz);
    const tags = [];
    let hit = 100;
    if (phys) hit = rel === 'back' ? 100 : rel === 'side' ? 95 : a.ranged ? 85 : 90;
    if (dh > 0) hit = Math.min(100, hit + dh * 2);
    const crit = phys && rel === 'back';
    let mul = hMul * (crit ? 1.5 : 1) * (phys && rel === 'side' ? 1.1 : 1);
    if (rel === 'back') tags.push(phys ? '背擊·必定暴擊' : '背擊');
    else if (rel === 'side') tags.push('側擊');
    if (dh !== 0) tags.push(`高低差 ${dh > 0 ? '+' : ''}${Math.round((hMul - 1) * 100)}%`);
    if (def.status.guard) {
      mul *= 0.5;
      tags.push('守護 -50%');
    }
    if (def.status.sleep > 0) {
      hit = 100;
      mul *= 1.2;
      tags.push('熟睡中');
    }
    if (chain) {
      mul *= 0.8;
      tags.push('導電');
    }
    const base = Math.max(1, A * a.power - D * 0.5);
    return { dmg: Math.max(1, Math.round(base * mul)), hit, crit, tags, rel };
  }

  healAmount(u) {
    return Math.round(u.mag * 1.4 + 8);
  }

  followUpPartner(att, def, fx, fz) {
    const [dx, dz] = dirTo(fx, fz, def.x, def.z);
    if (!dx && !dz) return null;
    const o = this.unitAt(def.x + dx, def.z + dz);
    if (o && o.team === att.team && o !== att && Math.abs(this.tileH(o.x, o.z) - this.tileH(def.x, def.z)) <= 2) return o;
    return null;
  }

  // Preview list for the targeting panel.
  preview(u, a, x, z) {
    const out = [];
    for (const { u: t, chain } of this.affected(u, a, x, z)) {
      if (a.type === 'heal') out.push({ unit: t, heal: Math.min(this.healAmount(u), t.maxHp - t.hp) });
      else if (a.type === 'haste') out.push({ unit: t, note: '行動提前' });
      else if (a.type === 'buff') out.push({ unit: t, note: '受到傷害減半' });
      else {
        const c = this.calc(u, t, a, u.x, u.z, chain);
        const entry = { unit: t, ...c, kill: c.dmg >= t.hp };
        if (a.type === 'phys' && a.shape === 'single') {
          const f = this.followUpPartner(u, t, u.x, u.z);
          if (f) entry.follow = f.name;
        }
        out.push(entry);
      }
    }
    return out;
  }

  // ------------------------------------------------------------ turn order
  pickNext(sim) {
    let best = null;
    let bt = Infinity;
    for (const s of sim) {
      const t = Math.max(0, 100 - s.ct) / s.u.spd;
      if (t < bt - 1e-9 || (Math.abs(t - bt) < 1e-9 && (s.ct > best.ct || (s.ct === best.ct && s.u.team === 'ally')))) {
        bt = t;
        best = s;
      }
    }
    for (const s of sim) s.ct += s.u.spd * bt;
    return best;
  }

  nextActor() {
    const sim = this.units.filter((u) => u.alive).map((u) => ({ u, ct: u.ct }));
    const best = this.pickNext(sim);
    for (const s of sim) s.u.ct = s.ct;
    return best.u;
  }

  previewOrder(current, n = 8) {
    const sim = this.units.filter((u) => u.alive).map((u) => ({ u, ct: u.ct }));
    for (const s of sim) if (s.u === current) s.ct -= 100;
    const out = [current];
    for (let i = 1; i < n; i++) {
      const b = this.pickNext(sim);
      out.push(b.u);
      b.ct -= 100;
    }
    return out;
  }

  // ------------------------------------------------------------ main loop
  async run() {
    const s = this.scenario;
    await this.ui.banner(s.night ? '新月夜襲' : '黎明突破', '勝利條件：擊敗黑鋼將軍 巴德　｜　敗北條件：賽倫陣亡');
    while (!this.result) {
      const u = this.nextActor();
      this.turn++;
      if (this.turn > 500) {
        this.result = 'draw';
        break;
      }
      this.tickTerrain();
      u.status.guard = false;
      u.tp = Math.min(5, u.tp + 1);
      this.ui.setTurnOrder(this.previewOrder(u));
      this.world.focusUnit(u);
      this.world.setActiveMarker(u);

      const tile = this.map.tile(u.x, u.z);
      if (tile.fire > 0) {
        await wait(0.3);
        this.fx.text(u, '灼傷', 'burn');
        this.damage(u, Math.ceil(u.maxHp * 0.12), false);
        await wait(0.5);
        await this.processDeaths();
        if (this.checkEnd()) break;
        if (!u.alive) continue;
      }

      if (u.status.sleep > 0) {
        const foeNear = this.foesOf(u).some((o) => manhattan(o.x, o.z, u.x, u.z) <= 2);
        if (foeNear) {
          u.status.sleep = 0;
          this.fx.text(u, '！', 'alert');
          await wait(0.5);
        } else {
          u.status.sleep--;
          this.fx.text(u, 'Zz…', 'sleep');
          await wait(0.45);
          u.ct -= 100;
          continue;
        }
      }

      let res;
      if (u.team === 'ally' && !this.auto) res = await this.playerTurn(u);
      else res = await this.aiTurn(u);
      u.ct -= 100 - (res.moved ? 0 : 10) - (res.acted ? 0 : 20);
      this.ui.setActive(null);
      this.checkEnd();
    }
    this.world.setActiveMarker(null);
    return this.result;
  }

  checkEnd() {
    if (this.result) return this.result;
    const leader = this.units.find((u) => u.leader);
    const boss = this.units.find((u) => u.boss);
    if ((leader && !leader.alive) || !this.allies.length) this.result = 'defeat';
    else if ((boss && !boss.alive) || !this.enemies.length) this.result = 'victory';
    return this.result;
  }

  tickTerrain() {
    for (const t of this.map.tiles) {
      if (t.fire > 0 && --t.fire === 0) this.fx.setFire(t, false);
      if (t.frozen > 0) {
        if (t.frozen === 1 && t.type === 'W' && this.unitAt(t.x, t.z)) continue; // never drop a unit into deep water
        if (--t.frozen === 0) {
          this.fx.setFrozen(t, false);
          this.refreshUnitsOn(t);
        }
      }
    }
  }

  refreshUnitsOn(t) {
    const o = this.unitAt(t.x, t.z);
    if (o) o.view.place();
  }

  // ------------------------------------------------------------ actions
  damage(t, dmg, crit) {
    t.hp = Math.max(0, t.hp - dmg);
    this.stats.damage += t.team === 'enemy' ? dmg : 0;
    t.view.hurt(crit);
    this.fx.text(t, String(dmg), crit ? 'crit' : 'dmg');
    sfx(crit ? 'crit' : 'hit');
    if (crit) this.world.shake(0.25);
    if (t.status.sleep > 0) t.status.sleep = 0;
    this.ui.refreshLabel(t);
  }

  async perform(u, a, x, z) {
    const fx = u.x;
    const fz = u.z;
    if (x !== fx || z !== fz) u.dir = dirIndex(dirTo(fx, fz, x, z), u.dir);
    u.tp -= a.tp;
    const targets = this.affected(u, a, x, z);
    const aoe = this.aoeTiles(a, x, z, fx, fz);
    this.ui.skillName(a.name, u.team);
    const tpos = this.world.tileCenter(x, z);

    if (a.type === 'phys' && !a.ranged) {
      await u.view.lungeOut(tpos);
    } else if (a.ranged) {
      u.view.pose = 'atk';
      sfx('bow');
      await this.fx.projectile(u.view.handPos(), tpos, a.element === 'fire' ? 'fire' : 'arrow');
    } else {
      u.view.pose = 'atk';
      this.fx.cast(u, a.type === 'heal' || a.type === 'haste' || a.type === 'buff' ? 'holy' : a.element);
      await wait(0.45);
    }

    if (a.element === 'fire') {
      sfx('fire');
      for (const t of aoe) this.fx.burst(this.world.tileCenter(t.x, t.z), 'fire');
    } else if (a.element === 'ice') {
      sfx('ice');
      this.fx.burst(tpos, 'ice');
    } else if (a.element === 'thunder') {
      sfx('thunder');
      this.fx.bolt(tpos);
      for (const t of this.conductiveRegion(x, z)) if (t.x !== x || t.z !== z) this.fx.spark(this.world.tileCenter(t.x, t.z));
      this.world.shake(0.35);
    }

    let firstHit = null;
    for (const { u: t, chain } of targets) {
      if (a.type === 'heal') {
        const amt = Math.min(this.healAmount(u), t.maxHp - t.hp);
        t.hp += amt;
        this.fx.text(t, '+' + amt, 'heal');
        this.fx.burst(t.view.center(), 'heal');
        sfx('heal');
        this.ui.refreshLabel(t);
        continue;
      }
      if (a.type === 'haste') {
        t.ct += 50;
        this.fx.text(t, '迅捷', 'buff');
        this.fx.burst(t.view.center(), 'holy');
        sfx('buff');
        continue;
      }
      if (a.type === 'buff') {
        t.status.guard = true;
        this.fx.text(t, '守護', 'buff');
        this.fx.burst(t.view.center(), 'holy');
        sfx('buff');
        this.ui.refreshLabel(t);
        continue;
      }
      const c = this.calc(u, t, a, fx, fz, chain);
      if (Math.random() * 100 >= c.hit) {
        this.fx.text(t, 'MISS', 'miss');
        sfx('miss');
        continue;
      }
      this.damage(t, c.dmg, c.crit);
      if (a.element === 'ice') t.ct -= 25;
      if (!firstHit) firstHit = t;
    }

    if (a.type === 'phys' && !a.ranged) u.view.lungeBack();
    else u.view.pose = 'idle';

    if (a.element === 'fire') for (const t of aoe) this.ignite(this.map.tile(t.x, t.z));
    if (a.element === 'ice') this.freezeAround(x, z);

    // Follow-up attack: an ally standing directly behind the target strikes too.
    if (a.type === 'phys' && a.shape === 'single' && targets.length === 1 && firstHit && firstHit.hp > 0) {
      const t = firstHit;
      const f = this.followUpPartner(u, t, fx, fz);
      if (f) {
        await wait(0.3);
        this.ui.skillName(`追擊！${f.name}`, f.team);
        f.dir = dirIndex(dirTo(f.x, f.z, t.x, t.z), f.dir);
        const fa = { ...ACTIONS[f.basic], power: ACTIONS[f.basic].power * 0.6 };
        await f.view.lungeOut(this.world.tileCenter(t.x, t.z));
        const c = this.calc(f, t, fa, f.x, f.z);
        this.damage(t, c.dmg, c.crit);
        f.view.lungeBack();
      }
    }
    await wait(0.45);
    await this.processDeaths();
  }

  ignite(t) {
    if (!t) return;
    if (t.frozen > 0) {
      t.frozen = 0;
      this.fx.setFrozen(t, false);
      this.refreshUnitsOn(t);
      return;
    }
    if (t.type === 'G' && !(t.deco && t.deco.kind === 'rock')) {
      t.fire = 6;
      this.fx.setFire(t, true);
    }
  }

  freezeAround(x, z) {
    for (const [dx, dz] of [[0, 0], ...DIRS]) {
      const t = this.map.tile(x + dx, z + dz);
      if (!t) continue;
      if (t.fire > 0) {
        t.fire = 0;
        this.fx.setFire(t, false);
      }
      if (t.type === 'W' || t.type === 'F') {
        t.frozen = 8;
        this.fx.setFrozen(t, true);
        this.refreshUnitsOn(t);
      }
    }
  }

  async processDeaths() {
    const dying = this.units.filter((u) => u.alive && u.hp <= 0);
    for (const u of dying) {
      u.alive = false;
      if (u.team === 'enemy') this.stats.kills++;
      sfx('death');
      this.ui.removeUnitLabel(u);
      this.ui.log(`${u.name} 倒下了。`);
    }
    await Promise.all(dying.map((u) => u.view.die()));
  }

  async moveUnit(u, path) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      u.dir = dirIndex([b.x - a.x, b.z - a.z], u.dir);
      const pa = this.world.unitPos(a.x, a.z);
      const pb = this.world.unitPos(b.x, b.z);
      const hop = Math.abs(this.tileH(a.x, a.z) - this.tileH(b.x, b.z)) > 0;
      sfx('step');
      await tween(hop ? 0.26 : 0.16, (k) => u.view.setPosLerp(pa, pb, k, hop ? 0.55 : 0.06), Ease.linear);
      u.x = b.x;
      u.z = b.z;
    }
    u.view.place();
    this.world.focusUnit(u);
  }

  // ------------------------------------------------------------ player control
  playerTurn(u) {
    return new Promise((resolve) => {
      this.ctx = { u, moved: false, acted: false, origin: { x: u.x, z: u.z, dir: u.dir }, resolve, reach: null, action: null };
      sfx('turn');
      this.ui.setActive(u);
      this.openMenu();
    });
  }

  openMenu() {
    const c = this.ctx;
    const u = c.u;
    this.state = 'menu';
    this.world.clearHighlights();
    this.ui.setPreview(null);
    this.ui.setActive(u);
    if (c.moved && c.acted) return this.beginFacing();
    const items = [{ label: '移動', disabled: c.moved, desc: `移動力 ${u.mov}　跳躍 ${u.jump}`, onClick: () => this.beginMove() }];
    for (const a of u.actions) {
      items.push({ label: a.name, cost: a.tp, desc: a.desc, disabled: c.acted || a.tp > u.tp, onClick: () => this.beginTarget(a) });
    }
    if (c.moved && !c.acted) items.push({ label: '取消移動', onClick: () => this.undoMove() });
    items.push({ label: c.moved || c.acted ? '結束行動' : '待機', desc: '選擇面向後結束回合。未移動／未行動可更快輪到下一回合。', onClick: () => this.beginFacing() });
    this.ui.setMenu(items);
    this.ui.hint('Q / E 旋轉視角　滾輪縮放　WASD 平移　右鍵取消');
  }

  beginMove() {
    const c = this.ctx;
    this.state = 'move';
    c.reach = this.reachable(c.u);
    this.ui.clearMenu();
    this.world.setHighlight('range', c.reach.dests, 0x4aa8ff, 0.55);
    this.ui.hint('選擇移動目的地　右鍵取消');
  }

  beginTarget(a) {
    const c = this.ctx;
    this.state = 'target';
    c.action = a;
    this.ui.clearMenu();
    const tiles = this.rangeTiles(a, c.u.x, c.u.z);
    const friendly = a.target === 'ally' || a.target === 'self';
    this.world.setHighlight('range', tiles, friendly ? 0x5fe08a : 0xff6a5a, 0.42);
    this.ui.hint(`${a.name}：選擇目標　右鍵取消`);
  }

  beginFacing() {
    const c = this.ctx;
    this.state = 'facing';
    this.ui.clearMenu();
    this.world.clearHighlights();
    const adj = DIRS.map(([dx, dz]) => ({ x: c.u.x + dx, z: c.u.z + dz })).filter((t) => this.map.tile(t.x, t.z));
    this.world.setHighlight('range', adj, 0xffd45a, 0.5);
    this.ui.hint('移動游標選擇面向，點擊確定（Enter 確定）　右鍵返回');
  }

  async undoMove() {
    const c = this.ctx;
    c.u.x = c.origin.x;
    c.u.z = c.origin.z;
    c.u.dir = c.origin.dir;
    c.u.view.place();
    c.moved = false;
    sfx('cancel');
    this.world.focusUnit(c.u);
    this.openMenu();
  }

  endPlayerTurn() {
    const c = this.ctx;
    this.state = 'busy';
    this.ctx = null;
    this.world.clearHighlights();
    this.ui.clearMenu();
    this.ui.setPreview(null);
    this.ui.hint('');
    c.resolve({ moved: c.moved, acted: c.acted });
  }

  onHover(pick) {
    this.world.setCursor(pick && pick.tile);
    const hu = pick && pick.tile ? this.unitAt(pick.tile.x, pick.tile.z) : null;
    this.ui.setHover(hu);
    const c = this.ctx;
    if (!c) return;
    if (this.state === 'target') {
      const a = c.action;
      const t = pick && pick.tile;
      const inRange = t && this.rangeTiles(a, c.u.x, c.u.z).some((r) => r.x === t.x && r.z === t.z);
      if (inRange && this.targetValid(c.u, a, t.x, t.z)) {
        this.world.setHighlight('aoe', this.aoeTiles(a, t.x, t.z, c.u.x, c.u.z), 0xffd45a, 0.6);
        const tiles = a.element === 'thunder' ? this.conductiveRegion(t.x, t.z) : [];
        this.world.setHighlight('chain', tiles, 0xb48cff, 0.35);
        this.ui.setPreview(this.preview(c.u, a, t.x, t.z), a);
      } else {
        this.world.setHighlight('aoe', [], 0, 0);
        this.world.setHighlight('chain', [], 0, 0);
        this.ui.setPreview(null);
      }
    } else if (this.state === 'move') {
      const t = pick && pick.tile;
      const n = t && c.reach.has(t.x, t.z);
      this.world.setHighlight('aoe', n ? this.pathTo(c.reach, t.x, t.z) : [], 0xbfe4ff, 0.45);
    } else if (this.state === 'facing' && pick && pick.tile) {
      const d = dirTo(c.u.x, c.u.z, pick.tile.x, pick.tile.z);
      if (d[0] || d[1]) c.u.dir = dirIndex(d, c.u.dir);
    }
  }

  async onClick(pick) {
    const c = this.ctx;
    if (!c || !pick || !pick.tile) return;
    const { x, z } = pick.tile;
    if (this.state === 'move') {
      if (!c.reach.has(x, z)) return;
      sfx('select');
      this.state = 'busy';
      this.world.clearHighlights();
      await this.moveUnit(c.u, this.pathTo(c.reach, x, z));
      c.moved = true;
      this.openMenu();
    } else if (this.state === 'target') {
      const a = c.action;
      const inRange = this.rangeTiles(a, c.u.x, c.u.z).some((r) => r.x === x && r.z === z);
      if (!inRange || !this.targetValid(c.u, a, x, z)) return;
      sfx('select');
      this.state = 'busy';
      this.world.clearHighlights();
      this.ui.setPreview(null);
      this.ui.hint('');
      await this.perform(c.u, a, x, z);
      c.acted = true;
      if (this.checkEnd() || !c.u.alive) return this.endPlayerTurn();
      this.openMenu();
    } else if (this.state === 'facing') {
      const d = dirTo(c.u.x, c.u.z, x, z);
      if (d[0] || d[1]) c.u.dir = dirIndex(d, c.u.dir);
      sfx('select');
      this.endPlayerTurn();
    }
  }

  confirm() {
    if (this.ctx && this.state === 'facing') {
      sfx('select');
      this.endPlayerTurn();
    }
  }

  cancel() {
    const c = this.ctx;
    if (!c) return;
    if (this.state === 'move' || this.state === 'target' || (this.state === 'facing' && !(c.moved && c.acted))) {
      sfx('cancel');
      this.openMenu();
    }
  }

  // ------------------------------------------------------------ AI
  distField(u) {
    const dist = new Map();
    const q = [];
    for (const o of this.foesOf(u)) {
      dist.set(key(o.x, o.z), 0);
      q.push([o.x, o.z]);
    }
    while (q.length) {
      const [x, z] = q.shift();
      const d = dist.get(key(x, z));
      const t = this.map.tile(x, z);
      for (const [dx, dz] of DIRS) {
        const nx = x + dx;
        const nz = z + dz;
        const k = key(nx, nz);
        if (dist.has(k)) continue;
        const nt = this.map.tile(nx, nz);
        if (!this.map.walkable(nt) || Math.abs(nt.h - t.h) > u.jump) continue;
        dist.set(k, d + 1);
        q.push([nx, nz]);
      }
    }
    return dist;
  }

  positionScore(u, x, z) {
    let s = this.tileH(x, z) * 0.6;
    const t = this.map.tile(x, z);
    if (t.fire > 0) s -= 12;
    if (u.ranged) for (const o of this.foesOf(u)) if (manhattan(o.x, o.z, x, z) === 1) s -= 6;
    return s;
  }

  evalAction(u, a, x, z, fx, fz) {
    const list = this.affected(u, a, x, z, fx, fz);
    let s = 0;
    if (a.type === 'heal') {
      for (const { u: t } of list) {
        const missing = t.maxHp - t.hp;
        if (missing >= 10) s += Math.min(missing, this.healAmount(u)) * 1.2 + (t.boss ? 10 : 0);
      }
      return s;
    }
    if (a.type === 'haste') return 0;
    if (a.type === 'buff') {
      const near = this.foesOf(u).some((e) => manhattan(e.x, e.z, fx, fz) <= 4);
      return near && u.hp < u.maxHp * 0.6 ? 12 : 0;
    }
    for (const { u: t, chain } of list) {
      const c = this.calc(u, t, a, fx, fz, chain);
      const exp = (c.dmg * c.hit) / 100;
      s += Math.min(exp, t.hp);
      if (c.dmg >= t.hp) s += 25 * (c.hit / 100) + (t.leader ? 30 : 0);
      if (t.leader) s += 4;
    }
    return s;
  }

  async aiTurn(u) {
    await wait(0.35);
    const reach = this.reachable(u);
    const acts = u.actions.filter((a) => a.tp <= u.tp);
    let best = null;
    for (const n of reach.dests) {
      const pos = this.positionScore(u, n.x, n.z);
      for (const a of acts)
        for (const t of this.rangeTiles(a, n.x, n.z)) {
          if (!this.targetValid(u, a, t.x, t.z, n.x, n.z)) continue;
          const s = this.evalAction(u, a, t.x, t.z, n.x, n.z);
          if (s <= 0) continue;
          const total = s + pos - a.tp * 2.5 - n.d * 0.05;
          if (!best || total > best.score) best = { score: total, n, a, t };
        }
    }
    let moved = false;
    let acted = false;
    const nf = this.nearestFoe(u);
    const nearD = nf ? manhattan(nf.x, nf.z, u.x, u.z) : Infinity;
    const stay = !best && (u.ai === 'hold' || (u.ai === 'boss' && nearD > 6));
    if (best) {
      if (best.n.x !== u.x || best.n.z !== u.z) {
        await this.moveUnit(u, this.pathTo(reach, best.n.x, best.n.z));
        moved = true;
      }
      this.world.setHighlight('aoe', this.aoeTiles(best.a, best.t.x, best.t.z, u.x, u.z), 0xff5a4a, 0.6);
      await wait(0.45);
      this.world.clearHighlights();
      await this.perform(u, best.a, best.t.x, best.t.z);
      acted = true;
    } else if (!stay) {
      const dist = this.distField(u);
      let bn = null;
      let bd = Infinity;
      for (const n of reach.dests) {
        const d = (dist.get(key(n.x, n.z)) ?? 99) - this.positionScore(u, n.x, n.z) * 0.1;
        if (d < bd) {
          bd = d;
          bn = n;
        }
      }
      if (bn && (bn.x !== u.x || bn.z !== u.z)) {
        await this.moveUnit(u, this.pathTo(reach, bn.x, bn.z));
        moved = true;
      }
    }
    if (u.alive) {
      const f = this.nearestFoe(u);
      if (f) {
        const d = dirTo(u.x, u.z, f.x, f.z);
        if (d[0] || d[1]) u.dir = dirIndex(d, u.dir);
      }
    }
    await wait(0.25);
    return { moved, acted };
  }

  dispose() {
    for (const u of this.units) {
      u.view.dispose();
      this.ui.removeUnitLabel(u);
    }
    this.world.clearHighlights();
    this.world.setActiveMarker(null);
  }
}
