// 숫자 블록 타일 그림 — 외부 이미지 없이 캔버스로 직접 그림 (독창적 디자인)
// 타일 크기·모양·질감은 타일 배틀과 같은 방식: 상아색 둥근 블록(RoundedBox) + 앞면 CanvasTexture
// 같은 캔버스 그림을 3D 텍스처와 DOM <img>(dataURL)에 같이 씀
import { THREE, roundRect, toonMat } from '../../../shared/table3d.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLORS, JOKER_KIND, kindNum, kindColor } from './rules.js';

export const TILE_W = 0.7;
export const TILE_H = 1.0;
export const TILE_D = 0.24;
export const TILE_RATIO = TILE_H / TILE_W;

const FACE_W = 256;
const FACE_H = 366;
const FONT = '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

// ---------- 꽃 무늬 (색맹 배려: 꽃마다 모양이 다름) ----------
/** 동백: 둥근 꽃잎 5장 / 개나리: 길쭉한 꽃잎 4장(십자) / 수국: 작은 꽃 4송이 마름모 / 제비꽃: 위로 뾰족한 꽃잎 3장(삼각) */
function flowerPass(ctx, c, cx, cy, size, outline) {
  const fill = () => {
    if (outline) ctx.stroke();
    ctx.fill();
  };
  const paint = (v) => (ctx.fillStyle = outline || v);
  const col = COLORS[c].color;
  const r = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  paint(col);
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = size * 0.1;
    ctx.lineJoin = 'round';
  }
  if (c === 0) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.42, 0, Math.PI * 2);
      fill();
    }
    paint('#ffd34d');
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
    fill();
  } else if (c === 1) {
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.5, r * 0.24, r * 0.5, 0, 0, Math.PI * 2);
      fill();
      ctx.restore();
    }
    paint('#fff6d0');
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
    fill();
  } else if (c === 2) {
    const pts = [
      [0, -0.55],
      [0.55, 0],
      [0, 0.55],
      [-0.55, 0],
    ];
    for (const [x, y] of pts) {
      ctx.save();
      ctx.translate(x * r, y * r);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.17, r * 0.13, r * 0.19, 0, 0, Math.PI * 2);
        fill();
      }
      ctx.restore();
    }
    paint('rgba(255,255,255,.85)');
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x * r, y * r, r * 0.07, 0, Math.PI * 2);
      fill();
    }
  } else {
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 0.55, -r * 0.45, 0, -r * 0.98);
      ctx.quadraticCurveTo(-r * 0.55, -r * 0.45, 0, 0);
      fill();
      ctx.restore();
    }
    paint('#fff');
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
    fill();
  }
  ctx.restore();
}

/** outline 색을 주면 꽃 모양 그대로 두꺼운 테두리를 먼저 그림 (카툰) */
export function drawFlower(ctx, c, cx, cy, size, outline = null) {
  if (outline) flowerPass(ctx, c, cx, cy, size, outline);
  flowerPass(ctx, c, cx, cy, size, null);
}

