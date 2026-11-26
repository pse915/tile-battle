// 급식 다섯! 3D: 급식실 테이블, 자리마다 뒤집힌 더미 + 공개 더미(맨 위 카드), 가운데 반짝이는 종
// 반짝임은 늘 똑같이 — 합이 5가 되는 순간을 알려 주는 효과는 절대 넣지 않음 (힌트 금지)
import { TableStage, THREE, cardMesh, canvasTexture } from '../../../shared/table3d.js';
import { tween, ease, wait } from '../../../shared/anim.js';
import { cardTexture, backTexture, CARD_W, CARD_H, CARD_T } from './cards.js';

const TABLE_W = 13;
const TABLE_D = 9;
const STACK_STEP = 0.012;

function drawFelt(ctx, w, h) {
  // 급식실 테이블: 연한 민트 상판 + 잔 점무늬
  ctx.fillStyle = '#d9efe6';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(70,120,110,.10)';
  for (let i = 0; i < 1600; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2 + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // 가운데 종 받침 자리 (둥근 매트)
  ctx.fillStyle = '#f7e3b3';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, h * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e2b866';
  ctx.lineWidth = 6;
  ctx.setLineDash([16, 10]);
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, h * 0.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, w - 28, h - 28);
}

// 한 기기 모드: 화면 가장자리와 맞는 자리
const SPOT = {
  bottom: { x: 0, z: 3.3 },
  top: { x: 0, z: -3.3 },
  left: { x: -5.4, z: 0 },
  right: { x: 5.4, z: 0 },
  bl: { x: -4.4, z: 2.7 },
  br: { x: 4.4, z: 2.7 },
  tl: { x: -4.4, z: -2.7 },
  tr: { x: 4.4, z: -2.7 },
};
export const EDGES = ['bottom', 'top', 'left', 'right'];

export class LunchStage {
  constructor(container) {
    this.stage = new TableStage(container, {
      bg: 0xbfdce6,
      floor: 0x9fb6bf,
      rim: 0xaab4bd,
      tableW: TABLE_W,
      tableD: TABLE_D,
      drawFelt,
      camera: { land: [0, 11.5, 7.6], target: [0, 0, 0.4], port: [0, 13, 4.2], portTarget: [0, 0, 0.3] },
    });
    this.s = this.stage;
    this.seats = [];
    this.onPick = null; // ({ seat } | { bell: true })
    this.s.onPick = (d) => this.onPick?.(d);
    this.buildRoom();
    this.buildBell();
  }

  setQuality(q) {
    this.s.setQuality(q);
  }
  setTitleMode(on) {
    this.s.setTitleMode(on);
  }

  /** 'top'이면 한 기기 파티용 머리 위 카메라 */
  setCamera(kind) {
    this.s.o.camera =
      kind === 'top'
        ? { land: [0, 15.5, 1.2], target: [0, 0, 0.05], port: [0, 14, 0.9], portTarget: [0, 0, 0] }
        : { land: [0, 11.5, 7.6], target: [0, 0, 0.4], port: [0, 13, 4.2], portTarget: [0, 0, 0.3] };
    this.s.resize();
  }

