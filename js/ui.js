// HTML 오버레이: 화면 전환, 이름표, 모달, 토스트, 배너, 컨페티, 강약표
import { SUITS, makeTile, tileLabel } from './rules.js';
import { suitIcon, tileImage } from './tiles.js';
import { audio } from './audio.js';

export const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export { esc };

// ---------- 화면 ----------
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.id === id));
  const first = id && document.getElementById(id)?.querySelector('button, input');
  first?.focus({ preventScroll: true });
}

export function showHud(on) {
  $('#hud').hidden = !on;
  if (!on) $('#help-panel').hidden = true;
}

// ---------- 토스트 / 배너 ----------
let toastTimer;
export function toast(msg, ms = 1800) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function banner(text) {
  const el = $('#banner');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// ---------- 모달 ----------
/** buttons: [{label, value, primary}] → 누른 버튼의 value로 resolve */
export function modal({ title, html, buttons = [{ label: '확인', value: true, primary: true }], opaque = false }) {
  return new Promise((resolve) => {
    const m = $('#modal');
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html;
    const actions = $('#modal-actions');
    actions.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = `btn${b.primary ? ' primary' : ''}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => {
        m.hidden = true;
        resolve(b.value);
      });
      actions.appendChild(btn);
    }
    m.classList.toggle('is-opaque', opaque);
    m.hidden = false;
    actions.querySelector('.primary, button')?.focus({ preventScroll: true });
  });
}

export function closeModal() {
  $('#modal').hidden = true;
}

// ---------- 좌석 이름표 ----------
let labelEls = [];
export function buildLabels(players, viewSeat) {
  const root = $('#labels');
  root.innerHTML = '';
  labelEls = players.map((p, i) => {
    const el = document.createElement('div');
    el.className = 'seat-label';
    el.innerHTML = `<span class="avatar">${p.emoji}</span><span><span class="name">${esc(p.name)}</span><span class="meta"></span></span><span class="bubble"></span>`;
    el.hidden = i === viewSeat;
    root.appendChild(el);
    return el;
  });
}

export function setLabelVisibility(viewSeat) {
  labelEls.forEach((el, i) => (el.hidden = i === viewSeat));
}

export function updateLabel(i, { count, chips }) {
  const el = labelEls[i];
  if (el) el.querySelector('.meta').textContent = `🀫 ${count}장 · 🪙 ${chips}`;
}

export function setTurnLabel(i) {
  labelEls.forEach((el, k) => el.classList.toggle('is-turn', k === i));
}

const bubbleTimers = new Map();
export function seatBubble(i, text, ms = 1200) {
  const b = labelEls[i]?.querySelector('.bubble');
  if (!b) return;
  b.textContent = text;
  b.classList.toggle('show', !!text);
  clearTimeout(bubbleTimers.get(i));
  if (text && ms) bubbleTimers.set(i, setTimeout(() => b.classList.remove('show'), ms));
}

export function positionLabels(stage) {
  labelEls.forEach((el, i) => {
    if (el.hidden) return;
    // 타일 줄보다 테이블 안쪽에 두어 화면 위쪽 HUD와 겹치지 않게
    const p = stage.project(stage.seatPos(i, 3.15, 0.2));
    el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
  });
}

export function clearLabels() {
  $('#labels').innerHTML = '';
  labelEls = [];
}

// ---------- HUD ----------
export function setMeBox(p, count) {
  $('#me-box').innerHTML = `${p.emoji} <b>${esc(p.name)}</b> · 🪙 ${p.chips} · ${count}장`;
}

export function setRound(r, total) {
  $('#hud-round').textContent = total ? `라운드 ${r} / ${total}` : '튜토리얼';
}

export function setTableInfo(html) {
  $('#hud-table').innerHTML = html;
}

export function comboText(tiles) {
  return tiles
    .map((t) => `<span class="suit-chip"><img src="${suitIcon(t.s, 20)}" alt="${SUITS[t.s].name}">${t.n}</span>`)
    .join(' ');
}

/** 내기/패스 버튼 상태 */
export function setActions({ myTurn, canPlay, canPass }) {
  $('#action-bar').classList.toggle('is-waiting', !myTurn);
  $('#btn-play').classList.toggle('is-off', !myTurn || !canPlay);
  $('#btn-pass').classList.toggle('is-off', !myTurn || !canPass);
  $('#turn-flag').hidden = !myTurn;
}

export function setSortLabel(mode) {
  $('#btn-sort').textContent = mode === 'num' ? '⇅ 숫자순' : '⇅ 문양순';
}

// ---------- 강약표 ----------
const imgs = (list) => list.map(([n, s]) => `<img src="${tileImage(makeTile(n, s))}" alt="${tileLabel(makeTile(n, s))}">`).join('');
export function helpHtml() {
  const suits = SUITS.map((s, i) => `<span class="suit-chip"><img src="${suitIcon(i, 20)}" alt="">${s.name}</span>`).join(' &lt; ');
  return `
    <h4>숫자 세기</h4>
    <div class="help-row">3 &lt; 4 &lt; … &lt; 최대숫자 &lt; 1 &lt; <b>2</b> (2가 최강)</div>
    <h4>문양 세기 (숫자가 같을 때)</h4>
    <div class="help-row">${suits}</div>
    <h4>5장 족보 (위가 셈)</h4>
    <div class="help-row"><strong>스트레이트 플러시</strong><span class="help-tiles">${imgs([[5, 2], [6, 2], [7, 2], [8, 2], [9, 2]])}</span></div>
    <div class="help-row"><strong>포카드</strong><span class="help-tiles">${imgs([[6, 0], [6, 1], [6, 2], [6, 3], [3, 0]])}</span></div>
    <div class="help-row"><strong>풀하우스</strong><span class="help-tiles">${imgs([[8, 0], [8, 1], [8, 3], [4, 0], [4, 2]])}</span></div>
    <div class="help-row"><strong>플러시</strong><span class="help-tiles">${imgs([[3, 3], [5, 3], [7, 3], [9, 3], [1, 3]])}</span></div>
    <div class="help-row"><strong>스트레이트</strong><span class="help-tiles">${imgs([[3, 1], [4, 2], [5, 0], [6, 3], [7, 1]])}</span></div>
    <p class="note">스트레이트는 1-2-3-4-5가 가장 세고 2-3-4-5-6이 그다음이에요.</p>
    <h4>1·2·3장</h4>
    <div class="help-row"><strong>싱글 · 페어 · 트리플</strong><span>같은 장수끼리만 겨뤄요</span></div>
    <h4>점수</h4>
    <p class="note">남은 장수만큼 점수. 손에 남은 2 한 장마다 ×2. 모든 사람과 점수 차이만큼 칩을 주고받아요.</p>`;
}

export function rulesHtml() {
  return `
    <h3>목표</h3>
    <p>손에 든 타일을 가장 먼저 모두 내면 이겨요. 남은 타일이 많을수록 칩을 잃어요.</p>
    <h3>타일</h3>
    <ul>
      <li>숫자 1~15 × 문양 4개(구름·별·달·해). 3명은 1~9, 4명은 1~13, 5명은 1~15를 써요.</li>
      <li>쓰는 타일을 모두 똑같이 나눠요 (3명·5명 12장, 4명 13장).</li>
      <li>숫자 세기: 3이 가장 약하고 … 최대숫자 &lt; 1 &lt; 2. <b>2가 가장 세요.</b></li>
      <li>숫자가 같으면 문양으로 겨뤄요: 구름 &lt; 별 &lt; 달 &lt; 해.</li>
    </ul>
    <h3>진행</h3>
    <ul>
      <li>구름 3을 가진 사람이 먼저 내고, 첫 수에는 구름 3이 꼭 들어가야 해요.</li>
      <li>다음 사람은 바닥과 <b>같은 장수, 더 센 조합</b>을 내거나 패스해요. 패스해도 다음 차례에 다시 낼 수 있어요.</li>
      <li>나머지 모두가 패스하면 마지막에 낸 사람이 바닥을 비우고 아무 조합이나 새로 시작해요.</li>
      <li>누군가 타일을 다 내면 라운드가 끝나요.</li>
    </ul>
    <h3>조합</h3>
    <ul>
      <li>싱글(1장) · 페어(같은 숫자 2장) · 트리플(같은 숫자 3장)</li>
      <li>5장: 스트레이트 &lt; 플러시 &lt; 풀하우스 &lt; 포카드 &lt; 스트레이트 플러시</li>
      <li>스트레이트는 1-2-3-4-5가 가장 세고 2-3-4-5-6이 그다음, 나머지는 가장 높은 숫자로 비교해요.</li>
      <li>같은 족보끼리는 가장 높은 타일(숫자 → 문양)로 비교해요. 풀하우스는 트리플 숫자, 포카드는 네 장 숫자로 비교해요.</li>
    </ul>
    <h3>점수</h3>
    <ul>
      <li>모두 칩 60개로 시작해요.</li>
      <li>라운드가 끝나면 남은 장수가 점수예요. 손에 남은 2 한 장마다 점수가 2배가 돼요.</li>
      <li>모든 두 사람 사이에서 점수 차이만큼 칩을 주고받아요.</li>
      <li>정한 라운드가 끝나거나 누군가 칩이 0 이하가 되면 게임이 끝나요.</li>
    </ul>`;
}

// ---------- 컨페티 ----------
export function confetti(sec = 3) {
  const c = $('#confetti');
  const ctx = c.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#ffd84d', '#d9486a', '#2563eb', '#15803d', '#ffffff'];
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.5,
    vx: (Math.random() - 0.5) * 2,
    vy: 2 + Math.random() * 3,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const end = performance.now() + sec * 1000;
  const frame = (now) => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.x += p.vx + Math.sin((now / 400) + p.r) * 0.6;
      p.y += p.vy;
      p.r += p.vr;
      if (p.y > innerHeight + 20 && now < end) p.y = -20;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    }
    if (now < end + 2500) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  };
  requestAnimationFrame(frame);
}

/** 모든 .btn 클릭에 딸깍 소리 */
export function bindClickSounds() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.btn, .icon-btn, .seg label')) audio.click();
  });
}
