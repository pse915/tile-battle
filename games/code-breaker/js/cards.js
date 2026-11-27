// 비밀번호 해독반 타일 그림: 캔버스로 직접 그린 '암호 동아리' 숫자 블록
// 같은 캔버스를 3D 텍스처와 DOM <img>(dataURL)에 같이 씀
import { canvasTexture, roundRect } from '../../../shared/table3d.js';

export const TW = 256;
export const TH = 364;
export const TILE_RATIO = TH / TW;

// 카툰 팔레트: 검정 = 진한 남보라, 흰 = 크림. 테두리는 외곽선과 같은 남색 계열
const OUTLINE = '#22203f';
const PAL = {
  b: { bg: '#34345e', ink: '#fff6dc', line: 'rgba(255,255,255,.22)', glow: '#7ff0c8', border: '#141230' },
  w: { bg: '#fff6dc', ink: '#2a2850', line: 'rgba(42,40,80,.22)', glow: '#ff7f9e', border: OUTLINE },
};

function base(ctx, w, h, c) {
  const p = PAL[c];
  ctx.fillStyle = p.border;
  roundRect(ctx, 0, 0, w, h, 34);
  ctx.fill();
  ctx.fillStyle = p.bg;
  roundRect(ctx, 14, 14, w - 28, h - 28, 24);
  ctx.fill();
  // 위쪽 하이라이트 띠 (단순한 한 줄)
  ctx.fillStyle = c === 'b' ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.6)';
  roundRect(ctx, 26, 24, w - 52, 18, 9);
  ctx.fill();
  return p;
}

/** 색만으로 구분하지 않도록 구석 표식: 검정 = 채운 동그라미, 흰 = 빈 동그라미 */
function colorMark(ctx, w, h, c, p) {
  ctx.beginPath();
  ctx.arc(w - 40, 52, 11, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = p.ink;
  if (c === 'b') {
    ctx.fillStyle = p.ink;
    ctx.fill();
  }
  ctx.stroke();
}

/** 열쇠 모양 (조커) */
function drawKey(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -s * 0.55, s * 0.32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -s * 0.55, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.22);
  ctx.lineTo(0, s * 0.75);
  ctx.moveTo(0, s * 0.45);
  ctx.lineTo(s * 0.26, s * 0.45);
  ctx.moveTo(0, s * 0.68);
  ctx.lineTo(s * 0.2, s * 0.68);
  ctx.stroke();
  ctx.restore();
}

/** 앞면: 큰 숫자(6·9 밑줄), 아래쪽 작은 자물쇠 눈금. n == null 이면 모르는 앞면 */
function drawFront(ctx, w, h, c, n) {
  const p = base(ctx, w, h, c);
  colorMark(ctx, w, h, c, p);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (n == null) {
    ctx.fillStyle = p.line;
    ctx.font = `${Math.round(h * 0.4)}px Jua, sans-serif`;
    ctx.fillText('?', w / 2, h * 0.47);
    return;
  }
  if (n === 12) {
    drawKey(ctx, w / 2, h * 0.43, w * 0.42, p.glow);
    ctx.fillStyle = p.ink;
    ctx.font = `${Math.round(h * 0.11)}px Jua, sans-serif`;
    ctx.fillText('조커', w / 2, h * 0.8);
    return;
  }
  ctx.fillStyle = p.ink;
  const two = n >= 10;
  ctx.font = `${Math.round(h * (two ? 0.44 : 0.56))}px Jua, sans-serif`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = c === 'b' ? p.border : 'rgba(255,255,255,.9)';
  ctx.strokeText(String(n), w / 2, h * 0.48);
  ctx.fillText(String(n), w / 2, h * 0.48);
  if (n === 6 || n === 9) {
    ctx.fillRect(w * 0.32, h * 0.71, w * 0.36, h * 0.025);
  }
  // 아래 눈금: 숫자만큼 칠해진 점 12개 (작은 비밀 표식)
  for (let i = 0; i < 12; i++) {
    const x = w * 0.2 + (i * (w * 0.6)) / 11;
    ctx.beginPath();
    ctx.arc(x, h * 0.86, 6, 0, Math.PI * 2);
    ctx.fillStyle = i < n ? p.glow : p.line;
    ctx.fill();
  }
}

/** 뒷면: 다이얼 자물쇠 무늬 (색만 보임) */
function drawBack(ctx, w, h, c) {
  const p = base(ctx, w, h, c);
  colorMark(ctx, w, h, c, p);
  const cx = w / 2;
  const cy = h / 2;
  ctx.strokeStyle = p.line;
  for (let r = 0; r < 3; r++) {
    ctx.lineWidth = r === 1 ? 9 : 5;
    ctx.beginPath();
    ctx.arc(cx, cy, w * (0.16 + r * 0.1), 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.lineWidth = i % 3 === 0 ? 8 : 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * w * 0.38, cy + Math.sin(a) * w * 0.38);
    ctx.lineTo(cx + Math.cos(a) * w * 0.44, cy + Math.sin(a) * w * 0.44);
    ctx.stroke();
  }
  ctx.fillStyle = p.glow;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy - w * 0.26, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // 가운데 열쇠 구멍
  ctx.fillStyle = p.line;
  ctx.beginPath();
  ctx.arc(cx, cy - 8, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx + 8, cy);
  ctx.lineTo(cx + 12, cy + 30);
  ctx.lineTo(cx - 12, cy + 30);
  ctx.closePath();
  ctx.fill();
}

export const frontTex = (c, n) => canvasTexture(`cb-f-${c}-${n == null ? 'x' : n}`, (ctx, w, h) => drawFront(ctx, w, h, c, n), TW, TH);
export const backTex = (c) => canvasTexture(`cb-b-${c}`, (ctx, w, h) => drawBack(ctx, w, h, c), TW, TH);

const urlCache = new Map();
function urlOf(key, tex) {
  if (!urlCache.has(key)) urlCache.set(key, tex.userData.canvas.toDataURL('image/png'));
  return urlCache.get(key);
}
/** DOM용 앞면 이미지 */
export const tileImg = (c, n) => urlOf(`f${c}${n}`, frontTex(c, n));
/** DOM용 뒷면 이미지 */
export const backImg = (c) => urlOf(`b${c}`, backTex(c === 'w' ? 'w' : 'b'));
/** 오프라인 모드 카드 코드('b7', 'wJ') → 이미지 */
export const codeImg = (code) => tileImg(code[0], code.slice(1) === 'J' ? 12 : Number(code.slice(1)));
