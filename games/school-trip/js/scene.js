// 서라벌학교여행 3D: 정사각형 판(테두리 40칸) · 툰 말 · 3D 주사위 · 칸 위 작은 건물 블록
import { TableStage, THREE, canvasTexture, toonMat, addOutline, roundRect } from '../../../shared/table3d.js';
import { tween, ease, wait } from '../../../shared/anim.js';
import { CELLS, FLOOR_COLORS, GROUP_COLORS, won } from './rules.js';

const CELL = 0.9;
const HALF = CELL * 5; // 판 가운데에서 바깥 칸 중심까지
const BOARD = CELL * 11;
const TOP = 0.16; // 판 윗면 높이
export const PAWN_COLORS = [0xff6b8a, 0x4fa3ff, 0x52c97a, 0xffb02e];
export const PAWN_CSS = ['#ff6b8a', '#4fa3ff', '#52c97a', '#ffb02e'];
const OUTLINE = 0x2d2f4a;

/** 칸 i의 중심 (시계 방향: 오른쪽 아래 교문 → 왼쪽 → 위 → 오른쪽) */
export function cellXZ(i) {
  i = ((i % 40) + 40) % 40;
  if (i <= 10) return [HALF - i * CELL, HALF];
  if (i <= 20) return [-HALF, HALF - (i - 10) * CELL];
  if (i <= 30) return [-HALF + (i - 20) * CELL, -HALF];
  return [HALF, -HALF + (i - 30) * CELL];
}
/** 칸이 놓인 변: 0 아래 · 1 왼쪽 · 2 위 · 3 오른쪽 (모서리는 -1) */
const sideOf = (i) => (i % 10 === 0 ? -1 : Math.floor(i / 10));
export const cellPos = (i, y = TOP) => {
  const [x, z] = cellXZ(i);
  return new THREE.Vector3(x, y, z);
};

const IMG = {};
function loadImg(name) {
  if (IMG[name]) return IMG[name];
  IMG[name] = new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = new URL(`../assets/${name}.png`, import.meta.url).href;
  });
  return IMG[name];
}

function fitText(ctx, text, max, size, font = 'Jua') {
  let s = size;
  ctx.font = `${s}px ${font}, sans-serif`;
  while (ctx.measureText(text).width > max && s > 10) {
    s -= 2;
    ctx.font = `${s}px ${font}, sans-serif`;
  }
}

/** 판 윗면 전체를 한 장의 캔버스로 */
function drawBoard(ctx, W, school) {
  const u = W / 11; // 한 칸 크기(px)
  ctx.fillStyle = '#fff6df';
  ctx.fillRect(0, 0, W, W);
  // 가운데
  const g = ctx.createLinearGradient(0, u, 0, W - u);
  g.addColorStop(0, '#c9ecff');
  g.addColorStop(1, '#e9fbe9');
  ctx.fillStyle = g;
  ctx.fillRect(u, u, W - 2 * u, W - 2 * u);
  ctx.save();
  ctx.translate(W / 2, W / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (school) {
    ctx.imageSmoothingEnabled = false;
    const iw = u * 6.6;
    const ih = (iw * school.height) / school.width;
    ctx.drawImage(school, -iw / 2, -ih / 2 + u * 0.9, iw, ih);
  }
  ctx.lineJoin = 'round';
  ctx.font = `${u * 0.95}px Jua, sans-serif`;
  ctx.lineWidth = u * 0.22;
  ctx.strokeStyle = '#2d2f4a';
  ctx.strokeText('서라벌학교여행', 0, -u * 2.1);
  ctx.fillStyle = '#ffe36a';
  ctx.fillText('서라벌학교여행', 0, -u * 2.1);
  ctx.font = `${u * 0.36}px Jua, sans-serif`;
  ctx.fillStyle = '#2d2f4a';
  ctx.fillText('서라벌여중 1층부터 4층까지 실을 모아라!', 0, -u * 1.25);
  // 층 안내
  ['1층', '2층', '3층', '4층'].forEach((t, k) => {
    ctx.fillStyle = FLOOR_COLORS[k];
    const x = (k - 1.5) * u * 1.3;
    roundRect(ctx, x - u * 0.55, u * 2.75, u * 1.1, u * 0.5, u * 0.15);
    ctx.fill();
    ctx.fillStyle = '#2d2f4a';
    ctx.font = `${u * 0.32}px Jua, sans-serif`;
    ctx.fillText(t, x, u * 3.01);
  });
  ctx.restore();
  // 칸
  for (let i = 0; i < 40; i++) {
    const [x, z] = cellXZ(i);
    const cx = W / 2 + (x / CELL) * u;
    const cy = W / 2 + (z / CELL) * u;
    const side = sideOf(i);
    ctx.save();
    ctx.translate(cx, cy);
    // 화면 아래에서 보는 사람이 읽기 쉽게: 아래·위 변은 똑바로, 왼쪽·오른쪽 변만 옆으로
    ctx.rotate(side === 1 ? Math.PI / 2 : side === 3 ? -Math.PI / 2 : 0);
    drawCell(ctx, i, u);
    ctx.restore();
  }
  ctx.strokeStyle = '#2d2f4a';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, W - 6);
  ctx.strokeRect(u, u, W - 2 * u, W - 2 * u);
}

