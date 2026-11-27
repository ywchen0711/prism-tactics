// HD-2D renderer: pixel-art billboards inside a lit 3D diorama, finished with
// bloom, tilt-shift depth of field, colour grading and a vignette.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/examples/jsm/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js';
import {
  tileCanvas, waterCanvas, drawTree, drawTuft, drawRock, drawTorch, drawFlames, drawBanner,
  characterFrames, CHAR_W, CHAR_H, pixelTex, highlightTex, cursorTex, ringTex, blobTex, skyTex,
} from './pixelart.js';
import { DIRS, EXTRAS, LV, topY } from './map.js';
import { clamp, mulberry32, tween, Ease } from './util.js';
import { SPECS } from './data.js';
import { portraitOf } from './portraits.js';

export const PX = 1 / 18; // world units per sprite pixel
const CHAR_PX = 1 / 23; // characters are drawn at a finer pixel size

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1.1 },
    contrast: { value: 1.05 },
    vignette: { value: 0.55 },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 tint;
    uniform float saturation, contrast, vignette, time;
    varying vec2 vUv;
    float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      col *= tint;
      float d = length(vUv - 0.5);
      col *= mix(1.0, 1.0 - smoothstep(0.3, 0.85, d), vignette);
      col += (rand(vUv * 1000.0 + time) - 0.5) * 0.02;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const TEX_KEYS = {
  G: ['grass_top', 'grass_side', 'deep'],
  D: ['dirt_top', 'dirt_side', 'deep'],
  S: ['stone_top', 'stone_side', 'stone_deep'],
  A: ['sand_top', 'sand_side', 'deep'],
  B: ['wood_top', 'wood_side', 'wood_side'],
  W: ['bed', 'deep', 'deep'],
  F: ['bed', 'deep', 'deep'],
};

