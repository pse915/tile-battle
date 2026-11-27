// 비밀번호 해독반 3D: 밤의 동아리방 책상 위, 자리마다 서 있는 숫자 블록 줄 + 가운데 흩어진 뒷면 더미
// 서 있는 타일의 앞면(+z)은 주인을 향함 → 남의 줄은 뒷면 색만 보임. 공개된 타일은 앞으로 눕혀 숫자가 보이게.
import { TableStage, THREE, canvasTexture, toonMat, addOutline } from '../../../shared/table3d.js';
import { tween, ease, wait } from '../../../shared/anim.js';
import { frontTex, backTex } from './cards.js';

export const W = 0.62;
export const H = 0.88;
export const D = 0.24;
const SIDE = { b: 0x34345e, w: 0xfff6dc };
const OUTLINE = { b: 0x141230, w: 0x22203f };

function drawFelt(ctx, w, h) {
  // 카툰 칠판: 민트빛 단색 + 굵은 모눈 + 분필 낙서 몇 개
  ctx.fillStyle = '#4fa894';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 3;
  for (let x = 0; x < w; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const marks = ['1', '2', '3', '7', '?', '<', '>', '★'];
  for (let i = 0; i < 16; i++) {
    ctx.save();
    ctx.translate(Math.random() * w, Math.random() * h);
    ctx.rotate((Math.random() - 0.5) * 0.8);
    ctx.fillStyle = 'rgba(255,255,240,.16)';
    ctx.font = `${30 + Math.random() * 26}px Jua, sans-serif`;
    ctx.fillText(marks[i % marks.length], 0, 0);
    ctx.restore();
  }
  // 가운데 더미 자리: 굵은 크림색 원
  ctx.fillStyle = 'rgba(255,246,220,.18)';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,246,220,.55)';
  ctx.lineWidth = 8;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** 상대 자리 각도: 0 = 나(아래) */
const ANGLES = {
  1: [0],
  2: [0, Math.PI],
  3: [0, -Math.PI / 2, Math.PI / 2],
  4: [0, -Math.PI / 2, Math.PI, Math.PI / 2],
};

export class CodeStage {
  constructor(container) {
    this.s = new TableStage(container, {
      bg: 0x8e97e3,
      floor: 0x7a83d2,
      rim: 0xe89a6c,
      toon: true,
      fitWidth: 11,
      tableW: 14,
      tableD: 10.6,
      drawFelt,
      camera: { land: [0, 10.6, 9.2], target: [0, 0, 1.1], port: [0, 15, 6.5], portTarget: [0, 0, 2.6] },
    });
    this.tiles = new Map(); // id → { g, c, n, up, seat }
    this.pile = { b: [], w: [] };
    this.n = 2;
    this.view = 0;
    this.selected = 0;
    this.fresh = 0;
    this.onTile = null;
    this.onPile = null;
    this.geo = new THREE.BoxGeometry(W, H, D);
    this.sideMat = { b: toonMat(SIDE.b), w: toonMat(SIDE.w) };
    this.s.onPick = (d) => {
      if (d.pile) this.onPile?.(d.pile);
      else if (d.tile) this.onTile?.(d.seat, d.tile);
    };
    this.s.onResize = () => this.relayout();
    this.buildDecor();
    let t = 0;
    this.s.frame.add((dt) => {
      t += dt;
      const sel = this.tiles.get(this.selected);
      if (sel) sel.box.material.forEach((m) => m.emissive && m.emissive.setHex(0x1b6b55).multiplyScalar(0.6 + Math.sin(t * 5) * 0.4));
      if (this.lamp) this.lamp.intensity = 0.5 + Math.sin(t * 1.3) * 0.04;
    });
  }

  setQuality(q) {
    this.s.setQuality(q);
  }
  setTitleMode(on) {
    this.s.setTitleMode(on);
  }

  buildDecor() {
    const g = this.s.group;
    // 책상 스탠드 불빛 (초록빛 도는 동아리방)
    this.lamp = new THREE.PointLight(0xfff0d0, 0.5, 22, 1.6);
    this.lamp.position.set(0, 6, 0);
    this.s.scene.add(this.lamp);
    // 장식: 구석의 노트와 연필
    const note = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.06, 2.8),
      toonMat(0xffffff, {
        map: canvasTexture('cb-note', (ctx, w, h) => {
          ctx.fillStyle = '#fff6dc';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = '#9db8d8';
          ctx.lineWidth = 2;
          for (let y = 40; y < h; y += 26) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }
          ctx.fillStyle = '#334';
          ctx.font = '26px Jua, sans-serif';
          ['암호 메모', '검? < 흰3 < 검?', '? = 4 아니면 5', '★ 조커 조심'].forEach((l, i) => ctx.fillText(l, 22, 64 + i * 52));
        }, 256, 340),
      }),
    );
    addOutline(note, { color: 0x22203f, thickness: 0.04 });
    note.position.set(-5.6, 0.03, -3.9);
    note.rotation.y = 0.35;
    note.receiveShadow = true;
    g.add(note);
    const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), toonMat(0xffc94d));
    addOutline(pencil, { color: 0x22203f, thickness: 0.03 });
    pencil.rotation.z = Math.PI / 2;
    pencil.rotation.y = -0.6;
    pencil.position.set(-4.7, 0.07, -2.4);
    g.add(pencil);
  }

  // ---------- 자리 배치 ----------
  seatInfo(seat) {
    const rel = (seat - this.view + this.n) % this.n;
    const a = (ANGLES[this.n] || ANGLES[4])[rel];
    const side = Math.abs(Math.sin(a)) > 0.5;
    const port = this.s.portrait;
    const R = side ? (port ? 3.4 : 5.35) : port ? 4.6 : 3.75;
    const front = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    return { a, side, rel, center: front.clone().multiplyScalar(R), front, dir: new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)) };
  }

  slot(seat, i, len, up) {
    const info = this.seatInfo(seat);
    const port = this.s.portrait;
    const maxLen = info.side ? (port ? 6.2 : 7.4) : port ? 7.6 : 10.5;
    const base = info.side ? 0.92 : 0.74;
    const sp = Math.min(base, maxLen / Math.max(1, len));
    const p = info.center.clone().addScaledVector(info.dir, (i - (len - 1) / 2) * sp);
    if (up) {
      // 눕힌 타일은 살짝 안쪽(가운데 쪽)으로
      p.addScaledVector(info.front, -0.35);
      p.y = D / 2 + 0.01;
      return { pos: p, rotX: -Math.PI / 2, rotY: info.a, rotZ: -info.a };
    }
    p.y = H / 2 + 0.01;
    return { pos: p, rotX: 0, rotY: info.a, rotZ: 0 };
  }

  /** 자리 위 이름표 위치 (3D) */
  labelPos(seat, len) {
    const info = this.seatInfo(seat);
    if (info.rel === 0) {
      const sp = Math.min(0.74, (this.s.portrait ? 7.6 : 10.5) / Math.max(1, len));
      return info.center.clone().addScaledVector(info.dir, -((len - 1) / 2) * sp - 1.0).setY(0.3);
    }
    return info.center.clone().addScaledVector(info.front, 1.0).setY(1.1);
  }

  makeTile(c) {
    const front = toonMat(0xffffff, { map: frontTex(c, null) });
    const back = toonMat(0xffffff, { map: backTex(c) });
    const side = this.sideMat[c].clone();
    side.emissive = new THREE.Color(0);
    // BoxGeometry 면 순서: +x, -x, +y, -y, +z(앞), -z(뒤)
    const box = new THREE.Mesh(this.geo, [side, side, side, side, front, back]);
    box.castShadow = true;
    box.receiveShadow = true;
    const ol = addOutline(box, { color: OUTLINE[c], thickness: 0.035 });
    ol.visible = this.s.outlinesOn !== false;
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.add(box);
    this.s.group.add(g);
    return { g, box, front, c };
  }

  setFace(t, n) {
    if (t.n === n) return;
    t.n = n;
    t.front.map = frontTex(t.c, n);
    t.front.needsUpdate = true;
  }

  pileTile(c) {
    const t = this.makeTile(c);
    const r = 0.3 + Math.random() * 1.3;
    const a = Math.random() * Math.PI * 2;
    t.g.position.set(Math.cos(a) * r, D / 2 + Math.random() * 0.04, Math.sin(a) * r * 0.85);
    t.g.rotation.set(Math.PI / 2, Math.random() * Math.PI * 2, 0); // 앞면이 아래 (YXZ 순서)
    t.g.userData = { pile: c };
    this.s.pickables.add(t.g);
    return t;
  }

  /** 가운데 더미 개수 맞추기 */
  setPile(counts) {
    for (const c of ['b', 'w']) {
      const want = counts[c] || 0;
      const list = this.pile[c];
      while (list.length < want) list.push(this.pileTile(c));
      while (list.length > want) this.dropTile(list.pop());
    }
  }

  dropTile(t) {
    this.s.group.remove(t.g);
    this.s.pickables.delete(t.g);
    t.front.dispose();
  }

  clear() {
    for (const t of this.tiles.values()) this.dropTile(t);
    this.tiles.clear();
    this.setPile({ b: 0, w: 0 });
    this.selected = 0;
  }

  /**
   * 서버 상태(cb)를 3D에 맞춤. 새 타일은 가운데 더미에서 날아오고, 공개된 타일은 앞으로 눕혀짐.
   * cb: { rows, hold, pile, phase }, viewSeat: 아래쪽에 앉을 자리, opts.instant: 연출 없이
   */
  sync(cb, viewSeat, opts = {}) {
    this.cb = cb;
    this.n = cb.rows.length;
    this.view = Math.max(0, viewSeat);
    const me = viewSeat;
    const over = cb.phase === 'over';
    const seen = new Set();
    const moves = [];
    // 더미: 먼저 줄어든 개수만큼 '날아갈 타일'로 씀
    const pc = cb.pile || { b: 0, w: 0 };
    const spare = { b: [], w: [] };
    for (const c of ['b', 'w']) while (this.pile[c].length > (pc[c] || 0)) spare[c].push(this.pile[c].pop());
    cb.rows.forEach((row, seat) => {
      row.forEach((tile, i) => {
        seen.add(tile.id);
        let t = this.tiles.get(tile.id);
        const up = tile.up || over;
        const target = this.slot(seat, i, row.length, up);
        if (!t) {
          const from = spare[tile.c].pop();
          t = this.makeTile(tile.c);
          t.seat = seat;
          this.tiles.set(tile.id, t);
          if (from && !opts.instant) {
            t.g.position.copy(from.g.position);
            t.g.rotation.copy(from.g.rotation);
            this.dropTile(from);
          } else {
            if (from) this.dropTile(from);
            t.g.position.copy(target.pos);
            t.g.rotation.set(target.rotX, target.rotY, target.rotZ);
          }
        }
        t.seat = seat;
        const flip = up && !t.up;
        t.up = up;
        this.setFace(t, tile.n != null ? tile.n : null);
        // 고르기: 남의 숨긴 타일만
        t.g.userData = { tile: tile.id, seat };
        if (seat !== me && !tile.up && !over) this.s.pickables.add(t.g);
        else this.s.pickables.delete(t.g);
        const p = t.g.position;
        const moved = p.distanceToSquared(target.pos) > 1e-4 || Math.abs(t.g.rotation.x - target.rotX) > 1e-3 || Math.abs(t.g.rotation.y - target.rotY) > 1e-3;
        if (moved) {
          if (opts.instant) {
            p.copy(target.pos);
            t.g.rotation.set(target.rotX, target.rotY, target.rotZ);
          } else moves.push(this.s.moveTo(t.g, { ...target, duration: flip ? 0.55 : 0.45, lift: flip ? 0.9 : 0.5 }).then(() => this.boing(t, flip ? 1 : 0.6)));
        }
        t.box.material[4].emissive.setHex(tile.id === cb.fresh && seat === me ? 0x0f3b30 : 0);
      });
    });
    for (const [id, t] of this.tiles) {
      if (!seen.has(id)) {
        this.dropTile(t);
        this.tiles.delete(id);
      }
    }
    for (const c of ['b', 'w']) spare[c].forEach((t) => this.dropTile(t));
    this.setPile(pc);
    if (!this.tiles.has(this.selected)) this.selected = 0;
    return Promise.all(moves);
  }

  /** 내려앉을 때 살짝 통통 */
  boing(t, amount = 1) {
    const o = t.box;
    return tween({
      duration: 0.32,
      ease: ease.linear,
      update: (k) => {
        const w = Math.sin(k * Math.PI * 2) * Math.exp(-k * 3) * 0.16 * amount;
        if (t.up) o.scale.set(1 + w, 1 + w, 1 - w * 1.3);
        else o.scale.set(1 + w, 1 - w * 1.3, 1 + w);
      },
      complete: () => o.scale.set(1, 1, 1),
    });
  }

  relayout() {
    if (this.cb) this.sync(this.cb, this.view, { instant: true });
  }

  select(id) {
    const old = this.tiles.get(this.selected);
    if (old) old.box.material.forEach((m) => m.emissive && m.emissive.setHex(0));
    this.selected = id || 0;
    const t = this.tiles.get(id);
    if (t && !t.up) {
      const y = H / 2 + 0.01;
      tween({ duration: 0.2, update: (k) => (t.g.position.y = y + Math.sin(k * Math.PI) * 0.25) });
    }
  }

  /** 추측 받는 타일: 들썩들썩 */
  async pulse(id) {
    const t = this.tiles.get(id);
    if (!t) return;
    const y = t.g.position.y;
    await tween({ duration: 0.6, ease: ease.linear, update: (k) => (t.g.position.y = y + Math.abs(Math.sin(k * Math.PI * 2)) * 0.3) });
    t.g.position.y = y;
  }

  /** 틀림: 좌우로 부르르 */
  async shake(id) {
    const t = this.tiles.get(id);
    if (!t) return;
    const r = t.g.rotation.z;
    await tween({ duration: 0.45, ease: ease.linear, update: (k) => (t.g.rotation.z = r + Math.sin(k * Math.PI * 6) * 0.12 * (1 - k)) });
    t.g.rotation.z = r;
  }

  /** 타일 화면 위치 (튜토리얼 강조) */
  tileRect(id) {
    const t = this.tiles.get(id);
    if (!t) return null;
    const p = this.s.project(t.g.position);
    const q = this.s.project(t.g.position.clone().add(new THREE.Vector3(0, H / 2, 0)));
    const r = Math.max(24, Math.abs(q.y - p.y) * 1.4);
    return { left: p.x - r, top: p.y - r, width: r * 2, height: r * 2 };
  }

  rowRect(seat) {
    const ids = (this.cb?.rows[seat] || []).map((t) => t.id);
    const pts = ids.map((id) => this.tiles.get(id)).filter(Boolean).map((t) => this.s.project(t.g.position));
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { left: Math.min(...xs) - 26, top: Math.min(...ys) - 34, width: Math.max(...xs) - Math.min(...xs) + 52, height: Math.max(...ys) - Math.min(...ys) + 68 };
  }

  project(v) {
    return this.s.project(v);
  }

  celebrate() {
    this.s.shake = 0.4;
  }

  async wait(sec) {
    await wait(sec);
  }
}
