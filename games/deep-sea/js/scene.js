// 밤바다 위 범선 갑판: 물결, 안개, 랜턴, 둥근 해도 테이블, 카드 줄, 열쇠, 연출
import * as THREE from 'three';
import { tween, updateTweens, ease, lerp } from '../../../shared/anim.js';
import { createCardMesh, setCardFace, setAnisotropy, CARD_W, CARD_H, CARD_T } from './cards.js';

const TABLE_R = 5.2;
const SEAT_R = 3.9;

export class SeaStage {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x061321);
    this.scene.fog = new THREE.Fog(0x061321, 20, 70);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.frameCallbacks = new Set();
    this.rows = []; // 자리별 카드 메시 배열
    this.revealedMeshes = [];
    this.showcaseMeshes = [];
    this.n = 4;
    this.viewSeat = 0;
    this.shake = 0;
    this.titleMode = false;
    this.selected = null; // { seat, index }
    this.hover = null;
    this.clickable = false;
    this.onCardClick = null;
    this.bottomInsetPx = 120;
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
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1));
    r.shadowMap.enabled = high;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    r.domElement.setAttribute('aria-label', '게임 테이블');
    this.container.prepend(r.domElement);
    this.renderer = r;
    this.moon.castShadow = high;
    setAnisotropy(high ? Math.min(8, r.capabilities.getMaxAnisotropy()) : 1);
    this.waveDetail = high ? 1 : 0.5;
    this.resize();
    r.setAnimationLoop(() => this.loop());
  }

  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const a = this.camera.aspect;
    const k = a < 1 ? Math.min(2.1, 0.62 / a + 0.38) : 1;
    this.camBase = a < 1 ? new THREE.Vector3(0, 14.5 * k, 4.4 * k) : new THREE.Vector3(0, 14.6, 7.4);
    this.camTarget = new THREE.Vector3(0, 0, a < 1 ? 0.2 : 0.85);
  }

  // ---------- 월드 ----------
  buildWorld() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x6f8fc8, 0x0a0a10, 0.75));
    const moon = new THREE.DirectionalLight(0x9fb8ff, 1.1);
    moon.position.set(-8, 14, -6);
    moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 2, far: 40 });
    s.add(moon);
    this.moon = moon;
    // 랜턴 두 개 (깜빡임)
    this.lanterns = [];
    for (const [x, z] of [[-4.6, -3.2], [4.6, -3.2]]) {
      const light = new THREE.PointLight(0xffb052, 14, 14, 1.6);
      light.position.set(x, 2.6, z);
      s.add(light);
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd38a }));
      glass.position.copy(light.position);
      s.add(glass);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6), new THREE.MeshStandardMaterial({ color: 0x3b2716 }));
      pole.position.set(x, 1.3, z);
      s.add(pole);
      this.lanterns.push(light);
    }
    // 바다
    const segs = 70;
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90, segs, segs),
      new THREE.MeshStandardMaterial({ color: 0x15507f, roughness: 0.3, metalness: 0.25, flatShading: true }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -2.4;
    s.add(ocean);
    this.ocean = ocean;
    this.oceanBase = Float32Array.from(ocean.geometry.attributes.position.array);
    // 갑판
    const plankMat = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.8 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(15, 0.4, 13), plankMat);
    deck.position.y = -1.3;
    deck.receiveShadow = true;
    s.add(deck);
    // 둥근 해도 테이블
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.6 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.2, 64), [wood, new THREE.MeshStandardMaterial({ map: chartTexture(), roughness: 0.85 }), wood]);
    top.position.y = -0.1;
    top.receiveShadow = true;
    s.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 1.1, 24), wood);
    leg.position.y = -0.7;
    s.add(leg);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R, 0.09, 10, 96), new THREE.MeshStandardMaterial({ color: 0xb8892f, metalness: 0.6, roughness: 0.35 }));
    rim.rotation.x = Math.PI / 2;
    s.add(rim);
    // 열쇠
    this.key = makeKey();
    this.key.visible = false;
    s.add(this.key);
    // 촉수 그림자 (문어 연출)
    this.tentacles = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(new THREE.Vector3(Math.sin(t * 3 + i) * 0.6, t * 5, Math.cos(t * 2.4) * 0.5 - t * 1.2));
      }
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.32, 8, false),
        new THREE.MeshStandardMaterial({ color: 0x2b0f3f, emissive: 0x220833, roughness: 0.4, transparent: true, opacity: 0.92 }),
      );
      tube.position.set(Math.sin(a) * (TABLE_R + 1.6), -2.5, Math.cos(a) * (TABLE_R + 1.6));
      tube.rotation.y = a + Math.PI;
      tube.scale.set(1, 0.001, 1);
      tube.visible = false;
      s.add(tube);
      this.tentacles.push(tube);
    }
  }

  // ---------- 좌석 ----------
  seatAngle(i) {
    return (((i - this.viewSeat + this.n) % this.n) * Math.PI * 2) / this.n;
  }
  seatPos(i, r = SEAT_R, y = 0) {
    const a = this.seatAngle(i);
    return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
  }
  seatTangent(i) {
    const a = this.seatAngle(i);
    return new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
  }

  setSeats(n, viewSeat) {
    this.clearRows();
    this.n = n;
    this.viewSeat = viewSeat;
    this.rows = Array.from({ length: n }, () => []);
  }

  clearRows() {
    for (const row of this.rows) for (const m of row) this.scene.remove(m);
    this.rows = this.rows.map(() => []);
    this.selected = null;
    this.hover = null;
  }

  /** 자리 i의 카드 j 위치 (눕혀서, 플레이어 앞에 한 줄) */
  slot(i, j, count) {
    const sp = CARD_W * 0.62 * 1.12;
    const base = this.seatPos(i, i === this.viewSeat ? SEAT_R + 0.15 : SEAT_R);
    const p = base.addScaledVector(this.seatTangent(i), (j - (count - 1) / 2) * sp);
    p.y = CARD_T / 2 + 0.01;
    return p;
  }

  layoutRow(i, animate = true) {
    const row = this.rows[i];
    row.forEach((m, j) => {
      const p = this.slot(i, j, row.length);
      if (this.selected && this.selected.seat === i && this.selected.index === j) p.y += 0.35;
      else if (this.hover === m) p.y += 0.12;
      m.userData.target = p;
      m.userData.yaw = this.seatAngle(i);
      if (!animate) {
        m.position.copy(p);
        m.rotation.set(0, m.userData.yaw, 0);
      }
    });
  }

  /** 모든 자리에 카드를 새로 나눔 (가운데에서 날아감) */
  async dealRows(counts, onEach) {
    this.clearRows();
    const jobs = [];
    let k = 0;
    counts.forEach((cnt, i) => {
      for (let j = 0; j < cnt; j++) {
        const m = createCardMesh('back');
        m.scale.setScalar(0.62);
        m.position.set(0, 0.6, 0);
        m.userData.seat = i;
        this.scene.add(m);
        this.rows[i].push(m);
        const delay = k++ * 0.035;
        m.userData.dealing = true;
        jobs.push(
          tween({ duration: 0.01, delay }).then(() => {
            onEach?.();
            m.userData.dealing = false;
          }),
        );
      }
    });
    counts.forEach((_, i) => this.layoutRow(i));
    // 날아가는 동안은 루프의 lerp가 이동을 맡음 (dealing 플래그로 시작 시간을 늦춤)
    await Promise.all(jobs);
  }

  setRowCount(i, count) {
    const row = this.rows[i];
    while (row.length > count) this.scene.remove(row.pop());
    while (row.length < count) {
      const m = createCardMesh('back');
      m.scale.setScalar(0.62);
      m.userData.seat = i;
      this.scene.add(m);
      row.push(m);
    }
    this.layoutRow(i, false);
  }

  // ---------- 뒤집기 ----------
  /** target 자리 index번째 카드를 뒤집어 가운데 공개 칸으로 보냄 */
  async flipCard(target, index, face, slotIndex, round) {
    const row = this.rows[target];
    if (!row || !row.length) return;
    const i = index >= 0 && index < row.length ? index : row.length - 1;
    const m = row.splice(i, 1)[0];
    if (this.selected?.seat === target) this.selected = null;
    this.layoutRow(target);
    setCardFace(m, face);
    m.userData.target = null;
    const p0 = m.position.clone();
    const lift = new THREE.Vector3(p0.x * 0.5, 2.6, p0.z * 0.5 + 1);
    const end = this.revealSlot(slotIndex, round);
    const q0 = m.quaternion.clone();
    const qUp = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0, Math.PI));
    const qEnd = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI));
    await tween({
      duration: 0.55,
      ease: ease.outCubic,
      update: (t) => {
        m.position.lerpVectors(p0, lift, t);
        m.quaternion.slerpQuaternions(q0, qUp, t);
        m.scale.setScalar(lerp(0.62, 1.2, t));
      },
    });
    await tween({ duration: 0.45 });
    await tween({
      duration: 0.45,
      ease: ease.inOutCubic,
      update: (t) => {
        m.position.lerpVectors(lift, end, t);
        m.position.y += Math.sin(Math.PI * t) * 0.4;
        m.quaternion.slerpQuaternions(qUp, qEnd, t);
        m.scale.setScalar(lerp(1.2, 0.56, t));
      },
    });
    this.revealedMeshes.push(m);
    return m;
  }

  revealSlot(k, round) {
    const per = this.n;
    const col = k % per;
    const sp = CARD_W * 0.56 * 1.1;
    return new THREE.Vector3((col - (per - 1) / 2) * sp, CARD_T + 0.02, -0.9 + (round - 1) * 0.72);
  }

  placeRevealed(list) {
    for (const m of this.revealedMeshes) this.scene.remove(m);
    this.revealedMeshes = [];
    const perRound = {};
    for (const r of list) {
      const k = (perRound[r.round] = (perRound[r.round] ?? -1) + 1);
      const m = createCardMesh(r.type);
      m.scale.setScalar(0.56);
      m.position.copy(this.revealSlot(k, r.round));
      m.rotation.set(0, 0, Math.PI);
      this.scene.add(m);
      this.revealedMeshes.push(m);
    }
  }

  clearRevealed() {
    for (const m of this.revealedMeshes) this.scene.remove(m);
    this.revealedMeshes = [];
  }

  // ---------- 열쇠 ----------
  keyPos(i) {
    const p = this.seatPos(i, i === this.viewSeat ? SEAT_R - 1.1 : SEAT_R - 1.2, 0.9);
    return p;
  }
  setKey(i, instant = false) {
    this.key.visible = i != null && i >= 0;
    if (!this.key.visible) return Promise.resolve();
    const to = this.keyPos(i);
    if (instant || !this.keyHome) {
      this.keyHome = to;
      return Promise.resolve();
    }
    const from = this.keyHome.clone();
    this.keyHome = null;
    return tween({
      duration: 0.7,
      ease: ease.inOutCubic,
      update: (t) => {
        this.key.position.lerpVectors(from, to, t);
        this.key.position.y += Math.sin(Math.PI * t) * 1.8;
        this.key.rotation.y = t * Math.PI * 4;
      },
      complete: () => (this.keyHome = to),
    });
  }

  // ---------- 연출 ----------
  sparkle(pos, color = 0xffd34d, n = 60, up = 3) {
    const arr = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      arr.set([pos.x, pos.y, pos.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 2;
      vel.push(new THREE.Vector3(Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.13, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(pts);
    let last = 0;
    tween({
      duration: 1.2,
      ease: ease.linear,
      update: (t) => {
        const dt = (t - last) * 1.2;
        last = t;
        for (let i = 0; i < n; i++) {
          vel[i].y -= 4 * dt;
          arr[i * 3] += vel[i].x * dt;
          arr[i * 3 + 1] += vel[i].y * dt;
          arr[i * 3 + 2] += vel[i].z * dt;
        }
        geo.attributes.position.needsUpdate = true;
        pts.material.opacity = 1 - t;
      },
      complete: () => {
        this.scene.remove(pts);
        geo.dispose();
        pts.material.dispose();
      },
    });
  }

  dust(pos) {
    this.sparkle(pos, 0x9fb3c8, 40, 1.2);
  }

  async monster() {
    this.shake = 0.5;
    this.tentacles.forEach((t, i) => {
      t.visible = true;
      tween({ duration: 0.9, delay: i * 0.06, ease: ease.outBack, update: (k) => t.scale.set(1, Math.max(0.001, k), 1) });
    });
    await tween({ duration: 2.2 });
    await Promise.all(
      this.tentacles.map((t) =>
        tween({ duration: 0.6, ease: ease.inCubic, update: (k) => t.scale.set(1, Math.max(0.001, 1 - k), 1), complete: () => (t.visible = false) }),
      ),
    );
  }

  // ---------- 튜토리얼 진열 ----------
  showcase(kinds, { y = 0.9, scale = 1, z = 1.9 } = {}) {
    this.clearShowcase();
    const sp = CARD_W * scale * 1.25;
    kinds.forEach((k, j) => {
      const m = createCardMesh(k);
      m.position.set((j - (kinds.length - 1) / 2) * sp, y, z);
      m.rotation.set(1.05, 0, Math.PI);
      m.scale.setScalar(0.001);
      this.scene.add(m);
      this.showcaseMeshes.push(m);
      tween({ duration: 0.45, delay: j * 0.1, ease: ease.outBack, update: (t) => m.scale.setScalar(Math.max(0.001, t * scale)) });
    });
  }
  clearShowcase() {
    for (const m of this.showcaseMeshes) this.scene.remove(m);
    this.showcaseMeshes = [];
  }

  // ---------- 타이틀 ----------
  setTitleMode(on) {
    this.titleMode = on;
    if (on) {
      this.titleAngle = 0;
      this.showcase(['treasure', 'monster', 'empty', 'treasure'], { y: 1.4, scale: 1.1, z: 0 });
    } else {
      this.clearShowcase();
    }
  }

  // ---------- 화면 좌표 / 입력 ----------
  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.container.clientWidth, y: (-p.y * 0.5 + 0.5) * this.container.clientHeight, visible: p.z < 1 };
  }

  onFrame(fn) {
    this.frameCallbacks.add(fn);
    return () => this.frameCallbacks.delete(fn);
  }

  bindPointer() {
    const el = this.container;
    let down = null;
    const setPtr = (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const pick = () => {
      if (!this.clickable) return null;
      const meshes = this.rows.flatMap((row, i) => (i === this.viewSeat ? [] : row));
      this.raycaster.setFromCamera(this.pointer, this.camera);
      return this.raycaster.intersectObjects(meshes, false)[0]?.object || null;
    };
    el.addEventListener('pointermove', (e) => {
      if (e.target !== this.renderer?.domElement || e.pointerType !== 'mouse') return;
      setPtr(e);
      const m = pick();
      if (m !== this.hover) {
        const prev = this.hover;
        this.hover = m;
        if (prev) this.layoutRow(prev.userData.seat);
        if (m) this.layoutRow(m.userData.seat);
      }
      el.style.cursor = m ? 'pointer' : '';
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.target === this.renderer?.domElement) down = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => {
      if (!down || e.target !== this.renderer?.domElement) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 12) return;
      setPtr(e);
      const m = pick();
      if (m) this.onCardClick?.(m.userData.seat, this.rows[m.userData.seat].indexOf(m));
    });
  }

  select(sel) {
    const prev = this.selected;
    this.selected = sel;
    if (prev) this.layoutRow(prev.seat);
    if (sel) this.layoutRow(sel.seat);
  }

  // ---------- 루프 ----------
  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;
    updateTweens(dt);

    // 카드는 목표 위치로 부드럽게
    const k = 1 - Math.exp(-dt * 10);
    for (const row of this.rows)
      for (const m of row) {
        const t = m.userData.target;
        if (!t || m.userData.dealing) continue;
        m.position.lerp(t, k);
        m.rotation.y = lerp(m.rotation.y, m.userData.yaw, k);
      }

    // 물결 (정점 높이)
    const pos = this.ocean.geometry.attributes.position;
    const base = this.oceanBase;
    const step = this.waveDetail < 1 ? 2 : 1;
    if (Math.floor(time * 30) % step === 0) {
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        pos.array[i * 3 + 2] = Math.sin(x * 0.35 + time * 1.1) * 0.35 + Math.cos(y * 0.28 + time * 0.8) * 0.3;
      }
      pos.needsUpdate = true;
      this.ocean.geometry.computeVertexNormals();
    }

    // 랜턴 깜빡임
    this.lanterns.forEach((l, i) => (l.intensity = 13 + Math.sin(time * 7 + i * 2) * 1.2 + Math.sin(time * 13 + i) * 0.8));

    // 열쇠: 떠서 빙글
    if (this.key.visible && this.keyHome) {
      this.key.position.set(this.keyHome.x, this.keyHome.y + Math.sin(time * 2.2) * 0.12, this.keyHome.z);
      this.key.rotation.y += dt * 1.2;
    }

    // 카메라 (배가 살짝 흔들림)
    if (this.titleMode) {
      this.titleAngle += dt * 0.1;
      this.camera.position.set(Math.sin(this.titleAngle) * 14, 7.5 + Math.sin(time * 0.6) * 0.3, Math.cos(this.titleAngle) * 14);
      this.camera.lookAt(0, 0.8, 0);
      this.showcaseMeshes.forEach((m, i) => {
        m.position.y = 1.4 + Math.sin(time * 1.4 + i) * 0.18;
        m.rotation.y = Math.sin(time * 0.5 + i) * 0.3;
      });
    } else if (this.camBase) {
      this.camera.position.copy(this.camBase);
      this.camera.position.y += Math.sin(time * 0.7) * 0.06;
      this.camera.position.x += Math.sin(time * 0.45) * 0.08;
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 0.4);
        this.camera.position.x += (Math.random() - 0.5) * this.shake;
        this.camera.position.y += (Math.random() - 0.5) * this.shake;
      }
      this.camera.lookAt(this.camTarget);
    }

    for (const fn of this.frameCallbacks) fn(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

// ---------- 소품과 텍스처 ----------
function makeKey() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8b931, metalness: 0.8, roughness: 0.25, emissive: 0x3a2800 });
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 10, 24), gold);
  bow.position.x = -0.42;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 10), gold);
  shaft.rotation.z = Math.PI / 2;
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), gold);
  t1.position.set(0.28, -0.1, 0);
  const t2 = t1.clone();
  t2.position.x = 0.18;
  g.add(bow, shaft, t1, t2);
  g.scale.setScalar(1.3);
  return g;
}

function plankTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `hsl(28, ${35 + (i % 3) * 5}%, ${18 + (i % 2) * 4}%)`;
    g.fillRect(0, i * 64, 512, 62);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, i * 64 + 62, 512, 2);
    for (let k = 0; k < 20; k++) {
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      g.beginPath();
      const y = i * 64 + Math.random() * 60;
      g.moveTo(0, y);
      g.lineTo(512, y + (Math.random() - 0.5) * 6);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

/** 낡은 해도 무늬 */
function chartTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(512, 512, 100, 512, 512, 520);
  grad.addColorStop(0, '#e9d7a8');
  grad.addColorStop(1, '#b89a5e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(80,50,20,0.18)';
  g.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath();
    g.moveTo(512, 512);
    g.lineTo(512 + Math.cos(a) * 520, 512 + Math.sin(a) * 520);
    g.stroke();
  }
  // 섬
  g.fillStyle = 'rgba(120,90,40,0.35)';
  for (const [x, y, r] of [[300, 260, 60], [760, 340, 44], [680, 760, 70], [240, 720, 36]]) {
    g.beginPath();
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const rr = r * (0.7 + Math.random() * 0.5);
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.fill();
  }
  g.strokeStyle = 'rgba(160,30,30,0.5)';
  g.setLineDash([14, 12]);
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(300, 260);
  g.bezierCurveTo(500, 300, 520, 600, 680, 760);
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(160,30,30,0.7)';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(660, 740);
  g.lineTo(700, 780);
  g.moveTo(700, 740);
  g.lineTo(660, 780);
  g.stroke();
  g.strokeStyle = 'rgba(80,50,20,0.35)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(512, 512, 500, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
