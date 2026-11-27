// Particles, floating combat text, projectiles, lightning and terrain-state visuals.
import * as THREE from 'three';
import { tween, Ease } from './util.js';
import { PX } from './world.js';

const MAX = 2400;

const PRESETS = {
  fire: { count: 40, color: [3.2, 1.4, 0.4], speed: [0.6, 2.2], up: 1.8, life: [0.4, 0.9], size: [0.08, 0.2], gravity: -1.5, spread: 0.35 },
  ice: { count: 40, color: [1.4, 2.6, 3.4], speed: [1, 2.8], up: 1, life: [0.4, 0.8], size: [0.05, 0.14], gravity: 3, spread: 0.2 },
  heal: { count: 30, color: [0.8, 3, 1.4], speed: [0.2, 0.6], up: 1.6, life: [0.7, 1.2], size: [0.06, 0.14], gravity: -0.6, spread: 0.45 },
  holy: { count: 26, color: [3, 2.6, 1.2], speed: [0.2, 0.8], up: 1.4, life: [0.6, 1.0], size: [0.06, 0.12], gravity: -0.5, spread: 0.4 },
  hit: { count: 16, color: [3, 2.4, 1.6], speed: [1.5, 3.5], up: 1, life: [0.15, 0.35], size: [0.04, 0.1], gravity: 6, spread: 0.1 },
  spark: { count: 18, color: [2.4, 2.4, 3.6], speed: [0.8, 2.4], up: 1.5, life: [0.15, 0.4], size: [0.05, 0.12], gravity: 2, spread: 0.3 },
  thunder: { count: 6, color: [3, 3, 4], speed: [0, 0.3], up: 0, life: [0.1, 0.25], size: [0.16, 0.3], gravity: 0, spread: 0.05 },
};

