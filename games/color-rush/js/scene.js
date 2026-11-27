// 컬러 러시 3D: 칠판 테이블 가운데 버린 더미(살짝 비틀려 쌓임)와 뽑을 더미,
// 자리마다 뒷면 카드 부채, 방향 화살표 링(지금 색으로 물듦, 방향을 바꾸면 뒤집혀 돎)
import { TableStage, THREE, canvasTexture, toonMat, addOutline } from '../../../shared/table3d.js';
import { tween, ease, wait } from '../../../shared/anim.js';
import { cardTex, backTex } from './cards.js';
import { COLOR_HEX } from './rules.js';

const CARD_W = 0.9;
const CARD_H = 1.35;
const CARD_T = 0.018;
const DRAW_POS = new THREE.Vector3(-0.72, 0, 0);
const DISCARD_POS = new THREE.Vector3(0.72, 0, 0);
const PILE_SHOW = 7;
const INK = 0x1f3550; // 외곽선: 진한 남색
const EDGE = 0xf2c98a; // 카드 옆면

// 카툰 카드 메시: 위(+y) 앞면, 아래 뒷면, 남색 외곽선
const geoCache = new Map();
const matCache = new Map();
let sideToon = null;
let outlinesOn = true;
function texMat(tex) {
  if (!matCache.has(tex)) matCache.set(tex, toonMat(0xffffff, { map: tex }));
  return matCache.get(tex);
}
function cardMesh({ w, h, t, face, back }) {
  sideToon ||= toonMat(EDGE);
  const k = w + ',' + h;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, t, h));
  const m = new THREE.Mesh(geoCache.get(k), [sideToon, sideToon, texMat(face), texMat(back), sideToon, sideToon]);
  m.castShadow = true;
  m.receiveShadow = true;
  addOutline(m, { color: INK, thickness: 0.022 }).visible = outlinesOn;
  return m;
}

const ME_POS = new THREE.Vector3(0, 1.6, 4.6); // 화면 아래(내 손) 쪽

function drawFelt(ctx, w, h) {
  // 밝은 초록 칠판(단색) + 굵은 분필 낙서 몇 개
  ctx.fillStyle = '#3f9474';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 70;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.3);
  ctx.quadraticCurveTo(w / 2, h * 0.22, w * 0.9, h * 0.34);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.font = '42px Jua, sans-serif';
  ctx.textAlign = 'center';
  const doodles = ['3 × 7 = 21', '★ 참 잘했어요', '가 나 다', '♪ ♫', '½ + ¼ = ¾', '시험 끝!'];
  const spots = [[0.13, 0.2], [0.85, 0.22], [0.12, 0.8], [0.88, 0.78], [0.5, 0.08], [0.5, 0.93]];
  doodles.forEach((t, i) => {
    ctx.save();
    ctx.translate(spots[i][0] * w, spots[i][1] * h);
    ctx.rotate((i % 2 ? 1 : -1) * 0.12);
    ctx.fillText(t, 0, 0);
    ctx.restore();
  });
}

