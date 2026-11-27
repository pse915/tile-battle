// 타일 메시와 CanvasTexture — 외부 이미지 없이 전부 직접 그림
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SUITS } from './rules.js';
import { toonMat, addOutline } from '../../../shared/table3d.js';

const INK = '#2a2240'; // 카툰 외곽선 색 (3D 외곽선과 같은 계열)
const OUTLINE = 0x2a2240;
let outlinesOn = true;
/** 낮음 품질에서 새로 만드는 타일 외곽선 끔 */
export function setTileOutlines(on) {
  outlinesOn = on;
}

export const TILE_W = 0.7;
export const TILE_H = 1.0;
export const TILE_D = 0.24;

const FACE_W = 256;
const FACE_H = 366;
const DISPLAY_FONT = '"Jua", "Gowun Dodum", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

let geometry = null;
let bodyMat = null;
let backMat = null;
let anisotropy = 4;
const faceCache = new Map();

export async function ensureFonts() {
  try {
    await Promise.race([
      document.fonts.load(`120px ${DISPLAY_FONT}`, '0123456789끝'),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* 폰트를 못 불러와도 기본 글꼴로 진행 */
  }
}

export function setAnisotropy(a) {
  anisotropy = a;
}

// ---------- 문양 그리기 (3D 타일과 HTML 아이콘 공용) ----------
export function drawSuit(ctx, s, cx, cy, size) {
  const color = SUITS[s].color;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = size * 0.07;
  ctx.lineJoin = 'round';
  const r = size / 2;
  if (s === 0) {
    // 구름: 둥근 덩어리 세 개 + 평평한 바닥
    const cloud = () => {
      ctx.beginPath();
      ctx.arc(cx - r * 0.45, cy + r * 0.12, r * 0.38, 0, Math.PI * 2);
      ctx.moveTo(cx + r * 0.55, cy - r * 0.18);
      ctx.arc(cx + r * 0.05, cy - r * 0.18, r * 0.5, 0, Math.PI * 2);
      ctx.moveTo(cx + r * 0.88, cy + r * 0.12);
      ctx.arc(cx + r * 0.52, cy + r * 0.12, r * 0.36, 0, Math.PI * 2);
      ctx.rect(cx - r * 0.6, cy + r * 0.05, r * 1.2, r * 0.45);
    };
    // 외곽선을 두껍게 먼저 깔고 그 위에 색 → 겹친 원의 안쪽 선이 안 보임
    ctx.lineWidth = size * 0.14;
    cloud();
    ctx.stroke();
    cloud();
    ctx.fill();
  } else if (s === 1) {
    // 별: 뾰족한 다섯 꼭짓점
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.42;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.02);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  } else if (s === 2) {
    // 달: 초승달 (임시 캔버스에서 잘라냄)
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * 1.2);
    const g = c.getContext('2d');
    const o = c.width / 2;
    // 진한 색 초승달(조금 크게) 위에 문양 색 초승달 → 테두리
    const crescent = (fill, grow) => {
      g.globalCompositeOperation = 'source-over';
      const t = document.createElement('canvas');
      t.width = t.height = c.width;
      const h = t.getContext('2d');
      h.fillStyle = fill;
      h.beginPath();
      h.arc(o, o, r * 0.92 + grow, 0, Math.PI * 2);
      h.fill();
      h.globalCompositeOperation = 'destination-out';
      h.beginPath();
      h.arc(o + r * 0.42, o - r * 0.22, r * 0.74 - grow, 0, Math.PI * 2);
      h.fill();
      g.drawImage(t, 0, 0);
    };
    crescent(INK, size * 0.045);
    crescent(color, 0);
    ctx.drawImage(c, cx - o, cy - o);
  } else {
    // 해: 원 + 여덟 개의 삼각 광선
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - 0.2) * r * 0.62, cy + Math.sin(a - 0.2) * r * 0.62);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a + 0.2) * r * 0.62, cy + Math.sin(a + 0.2) * r * 0.62);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.15, cy - r * 0.15, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** HTML에서 쓸 문양 아이콘 (data URL) */
const iconCache = new Map();
export function suitIcon(s, px = 40) {
  const key = `${s}-${px}`;
  if (!iconCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = px * 2;
    drawSuit(c.getContext('2d'), s, px, px, px * 1.6);
    iconCache.set(key, c.toDataURL());
  }
  return iconCache.get(key);
}

