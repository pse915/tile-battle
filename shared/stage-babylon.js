// Babylon.js 공용 3D 테이블 무대 (shared/table3d.js의 Babylon 판)
// 페이지에서 먼저 <script src="https://cdn.jsdelivr.net/npm/babylonjs@9.36.0/babylon.js"> 로 전역 BABYLON을 불러와야 함.
// 좌표계는 Three.js와 같게 오른손 좌표(y 위, z 앞)로 맞춰 게임 코드를 옮기기 쉽게 함.
import { updateTweens, tween, ease, lerp } from './anim.js';

const B = globalThis.BABYLON;
export { B as BABYLON };
export const V3 = (x = 0, y = 0, z = 0) => new B.Vector3(x, y, z);

const texCache = new Map();

/** 캔버스 그림 → 텍스처 (key가 같으면 재사용). draw(ctx, w, h) */
export function canvasTexture(scene, key, draw, w = 256, h = 256) {
  if (key && texCache.has(key)) return texCache.get(key);
  const t = new B.DynamicTexture(key || 'tex', { width: w, height: h }, scene, true);
  draw(t.getContext(), w, h);
  t.update(false); // 캔버스 위쪽 = 텍스처 위쪽 (Three.js와 같은 방향)
  t.anisotropicFilteringLevel = 8;
  if (key) texCache.set(key, t);
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

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

/** PBR 재질 만들기 도우미 */
export function pbr(scene, name, { color = '#ffffff', rough = 0.6, metal = 0, clearcoat = 0, map = null, emissive = null, alpha = 1 } = {}) {
  const m = new B.PBRMaterial(name, scene);
  m.albedoColor = B.Color3.FromHexString(color).toLinearSpace();
  m.roughness = rough;
  m.metallic = metal;
  if (map) m.albedoTexture = map;
  if (clearcoat) {
    m.clearCoat.isEnabled = true;
    m.clearCoat.intensity = clearcoat;
    m.clearCoat.roughness = 0.12;
  }
  if (emissive) m.emissiveColor = B.Color3.FromHexString(emissive);
  if (alpha < 1) m.alpha = alpha;
  return m;
}

export class BabylonStage {
  /**
   * @param {HTMLElement} container
   * @param {object} o  { bg, drawFelt(ctx,w,h), tableW, tableD, rim, floor, camera:{land,port,target,portTarget}, bloom, exposure }
   */
  constructor(container, o) {
    this.o = o;
    this.container = container;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', '게임 테이블');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    container.prepend(canvas);
    this.canvas = canvas;
    this.engine = new B.Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, powerPreference: 'high-performance' }, false);
    const scene = new B.Scene(this.engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = B.Color4.FromHexString(o.bg + 'ff');
    scene.ambientColor = new B.Color3(0.1, 0.1, 0.1);
    scene.skipPointerMovePicking = true;
    this.scene = scene;
    this.camera = new B.FreeCamera('cam', V3(0, 10, 6), scene);
    this.camera.fov = (40 * Math.PI) / 180;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 120;
    this.group = new B.TransformNode('game', scene);
    this.pickables = new Set();
    this.frame = new Set();
    this.titleMode = false;
    this.titleT = 0;
    this.shake = 0;
    this.onPick = null;
    this.onHover = null;
    this.hovered = null;
    this.buildWorld();
    this.bindPointer();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.engine.runRenderLoop(() => this.loop());
  }

  buildWorld() {
    const s = this.scene;
    const o = this.o;
    this.hemi = new B.HemisphericLight('hemi', V3(0, 1, 0), s);
    this.hemi.intensity = 0.35;
    this.hemi.diffuse = B.Color3.FromHexString('#fff4e0');
    this.hemi.groundColor = B.Color3.FromHexString('#302820');
    const sun = new B.DirectionalLight('sun', V3(5, -14, -6).normalize(), s);
    sun.position = V3(-5, 14, 6);
    sun.intensity = 2.2;
    sun.diffuse = B.Color3.FromHexString('#fff1d6');
    sun.shadowMinZ = 2;
    sun.shadowMaxZ = 40;
    this.sun = sun;
    const W = o.tableW || 12;
    const D = o.tableD || 8;
    const felt = canvasTexture(s, null, o.drawFelt, 1024, Math.round((1024 * D) / W));
    const top = B.MeshBuilder.CreateGround('table', { width: W, height: D }, s);
    top.material = pbr(s, 'felt', { map: felt, rough: 0.95 });
    top.receiveShadows = true;
    top.isPickable = false;
    this.table = top;
    const rimMat = pbr(s, 'rim', { color: '#' + (o.rim ?? 0x5a3820).toString(16).padStart(6, '0'), rough: 0.45, clearcoat: 0.5 });
    const t = 0.45;
    [
      [W + t * 2, t, 0, -(D / 2 + t / 2)],
      [W + t * 2, t, 0, D / 2 + t / 2],
      [t, D, -(W / 2 + t / 2), 0],
      [t, D, W / 2 + t / 2, 0],
    ].forEach(([w, d, x, z], i) => {
      const m = B.MeshBuilder.CreateBox('rim' + i, { width: w, height: 0.42, depth: d }, s);
      m.position.set(x, 0.06, z);
      m.material = rimMat;
      m.receiveShadows = true;
      m.isPickable = false;
    });
    const base = B.MeshBuilder.CreateBox('tableBase', { width: W, height: 0.3, depth: D }, s);
    base.position.y = -0.16;
    base.material = rimMat;
    base.isPickable = false;
    const floor = B.MeshBuilder.CreateGround('floor', { width: 80, height: 80 }, s);
    floor.position.y = -3;
    floor.material = pbr(s, 'floor', { color: '#' + (o.floor ?? 0x2a1d14).toString(16).padStart(6, '0'), rough: 1 });
    floor.isPickable = false;
    this.buildEnvironment();
  }

  /** 환경 반사광: 따뜻한 조명판이 있는 작은 방을 한 번 찍어 반사맵으로 씀 (외부 파일 없음) */
  buildEnvironment() {
    const s = this.scene;
    const probe = new B.ReflectionProbe('env', 128, s, true, true);
    probe.refreshRate = B.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    probe.position = V3(0, 2, 0);
    const room = B.MeshBuilder.CreateBox('envRoom', { size: 40, sideOrientation: B.Mesh.BACKSIDE }, s);
    const roomMat = new B.StandardMaterial('envRoomMat', s);
    roomMat.disableLighting = true;
    roomMat.emissiveColor = B.Color3.FromHexString('#3a3028');
    room.material = roomMat;
    probe.renderList.push(room);
    [
      [0, 18, 0, 14, 14, '#fff6e8', 3.0],
      [-18, 8, 4, 10, 8, '#ffe2b8', 1.4],
      [16, 10, -8, 8, 8, '#d8e6ff', 1.0],
    ].forEach(([x, y, z, w, h, c, k], i) => {
      const p = B.MeshBuilder.CreatePlane('envLight' + i, { width: w, height: h, sideOrientation: B.Mesh.DOUBLESIDE }, s);
      p.position.set(x, y, z);
      p.lookAt(V3(0, 0, 0));
      const m = new B.StandardMaterial('envLightMat' + i, s);
      m.disableLighting = true;
      m.emissiveColor = B.Color3.FromHexString(c).scale(k);
      p.material = m;
      probe.renderList.push(p);
    });
    // 반사맵을 한 번 찍은 직후(같은 프레임, 화면 그리기 전) 방을 숨김
    probe.cubeTexture.onAfterRenderObservable.addOnce(() => probe.renderList.forEach((m) => m.setEnabled(false)));
    s.environmentTexture = probe.cubeTexture;
    s.environmentIntensity = this.o.envIntensity ?? 0.6;
  }

  setQuality(q) {
    const high = q === 'high';
    const s = this.scene;
    const dpr = Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25);
    this.engine.setHardwareScalingLevel(1 / dpr);
    // 그림자: 높음만
    if (high && !this.shadows) {
      const sg = new B.ShadowGenerator(2048, this.sun);
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = B.ShadowGenerator.QUALITY_MEDIUM;
      sg.bias = 0.0008;
      sg.normalBias = 0.02;
      this.shadows = sg;
      this.casters?.forEach((m) => sg.addShadowCaster(m, true));
    } else if (!high && this.shadows) {
      this.shadows.dispose();
      this.shadows = null;
    }
    // 후처리: 높음은 빛 번짐 + FXAA + 톤매핑, 낮음은 톤매핑만
    this.pipeline?.dispose();
    this.pipeline = null;
    const ip = s.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = this.o.exposure ?? 1;
    ip.contrast = 1.08;
    if (high) {
      const p = new B.DefaultRenderingPipeline('fx', true, s, [this.camera]);
      p.samples = 4;
      p.fxaaEnabled = true;
      p.bloomEnabled = true;
      p.bloomThreshold = 0.85;
      p.bloomWeight = this.o.bloom ?? 0.25;
      p.bloomKernel = 48;
      p.bloomScale = 0.5;
      p.imageProcessingEnabled = true;
      p.imageProcessing.toneMappingEnabled = true;
      p.imageProcessing.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
      p.imageProcessing.exposure = this.o.exposure ?? 1;
      p.imageProcessing.contrast = 1.08;
      p.imageProcessing.vignetteEnabled = true;
      p.imageProcessing.vignetteWeight = 1.2;
      this.pipeline = p;
    }
    this.quality = q;
    this.resize();
  }

  /** 그림자를 드리울 물건 등록 */
  castShadow(mesh) {
    this.casters = this.casters || new Set();
    this.casters.add(mesh);
    this.shadows?.addShadowCaster(mesh, true);
  }
  uncastShadow(mesh) {
    this.casters?.delete(mesh);
    this.shadows?.removeShadowCaster(mesh, true);
  }

  resize() {
    this.engine.resize();
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    const a = w / h;
    this.aspect = a;
    const c = this.o.camera;
    if (a < 1) {
      const k = Math.min(2.2, 0.6 / a + 0.4);
      this.camBase = V3(c.port[0], c.port[1] * k, c.port[2] * k);
      // fitWidth: 이 너비(월드 단위)가 좁은 화면에서도 가로로 다 보이도록 카메라를 뒤로 뺌
      if (this.o.fitWidth) {
        const hHalf = Math.atan(Math.tan(this.camera.fov / 2) * a);
        const need = this.o.fitWidth / 2 / Math.tan(hHalf);
        const len = this.camBase.length();
        if (need > len) this.camBase.scaleInPlace(need / len);
      }
      this.camTarget = V3(...(c.portTarget || c.target || [0, 0, 0]));
    } else {
      const k = a < 1.4 ? 1.12 : 1;
      this.camBase = V3(c.land[0], c.land[1] * k, c.land[2] * k);
      this.camTarget = V3(...(c.target || [0, 0, 0]));
    }
    this.onResize?.(a);
  }

  get portrait() {
    return this.aspect < 1;
  }

  /** 고르기용 루트 찾기: 등록된 물건이나 그 자식이면 등록된 물건을 돌려줌 */
  rootOf(m) {
    let n = m;
    while (n && !this.pickables.has(n)) n = n.parent;
    return n;
  }

  bindPointer() {
    const s = this.scene;
    const pick = () => {
      const r = s.pick(s.pointerX, s.pointerY, (m) => !!this.rootOf(m));
      return r && r.hit ? this.rootOf(r.pickedMesh) : null;
    };
    s.onPointerObservable.add((pi) => {
      if (this.titleMode) return;
      if (pi.type === B.PointerEventTypes.POINTERUP && this.onPick) {
        const ob = pick();
        if (ob) this.onPick(ob.metadata || {}, ob);
      } else if (pi.type === B.PointerEventTypes.POINTERMOVE && pi.event.pointerType === 'mouse') {
        const ob = pick();
        if (ob !== this.hovered) {
          this.hovered = ob;
          this.canvas.style.cursor = ob ? 'pointer' : '';
          this.onHover?.(ob ? ob.metadata || {} : null, ob);
        }
      }
    });
  }

  setTitleMode(on) {
    this.titleMode = on;
  }

  /** 3D 위치 → 화면 좌표(px) */
  project(v) {
    const e = this.engine;
    const w = e.getRenderWidth();
    const h = e.getRenderHeight();
    const p = B.Vector3.Project(v, B.Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(w, h));
    const r = this.canvas.getBoundingClientRect();
    return { x: (p.x / w) * r.width + r.left, y: (p.y / h) * r.height + r.top, behind: p.z > 1 };
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

  loop(fixedDt) {
    const dt = fixedDt ?? Math.min(this.engine.getDeltaTime() / 1000, 0.1);
    updateTweens(dt);
    for (const f of this.frame) f(dt);
    const cam = this.camera;
    if (this.titleMode) {
      this.titleT += dt * 0.12;
      const R = Math.hypot(this.camBase.x, this.camBase.z) + 2;
      cam.position.set(Math.sin(this.titleT) * R, this.camBase.y * 0.75, Math.cos(this.titleT) * R);
      cam.setTarget(B.Vector3.Zero());
    } else {
      const k = Math.min(1, dt * 4);
      cam.position = B.Vector3.Lerp(cam.position, this.camBase, k);
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 2.5);
        cam.position.x += (Math.random() - 0.5) * this.shake * 0.3;
        cam.position.y += (Math.random() - 0.5) * this.shake * 0.3;
      }
      cam.setTarget(this.camTarget);
    }
    this.scene.render();
  }

  /** 테스트용: 화면이 숨겨져도 강제로 그림 */
  step(dt = 0.05, n = 1) {
    for (let i = 0; i < n; i++) this.loop(dt);
  }

  /** 지난 1초 평균 FPS */
  fps() {
    return this.engine.getFps();
  }
}