export class FX {
  constructor(world, labelsEl) {
    this.world = world;
    this.labels = labelsEl;
    this.floaters = [];
    this.tileFx = new Map();
    this.next = 0;
    this.ambientT = 0;

    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.baseSize = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.blink = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 } },
      vertexShader: /* glsl */ `
        attribute vec3 pcolor; attribute float psize; attribute float palpha;
        varying vec3 vColor; varying float vAlpha; uniform float uScale;
        void main() {
          vColor = pcolor; vAlpha = palpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          if (r > 0.5) discard;
          float a = (1.0 - smoothstep(0.0, 0.5, r)) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    world.scene.add(this.points);
  }

  emit(pos, opts) {
    const o = { count: 20, color: [2, 2, 2], speed: [0.5, 1.5], up: 0.5, life: [0.5, 1], size: [0.05, 0.1], gravity: 0, spread: 0.2, blink: 0, ...opts };
    const rr = (a) => a[0] + Math.random() * (a[1] - a[0]);
    for (let n = 0; n < o.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const sp = rr(o.speed);
      this.pos[i * 3] = pos.x + (Math.random() - 0.5) * o.spread * 2;
      this.pos[i * 3 + 1] = pos.y + (Math.random() - 0.5) * o.spread;
      this.pos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * o.spread * 2;
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      this.vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp * 0.5 + o.up;
      this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      const j = 0.85 + Math.random() * 0.3;
      this.col[i * 3] = o.color[0] * j;
      this.col[i * 3 + 1] = o.color[1] * j;
      this.col[i * 3 + 2] = o.color[2] * j;
      this.life[i] = this.maxLife[i] = rr(o.life);
      this.baseSize[i] = rr(o.size);
      this.grav[i] = o.gravity;
      this.blink[i] = o.blink;
    }
  }

  burst(pos, kind) {
    this.emit(pos, PRESETS[kind] || PRESETS.hit);
  }

  spark(pos) {
    this.emit(pos, PRESETS.spark);
  }

  cast(u, element) {
    const c = u.view.center();
    const kind = element === 'fire' ? 'fire' : element === 'ice' ? 'ice' : element === 'thunder' ? 'spark' : 'holy';
    this.emit(c, { ...PRESETS[kind], count: 30, speed: [0.2, 0.6], up: 0.8, spread: 0.5 });
  }

  bolt(target) {
    let x = target.x;
    let z = target.z;
    const top = target.y + 9;
    for (let y = top; y > target.y - 0.4; y -= 0.18) {
      x += (Math.random() - 0.5) * 0.25;
      z += (Math.random() - 0.5) * 0.25;
      this.emit(new THREE.Vector3(x, y, z), PRESETS.thunder);
    }
    this.burst(target, 'spark');
    const light = new THREE.PointLight(0xc8d8ff, 60, 14, 1.5);
    light.position.copy(target).add(new THREE.Vector3(0, 2, 0));
    this.world.scene.add(light);
    tween(0.35, (k) => (light.intensity = 60 * (1 - k)), Ease.out).then(() => this.world.scene.remove(light));
  }

  async projectile(from, to, kind) {
    const fire = kind === 'fire';
    const p = new THREE.Vector3();
    const dist = from.distanceTo(to);
    await tween(
      0.25 + dist * 0.04,
      (k) => {
        p.lerpVectors(from, to, k);
        p.y += Math.sin(Math.PI * k) * dist * 0.18;
        this.emit(p, {
          count: fire ? 4 : 2,
          color: fire ? [3, 1.4, 0.4] : [2.2, 2.1, 1.7],
          speed: [0, 0.15],
          up: 0,
          life: [0.12, 0.3],
          size: fire ? [0.08, 0.14] : [0.04, 0.07],
          spread: 0.02,
        });
      },
      Ease.linear,
    );
    this.burst(to, fire ? 'fire' : 'hit');
  }

  // Floating combat text in screen space, anchored to a unit.
  text(u, str, cls) {
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = str;
    this.labels.appendChild(el);
    this.floaters.push({ el, anchor: u.view.center().add(new THREE.Vector3(0, 0.9, 0)), t: 0, life: cls === 'crit' ? 1.4 : 1.1 });
  }

  setFire(t, on) {
    const k = 'fire:' + t.x + ',' + t.z;
    const prev = this.tileFx.get(k);
    if (prev) {
      for (const m of prev.meshes) {
        this.world.scene.remove(m);
        const bi = this.world.billboards.indexOf(m);
        if (bi >= 0) this.world.billboards.splice(bi, 1);
      }
      this.tileFx.delete(k);
    }
    if (!on) return;
    if (!this.flameTex) this.flameTex = this.world.flameTex;
    const y = this.world.map.standY(t);
    const meshes = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(10 * PX * 1.6, 14 * PX * 1.6);
      geo.translate(0, 7 * PX * 1.6, 0);
      const mat = new THREE.MeshBasicMaterial({ map: this.flameTex[i % 4], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      mat.color.setRGB(3, 1.7, 0.9);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(t.x + 0.25 + (i % 2) * 0.5, y, t.z + 0.3 + i * 0.2);
      m.userData.phase = i * 1.7;
      m.renderOrder = 4;
      this.world.scene.add(m);
      this.world.billboards.push(m);
      meshes.push(m);
    }
    this.tileFx.set(k, { meshes, tile: t, kind: 'fire' });
  }

  setFrozen(t, on) {
    const k = 'ice:' + t.x + ',' + t.z;
    const prev = this.tileFx.get(k);
    if (prev) {
      for (const m of prev.meshes) this.world.scene.remove(m);
      this.tileFx.delete(k);
      if (!on) this.burst(new THREE.Vector3(t.x + 0.5, 0.3, t.z + 0.5), 'ice');
    }
    if (!on) return;
    this.iceMat ||= new THREE.MeshStandardMaterial({ color: 0xbfe9ff, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x2a5a78, emissiveIntensity: 0.5 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.24, 1), this.iceMat);
    m.position.set(t.x + 0.5, 0.13, t.z + 0.5);
    m.receiveShadow = true;
    this.world.scene.add(m);
    this.tileFx.set(k, { meshes: [m], tile: t, kind: 'ice' });
  }

  clearTiles() {
    for (const v of [...this.tileFx.values()]) {
      if (v.kind === 'fire') this.setFire(v.tile, false);
      else {
        for (const m of v.meshes) this.world.scene.remove(m);
      }
    }
    this.tileFx.clear();
  }

  update(dt) {
    const w = this.world;
    this.mat.uniforms.uScale.value = (w.renderer.domElement.height * 0.5) / Math.tan((w.camera.fov * Math.PI) / 360);

    // Ambient motes: dust in daylight, fireflies at night.
    this.ambientT += dt;
    if (this.ambientT > 0.12) {
      this.ambientT = 0;
      const p = new THREE.Vector3(Math.random() * 16 - 1, 0.6 + Math.random() * 3, Math.random() * 14 - 1);
      this.emit(p, w.night
        ? { count: 1, color: [1.6, 2.4, 0.6], speed: [0.05, 0.2], up: 0.05, life: [3, 5], size: [0.06, 0.1], gravity: 0, spread: 0, blink: 1 }
        : { count: 1, color: [1.1, 1.0, 0.8], speed: [0.03, 0.12], up: 0.03, life: [4, 6], size: [0.03, 0.05], gravity: 0, spread: 0 });
    }
    // Embers from burning tiles
    for (const v of this.tileFx.values()) {
      if (v.kind !== 'fire') continue;
      if (Math.random() < dt * 6) {
        this.emit(new THREE.Vector3(v.tile.x + 0.5, w.map.standY(v.tile) + 0.3, v.tile.z + 0.5), { count: 1, color: [3, 1.2, 0.3], speed: [0.1, 0.3], up: 0.9, life: [0.6, 1.2], size: [0.04, 0.07], gravity: -0.3, spread: 0.35 });
      }
      for (const m of v.meshes) {
        m.material.map = this.flameTex[Math.abs(Math.floor(w.time * 10 + m.userData.phase)) % 4];
        m.scale.y = 1 + Math.sin(w.time * 12 + m.userData.phase) * 0.08;
      }
    }

    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.vel[i * 3] *= 1 - dt * 1.5;
      this.vel[i * 3 + 2] *= 1 - dt * 1.5;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      let a = Math.min(1, k * 2.5) * Math.min(1, (1 - k) * 8 + 0.2);
      if (this.blink[i]) a *= 0.5 + 0.5 * Math.sin(w.time * 4 + i);
      this.alpha[i] = a;
      this.size[i] = this.baseSize[i] * (0.5 + k * 0.5);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.psize.needsUpdate = true;
    this.geo.attributes.palpha.needsUpdate = true;

    for (const f of this.floaters.slice()) {
      f.t += dt;
      const s = w.project(f.anchor.clone().add(new THREE.Vector3(0, f.t * 0.6, 0)));
      const pop = f.t < 0.12 ? 1 + (0.12 - f.t) * 5 : 1;
      f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${pop})`;
      f.el.style.opacity = String(Math.min(1, (f.life - f.t) * 3));
      if (f.t >= f.life) {
        f.el.remove();
        this.floaters.splice(this.floaters.indexOf(f), 1);
      }
    }
  }
}
