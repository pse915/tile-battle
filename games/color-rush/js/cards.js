// 컬러 러시 카드 그림: '작은 칠판' 카드 — 나무 테두리, 칠판 바탕, 형광펜 자국, 분필 글씨
// 같은 캔버스 그림을 3D 텍스처(cardTex)와 DOM <img>(cardImg)에 같이 씀
import { canvasTexture, roundRect } from '../../../shared/table3d.js';
import { COLOR_HEX, COLORS, isNumber } from './rules.js';

export const CW = 240;
export const CH = 360;
export const CARD_RATIO = CH / CW;

/** 코드마다 같은 무늬가 나오게 하는 작은 난수 */
function rng(seed) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function board(ctx, w, h, seed) {
  const r = rng(seed);
  // 나무 테두리
  roundRect(ctx, 0, 0, w, h, 22);
  const wood = ctx.createLinearGradient(0, 0, w, h);
  wood.addColorStop(0, '#c99a62');
  wood.addColorStop(1, '#9a6b3c');
  ctx.fillStyle = wood;
  ctx.fill();
  // 칠판
  roundRect(ctx, 11, 11, w - 22, h - 22, 14);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a3d36');
  g.addColorStop(1, '#1a2924');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // 분필 가루
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.07})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2);
  }
  // 지우개 자국
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(20, h * (0.15 + r() * 0.1));
  ctx.quadraticCurveTo(w / 2, h * 0.1, w - 20, h * (0.2 + r() * 0.1));
  ctx.stroke();
  ctx.restore();
}

/** 형광펜으로 한 번 쓱 그은 자국 */
function swipe(ctx, color, cx, cy, len, thick, angle, seed, alpha = 0.55) {
  const r = rng(seed + 'sw');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    const y = (k - 1) * thick * 0.18;
    ctx.moveTo(-len / 2, y - thick / 2 + r() * 4);
    ctx.lineTo(len / 2 - 6, y - thick / 2 + r() * 6);
    ctx.lineTo(len / 2, y + thick / 2 - r() * 4);
    ctx.lineTo(-len / 2 + 8, y + thick / 2 + r() * 3);
    ctx.closePath();
    ctx.globalAlpha = alpha * (k === 1 ? 1 : 0.5);
    ctx.fill();
  }
  ctx.restore();
}

/** 색마다 모양: 분필 ▲ · 형광 ★ · 크레용 ◆ · 잉크 물방울 */
export function shapePath(ctx, col, x, y, s) {
  ctx.beginPath();
  if (col === 'c') {
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.95, y + s * 0.75);
    ctx.lineTo(x - s * 0.95, y + s * 0.75);
    ctx.closePath();
  } else if (col === 'p') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? s * 0.45 : s;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  } else if (col === 'o') {
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.75, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.75, y);
    ctx.closePath();
  } else {
    ctx.moveTo(x, y - s);
    ctx.bezierCurveTo(x + s * 0.2, y - s * 0.5, x + s * 0.8, y, x + s * 0.8, y + s * 0.3);
    ctx.arc(x, y + s * 0.3, s * 0.8, 0, Math.PI);
    ctx.bezierCurveTo(x - s * 0.8, y, x - s * 0.2, y - s * 0.5, x, y - s);
    ctx.closePath();
  }
}

function shape(ctx, col, x, y, s) {
  shapePath(ctx, col, x, y, s);
  ctx.fillStyle = COLOR_HEX[col];
  ctx.fill();
  ctx.lineWidth = Math.max(2, s * 0.14);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
}

