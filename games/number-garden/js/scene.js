// 숫자 블록 정원 3D: 학교 화단 테이블, 가운데 판(세트 줄), 자리마다 뒷면 타일 받침대, 뽑을 더미
import { TableStage, THREE, toonMat, addOutline } from '../../../shared/table3d.js';
import { ease, wait, tween } from '../../../shared/anim.js';
import { tileMesh, backMesh, TILE_W, TILE_H, TILE_D } from './cards.js';
import { kindOf, orderSet } from './rules.js';

const TABLE_W = 14;
const TABLE_D = 10;
const BOARD_W = 9.4; // 판 영역 가로
const BOARD_TOP = -2.9;
const BOARD_DEPTH = 5.6;
const RACK_LEN = 5.4;
const POOL_POS = new THREE.Vector3(-5.3, 0, 3.6);

function drawFelt(ctx, w, h) {
  // 카툰 잔디: 밝은 연두 바탕 + 큼직한 풀 무늬 몇 개
  ctx.fillStyle = '#9ad86a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#86c957';
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.beginPath();
    ctx.moveTo(x - 7, y);
    ctx.lineTo(x - 2, y - 16);
    ctx.lineTo(x + 1, y - 3);
    ctx.lineTo(x + 6, y - 13);
    ctx.lineTo(x + 8, y);
    ctx.closePath();
    ctx.fill();
  }
  // 가운데 화단 흙 (단색 + 두꺼운 벽돌 테두리)
  const m = w * 0.13;
  const rr = () => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(m, m * 0.62, w - m * 2, h - m * 1.24, 44);
    else ctx.rect(m, m * 0.62, w - m * 2, h - m * 1.24);
  };
  ctx.fillStyle = '#c98f5f';
  rr();
  ctx.fill();
  ctx.strokeStyle = '#3b2a4a';
  ctx.lineWidth = 26;
  rr();
  ctx.stroke();
  ctx.strokeStyle = '#ef8a5b';
  ctx.lineWidth = 16;
  ctx.setLineDash([40, 8]);
  rr();
  ctx.stroke();
  ctx.setLineDash([]);
  // 구석의 작은 꽃들 (외곽선 있는 단순한 꽃)
  const flowers = ['#ff8d9a', '#ffd84d', '#7fb2ff', '#c9a2ff', '#ffffff'];
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    if (x > m - 24 && x < w - m + 24 && y > m * 0.62 - 24 && y < h - m * 0.62 + 24) continue;
    [['#3b2a4a', 5.4], [flowers[i % flowers.length], 4]].forEach(([col, rad]) => {
      ctx.fillStyle = col;
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 6, y + Math.sin(a) * 6, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.fillStyle = '#ffb627';
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 상대 자리(나=0)에서 받침대 위치와 방향 */
function seatSpot(rel, n) {
  const spots = {
    bottom: { pos: [0, 0, 4.45], rotY: 0 },
    left: { pos: [-6.35, 0, 0], rotY: Math.PI / 2 },
    top: { pos: [0, 0, -4.45], rotY: Math.PI },
    right: { pos: [6.35, 0, 0], rotY: -Math.PI / 2 },
  };
  const order = n === 2 ? ['bottom', 'top'] : n === 3 ? ['bottom', 'left', 'right'] : ['bottom', 'left', 'top', 'right'];
  return spots[order[rel]];
}

export class GardenStage {
  constructor(container) {
    this.stage = new TableStage(container, {
      bg: 0xcdeccf,
      floor: 0xb5e0b4,
      rim: 0xd9925a,
      toon: true,
      fitWidth: 14.6,
      tableW: TABLE_W,
      tableD: TABLE_D,
      drawFelt,
      camera: { land: [0, 12.6, 8.2], target: [0, 0, 0.5], port: [0, 15.5, 4.2], portTarget: [0, 0, 0.2] },
    });
    this.s = this.stage;
    this.tiles = new Map(); // id → mesh (판 위)
    this.racks = [];
    this.n = 0;
    this.mySeat = 0;
    this.scale = 0.62;
    this.poolGroup = new THREE.Group();
    this.s.group.add(this.poolGroup);
    this.decorate();
  }

  setQuality(q) {
    this.s.setQuality(q);
  }
  setTitleMode(on) {
    this.s.setTitleMode(on);
  }

  /** 카툰 외곽선 (낮음 품질에서는 꺼 둠) */
  outline(mesh, color = 0x2e2a52, thickness = 0.04) {
    const o = addOutline(mesh, { color, thickness });
    o.visible = this.s.outlinesOn !== false;
    return mesh;
  }

  /** 타일 외곽선 (진한 남색) */
  tileOutline(m) {
    return this.outline(m, 0x2e2a52, 0.035);
  }

  /** 내려앉을 때 살짝 통통 (타일 앞면이 +z라 z가 높이 방향) */
  boing(m, amount = 1) {
    const base = m.scale.x;
    return tween({
      duration: 0.32,
      ease: ease.linear,
      update: (k) => {
        const w = Math.sin(k * Math.PI * 2) * Math.exp(-k * 3) * 0.16 * amount;
        m.scale.set(base * (1 + w), base * (1 + w), base * (1 - w * 1.3));
      },
      complete: () => m.scale.setScalar(base),
    });
  }

  decorate() {
    // 구석의 작은 화분 두 개 (분위기)
    const pot = toonMat(0xf08a5d);
    const leaf = toonMat(0x5cc24f);
    const petals = [0xff7a88, 0xffd84d, 0x7fb2ff, 0xc9a2ff];
    [
      [5.6, 3.7],
      [-5.6, -3.7],
    ].forEach(([x, z], k) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.32, 0.6, 20), pot);
      p.position.set(x, 0.3, z);
      p.castShadow = true;
      this.outline(p, 0x5a2e2a, 0.04);
      this.s.group.add(p);
      for (let i = 0; i < 3; i++) {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), leaf);
        st.position.set(x + (i - 1) * 0.16, 0.85, z + (i % 2) * 0.1);
        this.s.group.add(st);
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 10), toonMat(petals[(i + k * 2) % 4]));
        this.outline(fl, 0x3b2a4a, 0.025);
        fl.position.set(st.position.x, 1.18, st.position.z);
        fl.castShadow = true;
        this.s.group.add(fl);
      }
    });
  }

  /** 자리 수와 내 자리 (관전은 -1 → 0번이 아래) */
  setSeats(n, mySeat) {
    if (this.n === n && this.mySeat === mySeat) return;
    this.racks.forEach((r) => this.s.group.remove(r.group));
    this.racks = [];
    this.n = n;
    this.mySeat = mySeat;
    const base = mySeat >= 0 ? mySeat : 0;
    const wood = toonMat(0xe0a46a);
    for (let seat = 0; seat < n; seat++) {
      const rel = (seat - base + n) % n;
      const sp = seatSpot(rel, n);
      const group = new THREE.Group();
      group.position.set(...sp.pos);
      group.rotation.y = sp.rotY;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(RACK_LEN, 0.22, 0.55), wood);
      bar.position.y = 0.11;
      bar.castShadow = true;
      bar.receiveShadow = true;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(RACK_LEN, 0.42, 0.12), wood);
      lip.position.set(0, 0.21, 0.24);
      lip.castShadow = true;
      this.outline(bar, 0x5a3a2a, 0.035);
      this.outline(lip, 0x5a3a2a, 0.035);
      group.add(bar, lip);
      this.s.group.add(group);
      this.racks.push({ group, tiles: [], seat, rel, count: 0, mine: seat === mySeat });
    }
  }

  /** 받침대 위 뒷면 타일 수 맞추기 (내 자리는 DOM 손패가 있어 비워 둠) */
  setCounts(counts) {
    counts.forEach((c, seat) => {
      const r = this.racks[seat];
      if (!r) return;
      const want = r.mine ? 0 : c;
      while (r.tiles.length < want) {
        const m = this.tileOutline(backMesh());
        m.scale.setScalar(0.5);
        r.group.add(m);
        r.tiles.push(m);
      }
      while (r.tiles.length > want) r.group.remove(r.tiles.pop());
      const k = r.tiles.length;
      const step = Math.min(TILE_W * 0.5 + 0.03, (RACK_LEN - 0.4) / Math.max(1, k));
      r.tiles.forEach((m, i) => {
        m.position.set((i - (k - 1) / 2) * step, 0.22 + (TILE_H * 0.5) / 2, -0.02);
        m.rotation.x = 0.18;
      });
      r.count = c;
    });
  }

  /** 받침대 앞쪽 (이름표·날아가는 타일 출발점) */
  seatAnchor(seat, up = 1.1) {
    const r = this.racks[seat];
    if (!r) return new THREE.Vector3(0, 0, 0);
    r.group.updateMatrixWorld(true);
    const v = new THREE.Vector3(0, up, r.mine ? -0.6 : -0.9);
    return r.group.localToWorld(v);
  }

  setPool(count) {
    if (this.poolCount === count) return;
    this.poolCount = count;
    this.poolGroup.clear();
    const layers = Math.min(14, Math.ceil(count / 6));
    for (let i = 0; i < layers; i++) {
      for (let c = 0; c < 2; c++) {
        if (i === layers - 1 && c === 1 && count % 12 && count % 12 <= 6) continue;
        const m = this.tileOutline(backMesh());
        m.scale.setScalar(0.55);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = (Math.random() - 0.5) * 0.12;
        m.position.set(POOL_POS.x + (c - 0.5) * 0.42, 0.07 + i * TILE_D * 0.55, POOL_POS.z + (Math.random() - 0.5) * 0.04);
        this.poolGroup.add(m);
      }
    }
  }

  poolTop() {
    return new THREE.Vector3(POOL_POS.x, 0.3 + Math.min(14, Math.ceil((this.poolCount || 0) / 6)) * TILE_D * 0.55, POOL_POS.z);
  }

  /** 세트 줄 배치 계산: 판 영역에 맞게 크기를 줄여 가며 */
  layout(board) {
    for (let s = 0.62; s >= 0.3; s -= 0.04) {
      const tw = TILE_W * s + 0.03;
      const th = TILE_H * s + 0.16;
      const gap = tw * 0.7;
      let x = 0;
      let row = 0;
      const rows = [[]];
      const sets = board.map((set) => orderSet(set));
      for (const set of sets) {
        const w = set.length * tw;
        if (x > 0 && x + w > BOARD_W) {
          row++;
          x = 0;
          rows.push([]);
        }
        rows[row].push({ set, x });
        x += w + gap;
      }
      if (rows.length * th <= BOARD_DEPTH || s <= 0.31) {
        const pos = new Map();
        const totalH = rows.length * th;
        const z0 = BOARD_TOP + Math.max(0, (BOARD_DEPTH - totalH) / 2) + th / 2;
        rows.forEach((r, ri) => {
          const last = r[r.length - 1];
          const width = last ? last.x + last.set.length * tw : 0;
          const x0 = -width / 2 + tw / 2;
          r.forEach(({ set, x }) => set.forEach((id, k) => pos.set(id, new THREE.Vector3(x0 + x + k * tw, (TILE_D * s) / 2 + 0.01, z0 + ri * th))));
        });
        return { pos, scale: s };
      }
    }
    return { pos: new Map(), scale: 0.3 };
  }

  /**
   * 판 맞추기. 새로 나온 타일은 from(자리 번호)의 받침대에서 날아오고,
   * 사라진 타일(내 패로 되돌림)은 내 자리 쪽으로 날아가 사라짐
   */
  async setBoard(board, { fromSeat = -1, instant = false } = {}) {
    const { pos, scale } = this.layout(board);
    const jobs = [];
    let k = 0;
    for (const [id, to] of pos) {
      let m = this.tiles.get(id);
      if (!m) {
        m = this.tileOutline(tileMesh(kindOf(id)));
        m.rotation.x = -Math.PI / 2;
        m.scale.setScalar(scale);
        this.s.group.add(m);
        this.tiles.set(id, m);
        if (instant || fromSeat < 0) m.position.copy(to);
        else {
          m.position.copy(this.seatAnchor(fromSeat, 0.6));
          const mm = m;
          jobs.push(this.s.moveTo(m, { pos: to, duration: 0.5, lift: 1.2, delay: 0.05 * k++, easing: ease.outCubic }).then(() => this.boing(mm)));
        }
      } else if (m.position.distanceToSquared(to) > 1e-4) {
        if (instant) m.position.copy(to);
        else jobs.push(this.s.moveTo(m, { pos: to, duration: 0.35, lift: 0.25 }));
      }
      m.scale.setScalar(scale);
    }
    for (const [id, m] of [...this.tiles]) {
      if (pos.has(id)) continue;
      this.tiles.delete(id);
      if (instant) this.s.group.remove(m);
      else jobs.push(this.s.moveTo(m, { pos: this.seatAnchor(this.mySeat >= 0 ? this.mySeat : 0, 0.4), duration: 0.3, lift: 0.4 }).then(() => this.s.group.remove(m)));
    }
    await Promise.all(jobs);
  }

  /** 더미에서 받침대로 한 장 날아가기 */
  async drawFly(seat) {
    const m = this.tileOutline(backMesh());
    m.scale.setScalar(0.55);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(this.poolTop());
    this.s.group.add(m);
    await this.s.moveTo(m, { pos: this.seatAnchor(seat, 0.5), duration: 0.45, lift: 0.9, rotX: -0.3 });
    this.s.group.remove(m);
  }

  clearBoard() {
    for (const m of this.tiles.values()) this.s.group.remove(m);
    this.tiles.clear();
  }

  celebrate() {
    this.s.shake = 0.35;
    // 판 위 타일들이 통통 튐
    let t = 0;
    const list = [...this.tiles.values()];
    const base = list.map((m) => m.position.y);
    const f = (dt) => {
      t += dt;
      list.forEach((m, i) => (m.position.y = base[i] + Math.max(0, Math.sin(t * 9 - i * 0.25)) * 0.25 * Math.max(0, 1 - t / 2.4)));
      if (t > 2.6) {
        list.forEach((m, i) => (m.position.y = base[i]));
        this.s.frame.delete(f);
      }
    };
    this.s.frame.add(f);
  }

  async wait(sec) {
    await wait(sec);
  }
}