  buildRoom() {
    const g = this.s.group;
    // 테이블 다리 + 의자 몇 개 + 식판 장식
    const legMat = new THREE.MeshStandardMaterial({ color: 0x8c96a0, metalness: 0.6, roughness: 0.35 });
    [
      [-TABLE_W / 2 + 0.6, -TABLE_D / 2 + 0.6],
      [TABLE_W / 2 - 0.6, -TABLE_D / 2 + 0.6],
      [-TABLE_W / 2 + 0.6, TABLE_D / 2 - 0.6],
      [TABLE_W / 2 - 0.6, TABLE_D / 2 - 0.6],
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.8, 12), legMat);
      leg.position.set(x, -1.6, z);
      g.add(leg);
    });
    const stoolMat = new THREE.MeshStandardMaterial({ color: 0xff9f43, roughness: 0.5 });
    [
      [-3, TABLE_D / 2 + 1.4],
      [3, TABLE_D / 2 + 1.4],
      [-3, -TABLE_D / 2 - 1.4],
      [3, -TABLE_D / 2 - 1.4],
      [-TABLE_W / 2 - 1.4, 0],
      [TABLE_W / 2 + 1.4, 0],
    ].forEach(([x, z], i) => {
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.22, 24), i % 2 ? stoolMat : new THREE.MeshStandardMaterial({ color: 0x48c9b0, roughness: 0.5 }));
      seat.position.set(x, -1.0, z);
      g.add(seat);
    });
    // 식판(스테인리스) 장식 두 개
    const trayTex = canvasTexture(
      'lf-tray',
      (ctx, w, h) => {
        ctx.fillStyle = '#c9d1d8';
        ctx.fillRect(0, 0, w, h);
        const cells = [
          [12, 12, 70, 50],
          [92, 12, 70, 50],
          [172, 12, 72, 50],
          [12, 72, 112, 50],
          [134, 72, 110, 50],
        ];
        cells.forEach(([x, y, cw, ch]) => {
          const gr = ctx.createLinearGradient(x, y, x, y + ch);
          gr.addColorStop(0, '#9aa6b0');
          gr.addColorStop(1, '#e6ebef');
          ctx.fillStyle = gr;
          ctx.fillRect(x, y, cw, ch);
        });
      },
      256,
      134,
    );
    this.trays = [];
    [
      [-5.0, -3.4, 0.25],
      [5.1, 3.4, -0.3],
    ].forEach(([x, z, r]) => {
      const tray = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.06, 1.0),
        [0, 0, 0, 0, 0, 0].map((_, i) => (i === 2 ? new THREE.MeshStandardMaterial({ map: trayTex, metalness: 0.5, roughness: 0.35 }) : legMat)),
      );
      tray.position.set(x, 0.03, z);
      tray.rotation.y = r;
      tray.receiveShadow = true;
      g.add(tray);
      this.trays.push(tray);
    });
  }

  buildBell() {
    const b = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.5 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.22, 40), baseMat);
    base.position.y = 0.11;
    base.castShadow = true;
    b.add(base);
    this.domeMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.85, roughness: 0.22, emissive: 0x6a4300, emissiveIntensity: 0.25 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.72, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), this.domeMat);
    dome.position.y = 0.2;
    dome.castShadow = true;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.22, 16), new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: 0.9, roughness: 0.2 }));
    knob.position.y = 0.95;
    const knobTop = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 12), knob.material);
    knobTop.position.y = 1.08;
    this.dome = new THREE.Group();
    this.dome.add(dome, knob, knobTop);
    b.add(this.dome);
    // 고르기용 투명 원통
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.3, 16), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = 0.6;
    hit.userData = { bell: true };
    b.add(hit);
    this.s.pickables.add(hit);
    // 퍼지는 고리 (칠 때만)
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.95, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.position.y = 0.05;
    b.add(this.wave);
    const glow = new THREE.PointLight(0xffd36b, 0.6, 5);
    glow.position.set(0, 1.6, 0);
    b.add(glow);
    this.bell = b;
    this.s.group.add(b);
    // 늘 같은 속도로 반짝 (상태와 무관)
    let t = 0;
    this.s.frame.add((dt) => {
      t += dt;
      this.domeMat.emissiveIntensity = 0.2 + Math.sin(t * 2.2) * 0.08;
    });
  }

  /** 종 흔들기 + 퍼지는 고리 */
  ringBell(ok = true) {
    const d = this.dome;
    const w = this.wave;
    w.material.color.set(ok ? 0xfff2a8 : 0xff7a7a);
    tween({
      duration: 0.7,
      ease: ease.linear,
      update: (k) => {
        const damp = 1 - k;
        d.rotation.z = Math.sin(k * 30) * 0.18 * damp;
        d.rotation.x = Math.cos(k * 26) * 0.1 * damp;
        const sq = 1 - Math.sin(Math.min(1, k * 6) * Math.PI) * 0.12;
        d.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        w.scale.setScalar(1 + k * 2.6);
        w.material.opacity = 0.9 * damp;
      },
      complete: () => {
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        w.material.opacity = 0;
      },
    });
    if (!ok) this.s.shake = 0.35;
  }

  /**
   * 자리 배치: spots[seat] = 'bottom' 같은 이름 또는 null(고르게 둘러앉기, me가 아래)
   */
  setLayout(n, { me = 0, edges = null } = {}) {
    this.seats.forEach((st) => {
      this.s.group.remove(st.group);
      this.s.pickables.delete(st.pileHit);
    });
    this.seats = [];
    for (let i = 0; i < n; i++) {
      let x;
      let z;
      if (edges && edges[i]) ({ x, z } = SPOT[edges[i]]);
      else {
        const k = (i - me + n) % n;
        const a = Math.PI / 2 + (k * Math.PI * 2) / n;
        // 세로 화면은 좌우가 좁으니 타원을 세로로 길게
        const tall = this.s.camera.aspect < 1;
        x = Math.cos(a) * (tall ? 2.6 : 5.0);
        z = Math.sin(a) * (tall ? 4.3 : 3.3);
      }
      const yaw = Math.atan2(x, z); // 카드 위쪽이 가운데를 향하게 (주인 쪽에서 바로 보임)
      const pos = new THREE.Vector3(x, 0, z);
      const toC = pos.clone().multiplyScalar(-1).normalize();
      const side = new THREE.Vector3(toC.z, 0, -toC.x); // 주인 기준 오른쪽
      const pilePos = pos.clone().add(side.clone().multiplyScalar(-0.75));
      const openPos = pos.clone().multiplyScalar(0.5).add(side.clone().multiplyScalar(0.0));
      const group = new THREE.Group();
      this.s.group.add(group);
      const pile = cardMesh({ w: CARD_W, h: CARD_H, t: CARD_T, face: backTexture(), back: backTexture(), side: 0xf0ede4 });
      pile.rotation.y = yaw;
      group.add(pile);
      const pileHit = new THREE.Mesh(new THREE.BoxGeometry(CARD_W * 1.2, 0.8, CARD_H * 1.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      pileHit.position.copy(pilePos).setY(0.3);
      pileHit.rotation.y = yaw;
      pileHit.userData = { seat: i };
      group.add(pileHit);
      this.s.pickables.add(pileHit);
      const openStack = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, 1, CARD_H), new THREE.MeshStandardMaterial({ color: 0xf5f1e6, roughness: 0.7 }));
      openStack.rotation.y = yaw;
      openStack.castShadow = true;
      group.add(openStack);
      const top = cardMesh({ w: CARD_W, h: CARD_H, t: CARD_T, face: backTexture(), back: backTexture() });
      top.rotation.y = yaw;
      group.add(top);
      // 탈락 표시용 회색 판
      const outMark = new THREE.Mesh(new THREE.CircleGeometry(0.55, 28), new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.35, depthWrite: false }));
      outMark.rotation.x = -Math.PI / 2;
      outMark.position.copy(pilePos).setY(0.01);
      outMark.visible = false;
      group.add(outMark);
      const st = { i, pos, yaw, pilePos, openPos, group, pile, pileHit, openStack, top, outMark, pileCount: 0, openCount: 0, topCode: null };
      this.seats.push(st);
      this.setPile(i, 0);
      this.setOpen(i, null, 0);
    }
  }

  setPile(i, count) {
    const st = this.seats[i];
    if (!st) return;
    st.pileCount = count;
    const h = Math.max(CARD_T, count * STACK_STEP);
    st.pile.visible = count > 0;
    st.pile.scale.y = h / CARD_T;
    st.pile.position.copy(st.pilePos).setY(h / 2);
  }

  setOpen(i, code, count) {
    const st = this.seats[i];
    if (!st) return;
    st.openCount = count;
    st.topCode = code;
    const h = Math.max(0.001, (count - 1) * STACK_STEP);
    st.openStack.visible = count > 1;
    st.openStack.scale.y = h;
    st.openStack.position.copy(st.openPos).setY(h / 2);
    st.top.visible = !!code && count > 0;
    if (code) {
      st.top.material[2].map = cardTexture(code);
      st.top.material[2].needsUpdate = true;
    }
    st.top.position.copy(st.openPos).setY((count > 1 ? h : 0) + CARD_T / 2);
    st.top.rotation.set(0, st.yaw, 0);
  }

  setOut(i, out) {
    const st = this.seats[i];
    if (st) st.outMark.visible = !!out;
  }

  /** 서버 상태 비슷한 것 { piles:[n], open:[{top,count}], out:[] } 그대로 맞추기 */
  sync(lf) {
    if (!lf) return;
    lf.piles.forEach((n, i) => this.setPile(i, n));
    lf.open.forEach((o, i) => this.setOpen(i, o.top, o.count));
    (lf.out || []).forEach((o, i) => this.setOut(i, o));
  }

  /** 더미 맨 위 카드를 뒤집어 공개 더미로 */
  async animateFlip(i, code, dur = 0.32) {
    const st = this.seats[i];
    if (!st) return;
    const m = cardMesh({ w: CARD_W, h: CARD_H, t: CARD_T, face: cardTexture(code), back: backTexture() });
    m.position.copy(st.pilePos).setY(st.pileCount * STACK_STEP + 0.02);
    m.rotation.set(0, st.yaw, Math.PI);
    this.s.group.add(m);
    this.setPile(i, Math.max(0, st.pileCount - 1));
    const to = st.openPos.clone().setY(st.openCount * STACK_STEP + CARD_T);
    await this.s.moveTo(m, { pos: to, rotZ: 0, duration: dur, lift: 0.7 });
    this.s.group.remove(m);
    this.setOpen(i, code, st.openCount + 1);
  }

  /** 맞힘: 모든 공개 카드가 친 사람 더미로 날아감 */
  async animateCollect(seat, dur = 0.5) {
    const dst = this.seats[seat];
    if (!dst) return;
    const flying = [];
    let got = 0;
    this.seats.forEach((st) => {
      if (!st.openCount) return;
      got += st.openCount;
      const m = cardMesh({ w: CARD_W, h: CARD_H, t: CARD_T, face: st.topCode ? cardTexture(st.topCode) : backTexture(), back: backTexture() });
      m.position.copy(st.top.position);
      m.rotation.set(0, st.yaw, 0);
      this.s.group.add(m);
      this.setOpen(st.i, null, 0);
      flying.push(m);
    });
    await Promise.all(flying.map((m, k) => this.s.moveTo(m, { pos: dst.pilePos.clone().setY(dst.pileCount * STACK_STEP + 0.05), rotZ: Math.PI, rotY: dst.yaw, duration: dur, delay: k * 0.05, lift: 1.4 })));
    flying.forEach((m) => this.s.group.remove(m));
    this.setPile(seat, dst.pileCount + got);
  }

  /** 틀림: 친 사람 더미에서 다른 사람들에게 1장씩 */
  async animateGive(seat, to, dur = 0.45) {
    const src = this.seats[seat];
    if (!src || !to.length) return;
    const flying = to.map((t, k) => {
      const m = cardMesh({ w: CARD_W, h: CARD_H, t: CARD_T, face: backTexture(), back: backTexture() });
      m.position.copy(src.pilePos).setY(src.pileCount * STACK_STEP + 0.03);
      m.rotation.set(0, src.yaw, 0);
      this.s.group.add(m);
      const dst = this.seats[t];
      return this.s
        .moveTo(m, { pos: dst.pilePos.clone().setY(dst.pileCount * STACK_STEP + 0.05), rotY: dst.yaw, duration: dur, delay: k * 0.07, lift: 1.0 })
        .then(() => {
          this.s.group.remove(m);
          this.setPile(t, dst.pileCount + 1);
        });
    });
    this.setPile(seat, Math.max(0, src.pileCount - to.length));
    await Promise.all(flying);
  }

  /** 이름표 위치 (더미 뒤쪽, 화면 좌표) */
  labelPoint(i) {
    const st = this.seats[i];
    if (!st) return null;
    const p = st.pos.clone().multiplyScalar(1.12).setY(0.4);
    return this.s.project(p);
  }

  /** 튜토리얼 강조용 화면 사각형 */
  bellRect() {
    const a = this.s.project(new THREE.Vector3(-1, 0, -1));
    const b = this.s.project(new THREE.Vector3(1, 1.2, 1));
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  }
  openRect() {
    const pts = this.seats.map((st) => this.s.project(st.openPos));
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = 50;
    return { left: Math.min(...xs) - pad, top: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + pad * 2, height: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  }

  celebrate() {
    this.s.shake = 0.25;
  }

  wait(sec) {
    return wait(sec);
  }
}
