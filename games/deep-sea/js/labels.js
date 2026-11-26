// 좌석 이름표 (HTML) — 3D 좌석 위치에 맞춰 매 프레임 옮김
import { $, esc } from '../../../shared/ui-core.js';

let els = [];

export function buildLabels(players, viewSeat) {
  const root = $('#labels');
  root.innerHTML = '';
  els = players.map((p, i) => {
    const el = document.createElement('div');
    el.className = 'seat-label';
    el.innerHTML = `<span class="avatar">${p.emoji}</span><span><span class="name">${esc(p.name)}${i === viewSeat && p.name !== '나' ? ' (나)' : ''}</span><span class="meta"></span><span class="claim"></span></span><span class="bubble"></span>`;
    root.appendChild(el);
    return el;
  });
}

export function clearLabels() {
  $('#labels').innerHTML = '';
  els = [];
}

export function updateLabel(i, { count, key, claim, away, role, target }) {
  const el = els[i];
  if (!el) return;
  el.querySelector('.meta').textContent = `🂠 ${count}장${key ? ' · 🔑' : ''}${away ? ' · 💤' : ''}`;
  const parts = [];
  if (claim?.treasure != null) parts.push(`보물 ${claim.treasure}`);
  if (claim?.monster != null) parts.push(claim.monster ? '문어 있대!' : '문어 없대');
  el.querySelector('.claim').textContent = parts.length ? `💬 ${parts.join(' · ')}` : '';
  el.classList.toggle('is-key', !!key);
  el.classList.toggle('is-target', !!target);
  el.classList.toggle('role-crew', role === 'crew');
  el.classList.toggle('role-pirate', role === 'pirate');
}

const timers = new Map();
export function seatBubble(i, text, ms = 1800) {
  const b = els[i]?.querySelector('.bubble');
  if (!b) return;
  b.textContent = text;
  b.classList.add('show');
  clearTimeout(timers.get(i));
  timers.set(i, setTimeout(() => b.classList.remove('show'), ms));
}

export function positionLabels(stage) {
  const h = stage.container.clientHeight || innerHeight;
  els.forEach((el, i) => {
    const me = i === stage.viewSeat;
    let p = stage.project(stage.seatPos(i, me ? 4.9 : 5.15, me ? 0.2 : 0.4));
    let dy = me ? '-20%' : '-100%';
    // 화면 위쪽 HUD에 가리면 카드 줄 안쪽(테이블 쪽)으로
    if (!me && p.y < h * 0.2) {
      p = stage.project(stage.seatPos(i, 3.1, 0.2));
      dy = '0%';
    }
    // 화면 밖으로 잘리지 않게 좌우를 붙잡음
    const w = stage.container.clientWidth || innerWidth;
    const half = (el.offsetWidth || 100) / 2 + 4;
    const x = Math.min(Math.max(p.x, half), w - half);
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(p.y)}px) translate(-50%, ${dy})`;
  });
}
