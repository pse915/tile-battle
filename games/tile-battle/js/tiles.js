// 타일 메시와 CanvasTexture — 외부 이미지 없이 전부 직접 그림
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SUITS } from './rules.js';

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
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = size * 0.04;
  const r = size / 2;
  if (s === 0) {
    // 구름: 둥근 덩어리 세 개 + 평평한 바닥
    ctx.beginPath();
    ctx.arc(cx - r * 0.45, cy + r * 0.12, r * 0.38, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.05, cy - r * 0.18, r * 0.5, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.52, cy + r * 0.12, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, cx - r * 0.83, cy + r * 0.05, r * 1.7, r * 0.45, r * 0.22);
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
    ctx.fill();
    ctx.stroke();
  } else if (s === 2) {
    // 달: 초승달 (임시 캔버스에서 잘라냄)
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * 1.2);
    const g = c.getContext('2d');
    const o = c.width / 2;
    g.fillStyle = color;
    g.beginPath();
    g.arc(o, o, r * 0.92, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(o + r * 0.42, o - r * 0.22, r * 0.74, 0, Math.PI * 2);
    g.fill();
    ctx.drawImage(c, cx - o, cy - o);
  } else {
    // 해: 원 + 여덟 개의 삼각 광선
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - 0.2) * r * 0.62, cy + Math.sin(a - 0.2) * r * 0.62);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a + 0.2) * r * 0.62, cy + Math.sin(a + 0.2) * r * 0.62);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
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
  // 바탕: 상아색 + 아주 옅은 세로 그러데이션
  const g = ctx.createLinearGradient(0, 0, 0, FACE_H);
  g.addColorStop(0, '#fffef9');
  g.addColorStop(1, '#f3efe2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  // 문양 색 테두리
  ctx.strokeStyle = suit.color;
  ctx.lineWidth = 7;
  roundRect(ctx, 18, 18, FACE_W - 36, FACE_H - 36, 22);
  ctx.stroke();
  // 숫자
  ctx.fillStyle = suit.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = tile.n >= 10 ? 128 : 158;
  ctx.font = `${fs}px ${DISPLAY_FONT}`;
  ctx.fillText(String(tile.n), FACE_W / 2, 128);
  // 문양
  drawSuit(ctx, tile.s, FACE_W / 2, 262, 118);
  // 2는 가장 센 숫자라 금색 점으로 표시
  if (tile.n === 2) {
    ctx.fillStyle = '#e0a400';
    ctx.beginPath();
    ctx.arc(FACE_W - 44, 44, 9, 0, Math.PI * 2);
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
  ctx.fillStyle = '#1e3a5f';
  ctx.fillRect(0, 0, FACE_W, FACE_H);
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
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
  // 가운데 엠블럼
  ctx.fillStyle = '#ffd84d';
  roundRect(ctx, 58, 136, 140, 94, 20);
  ctx.fill();
  ctx.fillStyle = '#1e3a5f';
  ctx.font = `64px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('끝!', 128, 186);
  return c;
}

function shared() {
  if (!geometry) {
    geometry = new RoundedBoxGeometry(TILE_W, TILE_H, TILE_D, 3, 0.07);
    bodyMat = new THREE.MeshStandardMaterial({ color: 0xf6f0de, roughness: 0.32, metalness: 0.0 });
    backMat = new THREE.MeshStandardMaterial({ map: makeTexture(backCanvas()), roughness: 0.4 });
  }
}

/** 앞면이 보이는 타일 메시 */
export function createTileMesh(tile) {
  shared();
  if (!faceCache.has(tile.id)) {
    faceCache.set(tile.id, new THREE.MeshStandardMaterial({ map: makeTexture(faceCanvas(tile)), roughness: 0.3 }));
  }
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z(앞), -z(뒤)
  const mesh = new THREE.Mesh(geometry, [bodyMat, bodyMat, bodyMat, bodyMat, faceCache.get(tile.id), backMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.tile = tile;
  return mesh;
}

/** 상대 손패처럼 뒷면만 보이는 타일 */
export function createBackMesh() {
  shared();
  const mesh = new THREE.Mesh(geometry, [bodyMat, bodyMat, bodyMat, bodyMat, backMat, backMat]);
  mesh.castShadow = true;
  return mesh;
}


let backUrl = null;
/** HTML에서 쓸 타일 뒷면 그림 (오프라인 테이블 모드) */
export function tileBackImage() {
  if (!backUrl) backUrl = backCanvas().toDataURL();
  return backUrl;
}
