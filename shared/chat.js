// 공용 채팅: 온라인 방(대기방·게임 중·오프라인 테이블)에서 말풍선 버튼 → 채팅 패널
// 메시지는 서버 poll 응답의 s.chat 으로 옴 (새 연결 없음). 봇 연습·한 기기 모드에서는 숨김
//   const chat = new Chat({ send: (text) => …, mute: (pid, on) => …, audio });
//   chat.update(state, { pid, spectator, local });   // 새 상태가 올 때마다
//   chat.hide();                                      // 방을 나갈 때
const QUICK = ['👍 굿!', '😂', '😮 아깝다', '한 판 더?'];
const EMOJI = ['😀', '😆', '😭', '😡', '🤔', '😎', '🔥', '👏', '🙏', '❤️'];
const MAX = 60;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let cssLoaded = false;
function loadCss() {
  if (cssLoaded) return;
  cssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./chat.css', import.meta.url).href;
  document.head.appendChild(link);
}

export class Chat {
  constructor({ send, mute, audio }) {
    this.sendFn = send;
    this.muteFn = mute;
    this.audio = audio;
    this.lastId = null; // 처음 받은 메시지들은 '새 메시지'로 세지 않음
    this.unread = 0;
    this.open = false;
    this.busy = false;
    loadCss();
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="chat" hidden>
        <button class="chat-fab" type="button" aria-label="채팅 열기" aria-expanded="false">💬<span class="chat-badge" hidden>0</span></button>
        <div class="chat-toast" hidden aria-hidden="true"></div>
        <section class="chat-panel" hidden role="dialog" aria-label="채팅">
          <header class="chat-head"><b>채팅</b><button class="chat-mute-toggle" type="button" hidden>🔇 채팅 끄기</button><button class="chat-close" type="button" aria-label="채팅 닫기">✕</button></header>
          <div class="chat-mutes" hidden></div>
          <ol class="chat-list" aria-live="polite"></ol>
          <div class="chat-quick">${QUICK.map((q) => `<button type="button" data-say="${esc(q)}">${q}</button>`).join('')}<button type="button" class="chat-emoji-btn" aria-label="이모지" aria-expanded="false">😀</button></div>
          <div class="chat-emojis" hidden>${EMOJI.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div>
          <form class="chat-form">
            <input class="chat-input" maxlength="${MAX}" placeholder="한마디 (${MAX}자까지)" autocomplete="off" enterkeyhint="send" aria-label="보낼 말" />
            <button class="chat-send" type="submit">보내기</button>
          </form>
          <p class="chat-readonly" hidden>테이블 화면에서는 읽기만 할 수 있어요.</p>
        </section>
      </div>`,
    );
    const root = (this.root = document.body.lastElementChild);
    this.$ = (sel) => root.querySelector(sel);
    this.$('.chat-fab').addEventListener('click', () => this.toggle(!this.open));
    this.$('.chat-close').addEventListener('click', () => this.toggle(false));
    this.$('.chat-toast').addEventListener('click', () => this.toggle(true));
    this.$('.chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.say(this.$('.chat-input').value);
    });
    root.addEventListener('click', (e) => {
      const q = e.target.closest('[data-say]')?.dataset.say;
      if (q) this.say(q);
      const em = e.target.closest('[data-emoji]')?.dataset.emoji;
      if (em) {
        const inp = this.$('.chat-input');
        inp.value = (inp.value + em).slice(0, MAX);
        inp.focus();
      }
      const t = e.target.closest('[data-mute]');
      if (t) this.muteFn?.(t.dataset.mute, t.getAttribute('aria-pressed') !== 'true');
    });
    this.$('.chat-emoji-btn').addEventListener('click', (e) => {
      const box = this.$('.chat-emojis');
      box.hidden = !box.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!box.hidden));
    });
    this.$('.chat-mute-toggle').addEventListener('click', () => (this.$('.chat-mutes').hidden = !this.$('.chat-mutes').hidden));
    document.addEventListener('keydown', (e) => e.key === 'Escape' && this.open && this.toggle(false));
    // 모바일 키보드가 올라오면 패널을 키보드 위로
    const vv = window.visualViewport;
    if (vv) {
      const fit = () => root.style.setProperty('--kb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px');
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
    }
  }

  toggle(on) {
    this.open = on;
    this.$('.chat-panel').hidden = !on;
    this.$('.chat-fab').setAttribute('aria-expanded', String(on));
    this.root.classList.toggle('is-open', on);
    if (on) {
      this.unread = 0;
      this.renderBadge();
      this.$('.chat-toast').hidden = true;
      this.scrollDown();
      if (!this.readonly && matchMedia('(hover: hover)').matches) this.$('.chat-input').focus();
    } else this.$('.chat-input').blur();
  }

  async say(text) {
    text = String(text || '').trim();
    if (!text || this.busy || this.readonly) return;
    this.busy = true;
    this.$('.chat-send').disabled = true;
    const ok = await this.sendFn(text);
    this.busy = false;
    this.$('.chat-send').disabled = false;
    if (ok) {
      this.$('.chat-input').value = '';
      this.$('.chat-emojis').hidden = true;
    }
  }

  hide() {
    this.root.hidden = true;
    this.toggle(false);
    this.lastId = null;
    this.unread = 0;
    this.renderBadge();
  }

  update(s, { pid, spectator = false, local = false } = {}) {
    if (local || !s || !Array.isArray(s.chat)) return this.hide();
    this.root.hidden = false;
    this.pid = pid;
    this.readonly = spectator;
    const muted = (s.chatMuted || []).includes(pid);
    this.$('.chat-form').hidden = spectator;
    this.$('.chat-quick').hidden = spectator || muted;
    this.$('.chat-readonly').hidden = !spectator && !muted;
    this.$('.chat-readonly').textContent = spectator ? '테이블 화면에서는 읽기만 할 수 있어요.' : '방장이 내 채팅을 꺼 두었어요.';
    this.$('.chat-input').disabled = muted;
    this.renderMutes(s, pid);

    const list = s.chat;
    const newest = list.length ? list[list.length - 1].id : 0;
    if (this.lastId === null) this.lastId = newest;
    const fresh = list.filter((m) => m.id > this.lastId);
    this.lastId = Math.max(this.lastId, newest);
    if (list.length !== this.shown || fresh.length) this.renderList(list, s);
    const others = fresh.filter((m) => m.pid !== pid);
    if (!others.length) return;
    this.audio?.tone?.({ freq: 880, to: 1180, dur: 0.09, gain: 0.12, type: 'triangle' });
    if (!this.open) {
      this.unread += others.length;
      this.renderBadge();
      this.showToast(others[others.length - 1]);
    }
  }

  renderMutes(s, pid) {
    const host = s.hostId === pid && !this.readonly;
    this.$('.chat-mute-toggle').hidden = !host;
    if (!host) return (this.$('.chat-mutes').hidden = true);
    const people = s.players.filter((p) => !p.bot && p.id !== pid);
    const muted = s.chatMuted || [];
    this.$('.chat-mutes').innerHTML = people.length
      ? people.map((p) => `<button type="button" data-mute="${p.id}" aria-pressed="${muted.includes(p.id)}">${muted.includes(p.id) ? '🔇' : '💬'} ${esc(p.name)}</button>`).join('')
      : '<span>아직 다른 참가자가 없어요.</span>';
  }

  renderList(list, s) {
    this.shown = list.length;
    const emoji = Object.fromEntries((s.players || []).map((p) => [p.id, p.emoji]));
    const time = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
    this.$('.chat-list').innerHTML = list.length
      ? list
          .map(
            (m) => `<li class="${m.pid === this.pid ? 'mine' : ''}">
              <span class="who">${emoji[m.pid] || '🙂'} ${esc(m.name)}</span>
              <span class="bubble">${esc(m.text)}</span><time>${time(m.t)}</time></li>`,
          )
          .join('')
      : '<li class="empty">첫 인사를 건네 보세요 👋</li>';
    this.scrollDown();
  }

  scrollDown() {
    const el = this.$('.chat-list');
    el.scrollTop = el.scrollHeight;
  }

  renderBadge() {
    const b = this.$('.chat-badge');
    b.hidden = !this.unread;
    b.textContent = this.unread > 9 ? '9+' : this.unread;
  }

  showToast(m) {
    const t = this.$('.chat-toast');
    t.textContent = `${m.name}: ${m.text}`;
    t.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (t.hidden = true), 3200);
  }
}