export class World {
  constructor(canvas) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 220);
    this.cam = { target: new THREE.Vector3(7, 1.5, 6.5), yaw: Math.PI / 4, pitch: 0.74, dist: 23 };
    this.goal = { target: this.cam.target.clone(), yaw: this.cam.yaw, pitch: this.cam.pitch, dist: this.cam.dist };
    this.shakeAmt = 0;
    this.time = 0;
    this.billboards = [];
    this.updaters = [];
    this.pickables = [];
    this.unitViews = [];
    this.hl = {};
    this.hlMats = new Map();
    this.hlGeo = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
    this.hlTex = highlightTex();
    this.torches = [];
    this.raycaster = new THREE.Raycaster();
    this.textures = {};

    this.setupLights();
    this.setupComposer();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  tex(name) {
    if (!this.textures[name]) {
      let seed = 1;
      for (const ch of name) seed = seed * 31 + ch.charCodeAt(0);
      this.textures[name] = pixelTex(tileCanvas(name, seed).toCanvas(), { mip: true });
    }
    return this.textures[name];
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a4a3a, 1.1);
    this.sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
    this.sun.position.set(-3, 16, 1);
    this.sun.target.position.set(7, 0, 6);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(2048, 2048);
    Object.assign(s.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 50 });
    s.bias = -0.0004;
    s.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
  }

  setupComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.tiltH = new ShaderPass(HorizontalTiltShiftShader);
    this.tiltV = new ShaderPass(VerticalTiltShiftShader);
    this.tiltH.uniforms.r.value = 0.52;
    this.tiltV.uniforms.r.value = 0.52;
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.tiltH.uniforms.h.value = 5 / w;
    this.tiltV.uniforms.v.value = 5 / h;
  }

  setMood(night) {
    this.night = night;
    if (night) {
      this.scene.background = skyTex('#060914', '#121a38', '#24304f');
      this.scene.fog = new THREE.Fog(0x141b33, 26, 75);
      this.hemi.color.set(0x5a6aa8);
      this.hemi.groundColor.set(0x1a1520);
      this.hemi.intensity = 0.55;
      this.sun.color.set(0x9fb4ff);
      this.sun.intensity = 0.7;
      this.sun.position.set(18, 15, -4);
      this.renderer.toneMappingExposure = 1.15;
      this.grade.uniforms.tint.value.set(0.9, 0.95, 1.12);
      this.grade.uniforms.saturation.value = 0.95;
      this.bloom.strength = 0.7;
    } else {
      this.scene.background = skyTex('#7fb6e6', '#cfe4ef', '#f4e7c9');
      this.scene.fog = new THREE.Fog(0xd8e4e6, 30, 85);
      this.hemi.color.set(0xcfe6ff);
      this.hemi.groundColor.set(0x5a4a3a);
      this.hemi.intensity = 1.1;
      this.sun.color.set(0xffe2b8);
      this.sun.intensity = 2.6;
      this.sun.position.set(-3, 16, 1);
      this.renderer.toneMappingExposure = 1.0;
      this.grade.uniforms.tint.value.set(1.05, 1.0, 0.93);
      this.grade.uniforms.saturation.value = 1.12;
      this.bloom.strength = 0.4;
    }
    for (const t of this.torches) t.base = night ? 4.5 : 1.8;
    for (const v of this.unitViews) v.mesh.material.emissiveIntensity = v.baseEmissive();
  }

  // ------------------------------------------------------------ world building
  build(map) {
    this.map = map;
    this.buildTerrain(map);
    this.buildWater(map);
    this.buildDecor(map);
    this.buildSurroundings(map);
    this.cursor = new THREE.Mesh(
      this.hlGeo,
      new THREE.MeshBasicMaterial({ map: cursorTex(), transparent: true, depthWrite: false, color: 0xffffff }),
    );
    this.cursor.visible = false;
    this.cursor.renderOrder = 5;
    this.scene.add(this.cursor);
    this.activeMarker = this.makeActiveMarker();
  }

  buildTerrain(map) {
    const extras = new Map(EXTRAS.map((e) => [e.x + ',' + e.z, e]));
    const info = (x, z) => {
      const t = map.tile(x, z);
      if (t) return { top: this.renderTop(t), type: t.type, bridge: t.type === 'B' };
      const e = extras.get(x + ',' + z);
      if (e) return { top: topY(e.h), type: e.type, bridge: false };
      return null;
    };
    const groups = {};
    const quad = (texKey, v, n) => {
      const g = (groups[texKey] ||= { pos: [], nor: [], uv: [], idx: [] });
      const base = g.pos.length / 3;
      for (const p of v) g.pos.push(...p);
      for (let i = 0; i < 4; i++) g.nor.push(...n);
      g.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    // For each side: left & right corners as seen from outside, so every quad winds counter-clockwise.
    const SIDES = [
      { d: [1, 0], n: [1, 0, 0], l: [1, 1], r: [1, 0] },
      { d: [-1, 0], n: [-1, 0, 0], l: [0, 0], r: [0, 1] },
      { d: [0, 1], n: [0, 0, 1], l: [0, 1], r: [1, 1] },
      { d: [0, -1], n: [0, 0, -1], l: [1, 0], r: [0, 0] },
    ];
    const cells = [...map.tiles.map((t) => [t.x, t.z]), ...EXTRAS.map((e) => [e.x, e.z])];
    const FLOOR = -0.06;
    for (const [x, z] of cells) {
      const c = info(x, z);
      const [topK, sideK, deepK] = TEX_KEYS[c.type];
      const top = c.top;
      const bottom = c.bridge ? top - 0.2 : FLOOR;
      quad(topK, [[x, top, z + 1], [x + 1, top, z + 1], [x + 1, top, z], [x, top, z]], [0, 1, 0]);
      if (c.bridge) quad('bed', [[x, 0.02, z + 1], [x + 1, 0.02, z + 1], [x + 1, 0.02, z], [x, 0.02, z]], [0, 1, 0]);
      for (const s of SIDES) {
        const nb = info(x + s.d[0], z + s.d[1]);
        const nTop = Math.max(bottom, nb ? (nb.bridge ? FLOOR : nb.top) : FLOOR);
        if (nTop >= top - 1e-4) continue;
        let y1 = top;
        let first = true;
        while (y1 > nTop + 1e-4) {
          const y0 = Math.max(nTop, y1 - LV);
          const k = first ? sideK : deepK;
          quad(k, [[x + s.l[0], y0, z + s.l[1]], [x + s.r[0], y0, z + s.r[1]], [x + s.r[0], y1, z + s.r[1]], [x + s.l[0], y1, z + s.l[1]]], s.n);
          y1 = y0;
          first = false;
        }
      }
    }
    for (const [k, g] of Object.entries(groups)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setIndex(g.idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this.tex(k) }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.pickables.push(mesh);
    }
  }

  renderTop(t) {
    if (t.type === 'W') return 0.02;
    if (t.type === 'F') return 0.1;
    return topY(t.h);
  }

  buildWater() {
    const wtex = pixelTex(waterCanvas().toCanvas(), { mip: true, repeat: true });
    wtex.repeat.set(47, 1);
    this.waterTex = wtex;
    const mat = new THREE.MeshStandardMaterial({
      map: wtex, color: 0xa8d8f0, transparent: true, opacity: 0.78, roughness: 0.18, metalness: 0.05,
      emissive: 0x0a2a40, emissiveIntensity: 0.6, depthWrite: false,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(94, 2).rotateX(-Math.PI / 2), mat);
    water.position.set(7, 0.2, 6);
    water.receiveShadow = true;
    water.renderOrder = 2;
    this.scene.add(water);
    const bedTex = this.tex('bed').clone();
    bedTex.wrapS = bedTex.wrapT = THREE.RepeatWrapping;
    bedTex.repeat.set(40, 2);
    bedTex.needsUpdate = true;
    for (const cx of [-20, 34]) {
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(40, 2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: bedTex }));
      bed.position.set(cx, -0.04, 6);
      bed.receiveShadow = true;
      this.scene.add(bed);
    }
    this.updaters.push((dt) => {
      wtex.offset.x += dt * 0.05;
      wtex.offset.y = Math.sin(this.time * 0.6) * 0.04;
    });
  }

  makeSprite(tex, w, h, { shadow = true, emissive = 0.22, px = PX } = {}) {
    const geo = new THREE.PlaneGeometry(w * px, h * px);
    geo.translate(0, (h * px) / 2, 0);
    // Tilt normals upward so overhead lights read on the upright sprite.
    const n = geo.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0.55, 0.835);
    const mat = new THREE.MeshLambertMaterial({
      map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: emissive,
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    this.billboards.push(m);
    return m;
  }

  buildDecor(map) {
    const rnd = mulberry32(42);
    for (const t of map.tiles) {
      const y = topY(t.h);
      if (t.deco && t.deco.kind === 'tree') {
        const m = this.makeSprite(pixelTex(drawTree(t.deco.seed * 17, t.deco.variant).toCanvas()), 32, 48, { emissive: 0.12 });
        m.scale.setScalar(1.25 + rnd() * 0.2);
        m.position.set(t.x + 0.5, y - 0.05, t.z + 0.5);
        this.scene.add(m);
      } else if (t.deco && t.deco.kind === 'rock') {
        const m = this.makeSprite(pixelTex(drawRock(t.deco.seed * 5).toCanvas()), 16, 12, { emissive: 0.12 });
        m.scale.setScalar(1.3);
        m.position.set(t.x + 0.5, y - 0.03, t.z + 0.5);
        this.scene.add(m);
      } else if (t.type === 'G') {
        const n = (rnd() * 3) | 0;
        for (let i = 0; i < n; i++) {
          const m = this.makeSprite(pixelTex(drawTuft((rnd() * 1e6) | 0).toCanvas()), 8, 7, { shadow: false, emissive: 0.15 });
          m.position.set(t.x + 0.15 + rnd() * 0.7, y, t.z + 0.15 + rnd() * 0.7);
          this.scene.add(m);
        }
      }
    }
    // Wall torches and bridge torches
    const torchY = topY(5);
    this.addTorch(1.5, torchY + 0.45, 0.08, true);
    this.addTorch(4.5, torchY + 0.45, 0.08, true);
    this.addTorch(6.08, topY(1), 6.92, false);
    this.addTorch(7.92, topY(1), 6.92, false);
    // Banners hanging on the fortress wall
    const btex = pixelTex(drawBanner().toCanvas());
    for (const bx of [3, 6.6]) {
      const geo = new THREE.PlaneGeometry(12 * PX * 1.4, 24 * PX * 1.4);
      geo.translate(0, (-24 * PX * 1.4) / 2, 0);
      const b = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: btex, alphaTest: 0.5, side: THREE.DoubleSide }));
      b.position.set(bx, topY(7) - 0.1, 0.03);
      b.castShadow = true;
      this.scene.add(b);
      const phase = bx;
      this.updaters.push(() => {
        b.rotation.x = Math.sin(this.time * 1.3 + phase) * 0.06 - 0.04;
      });
    }
  }

  addTorch(x, y, z, wall) {
    if (!this.flameTex) this.flameTex = drawFlames().map((p) => pixelTex(p.toCanvas()));
    const pole = this.makeSprite(pixelTex(drawTorch().toCanvas()), 8, 18, { emissive: 0.15 });
    pole.position.set(x, y - (wall ? 0.7 : 0), z);
    this.scene.add(pole);
    const fgeo = new THREE.PlaneGeometry(10 * PX, 14 * PX);
    fgeo.translate(0, 7 * PX, 0);
    const fmat = new THREE.MeshBasicMaterial({ map: this.flameTex[0], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    fmat.color.setRGB(3, 2, 1.2);
    const flame = new THREE.Mesh(fgeo, fmat);
    flame.renderOrder = 4;
    flame.position.set(x, pole.position.y + 17 * PX, z);
    this.billboards.push(flame);
    this.scene.add(flame);
    const light = new THREE.PointLight(0xff9a4a, 2.5, 7, 1.6);
    light.position.set(x, flame.position.y + 0.3, z + (wall ? 0.4 : 0));
    this.scene.add(light);
    const torch = { light, base: 2.5, phase: Math.random() * 10 };
    this.torches.push(torch);
    this.updaters.push(() => {
      const t = this.time * 9 + torch.phase;
      light.intensity = torch.base * (0.85 + 0.1 * Math.sin(t) + 0.08 * Math.sin(t * 2.7));
      fmat.map = this.flameTex[Math.abs(Math.floor(this.time * 10 + torch.phase)) % 4];
    });
  }

  buildSurroundings(map) {
    const gtex = this.tex('ground').clone();
    gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
    gtex.repeat.set(140, 140);
    gtex.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: gtex }));
    ground.position.set(7, -0.06, 6);
    ground.receiveShadow = true;
    this.scene.add(ground);
    const rnd = mulberry32(7);
    const texCache = [];
    for (let i = 0; i < 8; i++) texCache.push(pixelTex(drawTree(1000 + i * 37, i % 3 === 0 ? 'pine' : 'oak').toCanvas()));
    let placed = 0;
    for (let tries = 0; tries < 2000 && placed < 170; tries++) {
      const x = -16 + rnd() * 46;
      const z = -14 + rnd() * 42;
      if (x > -1.8 && x < map.W + 0.6 && z > -2.2 && z < map.H + 0.6) continue;
      if (z > 4.4 && z < 7.6) continue;
      const m = this.makeSprite(texCache[(rnd() * texCache.length) | 0], 32, 48, { emissive: 0.1, shadow: Math.abs(x - 7) < 14 && Math.abs(z - 6) < 14 });
      m.scale.setScalar(1.3 + rnd() * 0.6);
      m.position.set(x, -0.06, z);
      this.scene.add(m);
      placed++;
    }
  }

  makeActiveMarker() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95 });
    mat.color.setRGB(2.2, 1.8, 0.8);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 4), mat);
    cone.rotation.x = Math.PI;
    g.add(cone);
    g.visible = false;
    this.scene.add(g);
    this.updaters.push(() => {
      if (!this.activeUnit || !this.activeUnit.alive) {
        g.visible = false;
        return;
      }
      const v = this.activeUnit.view;
      g.visible = true;
      g.position.copy(v.group.position);
      g.position.y += v.height() + 0.3 + Math.sin(this.time * 4) * 0.06;
      cone.rotation.y = this.time * 2;
    });
    return g;
  }

  setActiveMarker(u) {
    this.activeUnit = u;
  }

  // ------------------------------------------------------------ units
  addUnit(u) {
    const v = new UnitView(this, u);
    this.unitViews.push(v);
    return v;
  }

  unitPos(x, z) {
    const t = this.map.tile(x, z);
    return new THREE.Vector3(x + 0.5, this.map.standY(t), z + 0.5);
  }

  tileCenter(x, z) {
    return this.unitPos(x, z).add(new THREE.Vector3(0, 0.6, 0));
  }

  // ------------------------------------------------------------ highlights
  hlMat(color, opacity) {
    const k = color + ':' + opacity;
    if (!this.hlMats.has(k)) {
      this.hlMats.set(k, new THREE.MeshBasicMaterial({ map: this.hlTex, color, transparent: true, opacity, depthWrite: false }));
    }
    return this.hlMats.get(k);
  }

  setHighlight(name, tiles, color, opacity) {
    let g = this.hl[name];
    if (!g) {
      g = this.hl[name] = new THREE.Group();
      g.renderOrder = 3;
      this.scene.add(g);
    }
    g.clear();
    if (!tiles.length) return;
    const mat = this.hlMat(color, opacity);
    for (const t of tiles) {
      const tile = this.map.tile(t.x, t.z);
      if (!tile) continue;
      const m = new THREE.Mesh(this.hlGeo, mat);
      const y = tile.type === 'W' && !tile.frozen ? 0.21 : this.map.standY(tile) + (tile.type === 'F' && !tile.frozen ? 0.11 : 0);
      m.position.set(t.x + 0.5, y + 0.025, t.z + 0.5);
      m.renderOrder = 3;
      g.add(m);
    }
  }

  clearHighlights() {
    for (const g of Object.values(this.hl)) g.clear();
  }

  setCursor(tile) {
    if (!tile) {
      this.cursor.visible = false;
      return;
    }
    const t = this.map.tile(tile.x, tile.z);
    const y = t.type === 'W' && !t.frozen ? 0.21 : this.map.standY(t) + (t.type === 'F' && !t.frozen ? 0.11 : 0);
    this.cursor.position.set(tile.x + 0.5, y + 0.04, tile.z + 0.5);
    this.cursor.visible = true;
  }

  // ------------------------------------------------------------ camera
  rotate(step) {
    this.goal.yaw += (step * Math.PI) / 2;
  }
  rotateFree(dx) {
    this.goal.yaw -= dx * 0.008;
  }
  zoom(f) {
    this.goal.dist = clamp(this.goal.dist * f, 11, 36);
  }
  pan(dx, dz) {
    const s = Math.sin(this.cam.yaw);
    const c = Math.cos(this.cam.yaw);
    const t = this.goal.target;
    t.x = clamp(t.x + c * dx + s * dz, 0, this.map.W);
    t.z = clamp(t.z - s * dx + c * dz, 0, this.map.H);
  }
  focusUnit(u) {
    const p = this.unitPos(u.x, u.z);
    this.goal.target.set(clamp(p.x, 2, this.map.W - 2), 0.8 + p.y * 0.5, clamp(p.z, 2, this.map.H - 2));
  }
  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 5);
    const c = this.cam;
    c.target.lerp(this.goal.target, k);
    c.yaw += (this.goal.yaw - c.yaw) * k;
    c.pitch += (this.goal.pitch - c.pitch) * k;
    c.dist += (this.goal.dist - c.dist) * k;
    const cp = Math.cos(c.pitch);
    this.camera.position.set(
      c.target.x + Math.sin(c.yaw) * cp * c.dist,
      c.target.y + Math.sin(c.pitch) * c.dist,
      c.target.z + Math.cos(c.yaw) * cp * c.dist,
    );
    this.camera.lookAt(c.target);
    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 10);
    }
  }

  // ------------------------------------------------------------ picking
  pick(clientX, clientY) {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const th = this.raycaster.intersectObjects(this.pickables, false)[0];
    const tdist = th ? th.distance : Infinity;
    const meshes = this.unitViews.filter((v) => v.unit.alive).map((v) => v.mesh);
    for (const h of this.raycaster.intersectObjects(meshes, false)) {
      if (h.distance > tdist + 0.6) break;
      const v = h.object.userData.view;
      if (v.alphaAt(h.uv)) return { unit: v.unit, tile: { x: v.unit.x, z: v.unit.z } };
    }
    if (!th) return null;
    const p = th.point.clone().addScaledVector(th.face.normal, -0.01);
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    if (!this.map.tile(x, z)) return null;
    return { tile: { x, z } };
  }

  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, visible: p.z < 1 };
  }

  // ------------------------------------------------------------ frame
  render(dt) {
    this.time += dt;
    this.updateCamera(dt);
    const yaw = this.cam.yaw;
    for (const b of this.billboards) b.rotation.y = yaw;
    for (const f of this.updaters) f(dt);
    for (const v of this.unitViews) v.update(dt);
    if (this.cursor.visible) this.cursor.material.opacity = 0.7 + Math.sin(this.time * 6) * 0.3;
    this.grade.uniforms.time.value = this.time % 10;
    this.composer.render(dt);
  }
}

