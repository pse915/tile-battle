// 새 게임용 공용 3D 테이블: 렌더러·카메라·조명·테이블·고르기(레이캐스트)·카드 메시·애니메이션 루프
// 게임은 TableStage를 만들고 stage.group 아래에 자기 물건을 올리면 됨.
import * as THREE from 'three';
import { updateTweens, tween, ease, lerp } from './anim.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE };

const texCache = new Map();
let anisotropy = 4;

/** 캔버스 → 텍스처 (key가 같으면 재사용) */
export function canvasTexture(key, draw, w = 256, h = 256) {
  if (key && texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.userData.canvas = c;
  if (key) texCache.set(key, t);
  return t;
}

/** 둥근 사각형 경로 */
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 글꼴이 늦게 와도 캔버스 그림이 깨지지 않게 */
export async function ensureFonts() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('40px "Jua"'), document.fonts.load('20px "IBM Plex Sans KR"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* 글꼴 없이도 진행 */
  }
}

const sideMat = new Map();
/**
 * 납작한 카드/타일 메시: 위(+y)가 앞면, 아래가 뒷면
 * @param {{w:number,h:number,t:number, face:THREE.Texture, back:THREE.Texture, side?:number}} o
 */
export function cardMesh({ w, h, t = 0.03, face, back, side = 0xf5f1e6 }) {
  const geo = new THREE.BoxGeometry(w, t, h);
  if (!sideMat.has(side)) sideMat.set(side, new THREE.MeshStandardMaterial({ color: side, roughness: 0.7 }));
  const s = sideMat.get(side);
  const mats = [s, s, new THREE.MeshStandardMaterial({ map: face, roughness: 0.55 }), new THREE.MeshStandardMaterial({ map: back, roughness: 0.6 }), s, s];
  const m = new THREE.Mesh(geo, mats);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export function setCardFace(mesh, face) {
  mesh.material[2].map = face;
  mesh.material[2].needsUpdate = true;
}

// ---------- 카툰 렌더링 도우미 ----------
let toonRamp = null;
/** 3단계 명암 (어두움 · 중간 · 밝음) — 계단처럼 끊어져 또렷하게 */
export function toonGradient() {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.generateMipmaps = false;
  toonRamp.needsUpdate = true;
  return toonRamp;
}
/** 툰 재질 */
export function toonMat(color, { map = null, emissive = 0x000000, side = THREE.FrontSide } = {}) {
  return new THREE.MeshToonMaterial({ color, map, gradientMap: toonGradient(), emissive, side });
}
const outlineMats = new Map();
/**
 * 외곽선: 뒷면만 그리는 살짝 큰 복제 메시(inverted hull) — 후처리보다 훨씬 가벼움
 * 색은 검정 대신 따뜻한 남색 계열이 기본
 */
export function addOutline(mesh, { color = 0x2a2240, thickness = 0.04 } = {}) {
  if (!outlineMats.has(color)) outlineMats.set(color, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  const o = new THREE.Mesh(geo, outlineMats.get(color));
  // 크기에 상관없이 테두리 두께가 비슷하게 보이도록 축마다 비율 계산
  o.scale.set(1 + (thickness * 2) / Math.max(size.x, 0.01), 1 + (thickness * 2) / Math.max(size.y, 0.01), 1 + (thickness * 2) / Math.max(size.z, 0.01));
  o.userData.outline = true;
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

export class TableStage {
  /**
   * @param {HTMLElement} container
   * @param {object} o
   * @param {number} o.bg            배경색
   * @param {(ctx,w,h)=>void} o.drawFelt  테이블 천 그림
   * @param {number} [o.tableW=12]   테이블 가로
   * @param {number} [o.tableD=8]    테이블 세로
   * @param {number} [o.rim=0x5a3820] 테두리 나무색
   * @param {{land:number[],port:number[],target?:number[],portTarget?:number[]}} o.camera
   */
  constructor(container, o) {
    this.o = o;
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(o.bg);
    this.scene.fog = new THREE.Fog(o.bg, 26, 60);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pickables = new Set();
    this.frame = new Set();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.titleMode = false;
    this.titleT = 0;
    this.shake = 0;
    this.onPick = null; // (userData, object) => void
    this.onHover = null;
    this.hovered = null;
    this.buildWorld();
    this.bindPointer();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    const high = q === 'high';
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    const r = new THREE.WebGLRenderer({ antialias: high, powerPreference: high ? 'high-performance' : 'low-power' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25));
    r.shadowMap.enabled = high;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = this.o.exposure ?? 0.8;
    r.domElement.setAttribute('aria-label', '게임 테이블');
    this.container.prepend(r.domElement);
    this.renderer = r;
    this.sun.castShadow = high;
    this.composer = null;
    this.outlinesOn = !this.o.toon || high || this.o.outlineLow;
    if (this.o.toon) {
      // 카툰: 반사광·빛 번짐 없이 또렷하게. 그림자는 진하지 않고 경계가 분명하게
      this.scene.environment = null;
      r.toneMapping = THREE.NoToneMapping;
      this.hemi.intensity = 1.25;
      this.sun.intensity = 1.6;
      this.sun.shadow.radius = 1;
      r.shadowMap.type = THREE.PCFShadowMap;
      this.setOutlines(this.outlinesOn);
    } else {
      // 환경 조명(실내 반사광): 한 번 구워 두고 모든 재질이 은은하게 반사 — 낮음에서도 비용 거의 없음
      const pmrem = new THREE.PMREMGenerator(r);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      this.hemi.intensity = 0.25;
      this.sun.intensity = 1.1;
    }
    // 후처리(높음만, 카툰은 끔): 밝은 곳이 살짝 번지는 빛 + 색 보정 출력
    if (high && !this.o.toon) {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.o.bloom ?? 0.18, 0.4, 0.95);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    anisotropy = high ? Math.min(8, r.capabilities.getMaxAnisotropy()) : 2;
    this.resize();
    r.setAnimationLoop(() => this.loop());
  }

  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const a = this.camera.aspect;
    const c = this.o.camera;
    if (a < 1) {
      // 세로 화면: 좁을수록 멀리
      const k = Math.min(2.2, 0.6 / a + 0.4);
      this.camBase = new THREE.Vector3(c.port[0], c.port[1] * k, c.port[2] * k);
      // fitWidth: 이 너비(월드 단위)가 좁은 세로 화면에서도 가로로 다 보이도록 카메라를 뒤로 뺌
      if (this.o.fitWidth) {
        const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * a);
        const need = this.o.fitWidth / 2 / Math.tan(hHalf);
        const len = this.camBase.length();
        if (need > len) this.camBase.multiplyScalar(need / len);
      }
      this.camTarget = new THREE.Vector3(...(c.portTarget || c.target || [0, 0, 0]));
    } else {
      const k = a < 1.4 ? 1.12 : 1;
      this.camBase = new THREE.Vector3(c.land[0], c.land[1] * k, c.land[2] * k);
      this.camTarget = new THREE.Vector3(...(c.target || [0, 0, 0]));
    }
    this.onResize?.(a);
  }

  get portrait() {
    return this.camera.aspect < 1;
  }

  buildWorld() {
    const s = this.scene;
    const o = this.o;
    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x302820, 0.9);
    s.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.4);
    sun.position.set(-5, 14, 6);
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 2, far: 40 });
    sun.shadow.bias = -0.0005;
    s.add(sun);
    this.sun = sun;
    const W = o.tableW || 12;
    const D = o.tableD || 8;
    const felt = canvasTexture(null, o.drawFelt, 1024, Math.round((1024 * D) / W));
    const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), [
      ...Array(2).fill((o.toon ? toonMat(o.rim || 0x5a3820) : new THREE.MeshStandardMaterial({ color: o.rim || 0x5a3820, roughness: 0.6 }))),
      (o.toon ? toonMat(0xffffff, { map: felt }) : new THREE.MeshStandardMaterial({ map: felt, roughness: 0.95 })),
      ...Array(3).fill((o.toon ? toonMat(o.rim || 0x5a3820) : new THREE.MeshStandardMaterial({ color: o.rim || 0x5a3820, roughness: 0.6 }))),
    ]);
    top.position.y = -0.15;
    top.receiveShadow = true;
    s.add(top);
    const rimMat = o.toon ? toonMat(o.rim || 0x5a3820) : new THREE.MeshStandardMaterial({ color: o.rim || 0x5a3820, roughness: 0.45, metalness: 0.05 });
    const rimT = 0.45;
    [
      [W + rimT * 2, rimT, 0, -(D / 2 + rimT / 2)],
      [W + rimT * 2, rimT, 0, D / 2 + rimT / 2],
      [rimT, D, -(W / 2 + rimT / 2), 0],
      [rimT, D, W / 2 + rimT / 2, 0],
    ].forEach(([w, d, x, z]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, d), rimMat);
      m.position.set(x, -0.05, z);
      m.castShadow = true;
      m.receiveShadow = true;
      s.add(m);
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), (o.toon ? toonMat(o.floor || 0x2a1d14) : new THREE.MeshStandardMaterial({ color: o.floor || 0x2a1d14, roughness: 1 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3;
    s.add(floor);
  }

  bindPointer() {
    const el = this.container;
    const pick = (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects([...this.pickables], true);
      for (const hit of hits) {
        let ob = hit.object;
        while (ob && !this.pickables.has(ob)) ob = ob.parent;
        if (ob && ob.visible) return ob;
      }
      return null;
    };
    el.addEventListener('pointerup', (e) => {
      if (this.titleMode || !this.onPick) return;
      const ob = pick(e);
      if (ob) this.onPick(ob.userData, ob);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.titleMode) return;
      const ob = pick(e);
      if (ob !== this.hovered) {
        this.hovered = ob;
        el.style.cursor = ob ? 'pointer' : '';
        this.onHover?.(ob ? ob.userData : null, ob);
      }
    });
  }

  setTitleMode(on) {
    this.titleMode = on;
  }

  /** 3D 위치 → 화면 좌표(px) */
  project(v) {
    const p = v.clone().project(this.camera);
    const r = this.container.getBoundingClientRect();
    return { x: (p.x * 0.5 + 0.5) * r.width + r.left, y: (-p.y * 0.5 + 0.5) * r.height + r.top, behind: p.z > 1 };
  }

  /** 물건 하나를 부드럽게 옮기기 (위로 살짝 뜨는 호) */
  moveTo(obj, { pos, rotX = null, rotY = null, rotZ = null, duration = 0.45, lift = 0.6, delay = 0, easing = ease.inOutCubic }) {
    const from = obj.position.clone();
    const r0 = obj.rotation.clone();
    return tween({
      duration,
      delay,
      ease: easing,
      update: (k) => {
        obj.position.set(lerp(from.x, pos.x, k), lerp(from.y, pos.y, k) + Math.sin(k * Math.PI) * lift, lerp(from.z, pos.z, k));
        if (rotX != null) obj.rotation.x = lerp(r0.x, rotX, k);
        if (rotY != null) obj.rotation.y = lerp(r0.y, rotY, k);
        if (rotZ != null) obj.rotation.z = lerp(r0.z, rotZ, k);
      },
    });
  }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    updateTweens(dt);
    for (const f of this.frame) f(dt);
    const cam = this.camera;
    if (this.titleMode) {
      this.titleT += dt * 0.12;
      const R = Math.hypot(this.camBase.x, this.camBase.z) + 2;
      cam.position.set(Math.sin(this.titleT) * R, this.camBase.y * 0.75, Math.cos(this.titleT) * R);
      cam.lookAt(0, 0, 0);
    } else {
      cam.position.lerp(this.camBase, Math.min(1, dt * 4));
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 2.5);
        cam.position.x += (Math.random() - 0.5) * this.shake * 0.3;
        cam.position.y += (Math.random() - 0.5) * this.shake * 0.3;
      }
      cam.lookAt(this.camTarget);
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, cam);
  }

  /** 테스트용: 화면이 숨겨져 rAF가 멈춰도 강제로 그림 */
  step(dt = 0.05, n = 1) {
    const g = this.clock.getDelta;
    this.clock.getDelta = () => dt;
    for (let i = 0; i < n; i++) this.loop();
    this.clock.getDelta = g;
  }

  /** 카툰 외곽선 켜고 끄기 (낮음 품질에서는 끔) */
  setOutlines(on) {
    this.outlinesOn = on;
    this.scene.traverse((m) => {
      if (m.userData.outline) m.visible = on;
    });
  }

  clear() {
    for (const c of [...this.group.children]) this.group.remove(c);
    this.pickables.clear();
  }
}