function chalkText(ctx, text, x, y, size, fill) {
  ctx.font = `${size}px Jua, "Malgun Gothic", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.12;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** 건너뛰기: 손바닥 '멈춰' 표지 */
function iconSkip(ctx, x, y, s, col) {
  ctx.lineWidth = s * 0.2;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.62, y + s * 0.62);
  ctx.lineTo(x + s * 0.62, y - s * 0.62);
  ctx.stroke();
}

/** 방향 바꾸기: 위아래로 엇갈린 꺾인 화살표 두 개 */
function iconReverse(ctx, x, y, s, col) {
  const arrow = (dir) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, dir);
    ctx.beginPath();
    ctx.moveTo(-s * 0.9, s * 0.15);
    ctx.lineTo(-s * 0.9, -s * 0.35);
    ctx.lineTo(s * 0.35, -s * 0.35);
    ctx.lineTo(s * 0.35, -s * 0.75);
    ctx.lineTo(s * 0.95, -s * 0.1);
    ctx.lineTo(s * 0.35, s * 0.55);
    ctx.lineTo(s * 0.35, s * 0.15);
    ctx.closePath();
    ctx.translate(0, -s * 0.12);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = s * 0.12;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();
  };
  arrow(1);
  arrow(-1);
}

function drawFace(ctx, w, h, code) {
  board(ctx, w, h, code);
  const col = code[0];
  const v = code[1];
  const wild = col === 'w';
  const hex = wild ? '#ffffff' : COLOR_HEX[col];
  if (wild) {
    COLORS.forEach((c, i) => swipe(ctx, COLOR_HEX[c], w / 2, h * 0.3 + i * h * 0.13, w * 0.9, 40, -0.12, code + i, 0.6));
  } else {
    swipe(ctx, hex, w / 2, h / 2, w * 1.05, 120, -0.38, code);
  }
  // 가운데
  if (isNumber(code)) {
    chalkText(ctx, v, w / 2, h / 2 + 6, 168, hex);
    if (v === '6' || v === '9') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(w / 2 - 34, h / 2 + 86, 68, 8); // 6과 9 구분 밑줄
    }
  } else if (v === 'S') iconSkip(ctx, w / 2, h / 2, 62, hex);
  else if (v === 'R') iconReverse(ctx, w / 2, h / 2, 74, hex);
  else if (v === 'D') chalkText(ctx, '+2', w / 2, h / 2 + 4, 118, hex);
  else if (v === 'F') {
    COLORS.forEach((c, i) => shape(ctx, c, w / 2 + (i % 2 ? 46 : -46), h / 2 + (i < 2 ? -78 : 82), 22));
    chalkText(ctx, '+4', w / 2, h / 2 + 4, 116, '#ffe36a');
  } else if (v === 'W') {
    COLORS.forEach((c, i) => shape(ctx, c, w / 2 + (i % 2 ? 40 : -40), h / 2 + (i < 2 ? -40 : 44), 34));
  }
  // 모서리
  const corner = v === 'S' ? '⊘' : v === 'R' ? '⇄' : v === 'D' ? '+2' : v === 'F' ? '+4' : v === 'W' ? '★' : v;
  const drawCorner = () => {
    ctx.font = `${corner.length > 1 ? 34 : 42}px Jua, "Malgun Gothic", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(corner, 40, 46);
    if (!wild) shape(ctx, col, 40, 88, 13);
    else {
      ctx.font = '18px Jua, sans-serif';
      ctx.fillText('색', 40, 84);
    }
  };
  drawCorner();
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  drawCorner();
  ctx.restore();
  if (wild) {
    ctx.font = '22px Jua, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.textAlign = 'center';
    ctx.fillText(v === 'W' ? '색 바꾸기' : '색 바꾸고 +4', w / 2, h - 36);
  }
}

function drawBack(ctx, w, h) {
  board(ctx, w, h, 'back');
  COLORS.forEach((c, i) => swipe(ctx, COLOR_HEX[c], w / 2, h * 0.36 + i * 34, w * 0.8, 26, -0.3 + i * 0.05, 'b' + i, 0.7));
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.12);
  chalkText(ctx, '컬러', 0, -30, 64, '#ffffff');
  chalkText(ctx, '러시', 0, 38, 64, '#ffe36a');
  ctx.restore();
  // 분필 낙서: 별과 밑줄
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(48, h - 60);
  ctx.quadraticCurveTo(w / 2, h - 80, w - 48, h - 56);
  ctx.stroke();
  shapePath(ctx, 'p', w - 52, 56, 18);
  ctx.stroke();
}

export function cardTex(code) {
  return canvasTexture('cr-' + code, (ctx, w, h) => drawFace(ctx, w, h, code), CW, CH);
}
export function backTex() {
  return canvasTexture('cr-back', drawBack, CW, CH);
}

const imgCache = new Map();
/** DOM <img>용 dataURL (텍스처와 같은 그림) */
export function cardImg(code) {
  if (!code) return backImg();
  if (!imgCache.has(code)) imgCache.set(code, cardTex(code).userData.canvas.toDataURL('image/png'));
  return imgCache.get(code);
}
export function backImg() {
  if (!imgCache.has('back')) imgCache.set('back', backTex().userData.canvas.toDataURL('image/png'));
  return imgCache.get('back');
}

/** 색 고르기 버튼 안에 넣을 작은 모양 그림 */
export function swatchImg(col) {
  const key = 'sw-' + col;
  if (!imgCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    shape(ctx, col, 32, 32, 24);
    imgCache.set(key, c.toDataURL('image/png'));
  }
  return imgCache.get(key);
}
