// 원카드 카드 그림: 크림색 바탕, 두꺼운 남색 테두리, 둥근 모서리, 큰 숫자와 큰 무늬
// 빨강(♥♦)/검정(♠♣)은 색과 모양 둘 다로 구분 (색맹 배려: 무늬 기호를 크게, 빨강 무늬엔 점 테두리)
// 조커: 흑백 조커 = 별 모자 쓴 달 광대, 컬러 조커 = 무지개 별 광대 (직접 그린 그림)
// 같은 캔버스 그림을 3D 텍스처(cardTex)와 DOM <img>(cardImg)에 같이 씀
import { canvasTexture, roundRect } from '../../../shared/table3d.js';
import { SUIT_RED, RANK_LABEL, isJoker } from './rules.js';

export const CW = 240;
export const CH = 360;
export const CARD_RATIO = CH / CW;
const INK = '#1f3550';
const RED = '#e2384d';
const BLACK = '#1f2a3a';
export const SUIT_HEX = { s: BLACK, h: RED, d: RED, c: BLACK };

/** 무늬 모양 (가운데 x,y, 크기 s) */
export function suitPath(ctx, suit, x, y, s) {
  ctx.beginPath();
  if (suit === 'h') {
    ctx.moveTo(x, y + s * 0.85);
    ctx.bezierCurveTo(x - s * 1.25, y - s * 0.05, x - s * 0.7, y - s * 1.05, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.05, x + s * 1.25, y - s * 0.05, x, y + s * 0.85);
  } else if (suit === 'd') {
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x + s * 0.35, y - s * 0.35, x + s * 0.8, y);
    ctx.quadraticCurveTo(x + s * 0.35, y + s * 0.35, x, y + s);
    ctx.quadraticCurveTo(x - s * 0.35, y + s * 0.35, x - s * 0.8, y);
    ctx.quadraticCurveTo(x - s * 0.35, y - s * 0.35, x, y - s);
  } else if (suit === 's') {
    ctx.moveTo(x, y - s);
    ctx.bezierCurveTo(x + s * 1.3, y - s * 0.05, x + s * 0.75, y + s * 0.85, x + s * 0.08, y + s * 0.35);
    ctx.lineTo(x + s * 0.35, y + s);
    ctx.lineTo(x - s * 0.35, y + s);
    ctx.lineTo(x - s * 0.08, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 0.75, y + s * 0.85, x - s * 1.3, y - s * 0.05, x, y - s);
  } else {
    const r = s * 0.42;
    ctx.arc(x, y - s * 0.45, r, 0, Math.PI * 2);
    ctx.moveTo(x - s * 0.45 + r, y + s * 0.1);
    ctx.arc(x - s * 0.45, y + s * 0.1, r, 0, Math.PI * 2);
    ctx.moveTo(x + s * 0.45 + r, y + s * 0.1);
    ctx.arc(x + s * 0.45, y + s * 0.1, r, 0, Math.PI * 2);
    ctx.moveTo(x - s * 0.12, y);
    ctx.lineTo(x + s * 0.12, y);
    ctx.lineTo(x + s * 0.35, y + s);
    ctx.lineTo(x - s * 0.35, y + s);
    ctx.closePath();
  }
}

export function suitIcon(ctx, suit, x, y, s) {
  suitPath(ctx, suit, x, y, s);
  ctx.fillStyle = SUIT_HEX[suit];
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, s * 0.12);
  ctx.strokeStyle = SUIT_RED[suit] ? '#7a1020' : '#000';
  ctx.stroke();
  if (SUIT_RED[suit] && s > 14) {
    // 빨강 무늬: 가운데 흰 하이라이트 점 (흑백으로 봐도 구분되게)
    ctx.beginPath();
    ctx.arc(x - s * 0.25, y - s * 0.25, s * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fill();
  }
}

function base(ctx, w, h, fill = '#fffaf0') {
  roundRect(ctx, 0, 0, w, h, 28);
  ctx.fillStyle = INK;
  ctx.fill();
  roundRect(ctx, 9, 9, w - 18, h - 18, 20);
  ctx.fillStyle = fill;
  ctx.fill();
}