/** 새싹(조커): 흙더미에서 올라온 떡잎 두 장 */
export function drawSprout(ctx, cx, cy, size) {
  const s = size / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#8a5a35';
  ctx.beginPath();
  ctx.ellipse(0, 38 * s, 42 * s, 13 * s, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = '#3f9a3a';
  ctx.lineWidth = 7 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 34 * s);
  ctx.quadraticCurveTo(-4 * s, 5 * s, 2 * s, -14 * s);
  ctx.stroke();
  const leaf = (dir) => {
    ctx.save();
    ctx.translate(2 * s, -14 * s);
    ctx.scale(dir, 1);
    ctx.fillStyle = dir > 0 ? '#5cc24f' : '#48ad3e';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(10 * s, -30 * s, 40 * s, -34 * s, 46 * s, -20 * s);
    ctx.bezierCurveTo(40 * s, -2 * s, 14 * s, 6 * s, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.moveTo(4 * s, -3 * s);
    ctx.quadraticCurveTo(22 * s, -16 * s, 40 * s, -19 * s);
    ctx.stroke();
    ctx.restore();
  };
  leaf(1);
  leaf(-1);
  ctx.restore();
}

/** 타일 앞면 (상아색 바탕 + 숫자 + 꽃 무늬) */
export function drawFace(ctx, kind, w = FACE_W, h = FACE_H) {
  ctx.save();
  ctx.scale(w / FACE_W, h / FACE_H);
  // 카툰: 단색 크림 바탕 + 두꺼운 남색 테두리
  ctx.fillStyle = '#2e2a52';
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  ctx.fillStyle = '#fffaf0';
  roundRect(ctx, 12, 12, FACE_W - 24, FACE_H - 24, 30);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (kind >= JOKER_KIND) {
    ctx.fillStyle = '#dcf5cf';
    roundRect(ctx, 26, 26, FACE_W - 52, FACE_H - 52, 24);
    ctx.fill();
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 7;
    ctx.setLineDash([18, 10]);
    roundRect(ctx, 26, 26, FACE_W - 52, FACE_H - 52, 24);
    ctx.stroke();
    ctx.setLineDash([]);
    drawSprout(ctx, FACE_W / 2, 150, 200);
    ctx.font = `60px ${FONT}`;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.strokeText('새싹', FACE_W / 2, 292);
    ctx.fillStyle = '#2e7d32';
    ctx.fillText('새싹', FACE_W / 2, 292);
  } else {
    const c = kindColor(kind);
    const n = kindNum(kind);
    const col = COLORS[c];
    // 아래쪽 꽃밭 띠 (꽃색 옅은 바탕 + 꽃색 테두리)
    ctx.fillStyle = col.light;
    roundRect(ctx, 28, 214, FACE_W - 56, 122, 26);
    ctx.fill();
    ctx.strokeStyle = col.color;
    ctx.lineWidth = 6;
    ctx.stroke();
    // 큰 숫자: 흰 테두리로 또렷하게
    ctx.font = `${n >= 10 ? 142 : 172}px ${FONT}`;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 12;
    ctx.strokeText(String(n), FACE_W / 2, 116);
    ctx.fillStyle = col.color;
    ctx.fillText(String(n), FACE_W / 2, 116);
    // 6과 9 헷갈리지 않게 밑줄
    if (n === 6 || n === 9) {
      roundRect(ctx, FACE_W / 2 - 34, 186, 68, 10, 5);
      ctx.fill();
    }
    // 꽃 기호: 남색 그림자 테두리 위에 꽃 (모양으로 구분 — 색맹 배려)
    drawFlower(ctx, c, FACE_W / 2, 275, 108, '#2e2a52');
  }
  ctx.restore();
}

/** 뒷면: 초록 격자 울타리 + 가운데 꽃 문양 */
export function drawBack(ctx, w = FACE_W, h = FACE_H) {
  ctx.save();
  ctx.scale(w / FACE_W, h / FACE_H);
  ctx.fillStyle = '#2e2a52';
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  ctx.fillStyle = '#58b86a';
  roundRect(ctx, 12, 12, FACE_W - 24, FACE_H - 24, 30);
  ctx.fill();
  ctx.save();
  roundRect(ctx, 12, 12, FACE_W - 24, FACE_H - 24, 30);
  ctx.clip();
  ctx.strokeStyle = '#6fcb7e';
  ctx.lineWidth = 10;
  for (let x = -FACE_H; x < FACE_W + FACE_H; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + FACE_H, FACE_H);
    ctx.moveTo(x + FACE_H, 0);
    ctx.lineTo(x, FACE_H);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.arc(FACE_W / 2, FACE_H / 2, 66, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2e2a52';
  ctx.lineWidth = 8;
  ctx.stroke();
  // 네 가지 꽃이 한 송이씩
  [0, 1, 2, 3].forEach((c, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    drawFlower(ctx, c, FACE_W / 2 + Math.cos(a) * 32, FACE_H / 2 + Math.sin(a) * 32, 40, '#2e2a52');
  });
  ctx.restore();
}

// ---------- DOM 이미지 (dataURL 캐시) ----------
const urlCache = new Map();
function canvasUrl(key, draw, w, h) {
  if (!urlCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    urlCache.set(key, c.toDataURL());
  }
  return urlCache.get(key);
}
/** 종류(0~52) → 앞면 그림 주소 */
export const faceUrl = (kind) => canvasUrl('f' + kind, (ctx, w, h) => drawFace(ctx, Number(kind), w, h), 160, 229);
export const backUrl = () => canvasUrl('back', drawBack, 160, 229);

// ---------- 3D ----------
let geometry = null;
let bodyMat = null;
let backMat = null;
const faceMats = new Map();

function makeTexture(draw) {
  const c = document.createElement('canvas');
  c.width = FACE_W;
  c.height = FACE_H;
  draw(c.getContext('2d'), FACE_W, FACE_H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function shared() {
  if (geometry) return;
  geometry = new RoundedBoxGeometry(TILE_W, TILE_H, TILE_D, 3, 0.07);
  bodyMat = toonMat(0xfff6df);
  backMat = toonMat(0xffffff, { map: makeTexture(drawBack) });
}

/** 앞면 타일: 면 순서 +x, -x, +y, -y, +z(앞), -z(뒤) — 앞면이 +z */
export function tileMesh(kind) {
  shared();
  if (!faceMats.has(kind)) faceMats.set(kind, toonMat(0xffffff, { map: makeTexture((ctx) => drawFace(ctx, kind)) }));
  const m = new THREE.Mesh(geometry, [bodyMat, bodyMat, bodyMat, bodyMat, faceMats.get(kind), backMat]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** 양쪽 모두 뒷면인 타일 (남의 받침대, 뽑을 더미) */
export function backMesh() {
  shared();
  const m = new THREE.Mesh(geometry, [bodyMat, bodyMat, bodyMat, bodyMat, backMat, backMat]);
  m.castShadow = true;
  return m;
}
