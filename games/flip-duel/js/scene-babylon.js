// 흑백 뒤집기 대전 3D — Babylon.js 판 (scene.js(Three.js)와 같은 FlipStage 인터페이스)
import { BabylonStage, BABYLON as B, V3, canvasTexture, pbr } from '../../../shared/stage-babylon.js';
import { tween, ease, wait } from '../../../shared/anim.js';
import { drawFelt, drawBoard } from './art.js';

const CELL = 0.9;
const BOARD = CELL * 8;
const DISC_R = 0.37;
const DISC_H = 0.13;

export const cellPos = (i) => V3(((i % 8) - 3.5) * CELL, 0.12 + DISC_H / 2, (Math.floor(i / 8) - 3.5) * CELL);

export class FlipStage {
  constructor(container) {
    this.s = new BabylonStage(container, {
      bg: '#17110c',
      floor: 0x1b130d,
      rim: 0x4a2c17,
      tableW: 12.5,
      tableD: 10,
      drawFelt,
      exposure: 1.05,
      bloom: 0.22,
      fitWidth: 8.8,
      camera: { land: [0, 11.4, 6.6], target: [0, 0, 0.35], port: [0, 12.2, 2.4], portTarget: [0, 0, 0.15] },
    });
    this.scene = this.s.scene;
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
    const sc = this.scene;
    const g = this.s.group;
    // 판: 나무 틀 + 위에 그린 초록 판
    const frameMat = pbr(sc, 'frame', { color: '#3a2412', rough: 0.45, clearcoat: 0.6 });
    const frame = B.MeshBuilder.CreateBox('boardFrame', { width: BOARD + 0.6, height: 0.24, depth: BOARD + 0.6 }, sc);
    frame.material = frameMat;
    frame.parent = g;
    frame.receiveShadows = true;
    frame.isPickable = false;
    this.s.castShadow(frame);
    const top = B.MeshBuilder.CreateGround('boardTop', { width: BOARD + 0.6, height: BOARD + 0.6 }, sc);
    top.position.y = 0.121;
    const tex = canvasTexture(sc, 'fd-board', (ctx, w) => drawBoard(ctx, w), 1024, 1024);
    top.material = pbr(sc, 'boardTop', { map: tex, rough: 0.8 });
    top.receiveShadows = true;
    top.isPickable = false;
    top.parent = g;
    // 돌 재질: 코팅된 플라스틱
    this.matBlack = pbr(sc, 'black', { color: '#15151a', rough: 0.3, clearcoat: 1 });
    this.matWhite = pbr(sc, 'white', { color: '#f2eee3', rough: 0.36, clearcoat: 1 });
    this.discProto = B.MeshBuilder.CreateCylinder('discHalf', { diameter: DISC_R * 2, height: DISC_H / 2, tessellation: 40 }, sc);
    this.discProto.setEnabled(false);
    // 칸 고르기용 보이지 않는 판
    this.cells = [];
    for (let i = 0; i < 64; i++) {
      const m = B.MeshBuilder.CreateBox('cell' + i, { width: CELL * 0.96, height: 0.05, depth: CELL * 0.96 }, sc);
      m.position = cellPos(i).clone();
      m.position.y = 0.14;
      m.isVisible = false;
      m.metadata = { cell: i };
      m.parent = g;
      this.s.pickables.add(m);
      this.cells.push(m);
    }
    // 둘 수 있는 칸 고리
    this.hintMat = new B.StandardMaterial('hint', sc);
    this.hintMat.disableLighting = true;
    this.hintMat.emissiveColor = B.Color3.FromHexString('#ffe36a');
    this.hintProto = B.MeshBuilder.CreateTorus('hintRing', { diameter: 0.36, thickness: 0.07, tessellation: 32 }, sc);
    this.hintProto.material = this.hintMat;
    this.hintProto.isPickable = false;
    this.hintProto.setEnabled(false);
    this.hints = [];
    this.hoverRing = B.MeshBuilder.CreateTorus('hoverRing', { diameter: 0.72, thickness: 0.06, tessellation: 40 }, sc);
    const hm = new B.StandardMaterial('hoverMat', sc);
    hm.disableLighting = true;
    hm.emissiveColor = new B.Color3(1, 1, 1);
    hm.alpha = 0.85;
    this.hoverRing.material = hm;
    this.hoverRing.isPickable = false;
    this.hoverRing.setEnabled(false);
    // 마지막 수 표시
    this.lastMark = B.MeshBuilder.CreateDisc('lastMark', { radius: 0.08, tessellation: 20 }, sc);
    this.lastMark.rotation.x = Math.PI / 2;
    const lm = new B.StandardMaterial('lastMat', sc);
    lm.disableLighting = true;
    lm.emissiveColor = B.Color3.FromHexString('#ff4d5e');
    lm.backFaceCulling = false;
    this.lastMark.material = lm;
    this.lastMark.isPickable = false;
    this.lastMark.setEnabled(false);
    // 돌 통 두 개 (장식)
    const bowlMat = pbr(sc, 'bowl', { color: '#8a5a33', rough: 0.5, clearcoat: 0.4 });
    bowlMat.backFaceCulling = false;
    [-1, 1].forEach((side) => {
      const bowl = B.MeshBuilder.CreateCylinder('bowl' + side, { diameterTop: 1.8, diameterBottom: 1.4, height: 0.55, tessellation: 32, cap: B.Mesh.CAP_START }, sc);
      bowl.material = bowlMat;
      bowl.position.set(side * 5.1, 0.27, side * 2.6);
      bowl.isPickable = false;
      bowl.parent = g;
      this.s.castShadow(bowl);
      for (let k = 0; k < 7; k++) {
        const d = this.makeDisc(side < 0 ? 1 : 2);
        d.position.set(side * 5.1 + (Math.random() - 0.5) * 0.8, 0.2 + k * 0.04, side * 2.6 + (Math.random() - 0.5) * 0.8);
        d.rotation.z = (Math.random() - 0.5) * 0.4;
      }
    });
    let t = 0;
    this.s.frame.add((dt) => {
      t += dt;
      this.hintMat.alpha = 0.55 + Math.sin(t * 4) * 0.3;
    });
  }

