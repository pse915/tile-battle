// 카드 그림 — 외부 이미지 없이 Canvas로 직접 그림 (오리지널 디자인)
import * as THREE from 'three';
import { toonMat, addOutline } from '../../../shared/table3d.js';

export const CARD_W = 0.78;
export const CARD_H = 1.12;
export const CARD_T = 0.025;
const W = 256;
const H = 368;
const FONT = '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

export async function ensureFonts() {
  try {
    await Promise.race([document.fonts.load(`60px ${FONT}`, '보물빈방대왕문어탐험대해적'), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* 기본 글꼴로 진행 */
  }
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 카툰 스타일: 진한 남색 두꺼운 테두리, 단색 면, 큰 글씨
const INK = '#1c2350';

/** 채우고 남색 테두리 */
function blob(g, fill, lw = 6) {
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = lw;
  g.lineJoin = 'round';
  g.stroke();
}

function frame(g, bg, edge, label, labelColor = '#fff') {
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);
  g.fillStyle = bg;
  rr(g, 10, 10, W - 20, H - 20, 22);
  g.fill();
  g.strokeStyle = edge;
  g.lineWidth = 8;
  rr(g, 22, 22, W - 44, H - 44, 16);
  g.stroke();
  if (label) {
    rr(g, 34, H - 92, W - 68, 60, 18);
    blob(g, edge, 6);
    g.fillStyle = labelColor;
    g.font = `40px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, W / 2, H - 60);
  }
}

const DRAW = {
  back(g) {
    g.fillStyle = INK;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#3a6fd0';
    rr(g, 10, 10, W - 20, H - 20, 22);
    g.fill();
    // 단순한 물결 세 줄
    g.strokeStyle = '#7fb4ff';
    g.lineWidth = 8;
    g.lineCap = 'round';
    for (const y of [64, H - 64]) {
      g.beginPath();
      for (let x = 34; x <= W - 34; x += 6) g.lineTo(x, y + Math.sin(x / 16) * 8);
      g.stroke();
    }
    // 나침반 별
    const cx = W / 2, cy = H / 2;
    g.beginPath();
    g.arc(cx, cy, 66, 0, Math.PI * 2);
    blob(g, '#2a55a8', 6);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const r = i % 2 ? 34 : 82;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      const b = a + Math.PI / 8;
      g.lineTo(cx + Math.cos(b) * 16, cy + Math.sin(b) * 16);
    }
    g.closePath();
    blob(g, '#ffd34d', 6);
    g.strokeStyle = '#ffd34d';
    g.lineWidth = 8;
    rr(g, 22, 22, W - 44, H - 44, 16);
    g.stroke();
  },

  treasure(g) {
    frame(g, '#fff1c4', '#e0952a', '보물');
    const cx = W / 2, cy = 150;
    // 반짝 별 (단순)
    for (const [x, y, r] of [[54, 64, 14], [204, 74, 18], [196, 210, 10]]) {
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rad = i % 2 ? r * 0.35 : r;
        g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      }
      g.closePath();
      blob(g, '#ffd34d', 4);
    }
    // 동전 더미
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse(cx - 44 + i * 22, cy - 26 - (i % 2) * 10, 15, 10, 0, 0, Math.PI * 2);
      blob(g, '#ffd34d', 4);
    }
    // 뚜껑
    g.beginPath();
    g.ellipse(cx, cy - 6, 72, 34, 0, Math.PI, 0);
    g.closePath();
    blob(g, '#c8743a', 6);
    // 상자
    rr(g, cx - 72, cy - 6, 144, 78, 10);
    blob(g, '#a85a2a', 6);
    rr(g, cx - 72, cy + 10, 144, 14, 4);
    blob(g, '#ffc23d', 5);
    rr(g, cx - 14, cy + 2, 28, 34, 6);
    blob(g, '#ffc23d', 5);
  },

  empty(g) {
    frame(g, '#d6f1ff', '#4a90c2', '빈 방');
    // 해초
    g.lineCap = 'round';
    for (const x of [80, 128, 176]) {
      const path = () => {
        g.beginPath();
        g.moveTo(x, 262);
        for (let y = 262; y > 130 + (x % 50); y -= 10) g.lineTo(x + Math.sin(y / 16 + x) * 10, y);
      };
      path();
      g.strokeStyle = INK;
      g.lineWidth = 18;
      g.stroke();
      path();
      g.strokeStyle = '#4fc47d';
      g.lineWidth = 9;
      g.stroke();
    }
    // 거품
    for (const [x, y, r] of [[200, 90, 14], [176, 58, 9], [60, 108, 11], [88, 66, 7]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      blob(g, '#ffffff', 4);
    }
  },

  monster(g) {
    frame(g, '#ffd6e6', '#7c3aed', '대왕문어');
    const cx = W / 2, cy = 124;
    // 촉수 (테두리 먼저)
    g.lineCap = 'round';
    const legs = () => {
      for (let i = 0; i < 6; i++) {
        const dir = i < 3 ? -1 : 1;
        const k = i % 3;
        g.beginPath();
        g.moveTo(cx + dir * (10 + k * 14), cy + 50);
        g.bezierCurveTo(cx + dir * (40 + k * 26), cy + 110, cx + dir * (80 + k * 6), cy + 70 + k * 26, cx + dir * (64 + k * 16), cy + 132 + k * 8);
        g.stroke();
      }
    };
    g.strokeStyle = INK;
    g.lineWidth = 22;
    legs();
    g.strokeStyle = '#a78bfa';
    g.lineWidth = 12;
    legs();
    // 머리
    g.beginPath();
    g.ellipse(cx, cy, 62, 70, 0, 0, Math.PI * 2);
    blob(g, '#a78bfa', 7);
    // 큰 눈
    for (const dx of [-24, 24]) {
      g.beginPath();
      g.arc(cx + dx, cy + 14, 17, 0, Math.PI * 2);
      blob(g, '#ffffff', 5);
      g.fillStyle = INK;
      g.beginPath();
      g.arc(cx + dx + 3, cy + 17, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(cx + dx + 6, cy + 13, 3, 0, Math.PI * 2);
      g.fill();
    }
    // 화난 눈썹
    g.strokeStyle = INK;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(cx - 42, cy - 12);
    g.lineTo(cx - 12, cy - 2);
    g.moveTo(cx + 42, cy - 12);
    g.lineTo(cx + 12, cy - 2);
    g.stroke();
  },

  crew(g) {
    frame(g, '#d4f7ee', '#16a394', '탐험대');
    const cx = W / 2, cy = 140;
    // 망원경
    g.save();
    g.translate(cx - 10, cy);
    g.rotate(-0.5);
    rr(g, -80, -14, 110, 28, 8);
    blob(g, '#c27a3e', 6);
    rr(g, 30, -20, 50, 40, 8);
    blob(g, '#ffc23d', 6);
    rr(g, -88, -17, 14, 34, 4);
    blob(g, '#ffc23d', 5);
    g.restore();
    // 나침반
    g.beginPath();
    g.arc(cx + 40, cy + 74, 32, 0, Math.PI * 2);
    blob(g, '#ffffff', 6);
    g.beginPath();
    g.moveTo(cx + 40, cy + 50);
    g.lineTo(cx + 49, cy + 74);
    g.lineTo(cx + 31, cy + 74);
    g.closePath();
    blob(g, '#ef4444', 3);
  },

  pirate(g) {
    frame(g, '#ffe2c2', '#c2410c', '해적');
    const cx = W / 2, cy = 150;
    // 엇갈린 칼
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.save();
      g.translate(cx, cy + 10);
      g.rotate(s * 0.75);
      const blade = () => {
        g.beginPath();
        g.moveTo(0, -88);
        g.quadraticCurveTo(s * 18, -20, 0, 48);
        g.stroke();
      };
      g.strokeStyle = INK;
      g.lineWidth = 20;
      blade();
      g.strokeStyle = '#e2e8f0';
      g.lineWidth = 10;
      blade();
      rr(g, -22, 46, 44, 14, 6);
      blob(g, '#ffc23d', 5);
      g.restore();
    }
    // 삼각 모자 + 해골 대신 별
    g.beginPath();
    g.moveTo(cx - 74, cy - 58);
    g.quadraticCurveTo(cx, cy - 134, cx + 74, cy - 58);
    g.quadraticCurveTo(cx, cy - 78, cx - 74, cy - 58);
    g.closePath();
    blob(g, '#3b3f6b', 6);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 ? 6 : 14;
      g.lineTo(cx + Math.cos(a) * r, cy - 92 + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#ffd34d';
    g.fill();
  },
};

const canvasCache = new Map();
function cardCanvas(kind) {
  if (!canvasCache.has(kind)) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    DRAW[kind](c.getContext('2d'));
    canvasCache.set(kind, c);
  }
  return canvasCache.get(kind);
}

const urlCache = new Map();
/** HTML에 쓸 카드 그림 */
export function cardImage(kind) {
  if (!urlCache.has(kind)) urlCache.set(kind, cardCanvas(kind).toDataURL());
  return urlCache.get(kind);
}

let geo = null;
let edgeMat = null;
const matCache = new Map();
let anisotropy = 4;
let outlinesOn = true;
export function setAnisotropy(a) {
  anisotropy = a;
}
/** 낮음 품질에서 카드 외곽선 끔 (이후 만드는 카드에 적용) */
export function setCardOutlines(on) {
  outlinesOn = on;
}

function faceMat(kind) {
  if (!matCache.has(kind)) {
    const t = new THREE.CanvasTexture(cardCanvas(kind));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    // 앞면은 상자의 아래(-y)면이라, 카드를 뒤집어 보면 그림이 거꾸로 됨 → 180° 돌려 둠
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI;
    matCache.set(kind, toonMat(0xffffff, { map: t }));
  }
  return matCache.get(kind);
}

/**
 * 카드 메시. 눕혀 놓으면 +y(위)가 뒷면, -y(아래)가 앞면.
 * face를 모르면(남의 카드) 앞면도 뒷면 그림.
 */
export function createCardMesh(face = 'back') {
  if (!geo) {
    geo = new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H);
    edgeMat = toonMat(0x1c2350);
  }
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z
  const m = new THREE.Mesh(geo, [edgeMat, edgeMat, faceMat('back'), faceMat(face), edgeMat, edgeMat]);
  m.castShadow = true;
  m.receiveShadow = true;
  const o = addOutline(m, { color: 0x1c2350, thickness: 0.018 });
  o.visible = outlinesOn;
  return m;
}

/** 이미 놓인 카드의 앞면을 정해 줌 (뒤집기 직전) */
export function setCardFace(mesh, face) {
  mesh.material = [edgeMat, edgeMat, faceMat('back'), faceMat(face), edgeMat, edgeMat];
}