function drawCell(ctx, i, u) {
  const c = CELLS[i];
  const h = u / 2;
  ctx.fillStyle = c.kind === 'mark' ? '#fff0b8' : c.kind === 'card' ? '#ffe6f2' : i % 10 === 0 ? '#e8f4ff' : '#ffffff';
  ctx.fillRect(-h, -h, u, u);
  ctx.strokeStyle = '#2d2f4a';
  ctx.lineWidth = 3;
  ctx.strokeRect(-h, -h, u, u);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2d2f4a';
  if (i % 10 === 0) {
    ctx.font = `${u * 0.42}px sans-serif`;
    ctx.fillText(c.icon, 0, -u * 0.12);
    fitText(ctx, c.name, u * 0.92, u * 0.22);
    ctx.fillText(c.name, 0, u * 0.3);
    if (i === 0) {
      ctx.font = `${u * 0.13}px Jua, sans-serif`;
      ctx.fillText('지나면 용돈', 0, -u * 0.4);
    }
    return;
  }
  if (c.kind === 'room') {
    // 위쪽(판 안쪽) 색 띠 = 색 그룹
    ctx.fillStyle = GROUP_COLORS[c.group];
    ctx.fillRect(-h, -h, u, u * 0.26);
    ctx.strokeRect(-h, -h, u, u * 0.26);
    ctx.fillStyle = '#2d2f4a';
    ctx.font = `${u * 0.15}px Jua, sans-serif`;
    ctx.fillText(c.floor + 1 + '층', 0, -h + u * 0.13);
  }
  if (c.kind === 'room') {
    const words = c.name.length > 5 && c.name.includes(' ') ? c.name.split(' ') : c.name.length > 5 ? [c.name.slice(0, Math.ceil(c.name.length / 2)), c.name.slice(Math.ceil(c.name.length / 2))] : [c.name];
    words.forEach((w, k) => {
      fitText(ctx, w, u * 0.9, u * 0.21);
      ctx.fillText(w, 0, u * 0.02 + (k - (words.length - 1) / 2) * u * 0.22);
    });
    ctx.font = `${u * 0.17}px Jua, sans-serif`;
    ctx.fillStyle = '#c0392b';
    ctx.fillText(won(c.price), 0, u * 0.36);
  } else {
    ctx.font = `${u * 0.36}px sans-serif`;
    ctx.fillText(c.icon, 0, -u * 0.12);
    const words = c.name.length > 5 && c.name.includes(' ') ? c.name.split(' ') : [c.name];
    words.forEach((w, k) => {
      fitText(ctx, w, u * 0.9, u * 0.18);
      ctx.fillText(w, 0, u * 0.2 + k * u * 0.18 - (words.length - 1) * 0.09 * u);
    });
    if (c.kind === 'mark') {
      ctx.font = `${u * 0.14}px Jua, sans-serif`;
      ctx.fillStyle = '#c0392b';
      ctx.fillText(won(c.price) + ' · 명소', 0, u * 0.4);
    }
  }
}

