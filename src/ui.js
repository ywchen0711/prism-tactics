// DOM HUD: menus, unit panels, combat preview, turn order and unit labels.
import * as THREE from 'three';
import { wait } from './util.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function hpBar(u) {
  const pct = Math.max(0, (u.hp / u.maxHp) * 100);
  const cls = pct < 30 ? 'low' : pct < 60 ? 'mid' : '';
  return `<div class="hpbar ${cls}"><i style="width:${pct}%"></i></div>`;
}

function tpPips(u) {
  let s = '<span class="tp">';
  for (let i = 0; i < 5; i++) s += `<b class="${i < u.tp ? 'on' : ''}"></b>`;
  return s + '</span>';
}

function unitCard(u, compact) {
  const status = [];
  if (u.status.guard) status.push('<em class="st guard">守護</em>');
  if (u.status.sleep > 0) status.push('<em class="st sleep">熟睡</em>');
  if (u.leader) status.push('<em class="st lead">領袖</em>');
  if (u.boss) status.push('<em class="st boss">敵將</em>');
  return `
    <div class="card ${u.team}">
      <img class="portrait${u.portraitSmooth ? ' smooth' : ''}" src="${u.portrait}" alt="">
      <div class="info">
        <div class="nm">${esc(u.name)} <small>${esc(u.className)}</small> ${status.join('')}</div>
        <div class="row">HP <b>${u.hp}</b>/${u.maxHp} ${hpBar(u)}</div>
        <div class="row">TP ${tpPips(u)}</div>
        ${compact ? '' : `<div class="stats">攻 ${u.atk}　防 ${u.def}　魔 ${u.mag}　抗 ${u.res}　速 ${u.spd}　移 ${u.mov}</div>`}
      </div>
    </div>`;
}

export class UI {
  constructor(world) {
    this.world = world;
    this.labels = new Map();
    this.hotkeys = [];
    this.labelsEl = $('labels');
  }

  setActive(u) {
    this.active = u;
    $('unitPanel').innerHTML = u ? unitCard(u, false) : '';
    $('unitPanel').classList.toggle('show', !!u);
  }

  setActions({ cancel = false, confirm = false }) {
    $('cancelBtn').classList.toggle('show', cancel);
    $('confirmBtn').classList.toggle('show', confirm);
  }

  setHover(u) {
    const el = $('hoverPanel');
    if (!u || u === this.active) {
      el.classList.remove('show');
      return;
    }
    el.innerHTML = unitCard(u, false);
    el.classList.add('show');
  }

  setMenu(items) {
    const el = $('menu');
    el.innerHTML = '';
    this.hotkeys = [];
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'mbtn';
      b.disabled = !!it.disabled;
      b.innerHTML = `<kbd>${i + 1}</kbd><span>${esc(it.label)}</span>${it.cost ? `<em class="cost">TP ${it.cost}</em>` : ''}`;
      if (it.desc) b.title = it.desc;
      const run = () => {
        if (b.disabled) return;
        sfx('select');
        it.onClick();
      };
      b.addEventListener('click', run);
      b.addEventListener('mouseenter', () => this.hint(it.desc || ''));
      this.hotkeys.push(run);
      el.appendChild(b);
    });
    el.classList.add('show');
  }

  clearMenu() {
    $('menu').classList.remove('show');
    $('menu').innerHTML = '';
    this.hotkeys = [];
  }

  pressHotkey(n) {
    const f = this.hotkeys[n - 1];
    if (f) f();
  }

  hint(text) {
    $('hint').textContent = text;
    $('hint').classList.toggle('show', !!text);
  }

  setPreview(list, a) {
    const el = $('preview');
    if (!list || !list.length) {
      el.classList.remove('show');
      return;
    }
    el.innerHTML =
      `<div class="ptitle">${esc(a.name)}</div>` +
      list
        .map((e) => {
          const head = `<div class="pname ${e.unit.team}">${esc(e.unit.name)} <small>HP ${e.unit.hp}/${e.unit.maxHp}</small></div>`;
          if (e.heal !== undefined) return `<div class="pent">${head}<div class="pval heal">+${e.heal} HP</div></div>`;
          if (e.note) return `<div class="pent">${head}<div class="pval">${esc(e.note)}</div></div>`;
          const tags = e.tags.map((t) => `<em class="tag ${t.startsWith('背擊') ? 'back' : ''}">${esc(t)}</em>`).join('');
          return `<div class="pent">${head}
            <div class="pval"><b class="${e.crit ? 'crit' : ''}">${e.dmg}</b> 傷害　命中 <b>${e.hit}%</b> ${e.kill ? '<em class="tag kill">擊破</em>' : ''}</div>
            <div class="ptags">${tags}${e.follow ? `<em class="tag follow">追擊：${esc(e.follow)}</em>` : ''}</div></div>`;
        })
        .join('');
    el.classList.add('show');
  }

  setTurnOrder(list) {
    const el = $('turnOrder');
    el.innerHTML = '<div class="tlabel">行動順序</div>' + list.map((u, i) => `<div class="tslot ${u.team} ${i === 0 ? 'now' : ''}" title="${esc(u.name)}"><img src="${u.portrait}" alt=""></div>`).join('');
  }

  async banner(title, sub) {
    const el = $('banner');
    el.innerHTML = `<div class="btitle">${esc(title)}</div>${sub ? `<div class="bsub">${esc(sub)}</div>` : ''}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    await wait(2.4);
    el.classList.remove('show');
    await wait(0.3);
  }

  skillName(name, team) {
    const el = $('skillName');
    el.textContent = name;
    el.className = 'show ' + team;
    clearTimeout(this._skillT);
    this._skillT = setTimeout(() => (el.className = ''), 1300);
  }

  log(text) {
    const el = $('log');
    const d = document.createElement('div');
    d.textContent = text;
    el.appendChild(d);
    while (el.children.length > 4) el.firstChild.remove();
    setTimeout(() => d.classList.add('fade'), 4000);
  }

  // ---------------------------------------------------------------- labels over units
  addUnitLabel(u) {
    const el = document.createElement('div');
    el.className = 'ulabel ' + u.team;
    this.labelsEl.appendChild(el);
    this.labels.set(u, el);
    this.refreshLabel(u);
  }

  refreshLabel(u) {
    const el = this.labels.get(u);
    if (!el) return;
    const pct = Math.max(0, (u.hp / u.maxHp) * 100);
    el.innerHTML = `<div class="lbar"><i style="width:${pct}%"></i></div>${u.status.sleep > 0 ? '<span class="zz">Zz</span>' : ''}${u.status.guard ? '<span class="gd">盾</span>' : ''}`;
    if (u === this.active) this.setActive(u);
  }

  removeUnitLabel(u) {
    const el = this.labels.get(u);
    if (el) el.remove();
    this.labels.delete(u);
  }

  updateLabels() {
    const v = new THREE.Vector3();
    for (const [u, el] of this.labels) {
      v.copy(u.view.group.position);
      v.y += u.view.height() + 0.05;
      const s = this.world.project(v);
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      el.style.display = s.visible ? '' : 'none';
      if (u.status.sleep > 0 !== el.classList.contains('sleeping')) {
        el.classList.toggle('sleeping');
        this.refreshLabel(u);
      }
    }
  }

  clearAll() {
    this.setActive(null);
    this.setHover(null);
    this.clearMenu();
    this.setPreview(null);
    this.setActions({});
    this.hint('');
    $('turnOrder').innerHTML = '';
    $('log').innerHTML = '';
  }
}