/** 방향 링 그림: 시계 방향(캔버스 기준)으로 도는 꺾쇠 화살표 */
function drawRing(ctx, w) {
  const c = w / 2;
  const R0 = (1.78 / 2.15) * c;
  const R1 = c - 2;
  const mid = (R0 + R1) / 2;
  ctx.clearRect(0, 0, w, w);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = R1 - R0 - 6;
  ctx.beginPath();
  ctx.arc(c, c, mid, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const x = c + Math.cos(a) * mid;
    const y = c + Math.sin(a) * mid;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2); // 진행 방향 (각도가 커지는 쪽 = 캔버스에서 시계 방향)
    const s = (R1 - R0) * 0.42;
    ctx.beginPath();
    ctx.moveTo(s * 1.1, 0);
    ctx.lineTo(-s * 0.4, -s);
    ctx.lineTo(-s * 0.05, 0);
    ctx.lineTo(-s * 0.4, s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export class CRStage {
  constructor(container) {
    this.stage = new TableStage(container, {
      bg: 0xfbe9c6,
      floor: 0xe8be8a,
      rim: 0xd98f55,
      toon: true,
      fitWidth: 9.4,
      tableW: 13,
      tableD: 9.4,
      drawFelt,
      camera: { land: [0, 10.2, 7.4], target: [0, 0, 0.55], port: [0, 12.6, 3.6], portTarget: [0, 0, 0.25] },
    });
    this.s = this.stage;
    this.n = 4;
    this.me = 0;
    this.counts = [];
    this.fans = [];
    this.pileMeshes = [];
    this.pileCodes = [];
    this.drawCount = 0;
    this.dir = 1;
    this.turn = -1;
    this.onDraw = null;
    outlinesOn = this.s.outlinesOn !== false;
    this.build();
    this.s.onPick = (d) => d.drawPile && this.onDraw?.();
    this.s.onResize = () => this.layoutSeats();
  }

  setQuality(q) {
    this.s.setQuality(q);
    outlinesOn = this.s.outlinesOn !== false;
  }
  setTitleMode(on) {
    this.s.setTitleMode(on);
  }

  build() {
    const g = this.s.group;
    // 뽑을 더미
    this.drawGroup = new THREE.Group();
    this.drawGroup.position.copy(DRAW_POS);
    g.add(this.drawGroup);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(CARD_W * 1.2, 0.6, CARD_H * 1.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = 0.3;
    hit.userData = { drawPile: true };
    this.drawGroup.add(hit);
    this.s.pickables.add(hit);
    this.drawGlow = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 1.3, CARD_H * 1.25), new THREE.MeshBasicMaterial({ color: 0xffe36a, transparent: true, opacity: 0, depthWrite: false }));
    this.drawGlow.rotation.x = -Math.PI / 2;
    this.drawGlow.position.y = 0.004;
    this.drawGroup.add(this.drawGlow);
    this.drawStack = [];
    // 버린 더미
    this.pileGroup = new THREE.Group();
    this.pileGroup.position.copy(DISCARD_POS);
    g.add(this.pileGroup);
    // 방향 링 (지금 색으로 물듦)
    this.ringGroup = new THREE.Group();
    this.ringGroup.position.y = 0.006;
    g.add(this.ringGroup);
    const tex = canvasTexture('cr-ring', (ctx, w) => drawRing(ctx, w), 512, 512);
    this.ringMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xffffff });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.78, 2.15, 96), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    this.ringGroup.add(ring);
    // 지금 색 받침 (버린 더미 밑 빛)
    this.colorGlow = new THREE.Mesh(new THREE.CircleGeometry(1.0, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.colorGlow.rotation.x = -Math.PI / 2;
    this.colorGlow.position.set(DISCARD_POS.x, 0.003, 0);
    g.add(this.colorGlow);
    // 차례 표시
    this.turnMark = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.08, 48), new THREE.MeshBasicMaterial({ color: 0xffe36a, transparent: true, opacity: 0.7, depthWrite: false }));
    this.turnMark.rotation.x = -Math.PI / 2;
    this.turnMark.visible = false;
    g.add(this.turnMark);
    // 분필 받침 장식
    const tray = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.35), toonMat(0xc9844a));
    addOutline(tray, { color: INK, thickness: 0.03 }).visible = outlinesOn;
    tray.position.set(4.2, 0.06, -3.9);
    tray.castShadow = true;
    g.add(tray);
    ['#ffffff', '#3ad6b4', '#ff5ca8', '#ff9a2e'].forEach((c, i) => {
      const chalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 12), toonMat(c));
      addOutline(chalk, { color: INK, thickness: 0.02 }).visible = outlinesOn;
      chalk.rotation.z = Math.PI / 2;
      chalk.rotation.y = (i - 1.5) * 0.15;
      chalk.position.set(3.3 + i * 0.6, 0.18, -3.88);
      g.add(chalk);
    });
    this.ringSpin = 0;
    let t = 0;
    this.s.frame.add((dt) => {
      t += dt;
      this.ringGroup.rotation.y -= dt * 0.35 * this.dir;
      this.turnMark.material.opacity = 0.45 + Math.sin(t * 4) * 0.25;
      this.drawGlow.material.opacity = this.drawHint ? 0.3 + Math.sin(t * 5) * 0.2 : 0;
    });
  }

  // ---------- 자리 ----------
  /** 자리의 탁자 위 위치: 나(또는 0번)는 아래, 차례 순서대로 시계 방향 */
  seatPos(seat) {
    if (seat === this.me && this.me >= 0) return ME_POS.clone();
    return this.seatTablePos(seat);
  }
  seatTablePos(seat) {
    const ref = this.me >= 0 ? this.me : 0;
    const r = (seat - ref + this.n) % this.n;
    const th = Math.PI / 2 + (r * Math.PI * 2) / this.n;
    const port = this.s.portrait;
    const rx = port ? 2.55 : 4.9;
    const rz = port ? 3.8 : 3.05;
    return new THREE.Vector3(Math.cos(th) * rx, 0, Math.sin(th) * rz);
  }
  /** 이름표 자리 (화면 좌표용 3D 점) */
  labelPos(seat) {
    const p = this.seatTablePos(seat);
    const out = p.clone().setY(0).normalize();
    return p.add(out.multiplyScalar(0.25)).setY(0.9);
  }

  setPlayers(n, me) {
    if (n === this.n && me === this.me && this.fans.length === n) return;
    this.n = n;
    this.me = me;
    this.fans.forEach((f) => f && this.s.group.remove(f.group));
    this.fans = [];
    for (let i = 0; i < n; i++) {
      if (i === me) {
        this.fans.push(null);
        continue;
      }
      const group = new THREE.Group();
      this.s.group.add(group);
      this.fans.push({ group, cards: [], count: -1 });
    }
    this.layoutSeats();
  }

  layoutSeats() {
    this.fans.forEach((f, i) => {
      if (!f) return;
      const p = this.seatTablePos(i);
      f.group.position.copy(p);
      f.group.rotation.y = Math.atan2(p.x, p.z);
    });
    this.placeTurnMark();
  }

  setFan(seat, count) {
    const f = this.fans[seat];
    if (!f || f.count === count) return;
    f.count = count;
    const show = Math.min(count, 12);
    while (f.cards.length > show) f.group.remove(f.cards.pop());
    while (f.cards.length < show) {
      const m = cardMesh({ w: CARD_W * 0.8, h: CARD_H * 0.8, t: CARD_T, face: backTex(), back: backTex() });
      f.group.add(m);
      f.cards.push(m);
    }
    const step = show > 8 ? 0.09 : 0.13;
    f.cards.forEach((m, i) => {
      const a = (i - (show - 1) / 2) * step;
      m.position.set(Math.sin(a) * 1.5, 0.02 + i * 0.012, 1.5 - Math.cos(a) * 1.5);
      m.rotation.set(0, -a, 0);
    });
  }

  setTurn(seat) {
    this.turn = seat;
    this.placeTurnMark();
  }
  placeTurnMark() {
    const s = this.turn;
    this.turnMark.visible = s >= 0 && s !== this.me && !!this.fans[s];
    if (this.turnMark.visible) this.turnMark.position.copy(this.seatTablePos(s)).setY(0.005);
  }

  setDrawHint(on) {
    this.drawHint = on;
  }

  // ---------- 더미 ----------
  setDrawCount(n) {
    this.drawCount = Math.max(0, n);
    const show = n <= 0 ? 0 : Math.min(18, Math.ceil(n / 6));
    while (this.drawStack.length > show) this.drawGroup.remove(this.drawStack.pop());
    while (this.drawStack.length < show) {
      const m = cardMesh({ w: CARD_W, h: CARD_H, t: CARD_T, face: backTex(), back: backTex() });
      const i = this.drawStack.length;
      m.position.set((Math.random() - 0.5) * 0.03, 0.01 + i * 0.024, (Math.random() - 0.5) * 0.03);
      m.rotation.y = (Math.random() - 0.5) * 0.06;
      this.drawGroup.add(m);
      this.drawStack.push(m);
    }
  }
  drawTop() {
    return DRAW_POS.clone().setY(0.03 + this.drawStack.length * 0.024);
  }

  pileTopPos() {
    return DISCARD_POS.clone().setY(0.012 + this.pileMeshes.length * 0.02);
  }

  addPileCard(code, mesh = null) {
    const m = mesh || cardMesh({ w: CARD_W, h: CARD_H, t: CARD_T, face: cardTex(code), back: backTex() });
    if (!mesh) {
      m.position.copy(this.pileTopPos());
      m.rotation.y = (Math.random() - 0.5) * 0.7;
      m.position.x += (Math.random() - 0.5) * 0.12;
      m.position.z += (Math.random() - 0.5) * 0.12;
    }
    m.position.sub(DISCARD_POS);
    this.pileGroup.add(m);
    this.pileMeshes.push(m);
    this.pileCodes.push(code);
    while (this.pileMeshes.length > PILE_SHOW) {
      this.pileGroup.remove(this.pileMeshes.shift());
      this.pileCodes.shift();
      this.pileMeshes.forEach((p) => (p.position.y -= 0.02));
    }
  }

  setPile(codes) {
    const cur = this.pileCodes.slice(-codes.length).join();
    if (cur === codes.join() && this.pileCodes.length >= codes.length) return;
    this.pileMeshes.forEach((m) => this.pileGroup.remove(m));
    this.pileMeshes = [];
    this.pileCodes = [];
    codes.forEach((c) => this.addPileCard(c));
  }

  setColor(col) {
    const hex = new THREE.Color(COLOR_HEX[col] || '#ffffff');
    this.ringMat.color.copy(hex);
    this.colorGlow.material.color.copy(hex);
  }

  setDir(dir, animate = false) {
    if (dir === this.dir && !animate) {
      this.ringGroup.scale.x = dir;
      return Promise.resolve();
    }
    const from = this.ringGroup.scale.x;
    this.dir = dir;
    if (!animate) {
      this.ringGroup.scale.x = dir;
      return Promise.resolve();
    }
    return tween({
      duration: 0.6,
      ease: ease.inOutCubic,
      update: (k) => {
        this.ringGroup.scale.x = from + (dir - from) * k;
        this.ringGroup.position.y = 0.006 + Math.sin(k * Math.PI) * 0.4;
      },
    });
  }

  /** 상태에 바로 맞추기 (애니메이션 없이) */
  sync(cr, n, me) {
    this.setPlayers(n, me);
    cr.counts.forEach((c, i) => this.setFan(i, c));
    this.setDrawCount(cr.drawCount);
    this.setPile(cr.pile);
    this.setColor(cr.color);
    this.setDir(cr.dir);
    this.setTurn(cr.phase === 'over' ? -1 : cr.turn);
  }

  // ---------- 연출 ----------
  /** 카드를 자리에서 버린 더미로 */
  async animatePlay(seat, code) {
    const m = cardMesh({ w: CARD_W, h: CARD_H, t: CARD_T, face: cardTex(code), back: backTex() });
    const from = this.seatPos(seat);
    const mine = seat === this.me;
    m.position.copy(from).setY(mine ? from.y : 0.4);
    m.rotation.set(0, mine ? 0 : this.fans[seat]?.group.rotation.y || 0, mine ? 0 : Math.PI);
    this.s.group.add(m);
    if (this.counts) this.setFan(seat, Math.max(0, (this.fans[seat]?.count ?? 1) - 1));
    const to = this.pileTopPos();
    to.x += (Math.random() - 0.5) * 0.12;
    to.z += (Math.random() - 0.5) * 0.12;
    await this.s.moveTo(m, { pos: to, rotY: (Math.random() - 0.5) * 0.7, rotZ: 0, duration: 0.42, lift: 0.9 });
    this.s.group.remove(m);
    this.addPileCard(code, m);
    this.boing(m);
  }

  /** 내려앉을 때 살짝 통통 */
  boing(m, amount = 1) {
    return tween({
      duration: 0.32,
      ease: ease.linear,
      update: (k) => {
        const w = Math.sin(k * Math.PI * 2) * Math.exp(-k * 3) * 0.12 * amount;
        m.scale.set(1 + w, 1, 1 + w);
      },
      complete: () => m.scale.set(1, 1, 1),
    });
  }

  /** 뽑을 더미에서 자리로 n장 */
  async animateDraw(seat, n) {
    const jobs = [];
    for (let i = 0; i < n; i++) {
      const m = cardMesh({ w: CARD_W, h: CARD_H, t: CARD_T, face: backTex(), back: backTex() });
      m.position.copy(this.drawTop());
      this.s.group.add(m);
      const to = this.seatPos(seat);
      if (seat !== this.me) to.setY(0.3);
      jobs.push(
        this.s.moveTo(m, { pos: to, rotY: this.fans[seat]?.group.rotation.y || 0, duration: 0.36, lift: 0.7, delay: i * 0.09 }).then(() => {
          this.s.group.remove(m);
          const f = this.fans[seat];
          if (f) this.setFan(seat, f.count + 1);
        }),
      );
    }
    this.setDrawCount(this.drawCount - n);
    await Promise.all(jobs);
  }

  /** 버린 더미 → 뽑을 더미로 섞어 넣기 */
  async animateRecycle(count) {
    const keep = this.pileCodes[this.pileCodes.length - 1];
    const olds = this.pileMeshes.slice(0, -1);
    await Promise.all(olds.map((m, i) => this.s.moveTo(m, { pos: DRAW_POS.clone().sub(DISCARD_POS).setY(0.1), rotZ: Math.PI, duration: 0.3, delay: i * 0.03 })));
    this.pileMeshes.forEach((m) => this.pileGroup.remove(m));
    this.pileMeshes = [];
    this.pileCodes = [];
    if (keep) this.addPileCard(keep);
    this.setDrawCount(count);
  }

  /** 건너뛰어진 자리 살짝 흔들기 */
  bump(seat) {
    const f = this.fans[seat];
    if (!f) return;
    const y0 = f.group.position.y;
    tween({ duration: 0.4, update: (k) => (f.group.position.y = y0 + Math.sin(k * Math.PI * 3) * 0.15 * (1 - k)) });
  }

  celebrate() {
    this.s.shake = 0.4;
  }

  /** 화면 좌표: 튜토리얼 강조용 */
  rectOf(center, w, h) {
    const a = this.s.project(center.clone().add(new THREE.Vector3(-w / 2, 0, -h / 2)));
    const b = this.s.project(center.clone().add(new THREE.Vector3(w / 2, 0, h / 2)));
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  }
  pileRect() {
    return this.rectOf(DISCARD_POS, CARD_W * 1.5, CARD_H * 1.3);
  }
  drawRect() {
    return this.rectOf(DRAW_POS, CARD_W * 1.4, CARD_H * 1.3);
  }
  centerRect() {
    return this.rectOf(new THREE.Vector3(0, 0, 0), 4.4, 4.4);
  }

  wait(sec) {
    return wait(sec);
  }
}
