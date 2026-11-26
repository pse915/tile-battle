// Three.js 무대: 원목 테이블, 펠트, 조명, 카메라, 손패 배치, 타일 비행 연출
import * as THREE from 'three';
import { createTileMesh, createBackMesh, setAnisotropy, TILE_W, TILE_H, TILE_D } from './tiles.js';
import { tween, updateTweens, ease, lerp } from '../../../shared/anim.js';
import { makeTile, shuffle } from './rules.js';

const HAND_DIST = 3; // 카메라에서 손패까지 거리
const FELT_R = 5.5;
const SEAT_R = 4.35;

export class Stage {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x24170f);
    this.scene.fog = new THREE.Fog(0x24170f, 18, 34);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.scene.add(this.camera);
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.frameCallbacks = new Set();

    this.hand = new THREE.Group();
    this.hand.position.z = -HAND_DIST;
    this.camera.add(this.hand);
    this.handMeshes = [];
    this.selected = new Set();
    this.hoverMesh = null;
    this.handEnabled = false;
    this.onTileClick = null;
    this.bottomInsetPx = 96;

    this.centerPlays = []; // 바닥에 놓인 조합들 (최근 것이 마지막)
    this.seatCount = 3;
    this.viewSeat = 0;
    this.oppRows = [];
    this.chipStacks = [];
    this.titleTiles = [];
    this.showcaseMeshes = [];
    this.shake = 0;
    this.titleMode = false;
    this.titleAngle = 0;

    this.buildWorld();
    this.bindPointer();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------- 렌더러 ----------
  setQuality(q) {
    const high = q === 'high';
    this.quality = q;
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
    r.toneMappingExposure = 1.05;
    r.domElement.setAttribute('aria-label', '게임 테이블');
    this.container.prepend(r.domElement);
    this.renderer = r;
    setAnisotropy(high ? Math.min(8, r.capabilities.getMaxAnisotropy()) : 1);
    this.sun.castShadow = high;
    this.resize();
    r.setAnimationLoop(() => this.loop());
  }

  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  }

  placeCamera() {
    const a = this.camera.aspect;
    // 세로 화면에서는 테이블 전체가 보이도록 뒤로 물러남
    const k = a < 1 ? Math.min(2.1, 0.62 / a + 0.38) : 1;
    // 세로 화면은 더 위에서 내려다봐서 둥근 테이블이 화면 폭을 채우게
    this.camBase = a < 1 ? new THREE.Vector3(0, 14 * k, 6.2 * k) : new THREE.Vector3(0, 11.2, 9.6);
    this.camTarget = new THREE.Vector3(0, 0, a < 1 ? 2.2 : 0.9);
    if (!this.titleMode) {
      this.camera.position.copy(this.camBase);
      this.camera.lookAt(this.camTarget);
    }
  }

  // ---------- 월드 ----------
  buildWorld() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffeccc, 0x2a1a10, 0.75));
    const sun = new THREE.DirectionalLight(0xffe0b0, 2.1);
    sun.position.set(4, 13, 6);
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -7.5;
    sc.right = sc.top = 7.5;
    sc.near = 2;
    sc.far = 30;
    sun.shadow.bias = -0.0008;
    s.add(sun);
    this.sun = sun;
    const lamp = new THREE.PointLight(0xffc77a, 18, 16, 1.6);
    lamp.position.set(0, 6.5, 0);
    s.add(lamp);

    // 원목 테이블
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55 });
    const table = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.25, 0.5, 72), wood);
    table.position.y = -0.27;
    table.receiveShadow = true;
    s.add(table);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(FELT_R + 0.18, 0.14, 12, 96), wood);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.0;
    rim.castShadow = true;
    s.add(rim);

    // 칠판색 펠트
    const felt = new THREE.Mesh(
      new THREE.CylinderGeometry(FELT_R, FELT_R, 0.04, 72),
      [
        new THREE.MeshStandardMaterial({ color: 0x1d4d3b, roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ color: 0x1d4d3b }),
      ],
    );
    felt.position.y = -0.02;
    felt.receiveShadow = true;
    s.add(felt);

    // 바닥 (어두운 교실 바닥)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshStandardMaterial({ color: 0x1a110b, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4;
    s.add(floor);

    // 차례 표시 링
    this.turnRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.05, 10, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.9 }),
    );
    this.turnRing.rotation.x = -Math.PI / 2;
    this.turnRing.visible = false;
    s.add(this.turnRing);

    this.coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 24);
    this.coinMat = new THREE.MeshStandardMaterial({ color: 0xe8b931, metalness: 0.55, roughness: 0.32 });
  }

  // ---------- 좌석 ----------
  seatAngle(i) {
    return (((i - this.viewSeat + this.seatCount) % this.seatCount) * Math.PI * 2) / this.seatCount;
  }
  seatPos(i, r = SEAT_R, y = 0) {
    const a = this.seatAngle(i);
    return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
  }
  seatTangent(i) {
    const a = this.seatAngle(i);
    return new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
  }

  setSeats(n, viewSeat = 0) {
    this.seatCount = n;
    this.viewSeat = viewSeat;
    for (const g of this.oppRows) g && this.scene.remove(g);
    for (const g of this.chipStacks) g && this.scene.remove(g);
    this.oppRows = [];
    this.chipStacks = [];
    for (let i = 0; i < n; i++) {
      const row = new THREE.Group();
      row.position.copy(this.seatPos(i, SEAT_R + 0.3));
      row.rotation.y = this.seatAngle(i);
      row.userData.count = -1;
      this.scene.add(row);
      this.oppRows.push(row);
      const chips = new THREE.Group();
      const off = i === viewSeat ? 2.6 : 1.9;
      chips.position.copy(this.seatPos(i, i === viewSeat ? SEAT_R - 0.6 : SEAT_R - 0.4)).addScaledVector(this.seatTangent(i), -off);
      chips.userData.count = -1;
      this.scene.add(chips);
      this.chipStacks.push(chips);
    }
  }

  /** 상대 손패(뒷면) 개수 갱신 */
  setOppCount(i, count) {
    const row = this.oppRows[i];
    if (!row) return;
    if (i === this.viewSeat) count = 0;
    if (row.userData.count === count) return;
    row.userData.count = count;
    while (row.children.length > count) row.remove(row.children[row.children.length - 1]);
    while (row.children.length < count) {
      const m = createBackMesh();
      m.scale.setScalar(0.5);
      row.add(m);
    }
    const sp = TILE_W * 0.5 * 1.04;
    row.children.forEach((m, j) => {
      m.position.set((j - (count - 1) / 2) * sp, TILE_H * 0.25, 0);
      m.rotation.set(-0.12, 0, 0);
    });
  }

  setChips(i, chips) {
    const g = this.chipStacks[i];
    if (!g) return;
    const n = Math.max(0, Math.min(24, Math.ceil(chips / 5)));
    if (g.userData.count === n) return;
    g.userData.count = n;
    while (g.children.length > n) g.remove(g.children[g.children.length - 1]);
    while (g.children.length < n) {
      const c = new THREE.Mesh(this.coinGeo, this.coinMat);
      c.castShadow = true;
      g.add(c);
    }
    // 두 줄로 쌓기
    g.children.forEach((c, k) => {
      const col = k % 2;
      const lvl = Math.floor(k / 2);
      c.position.set(col * 0.44 + Math.sin(k * 7.1) * 0.02, 0.03 + lvl * 0.064, Math.cos(k * 3.3) * 0.02);
    });
  }

  chipTop(i) {
    const g = this.chipStacks[i];
    const p = g ? g.position.clone() : new THREE.Vector3();
    p.y = 0.1 + (g ? g.children.length * 0.032 : 0);
    return p;
  }

  async flyCoins(from, to, amount, onLand) {
    const n = Math.min(7, Math.max(1, Math.ceil(amount / 3)));
    const jobs = [];
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(this.coinGeo, this.coinMat);
      const p0 = this.chipTop(from);
      const p1 = this.chipTop(to);
      c.position.copy(p0);
      this.scene.add(c);
      jobs.push(
        tween({
          duration: 0.55,
          delay: k * 0.07,
          ease: ease.inOutCubic,
          update: (t) => {
            c.position.lerpVectors(p0, p1, t);
            c.position.y += Math.sin(Math.PI * t) * 1.6;
            c.rotation.x = t * Math.PI * 4;
          },
          complete: () => {
            this.scene.remove(c);
            onLand?.();
          },
        }),
      );
    }
    await Promise.all(jobs);
  }

  setTurn(i) {
    if (i == null) {
      this.turnRing.visible = false;
      return;
    }
    this.turnRing.visible = true;
    const p = this.seatPos(i, i === this.viewSeat ? SEAT_R - 0.2 : SEAT_R + 0.3);
    this.turnRing.position.set(p.x, 0.03, p.z);
    this.turnRing.scale.setScalar(i === this.viewSeat ? 1.6 : 1.3);
  }

  // ---------- 내 손패 ----------
  setHand(tiles) {
    for (const m of this.handMeshes) this.hand.remove(m);
    this.handMeshes = tiles.map((t) => {
      const m = createTileMesh(t);
      m.castShadow = false;
      m.receiveShadow = false;
      m.scale.setScalar(0.001);
      m.position.set(0, -2, 0);
      this.hand.add(m);
      return m;
    });
    this.selected.clear();
    this.hoverMesh = null;
  }

  /** 정렬된 타일 순서대로 메시 재배열 */
  orderHand(tiles) {
    const byId = new Map(this.handMeshes.map((m) => [m.userData.tile.id, m]));
    this.handMeshes = tiles.map((t) => byId.get(t.id)).filter(Boolean);
  }

  toggleSelect(id) {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  setSelection(ids) {
    this.selected = new Set(ids);
  }

  handLayout() {
    const n = this.handMeshes.length;
    if (!n) return [];
    const halfH = HAND_DIST * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const halfW = halfH * this.camera.aspect;
    const vh = this.container.clientHeight || window.innerHeight;
    const bottom = -halfH + (this.bottomInsetPx / vh) * 2 * halfH;
    const usable = 2 * halfW * 0.95;
    const gap = 1.05;
    let rows = 1;
    let per = n;
    let scale = Math.min(0.4, usable / (n * TILE_W * gap));
    if (scale < 0.27 && n > 6) {
      rows = 2;
      per = Math.ceil(n / 2);
      scale = Math.min(0.4, usable / (per * TILE_W * gap));
    }
    scale = Math.min(scale, (0.3 * 2 * halfH) / (rows * TILE_H * 1.12));
    const th = TILE_H * scale;
    return this.handMeshes.map((m, i) => {
      const row = rows === 2 && i >= per ? 1 : 0;
      const idx = row ? i - per : i;
      const cnt = rows === 2 ? (row ? n - per : per) : n;
      const x = (idx - (cnt - 1) / 2) * TILE_W * scale * gap;
      const nx = x / halfW;
      let y = bottom + th * 0.66 - nx * nx * th * 0.2;
      if (rows === 2 && row === 0) y += th * 1.1;
      const id = m.userData.tile.id;
      if (this.selected.has(id)) y += th * 0.32;
      else if (this.hoverMesh === m) y += th * 0.1;
      return { m, x, y, z: rows === 2 && row === 0 ? -0.08 : 0, rz: -nx * 0.09, s: scale };
    });
  }

  /** 내 손패에서 타일을 떼어내 월드로 옮김 (비행 연출 전에) */
  detachFromHand(ids) {
    const set = new Set(ids);
    const out = [];
    this.handMeshes = this.handMeshes.filter((m) => {
      if (set.has(m.userData.tile.id)) {
        this.scene.attach(m);
        out.push(m);
        return false;
      }
      return true;
    });
    for (const id of ids) this.selected.delete(id);
    return out;
  }

  /** 상대가 낸 타일: 그 자리 위에서 만들어 날려 보냄 */
  spawnAtSeat(i, tiles) {
    const base = this.seatPos(i, SEAT_R + 0.2, 0.9);
    const tan = this.seatTangent(i);
    return tiles.map((t, k) => {
      const m = createTileMesh(t);
      m.position.copy(base).addScaledVector(tan, (k - (tiles.length - 1) / 2) * 0.4);
      m.rotation.set(0, this.seatAngle(i) + Math.PI, 0);
      m.scale.setScalar(0.5);
      this.scene.add(m);
      return m;
    });
  }

  // ---------- 바닥 ----------
  /** 바닥 타일 크기: 세로 화면에서는 더 크게 */
  centerScale() {
    return this.camera.aspect < 1 ? 1.4 : 1.1;
  }

  centerSlots(k, age = 0) {
    const cs = this.centerScale();
    const sp = TILE_W * 1.08 * cs;
    return Array.from({ length: k }, (_, j) => new THREE.Vector3((j - (k - 1) / 2) * sp, (TILE_D / 2) * cs + age * 0.002, (-age * 1.1 + 0.2) * cs));
  }

  /** 타일을 포물선으로 날려 바닥 가운데에 착지시킴 */
  async playToCenter(meshes, onLand) {
    // 이전 조합은 뒤로 밀고, 오래된 것은 치움
    this.centerPlays.forEach((play, idx) => {
      const age = this.centerPlays.length - idx;
      const slots = this.centerSlots(play.length, age);
      play.forEach((m, j) => {
        const p0 = m.position.clone();
        const s0 = m.scale.x;
        const s1 = 0.86 * this.centerScale();
        tween({ duration: 0.35, update: (t) => { m.position.lerpVectors(p0, slots[j], t); m.scale.setScalar(lerp(s0, s1, t)); } });
      });
    });
    while (this.centerPlays.length > 2) for (const m of this.centerPlays.shift()) this.scene.remove(m);

    const slots = this.centerSlots(meshes.length);
    const jobs = meshes.map((m, j) => {
      const p0 = m.position.clone();
      const q0 = m.quaternion.clone();
      const s0 = m.scale.x;
      const yaw = (Math.random() - 0.5) * 0.12;
      const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw, 'XYZ'));
      const spinAxis = new THREE.Vector3(0, 1, 0);
      const spin = new THREE.Quaternion();
      m.castShadow = true;
      return tween({
        duration: 0.62,
        delay: j * 0.06,
        ease: ease.inOutCubic,
        update: (t) => {
          m.position.lerpVectors(p0, slots[j], t);
          m.position.y += Math.sin(Math.PI * t) * 1.7;
          m.quaternion.slerpQuaternions(q0, q1, t);
          spin.setFromAxisAngle(spinAxis, (1 - t) * Math.PI * 0.9);
          m.quaternion.premultiply(spin);
          m.scale.setScalar(lerp(s0, this.centerScale(), t));
        },
        complete: () => onLand?.(j),
      });
    });
    this.centerPlays.push(meshes);
    await Promise.all(jobs);
    this.shake = Math.max(this.shake, 0.05);
  }

  /** 모두 패스: 바닥을 한쪽으로 쓸어냄 */
  async sweepCenter() {
    const all = this.centerPlays.flat();
    this.centerPlays = [];
    await Promise.all(
      all.map((m, k) => {
        const p0 = m.position.clone();
        const p1 = new THREE.Vector3(7.5, 0.1, -3 + (k % 5) * 0.3);
        return tween({
          duration: 0.5,
          delay: k * 0.02,
          ease: ease.inCubic,
          update: (t) => {
            m.position.lerpVectors(p0, p1, t);
            m.rotation.z += 0.08;
          },
          complete: () => this.scene.remove(m),
        });
      }),
    );
  }

  clearCenter() {
    for (const m of this.centerPlays.flat()) this.scene.remove(m);
    this.centerPlays = [];
  }

  // ---------- 이펙트 ----------
  burst(color = 0xffd84d, big = false) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.74, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.3, 0.2);
    this.scene.add(ring);
    tween({
      duration: 0.8,
      update: (t) => {
        ring.scale.setScalar(1 + t * (big ? 7 : 4.5));
        ring.material.opacity = 1 - t;
      },
      complete: () => {
        this.scene.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
      },
    });

    const N = big ? 90 : 45;
    const pos = new Float32Array(N * 3);
    const vel = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 3.5;
      vel.push(new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp));
      pos.set([0, 0.4, 0.2], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(pts);
    let last = 0;
    tween({
      duration: 1.1,
      ease: ease.linear,
      update: (t) => {
        const dt = (t - last) * 1.1;
        last = t;
        for (let i = 0; i < N; i++) {
          vel[i].y -= 9.8 * dt;
          pos[i * 3] += vel[i].x * dt;
          pos[i * 3 + 1] = Math.max(0.05, pos[i * 3 + 1] + vel[i].y * dt);
          pos[i * 3 + 2] += vel[i].z * dt;
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
    this.shake = big ? 0.22 : 0.12;
  }

  // ---------- 타이틀 ----------
  setTitleMode(on) {
    this.titleMode = on;
    for (const m of this.titleTiles) this.scene.remove(m);
    this.titleTiles = [];
    if (on) {
      const picks = shuffle(Array.from({ length: 60 }, (_, i) => makeTile((i % 15) + 1, Math.floor(i / 15)))).slice(0, 16);
      picks.forEach((t, i) => {
        const m = createTileMesh(t);
        m.userData.orbit = { a: (i / picks.length) * Math.PI * 2, r: 2.2 + (i % 3) * 1.1, y: 1.4 + (i % 4) * 0.55, spin: 0.4 + Math.random() * 0.8 };
        this.scene.add(m);
        this.titleTiles.push(m);
      });
    } else {
      this.placeCamera();
    }
  }

  // ---------- 튜토리얼용 진열 ----------
  /** rows: 타일 배열의 배열. 반환: 각 줄 왼쪽 끝의 월드 좌표 */
  showcase(rows, { scale = 0.8, gapZ = 1.05, z0 = null } = {}) {
    this.clearShowcase();
    const sp = TILE_W * scale * 1.08;
    const startZ = z0 ?? -((rows.length - 1) * gapZ) / 2 + 0.3;
    const anchors = [];
    rows.forEach((row, r) => {
      const z = startZ + r * gapZ;
      row.forEach((t, j) => {
        const m = createTileMesh(t);
        m.scale.setScalar(0.001);
        m.rotation.set(-Math.PI / 2, 0, 0);
        const x = (j - (row.length - 1) / 2) * sp;
        m.position.set(x, (TILE_D / 2) * scale, z);
        this.scene.add(m);
        this.showcaseMeshes.push(m);
        tween({ duration: 0.4, delay: r * 0.12 + j * 0.03, ease: ease.outBack, update: (k) => m.scale.setScalar(Math.max(0.001, k * scale)) });
      });
      anchors.push(new THREE.Vector3(-((row.length - 1) / 2) * sp - sp * 0.7, 0.1, z));
    });
    return anchors;
  }

  clearShowcase() {
    for (const m of this.showcaseMeshes) this.scene.remove(m);
    this.showcaseMeshes = [];
  }

  // ---------- 화면 좌표 ----------
  project(v) {
    const p = v.clone().project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, visible: p.z < 1 };
  }

  onFrame(fn) {
    this.frameCallbacks.add(fn);
    return () => this.frameCallbacks.delete(fn);
  }

  // ---------- 입력 ----------
  bindPointer() {
    const el = this.container;
    let down = null;
    const setPtr = (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const pick = () => {
      if (!this.handEnabled || !this.handMeshes.length) return null;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.handMeshes, false)[0];
      return hit ? hit.object : null;
    };
    el.addEventListener('pointermove', (e) => {
      if (e.target !== this.renderer?.domElement) return;
      setPtr(e);
      if (e.pointerType === 'mouse') {
        const m = pick();
        this.hoverMesh = m;
        el.style.cursor = m ? 'pointer' : '';
      }
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.target !== this.renderer?.domElement) return;
      down = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => {
      if (!down || e.target !== this.renderer?.domElement) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 12) return;
      setPtr(e);
      const m = pick();
      if (m) this.onTileClick?.(m.userData.tile);
    });
    el.addEventListener('pointerleave', () => {
      this.hoverMesh = null;
    });
  }

  // ---------- 루프 ----------
  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;
    updateTweens(dt);

    // 손패를 목표 위치로 부드럽게
    const k = 1 - Math.exp(-dt * 14);
    for (const L of this.handLayout()) {
      L.m.position.x = lerp(L.m.position.x, L.x, k);
      L.m.position.y = lerp(L.m.position.y, L.y, k);
      L.m.position.z = lerp(L.m.position.z, L.z, k);
      L.m.rotation.set(-0.1, 0, lerp(L.m.rotation.z, L.rz, k));
      L.m.scale.setScalar(lerp(L.m.scale.x, L.s, k));
    }

    if (this.turnRing.visible) this.turnRing.material.opacity = 0.55 + Math.sin(time * 4) * 0.35;

    if (this.titleMode) {
      this.titleAngle += dt * 0.12;
      const r = 13;
      this.camera.position.set(Math.sin(this.titleAngle) * r, 8.5, Math.cos(this.titleAngle) * r);
      this.camera.lookAt(0, 1.2, 0);
      for (const m of this.titleTiles) {
        const o = m.userData.orbit;
        o.a += dt * 0.25;
        m.position.set(Math.cos(o.a) * o.r, o.y + Math.sin(time * 1.3 + o.a * 3) * 0.25, Math.sin(o.a) * o.r);
        m.rotation.y += dt * o.spin;
        m.rotation.x = Math.sin(time + o.a) * 0.4;
      }
    } else if (this.camBase) {
      // 살짝 흔들림
      this.camera.position.copy(this.camBase);
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 0.6);
        this.camera.position.x += (Math.random() - 0.5) * this.shake;
        this.camera.position.y += (Math.random() - 0.5) * this.shake;
      }
      this.camera.lookAt(this.camTarget);
    }

    for (const fn of this.frameCallbacks) fn(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

// ---------- 절차적 텍스처 ----------
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#8a5a33';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 512;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '60,34,18' : '170,118,70'},${0.15 + Math.random() * 0.25})`;
    g.lineWidth = 1 + Math.random() * 4;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 6);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function feltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#1f5240';
  g.fillRect(0, 0, 1024, 1024);
  const img = g.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // 분필로 그린 듯한 놓는 자리
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = 5;
  g.setLineDash([22, 16]);
  g.beginPath();
  g.ellipse(512, 512, 330, 220, 0, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(512, 512, 490, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