function drawFelt(ctx, w, h) {
  ctx.fillStyle = '#ffe9b8';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.18;
  for (let y = 0; y < h; y += 40)
    for (let x = (y / 40) % 2 ? 20 : 0; x < w; x += 40) {
      ctx.fillStyle = '#f5b971';
      ctx.fillRect(x, y, 20, 20);
    }
  ctx.globalAlpha = 1;
}

function pipTex(v) {
  return canvasTexture('st-die-' + v, (ctx, w) => {
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, w, w);
    ctx.fillStyle = v === 1 ? '#e84a5f' : '#2d2f4a';
    const P = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[v];
    P.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc((x * w) / 4, (y * w) / 4, v === 1 ? w * 0.13 : w * 0.09, 0, Math.PI * 2);
      ctx.fill();
    });
  }, 128, 128);
}
// 면 순서 +x,-x,+y,-y,+z,-z
const FACES = [3, 4, 1, 6, 2, 5];
const TOP_ROT = { 1: [0, 0], 6: [Math.PI, 0], 2: [-Math.PI / 2, 0], 5: [Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2] };

export class SchoolStage {
  constructor(container) {
    this.stage = new TableStage(container, {
      bg: 0xbfe8ff,
      floor: 0xa6dcf5,
      rim: 0xf2a65a,
      toon: true,
      fitWidth: BOARD + 0.5,
      tableW: 13.2,
      tableD: 12.6,
      drawFelt,
      camera: { land: [0, 13.2, 7.4], target: [0, 0, 0.5], port: [0, 13, 3.6], portTarget: [0, 0, 0.35] },
    });
    this.s = this.stage;
    this.onCell = null;
    this.pawns = [];
    this.blocks = new Array(40).fill(null);
    this.plates = new Array(40).fill(null);
    this.build();
    this.s.onPick = (d) => d.cell != null && this.onCell?.(d.cell);
    this.s.onHover = (d) => this.hover(d ? d.cell : null);
  }

  setQuality(q) {
    this.s.setQuality(q);
  }
  setTitleMode(on) {
    this.s.setTitleMode(on);
  }

