// 흑백 뒤집기 대전 3D: 나무 테이블 위 초록 판, 앞뒤 색이 다른 돌, 둘 수 있는 칸 표시, 뒤집기 연출
import { TableStage, THREE, canvasTexture } from '../../../shared/table3d.js';
import { tween, ease, wait } from '../../../shared/anim.js';

const CELL = 0.9;
const BOARD = CELL * 8;
const DISC_R = 0.37;
const DISC_H = 0.13;

export const cellPos = (i) => new THREE.Vector3((((i % 8) - 3.5) * CELL), 0.12 + DISC_H / 2, (Math.floor(i / 8) - 3.5) * CELL);

function drawFelt(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, '#6b4a2f');
  g.addColorStop(1, '#3d2716');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 나뭇결
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = i % 2 ? '#24140a' : '#8a6340';
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    const y = Math.random() * h;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + 20 * Math.sin(i), w * 0.6, y - 20, w, y + 10);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawBoard(ctx, w) {
  ctx.fillStyle = '#1f6b46';
  ctx.fillRect(0, 0, w, w);
  const m = w * 0.04;
  const s = (w - m * 2) / 8;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#22774e' : '#25804f';
      ctx.fillRect(m + c * s, m + r * s, s, s);
    }
  ctx.strokeStyle = '#0d3a24';
  ctx.lineWidth = 4;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(m + i * s, m);
    ctx.lineTo(m + i * s, w - m);
    ctx.moveTo(m, m + i * s);
    ctx.lineTo(w - m, m + i * s);
    ctx.stroke();
  }
  ctx.fillStyle = '#0d3a24';
  [
    [2, 2],
    [2, 6],
    [6, 2],
    [6, 6],
  ].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(m + x * s, m + y * s, 8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = `${Math.round(m * 0.7)}px Jua, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    ctx.fillText('ABCDEFGH'[i], m + (i + 0.5) * s, m / 2);
    ctx.fillText(String(i + 1), m / 2, m + (i + 0.5) * s);
  }
}

export class FlipStage {
  constructor(container) {
    this.stage = new TableStage(container, {
      bg: 0x17110c,
      floor: 0x1b130d,
      rim: 0x4a2c17,
      tableW: 12.5,
      tableD: 10,
      drawFelt,
      camera: { land: [0, 11.4, 6.6], target: [0, 0, 0.35], port: [0, 12.2, 2.4], portTarget: [0, 0, 0.15] },
    });
    this.s = this.stage;
    this.discs = new Array(64).fill(null);
    this.onCell = null;
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
    const tex = canvasTexture('fd-board', (ctx, w) => drawBoard(ctx, w), 1024, 1024);
    const frame = new THREE.MeshStandardMaterial({ color: 0x2b1a0e, roughness: 0.5 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD + 0.6, 0.24, BOARD + 0.6), [frame, frame, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), frame, frame, frame]);
    board.receiveShadow = true;
    board.castShadow = true;
    g.add(board);
    // 돌 재질
    this.matBlack = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.35, metalness: 0.1 });
    this.matWhite = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.4 });
    this.discGeo = new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_H / 2, 40);
    // 칸 고르기용 투명 판
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const pickGeo = new THREE.BoxGeometry(CELL * 0.96, 0.05, CELL * 0.96);
    this.cells = [];
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(pickGeo, pickMat);
      m.position.copy(cellPos(i)).setY(0.14);
      m.userData = { cell: i };
      g.add(m);
      this.s.pickables.add(m);
      this.cells.push(m);
    }
    // 둘 수 있는 칸 표시
    this.hintMat = new THREE.MeshBasicMaterial({ color: 0xffe36a, transparent: true, opacity: 0.7, depthWrite: false });
    this.hintGeo = new THREE.RingGeometry(0.14, 0.22, 32);
    this.hints = [];
    this.hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.visible = false;
    g.add(this.hoverRing);
    // 마지막 수 표시
    this.lastMark = new THREE.Mesh(new THREE.CircleGeometry(0.08, 20), new THREE.MeshBasicMaterial({ color: 0xff4d5e }));
    this.lastMark.rotation.x = -Math.PI / 2;
    this.lastMark.visible = false;
    g.add(this.lastMark);
    // 돌 통 두 개 (장식)
    [-1, 1].forEach((side) => {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.55, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.5, side: THREE.DoubleSide }));
      bowl.position.set(side * 5.1, 0.27, side * 2.6);
      bowl.castShadow = true;
      g.add(bowl);
      for (let k = 0; k < 7; k++) {
        const d = this.makeDisc(side < 0 ? 1 : 2);
        d.position.set(side * 5.1 + (Math.random() - 0.5) * 0.8, 0.2 + k * 0.04, side * 2.6 + (Math.random() - 0.5) * 0.8);
        d.rotation.z = (Math.random() - 0.5) * 0.4;
        g.add(d);
      }
    });
    let t = 0;
    this.s.frame.add((dt) => {
      t += dt;
      this.hintMat.opacity = 0.45 + Math.sin(t * 4) * 0.25;
    });
  }

  makeDisc(color) {
    const d = new THREE.Group();
    const top = new THREE.Mesh(this.discGeo, this.matBlack);
    top.position.y = DISC_H / 4;
    const bot = new THREE.Mesh(this.discGeo, this.matWhite);
    bot.position.y = -DISC_H / 4;
    top.castShadow = bot.castShadow = true;
    d.add(top, bot);
    d.rotation.x = color === 2 ? Math.PI : 0;
    d.userData.color = color;
    return d;
  }

  /** 판 전체를 바로 맞추기 (처음 들어올 때, 새 판) */
  setBoard(board, last = -1) {
    for (let i = 0; i < 64; i++) {
      const want = board[i];
      const d = this.discs[i];
      if (!want && d) {
        this.s.group.remove(d);
        this.discs[i] = null;
      } else if (want && !d) {
        const nd = this.makeDisc(want);
        nd.position.copy(cellPos(i));
        this.s.group.add(nd);
        this.discs[i] = nd;
      } else if (want && d && d.userData.color !== want) {
        d.userData.color = want;
        d.rotation.x = want === 2 ? Math.PI : 0;
      }
    }
    this.markLast(last);
  }

  markLast(i) {
    this.lastMark.visible = i >= 0;
    if (i >= 0) this.lastMark.position.copy(cellPos(i)).setY(0.12 + DISC_H + 0.01);
  }

  /** 돌 놓기 + 차례로 뒤집기 연출. sfx: { place(), flip(k) } */
  async animateMove(idx, color, flips, sfx) {
    this.markLast(-1);
    if (!this.discs[idx]) {
      const d = this.makeDisc(color);
      const to = cellPos(idx);
      d.position.set(to.x, 3, to.z + 0.6);
      this.s.group.add(d);
      this.discs[idx] = d;
      await this.s.moveTo(d, { pos: to, duration: 0.32, lift: 0, easing: ease.inCubic });
      sfx?.place();
    }
    const center = cellPos(idx);
    const order = flips.slice().sort((a, b) => cellPos(a).distanceTo(center) - cellPos(b).distanceTo(center));
    await Promise.all(
      order.map((f, k) => {
        const d = this.discs[f];
        if (!d) return null;
        d.userData.color = color;
        const base = cellPos(f);
        const from = d.rotation.x;
        const to = color === 2 ? Math.PI : 0;
        const dir = to > from ? 1 : -1;
        return tween({
          delay: 0.06 * k,
          duration: 0.34,
          ease: ease.inOutCubic,
          update: (q) => {
            d.position.y = base.y + Math.sin(q * Math.PI) * 0.55;
            d.rotation.x = from + dir * Math.PI * q;
          },
          complete: () => {
            d.rotation.x = to;
            sfx?.flip(k);
          },
        });
      }),
    );
    this.markLast(idx);
  }

  /** 둘 수 있는 칸 표시 */
  showHints(list) {
    this.hints.forEach((h) => this.s.group.remove(h));
    this.hints = list.map((i) => {
      const m = new THREE.Mesh(this.hintGeo, this.hintMat);
      m.rotation.x = -Math.PI / 2;
      m.position.copy(cellPos(i)).setY(0.125);
      this.s.group.add(m);
      return m;
    });
    this.hintSet = new Set(list);
    if (this.hoverRing.visible && !this.hintSet.has(this.hoverCell)) this.hoverRing.visible = false;
  }

  hover(cell) {
    this.hoverCell = cell;
    const on = cell != null && this.hintSet?.has(cell);
    this.hoverRing.visible = on;
    if (on) this.hoverRing.position.copy(cellPos(cell)).setY(0.13);
  }

  /** 화면 좌표: 튜토리얼 강조용 */
  cellRect(i) {
    const p = this.s.project(cellPos(i));
    const q = this.s.project(cellPos(i).add(new THREE.Vector3(CELL / 2, 0, 0)));
    const r = Math.abs(q.x - p.x) * 1.3;
    return { left: p.x - r, top: p.y - r, width: r * 2, height: r * 2 };
  }

  boardRect() {
    const a = this.s.project(new THREE.Vector3(-BOARD / 2, 0.12, -BOARD / 2));
    const b = this.s.project(new THREE.Vector3(BOARD / 2, 0.12, BOARD / 2));
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  }

  celebrate() {
    this.s.shake = 0.4;
  }

  async wait(sec) {
    await wait(sec);
  }
}