// ------------------------------------------------------------------ unit sprite
const TEAM_COLOR = { ally: 0x4aa8ff, enemy: 0xff4a4a };
let SHARED = null;

export class UnitView {
  constructor(world, unit) {
    SHARED ||= { ring: ringTex(), blob: blobTex() };
    this.world = world;
    this.unit = unit;
    this.frames = characterFrames(SPECS[unit.spec]);
    this.tex = {
      front: this.frames.front.map((p) => pixelTex(p.toCanvas())),
      back: this.frames.back.map((p) => pixelTex(p.toCanvas())),
    };
    const pic = portraitOf(unit.spec);
    unit.portrait = pic.src;
    unit.portraitSmooth = pic.smooth;
    this.baseScale = unit.boss ? 1.22 : 1;
    this.mesh = world.makeSprite(this.tex.front[0], CHAR_W, CHAR_H, { emissive: this.baseEmissive(), px: CHAR_PX });
    this.world.billboards.pop(); // unit sprites are billboarded in update()
    this.mesh.userData.view = this;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    const ringMat = new THREE.MeshBasicMaterial({ map: SHARED.ring, color: TEAM_COLOR[unit.team], transparent: true, opacity: 0.85, depthWrite: false });
    ringMat.color.multiplyScalar(1.6);
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78).rotateX(-Math.PI / 2), ringMat);
    this.ring.position.y = 0.03;
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: SHARED.blob, transparent: true, depthWrite: false, opacity: 0.6 }),
    );
    this.blob.position.y = 0.02;
    this.group.add(this.blob, this.ring);
    this.offset = new THREE.Vector3();
    this.hop = 0;
    this.pose = 'idle';
    this.flash = 0;
    this.animT = Math.random() * 2;
    this.displayed = this.frames.front[0];
    world.scene.add(this.group);
    this.place();
  }

  baseEmissive() {
    return this.world.night ? 0.2 : 0.26;
  }

  place() {
    this.group.position.copy(this.world.unitPos(this.unit.x, this.unit.z));
  }

  setPosLerp(a, b, k, arc) {
    this.group.position.lerpVectors(a, b, k);
    this.group.position.y += Math.sin(Math.PI * k) * arc;
  }

  height() {
    return CHAR_H * CHAR_PX * this.baseScale;
  }

  center() {
    return this.group.position.clone().add(new THREE.Vector3(0, 0.8 * this.baseScale, 0));
  }

  handPos() {
    return this.group.position.clone().add(new THREE.Vector3(0, 1.0 * this.baseScale, 0));
  }

  alphaAt(uv) {
    return this.displayed.alphaAt(uv.x, uv.y);
  }

  async lungeOut(target) {
    this.pose = 'atk';
    const g = this.group.position;
    const dir = new THREE.Vector3(target.x - g.x, 0, target.z - g.z).normalize().multiplyScalar(0.4);
    await tween(0.13, (k) => this.offset.copy(dir).multiplyScalar(k), Ease.out);
  }

  lungeBack() {
    const start = this.offset.clone();
    tween(0.2, (k) => this.offset.copy(start).multiplyScalar(1 - k), Ease.inOut).then(() => (this.pose = 'idle'));
  }

  hurt(crit) {
    this.flash = crit ? 1.4 : 1;
    const dir = new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2);
    tween(0.25, (k) => this.offset.copy(dir).multiplyScalar(Math.sin(Math.PI * k)), Ease.out);
  }

  async die() {
    const m = this.mesh.material;
    m.transparent = true;
    m.alphaTest = 0.01;
    m.needsUpdate = true;
    this.flash = 2;
    await tween(0.8, (k) => {
      m.opacity = 1 - k;
      this.ring.material.opacity = 0.85 * (1 - k);
      this.blob.material.opacity = 0.6 * (1 - k);
      this.mesh.position.y = k * 0.3;
    });
    this.world.scene.remove(this.group);
  }

  dispose() {
    this.world.scene.remove(this.group);
    const i = this.world.unitViews.indexOf(this);
    if (i >= 0) this.world.unitViews.splice(i, 1);
  }

  update(dt) {
    this.animT += dt;
    const w = this.world;
    const yaw = w.cam.yaw;
    const [dx, dz] = DIRS[this.unit.dir];
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const facingCam = dx * fx + dz * fz < 0;
    const screenRight = dx * -fz + dz * fx;
    const view = facingCam ? 'front' : 'back';
    const idx = this.pose === 'atk' ? 2 : Math.abs(Math.floor(this.animT * 2.2)) % 2;
    const tex = this.tex[view][idx];
    this.displayed = this.frames[view][idx];
    const m = this.mesh.material;
    if (m.map !== tex) {
      m.map = tex;
      m.emissiveMap = tex;
    }
    this.mesh.rotation.y = yaw;
    this.mesh.scale.set((screenRight > 0 ? -1 : 1) * this.baseScale, this.baseScale, this.baseScale);
    this.mesh.position.x = this.offset.x;
    this.mesh.position.z = this.offset.z;
    if (this.unit.alive) this.mesh.position.y = this.offset.y;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    m.emissiveIntensity = this.baseEmissive() + this.flash * 2.2;
    this.ring.material.opacity = this.unit.alive ? 0.6 + Math.sin(this.animT * 3) * 0.2 : this.ring.material.opacity;
  }
}