/** HTML에서 쓸 작은 타일 그림 (data URL) */
export function tileImage(tile) {
  return faceCanvas(tile).toDataURL();
}

function faceCanvas(tile) {
  const c = document.createElement('canvas');
  c.width = FACE_W;
  c.height = FACE_H;
  const ctx = c.getContext('2d');
  const suit = SUITS[tile.s];
  // 바탕: 단색 크림 (카툰: 그러데이션 없음)
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  // 두꺼운 진한 테두리 + 안쪽 문양 색 띠
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 12;
  roundRect(ctx, 12, 12, FACE_W - 24, FACE_H - 24, 30);
  ctx.stroke();
  ctx.strokeStyle = suit.color;
  ctx.lineWidth = 8;
  roundRect(ctx, 26, 26, FACE_W - 52, FACE_H - 52, 20);
  ctx.stroke();
  // 큰 숫자 (진한 테두리)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = tile.n >= 10 ? 140 : 176;
  ctx.font = `${fs}px ${DISPLAY_FONT}`;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 14;
  ctx.strokeText(String(tile.n), FACE_W / 2, 130);
  ctx.fillStyle = suit.color;
  ctx.fillText(String(tile.n), FACE_W / 2, 130);
  // 문양
  drawSuit(ctx, tile.s, FACE_W / 2, 268, 112);
  // 2는 가장 센 숫자라 금색 별점으로 표시
  if (tile.n === 2) {
    ctx.fillStyle = '#ffc928';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(FACE_W - 48, 48, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
  return c;
}

function makeTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

function backCanvas() {
  const c = document.createElement('canvas');
  c.width = FACE_W;
  c.height = FACE_H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a6fb5';
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 12;
  roundRect(ctx, 12, 12, FACE_W - 24, FACE_H - 24, 30);
  ctx.stroke();
  // OMR 답안지 마킹 칸 무늬
  const cols = 6, rows = 9;
  const filled = new Set([3, 8, 16, 21, 27, 34, 40, 47, 51]);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const cx = 38 + x * 36;
      const cy = 38 + y * 36.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 9, 12, 0, 0, Math.PI * 2);
      if (filled.has(y * cols + x)) {
        ctx.fillStyle = '#ffd84d';
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
  // 가운데 엠블럼
  ctx.fillStyle = '#ffd84d';
  roundRect(ctx, 58, 136, 140, 94, 20);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `64px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('끝!', 128, 186);
  return c;
}

function shared() {
  if (!geometry) {
    geometry = new RoundedBoxGeometry(TILE_W, TILE_H, TILE_D, 3, 0.07);
    bodyMat = toonMat(0xfff3d6);
    backMat = toonMat(0xffffff, { map: makeTexture(backCanvas()) });
  }
}

function outline(mesh, thickness = 0.028) {
  addOutline(mesh, { color: OUTLINE, thickness }).visible = outlinesOn;
}

/** 앞면이 보이는 타일 메시 */
export function createTileMesh(tile) {
  shared();
  if (!faceCache.has(tile.id)) {
    faceCache.set(tile.id, toonMat(0xffffff, { map: makeTexture(faceCanvas(tile)) }));
  }
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z(앞), -z(뒤)
  const mesh = new THREE.Mesh(geometry, [bodyMat, bodyMat, bodyMat, bodyMat, faceCache.get(tile.id), backMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.tile = tile;
  outline(mesh);
  return mesh;
}

/** 상대 손패처럼 뒷면만 보이는 타일 */
export function createBackMesh() {
  shared();
  const mesh = new THREE.Mesh(geometry, [bodyMat, bodyMat, bodyMat, bodyMat, backMat, backMat]);
  mesh.castShadow = true;
  outline(mesh, 0.05);
  return mesh;
}


let backUrl = null;
/** HTML에서 쓸 타일 뒷면 그림 (오프라인 테이블 모드) */
export function tileBackImage() {
  if (!backUrl) backUrl = backCanvas().toDataURL();
  return backUrl;
}
