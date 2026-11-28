// 보석 공방 3D: 나무 작업대 위에 보석 6더미(카툰 원판 토큰)를 한 줄로 쌓아 두고,
// 누르면 고른 보석이 톡 튀어 오름. 보석이 오가면 더미가 출렁이고, 카드 덱 3단이 옆에 놓임
import { TableStage, THREE, canvasTexture, toonMat, addOutline } from '../../../shared/table3d.js';
import { tween, ease } from '../../../shared/anim.js';
import { ALL } from './rules.js';

export const GEM_HEX = { r: 0xe0475b, b: 0x3a7bd5, g: 0x2fae6a, w: 0xf3eee2, k: 0x3b3346, y: 0xf2b631 };
export const GEM_CSS = { r: '#e0475b', b: '#3a7bd5', g: '#2fae6a', w: '#f3eee2', k: '#3b3346', y: '#f2b631' };
const INK = 0x2b2140;
const TOKEN_R = 0.42;
const TOKEN_H = 0.09;
const GAP = 1.12;
const ROW_Z = -1.15;

function drawFelt(ctx, w, h) {
  // 공방 작업대: 따뜻한 남보라 가죽 + 금색 박음질
  ctx.fillStyle = '#5b4a8a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(242,182,49,0.45)';
  ctx.lineWidth = 6;
  ctx.setLineDash([18, 14]);
  ctx.strokeRect(w * 0.04, h * 0.05, w * 0.92, h * 0.9);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let i = 0; i < 40; i++) {
    const x = ((i * 97) % 100) / 100;
    const y = ((i * 61) % 100) / 100;
    ctx.beginPath();
    ctx.moveTo(x * w, y * h - 14);
    ctx.lineTo(x * w + 10, y * h);
    ctx.lineTo(x * w, y * h + 14);
    ctx.lineTo(x * w - 10, y * h);
    ctx.closePath();
    ctx.fill();
  }
}

/** 토큰 윗면: 보석 모양 그림 */
function gemTop(c) {
  return canvasTexture('gw-top-' + c, (ctx, w) => {
    const hex = '#' + GEM_HEX[c].toString(16).padStart(6, '0');
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(w / 2, w / 2, w * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    // 보석 컷 (육각형 + 안쪽 면)
    const light = c === 'w' ? '#d8cfbd' : 'rgba(255,255,255,0.8)';
    ctx.fillStyle = light;
    ctx.strokeStyle = c === 'w' ? '#8a7f6a' : '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const r = w * 0.24;
      ctx[i ? 'lineTo' : 'moveTo'](w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    if (c === 'y') {
      ctx.fillStyle = '#7a4d00';
      ctx.font = 'bold 64px Jua, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', w / 2, w / 2 + 4);
    }
  }, 128, 128);
}

export class GWStage {
  constructor(container) {
    this.stage = new TableStage(container, {
      bg: 0x2a2140,
      floor: 0x3a2d55,
      rim: 0x8a5a2b,
      toon: true,
      fitWidth: 7.6,
      tableW: 11,
      tableD: 7.4,
      drawFelt,
      camera: { land: [1.4, 8.6, 6.4], target: [1.4, 0, 0.9], port: [0, 11, 6.2], portTarget: [0, 0, 2.6] },
    });
    this.s = this.stage;
    this.stacks = {};
    this.counts = {};
    this.picked = [];
    this.onPickGem = null;
    this.build();
    this.s.onPick = (d) => d.gem && this.onPickGem?.(d.gem);
  }

  setQuality(q) {
    this.s.setQuality(q);
  }
  setTitleMode(on) {
    this.s.setTitleMode(on);
  }

  build() {
    const geo = new THREE.CylinderGeometry(TOKEN_R, TOKEN_R, TOKEN_H, 28);
    ALL.forEach((c, i) => {
      const grp = new THREE.Group();
      grp.position.set((i - 2.5) * GAP, 0, ROW_Z);
      this.s.group.add(grp);
      const side = toonMat(GEM_HEX[c]);
      const top = toonMat(0xffffff, { map: gemTop(c) });
      const tokens = [];
      for (let k = 0; k < 7; k++) {
        const m = new THREE.Mesh(geo, [side, top, side]);
        m.position.y = TOKEN_H / 2 + k * (TOKEN_H + 0.012);
        m.rotation.y = k * 0.4;
        m.castShadow = true;
        addOutline(m, { color: INK, thickness: 0.025 });
        grp.add(m);
        tokens.push(m);
      }
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(TOKEN_R * 1.25, TOKEN_R * 1.25, 1.2, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.y = 0.5;
      hit.userData = { gem: c };
      grp.add(hit);
      if (c !== 'y') this.s.pickables.add(hit);
      // 고른 보석: 더미 위로 떠오르는 토큰
      const lift = new THREE.Mesh(geo, [side, top, side]);
      addOutline(lift, { color: INK, thickness: 0.025 });
      lift.visible = false;
      grp.add(lift);
      const lift2 = lift.clone();
      lift2.visible = false;
      grp.add(lift2);
      this.stacks[c] = { grp, tokens, lift: [lift, lift2] };
    });
    // 카드 덱 3단 (장식): 오른쪽 아래
    const deckCol = [0x7fb069, 0xe6aa68, 0x6d7ae0];
    for (let t = 0; t < 3; t++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22 - t * 0.04, 0.88), toonMat(deckCol[t]));
      d.position.set(-2.6 + t * 0.78, 0.11, 1.1);
      d.rotation.y = (t - 1) * 0.08;
      addOutline(d, { color: INK, thickness: 0.03 });
      this.s.group.add(d);
    }
  }

  /** 은행 보석 수만큼 쌓기 (최대 7개만 그림) */
  setBank(bank) {
    ALL.forEach((c) => {
      const n = bank[c] || 0;
      const st = this.stacks[c];
      const prev = this.counts[c];
      st.tokens.forEach((m, k) => (m.visible = k < n));
      if (prev != null && prev !== n) this.bounce(c);
      this.counts[c] = n;
    });
  }

  /** 고른 보석 표시 (같은 색 2개면 두 개 떠오름) */
  setPicked(list) {
    this.picked = list.slice();
    ALL.forEach((c) => {
      const k = list.filter((x) => x === c).length;
      const st = this.stacks[c];
      const top = Math.max(0, Math.min(7, this.counts[c] || 0)) * (TOKEN_H + 0.012);
      st.lift.forEach((m, i) => {
        m.visible = i < k;
        m.position.y = top + 0.45 + i * 0.22;
      });
    });
  }

  bounce(c) {
    const g = this.stacks[c].grp;
    tween({ duration: 0.35, ease: ease.linear || ((t) => t), update: (t) => (g.scale.y = 1 + Math.sin(t * Math.PI) * 0.25) });
  }

  /** 화면 좌표 (이름표·수량 배지용) */
  screenOf(c) {
    const v = this.stacks[c].grp.position.clone();
    v.y = 0.9;
    return this.s.project(v);
  }

  shake(n = 0.3) {
    this.s.shake = Math.max(this.s.shake || 0, n);
  }
}
