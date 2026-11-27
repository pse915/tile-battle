// 급식 다섯! 카드 그림 — 외부 이미지 없이 캔버스로 직접 그린 오리지널 급식 메뉴
// 같은 그림을 3D 텍스처(cardTexture)와 DOM <img>(cardImage)에 같이 씀
import { canvasTexture, roundRect } from '../../../shared/table3d.js';
import { cardMenu, cardCount, MENUS } from './rules.js';

export const CARD_W = 1.1;
export const CARD_H = 1.54;
export const CARD_T = 0.03;
const W = 256;
const H = 358;
const FONT = '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

/** 메뉴마다 카드 바탕색 (식판 칸 색) */
const BG = {
  tteok: ['#ffd6cc'],
  donkatsu: ['#ffe9b8'],
  gimbap: ['#d4f5c4'],
  milk: ['#cfe6ff'],
  pudding: ['#fff3a8'],
};

function face(g, x, y, s, { eyeY = 0, color = '#2b2d55' } = {}) {
  // 귀여운 얼굴: 눈 두 개, 웃는 입, 볼터치
  g.fillStyle = color;
  g.beginPath();
  g.arc(x - s * 0.28, y + eyeY, s * 0.075, 0, Math.PI * 2);
  g.arc(x + s * 0.28, y + eyeY, s * 0.075, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.5, s * 0.05);
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x, y + eyeY + s * 0.06, s * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  g.fillStyle = 'rgba(255,110,130,.45)';
  g.beginPath();
  g.ellipse(x - s * 0.45, y + eyeY + s * 0.12, s * 0.11, s * 0.07, 0, 0, Math.PI * 2);
  g.ellipse(x + s * 0.45, y + eyeY + s * 0.12, s * 0.11, s * 0.07, 0, 0, Math.PI * 2);
  g.fill();
}