  makeDisc(color) {
    const sc = this.scene;
    const d = new B.TransformNode('disc', sc);
    d.parent = this.s.group;
    const top = this.discProto.clone('discTop');
    top.setEnabled(true);
    top.material = this.matBlack;
    top.position.y = DISC_H / 4;
    top.parent = d;
    const bot = this.discProto.clone('discBot');
    bot.setEnabled(true);
    bot.material = this.matWhite;
    bot.position.y = -DISC_H / 4;
    bot.parent = d;
    [top, bot].forEach((m) => {
      m.isPickable = false;
      m.receiveShadows = true;
      this.s.castShadow(m);
    });
    d.rotation.x = color === 2 ? Math.PI : 0;
    d.userData = { color };
    return d;
  }

  removeDisc(d) {
    d.getChildMeshes().forEach((m) => this.s.uncastShadow(m));
    d.dispose();
  }

  setBoard(board, last = -1) {
    for (let i = 0; i < 64; i++) {
      const want = board[i];
      const d = this.discs[i];
      if (!want && d) {
        this.removeDisc(d);
        this.discs[i] = null;
      } else if (want && !d) {
        const nd = this.makeDisc(want);
        nd.position = cellPos(i);
        this.discs[i] = nd;
      } else if (want && d && d.userData.color !== want) {
        d.userData.color = want;
        d.rotation.x = want === 2 ? Math.PI : 0;
      }
    }
    this.markLast(last);
  }

  markLast(i) {
    this.lastMark.setEnabled(i >= 0);
    if (i >= 0) {
      const p = cellPos(i);
      this.lastMark.position.set(p.x, 0.12 + DISC_H + 0.012, p.z);
    }
  }

  async animateMove(idx, color, flips, sfx) {
    this.markLast(-1);
    if (!this.discs[idx]) {
      const d = this.makeDisc(color);
      const to = cellPos(idx);
      d.position.set(to.x, 3, to.z + 0.6);
      this.discs[idx] = d;
      await this.s.moveTo(d, { pos: to, duration: 0.32, lift: 0, easing: ease.inCubic });
      sfx?.place();
    }
    const center = cellPos(idx);
    const order = flips.slice().sort((a, b) => B.Vector3.Distance(cellPos(a), center) - B.Vector3.Distance(cellPos(b), center));
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

  showHints(list) {
    this.hints.forEach((h) => h.dispose());
    this.hints = list.map((i) => {
      const m = this.hintProto.clone('hint' + i);
      m.setEnabled(true);
      const p = cellPos(i);
      m.position.set(p.x, 0.13, p.z);
      return m;
    });
    this.hintSet = new Set(list);
    if (!this.hintSet.has(this.hoverCell)) this.hoverRing.setEnabled(false);
  }

  hover(cell) {
    this.hoverCell = cell;
    const on = cell != null && this.hintSet?.has(cell);
    this.hoverRing.setEnabled(!!on);
    if (on) {
      const p = cellPos(cell);
      this.hoverRing.position.set(p.x, 0.135, p.z);
    }
  }

  cellRect(i) {
    const p = this.s.project(cellPos(i));
    const q = this.s.project(cellPos(i).add(V3(CELL / 2, 0, 0)));
    const r = Math.abs(q.x - p.x) * 1.3;
    return { left: p.x - r, top: p.y - r, width: r * 2, height: r * 2 };
  }

  boardRect() {
    const a = this.s.project(V3(-BOARD / 2, 0.12, -BOARD / 2));
    const b = this.s.project(V3(BOARD / 2, 0.12, BOARD / 2));
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  }

  celebrate() {
    this.s.shake = 0.4;
  }

  async wait(sec) {
    await wait(sec);
  }
}