function bigText(ctx, text, x, y, size, fill) {
  ctx.font = `${size}px Jua, "Malgun Gothic", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.14;
  ctx.strokeStyle = '#fff';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** 특수 카드 아래 작은 띠 (무슨 효과인지 글로) */
const EFFECT = { A: '+3 공격', 2: '+2 공격', 7: '무늬 바꾸기', J: '건너뛰기', Q: '방향 바꾸기', K: '한 번 더' };

function drawFace(ctx, w, h, code) {
  if (isJoker(code)) return drawJoker(ctx, w, h, code);
  base(ctx, w, h);
  const suit = code[0];
  const r = code[1];
  const label = RANK_LABEL[r] || r;
  const col = SUIT_HEX[suit];
  const special = EFFECT[r] != null;
  // 특수 카드는 은은한 바탕 띠
  if (special) {
    ctx.save();
    roundRect(ctx, 9, 9, w - 18, h - 18, 20);
    ctx.clip();
    ctx.fillStyle = SUIT_RED[suit] ? '#ffe3e6' : '#e3ebf7';
    ctx.fillRect(0, h * 0.62, w, h);
    ctx.restore();
  }
  // 모서리: 숫자 + 무늬
  const corner = () => {
    bigText(ctx, label, 42, 46, label.length > 1 ? 44 : 54, col);
    suitIcon(ctx, suit, 42, 92, 17);
  };
  corner();
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  corner();
  ctx.restore();
  // 가운데: 큰 무늬 + 큰 숫자
  suitIcon(ctx, suit, w / 2, h * 0.36, 58);
  bigText(ctx, label, w / 2, h * 0.64, label.length > 1 ? 92 : 112, col);
  if (r === 'A' && suit === 's') {
    // ♠A는 +5: 왕관 표시
    ctx.fillStyle = '#ffd84d';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const cx = w / 2;
    const cy = h * 0.17;
    ctx.moveTo(cx - 34, cy + 14);
    ctx.lineTo(cx - 38, cy - 12);
    ctx.lineTo(cx - 16, cy + 2);
    ctx.lineTo(cx, cy - 18);
    ctx.lineTo(cx + 16, cy + 2);
    ctx.lineTo(cx + 38, cy - 12);
    ctx.lineTo(cx + 34, cy + 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (special) {
    const t = r === 'A' && suit === 's' ? '+5 공격' : EFFECT[r];
    ctx.font = '24px Jua, "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    ctx.fillText(t, w / 2, h - 44);
  }
}

/** 조커: 둥근 얼굴 광대 + 별 모자. 흑백은 달빛 회색, 컬러는 무지개 */
function drawJoker(ctx, w, h, code) {
  const color = code === 'XC';
  base(ctx, w, h, color ? '#fff6d6' : '#eef0f4');
  ctx.save();
  roundRect(ctx, 9, 9, w - 18, h - 18, 20);
  ctx.clip();
  // 배경 햇살 줄무늬
  const rays = color ? ['#ff6b6b', '#ffb84d', '#ffe36a', '#6fdc8c', '#5cc8ff', '#a98bff'] : ['#d5d9e0', '#f6f7f9'];
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.46);
    const a0 = (i / 18) * Math.PI * 2;
    const a1 = ((i + 1) / 18) * Math.PI * 2;
    ctx.lineTo(w / 2 + Math.cos(a0) * 400, h * 0.46 + Math.sin(a0) * 400);
    ctx.lineTo(w / 2 + Math.cos(a1) * 400, h * 0.46 + Math.sin(a1) * 400);
    ctx.closePath();
    ctx.fillStyle = rays[i % rays.length];
    ctx.globalAlpha = color ? 0.45 : 0.7;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  const cx = w / 2;
  const cy = h * 0.5;
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  // 모자 (세 갈래, 끝에 방울)
  const hat = color ? ['#ff5c7a', '#5cc8ff', '#ffd84d'] : ['#2a2f3a', '#9aa3b2', '#2a2f3a'];
  [-1, 0, 1].forEach((k, i) => {
    ctx.beginPath();
    ctx.moveTo(cx - 44 + i * 30, cy - 34);
    ctx.quadraticCurveTo(cx + k * 50, cy - 90, cx + k * 62, cy - 104 + (k ? 18 : 0));
    ctx.lineTo(cx - 14 + i * 30, cy - 34);
    ctx.closePath();
    ctx.fillStyle = hat[i];
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + k * 62, cy - 104 + (k ? 18 : 0), 9, 0, Math.PI * 2);
    ctx.fillStyle = color ? '#ffe36a' : '#ffffff';
    ctx.fill();
    ctx.stroke();
  });
  // 얼굴
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.stroke();
  // 볼 (컬러만 분홍)
  ctx.fillStyle = color ? '#ff9fb3' : '#c9ced8';
  [-1, 1].forEach((k) => {
    ctx.beginPath();
    ctx.arc(cx + k * 26, cy + 12, 9, 0, Math.PI * 2);
    ctx.fill();
  });
  // 눈: 별 하나, 윙크 하나
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? 4 : 10;
    ctx.lineTo(cx - 16 + Math.cos(a) * rr, cy - 10 + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx + 16, cy - 8, 8, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  // 웃는 입
  ctx.beginPath();
  ctx.arc(cx, cy + 8, 20, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  // 코
  ctx.beginPath();
  ctx.arc(cx, cy + 2, 7, 0, Math.PI * 2);
  ctx.fillStyle = color ? '#ff5c7a' : '#5b6474';
  ctx.fill();
  // 옷깃 주름
  ctx.lineWidth = 5;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 22 - 11, cy + 46);
    ctx.lineTo(cx + i * 22, cy + 70);
    ctx.lineTo(cx + i * 22 + 11, cy + 46);
    ctx.closePath();
    ctx.fillStyle = color ? ['#a98bff', '#5cc8ff', '#6fdc8c', '#ffb84d', '#ff6b6b'][i + 2] : i % 2 ? '#2a2f3a' : '#ffffff';
    ctx.fill();
    ctx.stroke();
  }
  // 글자
  const pw = color ? '+7' : '+5';
  bigText(ctx, pw, 44, 48, 48, color ? '#e2384d' : BLACK);
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  bigText(ctx, pw, 44, 48, 48, color ? '#e2384d' : BLACK);
  ctx.restore();
  ctx.font = '26px Jua, "Malgun Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.fillText(color ? '컬러 조커' : '흑백 조커', cx, h - 40);
}

function drawBack(ctx, w, h) {
  base(ctx, w, h, '#3d6fd1');
  ctx.save();
  roundRect(ctx, 20, 20, w - 40, h - 40, 14);
  ctx.clip();
  // 체크 무늬
  for (let y = 0; y < h; y += 24)
    for (let x = 0; x < w; x += 24) {
      if (((x + y) / 24) % 2) continue;
      ctx.fillStyle = '#5a8be8';
      ctx.fillRect(x, y, 24, 24);
    }
  ctx.restore();
  roundRect(ctx, 20, 20, w - 40, h - 40, 14);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  // 가운데 원판: 네 무늬 + '1'
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 66, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ['s', 'h', 'd', 'c'].forEach((s, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    suitIcon(ctx, s, w / 2 + Math.cos(a) * 42, h / 2 + Math.sin(a) * 42, 12);
  });
  bigText(ctx, '1', w / 2, h / 2 + 2, 60, '#e2384d');
}

export function cardTex(code) {
  return canvasTexture('oc-' + code, (ctx, w, h) => drawFace(ctx, w, h, code), CW, CH);
}
export function backTex() {
  return canvasTexture('oc-back', drawBack, CW, CH);
}

const imgCache = new Map();
export function cardImg(code) {
  if (!code) return backImg();
  if (!imgCache.has(code)) imgCache.set(code, cardTex(code).userData.canvas.toDataURL('image/png'));
  return imgCache.get(code);
}
export function backImg() {
  if (!imgCache.has('back')) imgCache.set('back', backTex().userData.canvas.toDataURL('image/png'));
  return imgCache.get('back');
}

/** 무늬 고르기 버튼·칩에 넣을 작은 무늬 그림 */
export function suitImg(suit) {
  const key = 'sw-' + suit;
  if (!imgCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    if (suit) suitIcon(ctx, suit, 32, 32, 24);
    else {
      ctx.font = '40px Jua, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.fillText('★', 32, 34);
    }
    imgCache.set(key, c.toDataURL('image/png'));
  }
  return imgCache.get(key);
}
