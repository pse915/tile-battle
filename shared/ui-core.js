// 공용 HTML 오버레이 도우미: 화면 전환, 토스트, 배너, 모달, 컨페티
// 페이지에 #modal(#modal-title, #modal-body, #modal-actions), #toast, #banner, #confetti 가 있어야 함

export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.id === id));
  const first = id && document.getElementById(id)?.querySelector('button, input');
  first?.focus({ preventScroll: true });
}

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

export function confetti(sec = 3, colors = ['#ffd84d', '#d9486a', '#2563eb', '#15803d', '#ffffff']) {
  const c = $('#confetti');
  const ctx = c.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      p.x += p.vx + Math.sin(now / 400 + p.r) * 0.6;
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

/** 모든 버튼 클릭에 소리 */
export function bindClickSounds(play) {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.btn, .icon-btn, .seg label')) play();
  });
}