  build() {
    const g = this.s.group;
    const tex = canvasTexture('st-board', (ctx, w) => drawBoard(ctx, w, null), 2048, 2048);
    loadImg('school').then((im) => {
      if (!im) return;
      drawBoard(tex.userData.canvas.getContext('2d'), 2048, im);
      tex.needsUpdate = true;
    });
    const frame = toonMat(0x7fc8f8);
    const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD + 0.3, 0.3, BOARD + 0.3), [frame, frame, toonMat(0xffffff, { map: tex }), frame, frame, frame]);
    board.position.y = TOP - 0.15;
    board.receiveShadow = true;
    addOutline(board, { color: OUTLINE, thickness: 0.05 });
    g.add(board);
    // 고르기용 투명 칸
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const pickGeo = new THREE.BoxGeometry(CELL * 0.96, 0.06, CELL * 0.96);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(pickGeo, pickMat);
      m.position.copy(cellPos(i, TOP + 0.02));
      m.userData = { cell: i };
      g.add(m);
      this.s.pickables.add(m);
    }
    // 강조 고리 (지금 칸 · 엘리베이터 고르기)
    this.hiMat = new THREE.MeshBasicMaterial({ color: 0xff8a5c, transparent: true, opacity: 0.85, depthWrite: false });
    this.hiGeo = new THREE.RingGeometry(0.28, 0.4, 32);
    this.hints = [];
    this.hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.44, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.visible = false;
    g.add(this.hoverRing);
    // 주사위 두 개
    this.dice = [0, 1].map((k) => {
      const mats = FACES.map((v) => toonMat(0xffffff, { map: pipTex(v) }));
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), mats);
      d.rotation.order = 'YXZ';
      d.castShadow = true;
      addOutline(d, { color: OUTLINE, thickness: 0.03 });
      d.position.set(-0.5 + k * 1.0, TOP + 0.31, 1.0);
      g.add(d);
      return d;
    });
    let t = 0;
    this.s.frame.add((dt) => {
      t += dt;
      this.hiMat.opacity = 0.65 + Math.sin(t * 5) * 0.25;
      this.pawns.forEach((p, k) => {
        if (p && p.userData.turn && !p.userData.moving) p.children[0].position.y = Math.abs(Math.sin(t * 4 + k)) * 0.12;
        else if (p) p.children[0].position.y = 0;
      });
    });
  }

  // ---------- 말 ----------
  makePawn(seat) {
    const root = new THREE.Group();
    const body = new THREE.Group();
    const mat = toonMat(PAWN_COLORS[seat]);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.12, 24), mat);
    base.position.y = 0.06;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.3, 24), mat);
    torso.position.y = 0.26;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), mat);
    head.position.y = 0.5;
    const white = toonMat(0xffffff);
    const ink = toonMat(0x2d2f4a);
    [-1, 1].forEach((sx) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), white);
      eye.position.set(sx * 0.055, 0.53, 0.125);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), ink);
      pupil.position.set(sx * 0.055, 0.53, 0.155);
      body.add(eye, pupil);
    });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 20), toonMat(0x2d2f4a));
    cap.position.y = 0.64;
    const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.26), toonMat(0x2d2f4a));
    capTop.position.y = 0.67;
    capTop.rotation.y = Math.PI / 4;
    [base, torso, head].forEach((m) => {
      m.castShadow = true;
      addOutline(m, { color: OUTLINE, thickness: 0.025 });
    });
    body.add(base, torso, head, cap, capTop);
    root.add(body);
    root.userData.seat = seat;
    if (this.s.outlinesOn === false) root.traverse((m) => m.userData.outline && (m.visible = false));
    return root;
  }

  pawnSpot(i, seat) {
    const p = cellPos(i);
    const off = [
      [-0.18, -0.12],
      [0.18, -0.12],
      [-0.18, 0.2],
      [0.18, 0.2],
    ][seat];
    p.x += off[0];
    p.z += off[1];
    return p;
  }

  setPlayers(n) {
    this.pawns.forEach((p) => p && this.s.group.remove(p));
    this.pawns = [];
    for (let s = 0; s < n; s++) {
      const p = this.makePawn(s);
      p.position.copy(this.pawnSpot(0, s));
      this.s.group.add(p);
      this.pawns.push(p);
    }
  }

  /** 상태에 맞춰 바로 놓기 */
  sync(st) {
    if (!st) return;
    if (this.pawns.length !== st.n) this.setPlayers(st.n);
    st.players.forEach((p, s) => {
      const m = this.pawns[s];
      m.visible = !p.out;
      if (!m.userData.moving) m.position.copy(this.pawnSpot(p.pos, s));
      m.userData.turn = st.phase !== 'over' && st.turn === s;
      m.userData.pos = p.pos;
    });
    for (let i = 0; i < 40; i++) this.setOwner(i, st.own[i], st.lvl[i]);
  }

  /** 한 칸씩 통통 뛰어 가기 */
  async hop(seat, from, steps, onStep) {
    const m = this.pawns[seat];
    if (!m) return;
    m.userData.moving = true;
    const dir = steps < 0 ? -1 : 1;
    let pos = from;
    const dur = Math.abs(steps) > 8 ? 0.16 : 0.2;
    for (let k = 0; k < Math.abs(steps); k++) {
      pos = (pos + dir + 40) % 40;
      const to = this.pawnSpot(pos, seat);
      m.rotation.y = Math.atan2(to.x - m.position.x, to.z - m.position.z);
      await this.s.moveTo(m, { pos: to, duration: dur, lift: 0.45, easing: ease.linear });
      onStep?.(k, pos);
      this.boing(m, 0.7);
    }
    m.rotation.y = 0;
    m.userData.moving = false;
  }

  /** 순간이동 (엘리베이터·숙직실) */
  async jump(seat, to) {
    const m = this.pawns[seat];
    if (!m) return;
    m.userData.moving = true;
    const t = this.pawnSpot(to, seat);
    await this.s.moveTo(m, { pos: t, duration: 0.7, lift: 2.2, easing: ease.inOutCubic });
    this.boing(m, 1.2);
    m.userData.moving = false;
  }

  boing(d, amount = 1) {
    return tween({
      duration: 0.35,
      ease: ease.linear,
      update: (k) => {
        const w = Math.sin(k * Math.PI * 2) * Math.exp(-k * 3) * 0.28 * amount;
        d.scale.set(1 + w, 1 - w * 1.4, 1 + w);
      },
      complete: () => d.scale.set(1, 1, 1),
    });
  }

  // ---------- 주사위 ----------
  async rollDice(d, sfx) {
    const fin = d.map((v) => TOP_ROT[v]);
    await Promise.all(
      this.dice.map((die, k) => {
        const endX = -0.55 + k * 1.1;
        const endZ = 0.9 + (k ? 0.15 : -0.1);
        const yaw = (Math.random() - 0.5) * 0.8;
        const spinX = (2 + Math.floor(Math.random() * 2)) * Math.PI * 2;
        const spinY = (1 + Math.floor(Math.random() * 2)) * Math.PI * 2;
        const startX = endX + (Math.random() - 0.5) * 2;
        return tween({
          duration: 0.85 + k * 0.1,
          ease: ease.outCubic,
          update: (q) => {
            const bounce = Math.abs(Math.sin(q * Math.PI * 2.5)) * (1 - q) * 2.2;
            die.position.set(startX + (endX - startX) * q, TOP + 0.31 + bounce, endZ - (1 - q) * 2.2);
            die.rotation.x = fin[k][0] + spinX * (1 - q);
            die.rotation.z = fin[k][1];
            die.rotation.y = yaw + spinY * (1 - q);
          },
          complete: () => {
            this.boing(die, 0.6);
            sfx?.();
          },
        });
      }),
    );
  }

  // ---------- 주인 표시 · 건물 ----------
  setOwner(i, owner, lvl) {
    const g = this.s.group;
    const cur = this.plates[i];
    if (cur && (cur.userData.owner !== owner || owner < 0)) {
      g.remove(cur);
      this.plates[i] = null;
    }
    if (owner >= 0 && !this.plates[i]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.86, 0.05, CELL * 0.2), toonMat(PAWN_COLORS[owner]));
      const side = sideOf(i);
      const p = cellPos(i, TOP + 0.03);
      // 바깥쪽 가장자리
      const out = CELL * 0.36;
      if (side === 0) p.z += out;
      else if (side === 1) p.x -= out;
      else if (side === 2) p.z -= out;
      else if (side === 3) p.x += out;
      if (side === 1 || side === 3) plate.rotation.y = Math.PI / 2;
      plate.position.copy(p);
      addOutline(plate, { color: OUTLINE, thickness: 0.02 });
      plate.userData.owner = owner;
      g.add(plate);
      this.plates[i] = plate;
      this.boing(plate);
    }
    const b = this.blocks[i];
    if (b && b.userData.lvl !== lvl) {
      g.remove(b);
      this.blocks[i] = null;
    }
    if (lvl > 0 && !this.blocks[i]) {
      const m = this.makeBuilding(lvl, owner);
      m.position.copy(cellPos(i, TOP));
      const side = sideOf(i);
      const inn = CELL * 0.3;
      if (side === 0) m.position.z -= inn;
      else if (side === 1) m.position.x += inn;
      else if (side === 2) m.position.z += inn;
      else if (side === 3) m.position.x -= inn;
      m.userData.lvl = lvl;
      g.add(m);
      this.blocks[i] = m;
      this.boing(m, 1.3);
    }
  }

  makeBuilding(lvl, owner) {
    const grp = new THREE.Group();
    const add = (geo, color, y, x = 0) => {
      const m = new THREE.Mesh(geo, toonMat(color));
      m.position.set(x, y, 0);
      m.castShadow = true;
      addOutline(m, { color: OUTLINE, thickness: 0.02 });
      grp.add(m);
      return m;
    };
    if (lvl === 1) {
      // 책상
      add(new THREE.BoxGeometry(0.34, 0.05, 0.2), 0xd9a066, 0.17);
      [-0.13, 0.13].forEach((x) => add(new THREE.BoxGeometry(0.04, 0.15, 0.16), 0xb07a45, 0.075, x));
    } else if (lvl === 2) {
      // 책장
      add(new THREE.BoxGeometry(0.36, 0.34, 0.16), 0xb07a45, 0.17);
      [0x6fa8ff, 0xff7a8a, 0x7ed47e].forEach((c, k) => add(new THREE.BoxGeometry(0.28, 0.07, 0.17), c, 0.07 + k * 0.1));
    } else {
      // 리모델링: 작은 건물 + 지붕
      add(new THREE.BoxGeometry(0.4, 0.3, 0.26), 0xfff3d6, 0.15);
      const roof = add(new THREE.ConeGeometry(0.3, 0.2, 4), PAWN_COLORS[Math.max(0, owner)], 0.4);
      roof.rotation.y = Math.PI / 4;
      add(new THREE.BoxGeometry(0.1, 0.12, 0.02), 0x2d2f4a, 0.06).position.z = 0.13;
    }
    if (this.s.outlinesOn === false) grp.traverse((m) => m.userData.outline && (m.visible = false));
    return grp;
  }

  // ---------- 강조 ----------
  showHints(list) {
    this.hints.forEach((h) => this.s.group.remove(h));
    this.hints = list.map((i) => {
      const m = new THREE.Mesh(this.hiGeo, this.hiMat);
      m.rotation.x = -Math.PI / 2;
      m.position.copy(cellPos(i, TOP + 0.012));
      this.s.group.add(m);
      return m;
    });
  }

  hover(cell) {
    this.hoverRing.visible = cell != null;
    if (cell != null) this.hoverRing.position.copy(cellPos(cell, TOP + 0.014));
  }

  /** 화면 좌표: 튜토리얼 강조용 */
  cellRect(i) {
    const p = this.s.project(cellPos(i));
    const q = this.s.project(cellPos(i).add(new THREE.Vector3(CELL / 2, 0, 0)));
    const r = Math.max(14, Math.abs(q.x - p.x) * 1.4);
    return { left: p.x - r, top: p.y - r, width: r * 2, height: r * 2 };
  }
  boardRect() {
    const a = this.s.project(new THREE.Vector3(-BOARD / 2, TOP, -BOARD / 2));
    const b = this.s.project(new THREE.Vector3(BOARD / 2, TOP, BOARD / 2));
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  }
  diceRect() {
    const p = this.s.project(new THREE.Vector3(0, TOP, 0.9));
    return { left: p.x - 70, top: p.y - 50, width: 140, height: 100 };
  }

  celebrate() {
    this.s.shake = 0.4;
  }
  async wait(sec) {
    await wait(sec);
  }
}
