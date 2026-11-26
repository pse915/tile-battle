// 카드 그림 — 외부 이미지 없이 Canvas로 직접 그림 (오리지널 디자인)
import * as THREE from 'three';

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

function frame(g, bg, edge, label, labelColor = '#fff') {
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = edge;
  g.lineWidth = 6;
  rr(g, 12, 12, W - 24, H - 24, 18);
  g.stroke();
  if (label) {
    g.fillStyle = edge;
    rr(g, 40, H - 82, W - 80, 50, 14);
    g.fill();
    g.fillStyle = labelColor;
    g.font = `34px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, W / 2, H - 56);
  }
}

const DRAW = {
  back(g) {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#13355a');
    grad.addColorStop(1, '#0a1f38');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // 물결 무늬
    g.strokeStyle = 'rgba(120,200,255,0.18)';
    g.lineWidth = 3;
    for (let y = 30; y < H; y += 28) {
      g.beginPath();
      for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin(x / 18 + y) * 5);
      g.stroke();
    }
    // 나침반 장미
    const cx = W / 2, cy = H / 2;
    g.fillStyle = '#e8c15a';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r = i % 2 ? 46 : 78;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      g.lineTo(cx + Math.cos(a + 0.35) * 16, cy + Math.sin(a + 0.35) * 16);
      g.lineTo(cx + Math.cos(a - 0.35) * 16, cy + Math.sin(a - 0.35) * 16);
      g.fill();
    }
    g.strokeStyle = '#e8c15a';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, 58, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#e8c15a';
    g.lineWidth = 5;
    rr(g, 12, 12, W - 24, H - 24, 18);
    g.stroke();
  },

  treasure(g) {
    frame(g, '#f6e3b4', '#b7791f', '보물');
    const cx = W / 2, cy = 150;
    // 반짝이는 빛
    g.fillStyle = 'rgba(255,215,90,0.45)';
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a - 0.12) * 120, cy + Math.sin(a - 0.12) * 120);
      g.lineTo(cx + Math.cos(a + 0.12) * 120, cy + Math.sin(a + 0.12) * 120);
      g.fill();
    }
    // 상자
    g.fillStyle = '#8b4a1c';
    rr(g, cx - 70, cy - 10, 140, 76, 8);
    g.fill();
    g.fillStyle = '#a65d24';
    g.beginPath();
    g.ellipse(cx, cy - 10, 70, 34, 0, Math.PI, 0);
    g.fill();
    // 동전 더미
    g.fillStyle = '#ffd34d';
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(cx - 48 + (i % 5) * 24, cy - 22 - Math.floor(i / 5) * 12, 13, 8, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#e0a400';
    rr(g, cx - 72, cy + 10, 144, 12, 3);
    g.fill();
    rr(g, cx - 12, cy - 2, 24, 32, 4);
    g.fill();
  },

  empty(g) {
    frame(g, '#d7ecf5', '#4b7f99', '빈 방');
    // 거품과 해초
    g.strokeStyle = '#3f8f6b';
    g.lineWidth = 8;
    g.lineCap = 'round';
    for (const x of [78, 128, 178]) {
      g.beginPath();
      g.moveTo(x, 270);
      for (let y = 270; y > 120 + (x % 50); y -= 10) g.lineTo(x + Math.sin(y / 14 + x) * 10, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(75,127,153,0.8)';
    g.lineWidth = 3;
    for (const [x, y, r] of [[200, 90, 12], [180, 60, 7], [60, 110, 9], [90, 70, 5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    }
  },

  monster(g) {
    frame(g, '#2a1240', '#c2410c', '대왕문어');
    const cx = W / 2, cy = 130;
    // 촉수
    g.strokeStyle = '#7c3aed';
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const dir = i < 3 ? -1 : 1;
      const k = i % 3;
      g.lineWidth = 16 - k * 3;
      g.beginPath();
      g.moveTo(cx + dir * (10 + k * 14), cy + 50);
      g.bezierCurveTo(cx + dir * (40 + k * 30), cy + 120, cx + dir * (90 + k * 8), cy + 70 + k * 30, cx + dir * (70 + k * 18), cy + 140 + k * 10);
      g.stroke();
    }
    // 머리
    g.fillStyle = '#8b5cf6';
    g.beginPath();
    g.ellipse(cx, cy, 62, 72, 0, 0, Math.PI * 2);
    g.fill();
    // 눈
    for (const dx of [-24, 24]) {
      g.fillStyle = '#fff7d6';
      g.beginPath();
      g.arc(cx + dx, cy + 18, 16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.beginPath();
      g.ellipse(cx + dx, cy + 20, 5, 11, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.ellipse(cx - 22, cy - 34, 16, 10, -0.5, 0, Math.PI * 2);
    g.fill();
  },

  crew(g) {
    frame(g, '#d1f0ea', '#0f766e', '탐험대');
    const cx = W / 2, cy = 150;
    // 망원경
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.5);
    g.fillStyle = '#8b5a2b';
    rr(g, -80, -14, 110, 28, 6);
    g.fill();
    g.fillStyle = '#d4a017';
    rr(g, 30, -18, 50, 36, 6);
    g.fill();
    g.fillStyle = '#d4a017';
    rr(g, -86, -16, 12, 32, 3);
    g.fill();
    g.restore();
    // 나침반
    g.strokeStyle = '#0f766e';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx + 40, cy + 70, 30, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#dc2626';
    g.beginPath();
    g.moveTo(cx + 40, cy + 46);
    g.lineTo(cx + 48, cy + 70);
    g.lineTo(cx + 32, cy + 70);
    g.fill();
  },

  pirate(g) {
    frame(g, '#3b1a1a', '#e8c15a', '해적', '#3b1a1a');
    const cx = W / 2, cy = 150;
    // 엇갈린 갈고리 칼
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.save();
      g.translate(cx, cy + 10);
      g.rotate(s * 0.75);
      g.strokeStyle = '#cbd5e1';
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(0, -90);
      g.quadraticCurveTo(s * 18, -20, 0, 50);
      g.stroke();
      g.strokeStyle = '#e8c15a';
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(-18, 52);
      g.lineTo(18, 52);
      g.stroke();
      g.restore();
    }
    // 삼각 모자
    g.fillStyle = '#111';
    g.beginPath();
    g.moveTo(cx - 70, cy - 60);
    g.quadraticCurveTo(cx, cy - 130, cx + 70, cy - 60);
    g.quadraticCurveTo(cx, cy - 80, cx - 70, cy - 60);
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
export function setAnisotropy(a) {
  anisotropy = a;
}

function faceMat(kind) {
  if (!matCache.has(kind)) {
    const t = new THREE.CanvasTexture(cardCanvas(kind));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    // 앞면은 상자의 아래(-y)면이라, 카드를 뒤집어 보면 그림이 거꾸로 됨 → 180° 돌려 둠
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI;
    matCache.set(kind, new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 }));
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
    edgeMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.7 });
  }
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z
  const m = new THREE.Mesh(geo, [edgeMat, edgeMat, faceMat('back'), faceMat(face), edgeMat, edgeMat]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** 이미 놓인 카드의 앞면을 정해 줌 (뒤집기 직전) */
export function setCardFace(mesh, face) {
  mesh.material = [edgeMat, edgeMat, faceMat('back'), faceMat(face), edgeMat, edgeMat];
}