/** 메뉴 하나 그리기: (x, y) 가운데, s = 반지름 정도 크기 */
export const DRAW_MENU = {
  tteok(g, x, y, s) {
    // 빨간 양념 웅덩이 위 떡 세 줄 + 어묵 한 장
    g.fillStyle = '#e8432f';
    g.beginPath();
    g.ellipse(x, y + s * 0.15, s * 1.0, s * 0.72, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c92f1f';
    g.beginPath();
    g.ellipse(x + s * 0.2, y + s * 0.35, s * 0.6, s * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    const cake = (cx, cy, rot) => {
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.fillStyle = '#ffd7c4';
      roundRect(g, -s * 0.62, -s * 0.17, s * 1.24, s * 0.34, s * 0.17);
      g.fill();
      g.fillStyle = 'rgba(230,60,40,.65)';
      roundRect(g, -s * 0.62, s * 0.02, s * 1.24, s * 0.15, s * 0.08);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)';
      roundRect(g, -s * 0.45, -s * 0.12, s * 0.5, s * 0.07, s * 0.035);
      g.fill();
      g.restore();
    };
    cake(x - s * 0.08, y - s * 0.32, -0.25);
    cake(x + s * 0.12, y + s * 0.05, 0.12);
    cake(x - s * 0.15, y + s * 0.42, -0.08);
    face(g, x + s * 0.12, y + s * 0.03, s * 0.55);
  },

  donkatsu(g, x, y, s) {
    // 바삭한 타원 돈가스 + 소스 줄무늬 + 양배추
    g.fillStyle = '#b8e07a';
    g.beginPath();
    g.ellipse(x + s * 0.55, y - s * 0.55, s * 0.45, s * 0.3, 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d9862e';
    g.beginPath();
    g.ellipse(x, y, s * 1.0, s * 0.72, -0.15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#efa548';
    g.beginPath();
    g.ellipse(x - s * 0.05, y - s * 0.06, s * 0.88, s * 0.6, -0.15, 0, Math.PI * 2);
    g.fill();
    // 소스
    g.strokeStyle = '#6b3415';
    g.lineWidth = s * 0.12;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - s * 0.7, y + s * 0.25);
    g.bezierCurveTo(x - s * 0.3, y - s * 0.2, x + s * 0.1, y + s * 0.5, x + s * 0.65, y + s * 0.05);
    g.stroke();
    face(g, x - s * 0.05, y - s * 0.22, s * 0.55);
  },

  gimbap(g, x, y, s) {
    // 김밥 한 조각 단면: 김 → 밥 → 속재료
    g.fillStyle = '#1f2a22';
    g.beginPath();
    g.arc(x, y, s * 0.95, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fbfaf3';
    g.beginPath();
    g.arc(x, y, s * 0.8, 0, Math.PI * 2);
    g.fill();
    const fill = [
      ['#ffcd2e', -0.22, -0.18],
      ['#ff8a3d', 0.2, -0.2],
      ['#3fae4a', -0.22, 0.2],
      ['#ff7fa3', 0.2, 0.18],
    ];
    fill.forEach(([c, dx, dy]) => {
      g.fillStyle = c;
      roundRect(g, x + dx * s - s * 0.15, y + dy * s - s * 0.13, s * 0.3, s * 0.26, s * 0.07);
      g.fill();
    });
    g.fillStyle = '#8a5a2b';
    g.beginPath();
    g.arc(x, y, s * 0.11, 0, Math.PI * 2);
    g.fill();
    // 김에 붙은 작은 얼굴은 위쪽 밥 위에
    face(g, x, y - s * 0.55, s * 0.42, { color: '#2b2d55' });
  },

  milk(g, x, y, s) {
    // 학교 우유갑 (지붕 모양 뚜껑)
    const w = s * 1.05;
    const h = s * 1.1;
    const top = y - h * 0.45;
    g.fillStyle = '#ffffff';
    roundRect(g, x - w / 2, top, w, h, s * 0.08);
    g.fill();
    g.strokeStyle = '#3b7bd8';
    g.lineWidth = s * 0.07;
    g.stroke();
    g.fillStyle = '#4c8ff0';
    g.beginPath();
    g.moveTo(x - w / 2, top);
    g.lineTo(x - w * 0.32, top - s * 0.45);
    g.lineTo(x + w * 0.32, top - s * 0.45);
    g.lineTo(x + w / 2, top);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#2d63b8';
    g.fillRect(x - w * 0.34, top - s * 0.6, w * 0.68, s * 0.16);
    // 파란 띠 + 글씨
    g.fillStyle = '#4c8ff0';
    g.fillRect(x - w / 2, top + h * 0.68, w, h * 0.2);
    g.fillStyle = '#fff';
    g.font = `${Math.round(s * 0.3)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('우유', x, top + h * 0.785);
    face(g, x, top + h * 0.35, s * 0.55);
  },

  pudding(g, x, y, s) {
    // 접시 위 탱글탱글 푸딩 + 캐러멜 + 체리
    g.fillStyle = '#e7eef5';
    g.beginPath();
    g.ellipse(x, y + s * 0.62, s * 1.0, s * 0.28, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b9c7d6';
    g.lineWidth = s * 0.05;
    g.stroke();
    g.fillStyle = '#ffd34d';
    g.beginPath();
    g.moveTo(x - s * 0.75, y + s * 0.6);
    g.quadraticCurveTo(x - s * 0.62, y - s * 0.1, x - s * 0.5, y - s * 0.45);
    g.lineTo(x + s * 0.5, y - s * 0.45);
    g.quadraticCurveTo(x + s * 0.62, y - s * 0.1, x + s * 0.75, y + s * 0.6);
    g.closePath();
    g.fill();
    g.fillStyle = '#8a4a14';
    g.beginPath();
    g.moveTo(x - s * 0.52, y - s * 0.38);
    g.quadraticCurveTo(x - s * 0.5, y - s * 0.58, x, y - s * 0.6);
    g.quadraticCurveTo(x + s * 0.5, y - s * 0.58, x + s * 0.52, y - s * 0.38);
    g.quadraticCurveTo(x + s * 0.4, y - s * 0.12, x + s * 0.25, y - s * 0.3);
    g.quadraticCurveTo(x, y - s * 0.1, x - s * 0.2, y - s * 0.3);
    g.quadraticCurveTo(x - s * 0.4, y - s * 0.12, x - s * 0.52, y - s * 0.38);
    g.fill();
    g.fillStyle = '#e8243c';
    g.beginPath();
    g.arc(x + s * 0.05, y - s * 0.72, s * 0.16, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3c7a2a';
    g.lineWidth = s * 0.05;
    g.beginPath();
    g.moveTo(x + s * 0.05, y - s * 0.86);
    g.quadraticCurveTo(x + s * 0.15, y - s * 1.0, x + s * 0.3, y - s * 1.0);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)';
    roundRect(g, x - s * 0.45, y - s * 0.15, s * 0.12, s * 0.5, s * 0.06);
    g.fill();
    face(g, x, y + s * 0.15, s * 0.55);
  },
};

/** 개수별 배치 (카드 안 비율 좌표) */
const SPOTS = {
  1: [[0.5, 0.5]],
  2: [
    [0.5, 0.28],
    [0.5, 0.72],
  ],
  3: [
    [0.3, 0.22],
    [0.5, 0.5],
    [0.7, 0.78],
  ],
  4: [
    [0.29, 0.28],
    [0.71, 0.28],
    [0.29, 0.72],
    [0.71, 0.72],
  ],
  5: [
    [0.28, 0.22],
    [0.72, 0.22],
    [0.5, 0.5],
    [0.28, 0.78],
    [0.72, 0.78],
  ],
};
const SIZE = { 1: 0.32, 2: 0.25, 3: 0.2, 4: 0.2, 5: 0.17 };

export const INK = '#2b2d55';

/** 메뉴 그림을 진한 남색 외곽선으로 감싸기 (오프스크린에 그려 여러 방향으로 찍음) */
const stickerCache = new Map();
function menuSticker(menu, s) {
  const key = menu + ':' + Math.round(s);
  if (stickerCache.has(key)) return stickerCache.get(key);
  const size = Math.ceil(s * 3);
  const art = document.createElement('canvas');
  art.width = art.height = size;
  DRAW_MENU[menu]?.(art.getContext('2d'), size / 2, size / 2, s);
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const og = out.getContext('2d');
  const t = Math.max(2.5, s * 0.09);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    og.drawImage(art, Math.cos(a) * t, Math.sin(a) * t);
  }
  og.globalCompositeOperation = 'source-in';
  og.fillStyle = INK;
  og.fillRect(0, 0, size, size);
  og.globalCompositeOperation = 'source-over';
  og.drawImage(art, 0, 0);
  stickerCache.set(key, out);
  return out;
}

export function drawCard(g, code, w = W, h = H) {
  const menu = cardMenu(code);
  const n = cardCount(code);
  const [c1] = BG[menu] || ['#fff'];
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  // 카툰: 단색 바탕 + 두꺼운 남색 테두리 + 둥근 모서리
  g.fillStyle = c1;
  roundRect(g, 9, 9, w - 18, h - 18, 24);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 9;
  g.stroke();
  const pts = SPOTS[n] || SPOTS[1];
  const s = SIZE[n] * w;
  const st = menuSticker(menu, s);
  pts.forEach(([px, py]) => g.drawImage(st, px * w - st.width / 2, py * h - st.height / 2));
  // 모서리 개수 숫자 (위·아래 두 곳, 아래쪽은 거꾸로 — 어느 자리에서 봐도 읽힘)
  // 개수 숫자는 넣지 않음 — 그림을 직접 세는 게 이 게임의 재미
}

export function drawBack(g, w = W, h = H) {
  // 스테인리스 식판 무늬 뒷면
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#3cc4ad';
  roundRect(g, 9, 9, w - 18, h - 18, 24);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 9;
  g.stroke();
  // 식판 칸
  g.fillStyle = 'rgba(255,255,255,.18)';
  roundRect(g, 32, 34, 86, 70, 16);
  g.fill();
  roundRect(g, 138, 34, 86, 70, 16);
  g.fill();
  roundRect(g, 32, 254, 192, 70, 18);
  g.fill();
  // 가운데 동그란 종 + 글씨
  g.fillStyle = '#ffe066';
  g.beginPath();
  g.arc(w / 2, h / 2 - 4, 62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8a90c';
  g.beginPath();
  g.arc(w / 2, h / 2 - 4, 62, 0, Math.PI);
  g.fill();
  g.fillStyle = '#ffe066';
  g.beginPath();
  g.arc(w / 2, h / 2 - 4, 50, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(w / 2, h / 2 - 4, 62, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#c0392b';
  g.font = `44px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('5', w / 2, h / 2 - 2);
  g.fillStyle = '#fff';
  g.font = `30px ${FONT}`;
  g.fillText('급식 다섯!', w / 2, h / 2 + 88);
  // 숟가락·젓가락
  g.strokeStyle = 'rgba(255,255,255,.75)';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(52, 134);
  g.lineTo(52, 222);
  g.moveTo(66, 134);
  g.lineTo(66, 222);
  g.moveTo(198, 160);
  g.lineTo(198, 222);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.75)';
  g.beginPath();
  g.ellipse(198, 146, 13, 18, 0, 0, Math.PI * 2);
  g.fill();
}

export function cardTexture(code) {
  return canvasTexture('lf-' + code, (g, w, h) => drawCard(g, code, w, h), W, H);
}
export function backTexture() {
  return canvasTexture('lf-back', (g, w, h) => drawBack(g, w, h), W, H);
}

const urlCache = new Map();
function toUrl(key, draw) {
  if (urlCache.has(key)) return urlCache.get(key);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  draw(c.getContext('2d'), W, H);
  const url = c.toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}
export function cardImage(code) {
  return toUrl(code, (g, w, h) => drawCard(g, code, w, h));
}
export function backImage() {
  return toUrl('back', (g, w, h) => drawBack(g, w, h));
}

/** 메뉴 하나만 (규칙·튜토리얼 그림용) */
export function menuImage(menu, size = 96) {
  return toUrl('menu-' + menu + size, (g) => {
    g.canvas.width = size;
    g.canvas.height = size;
    DRAW_MENU[menu](g, size / 2, size / 2 + size * 0.05, size * 0.36);
  });
}

export const ALL_MENUS = MENUS;
