// 공용 온라인 대기방: 방 만들기 / 코드로 참여 / 대기방 화면 / 폴링
// 게임 화면은 onGameState(state, isFirst)로 서버 상태를 받아 그리기만 하면 됨
import { api, onlineReady } from './net.js';
import { $, esc, showScreen, toast } from './ui-core.js';
import { common } from './storage.js';
import './offline-table.js'; // 방 모드 고르기·오프라인 화면 스타일

const POLL_GAME_MS = 1300;
const POLL_LOBBY_MS = 2000;
const POLL_LOCAL_MS = 300; // 이 기기 안의 서버(봇 연습)는 빠르게
const POLL_IDLE_MAX_MS = 3500; // 오프라인 테이블 모드: 변화가 없으면 점점 천천히
const DIFF_NAME = { easy: '쉬움', normal: '보통', hard: '어려움' };

const TEMPLATE = (title) => `
  <section id="screen-online" class="screen" aria-label="온라인 방">
    <form class="sheet" onsubmit="return false">
      <header class="sheet-head">온라인 방 · ${esc(title)}</header>
      <p class="note setup-note" id="online-setup-note" hidden>온라인 서버가 아직 설정되지 않았어요. 선생님께 README의 ‘온라인 대기방 설정’을 부탁하세요.</p>
      <div class="field">
        <label for="online-nick">닉네임</label>
        <input id="online-nick" maxlength="8" autocomplete="off" />
      </div>
      <div class="field">
        <label for="room-code">친구 방에 들어가기</label>
        <div class="join-row">
          <input id="room-code" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="코드 4자리" autocomplete="off" />
          <button type="button" class="btn primary" id="btn-join-room">참여하기</button>
        </div>
      </div>
      <div class="or-line"><span>또는</span></div>
      <fieldset class="field mode-pick" id="mode-pick" hidden>
        <legend>새 방 모드</legend>
        <div class="seg">
          <label><input type="radio" name="room-mode" value="online" checked /><span>🌐 온라인 모드<small>규칙 자동 판정 · 봇 가능</small></span></label>
          <label><input type="radio" name="room-mode" value="offline" /><span>🪑 오프라인 테이블<small>패만 공유 · 판정은 말로</small></span></label>
        </div>
      </fieldset>
      <button type="button" class="btn big" id="btn-create-room">🏠 새 방 만들기 <small>코드를 친구에게 알려 주세요</small></button>
      <div class="sheet-actions">
        <button type="button" class="btn" data-lobby-back>뒤로</button>
      </div>
    </form>
  </section>
  <section id="screen-lobby" class="screen" aria-label="대기방">
    <div class="sheet lobby-sheet">
      <header class="sheet-head">대기방 <span class="lobby-count" id="lobby-count"></span></header>
      <p class="mode-tag" id="lobby-mode"></p>
      <p class="lobby-label">방 코드</p>
      <div class="room-code" id="lobby-code" aria-live="polite"></div>
      <div class="share-row">
        <button class="btn small" id="btn-copy-code">코드 복사</button>
        <button class="btn small" id="btn-copy-link">초대 링크 복사</button>
        <button class="btn small" id="btn-copy-table" hidden>📺 테이블 화면 링크</button>
      </div>
      <ul class="lobby-players" id="lobby-players"></ul>
      <div id="lobby-host">
        <div class="field" id="lobby-bots">
          <label>봇 넣기</label>
          <div class="bot-row">
            <button class="btn small" data-bot="normal">🤖 봇 추가</button>
          </div>
        </div>
      </div>
      <p class="lobby-hint" id="lobby-hint"></p>
      <div class="sheet-actions">
        <button class="btn" id="btn-lobby-leave">나가기</button>
        <button class="btn primary" id="btn-lobby-start">게임 시작</button>
      </div>
    </div>
  </section>`;

function rememberPid(code, pid) {
  try {
    if (pid) sessionStorage.setItem(`games:room:${code}`, pid);
    else sessionStorage.removeItem(`games:room:${code}`);
  } catch {
    /* 무시 */
  }
}
function storedPid(code) {
  try {
    return sessionStorage.getItem(`games:room:${code}`);
  } catch {
    return null;
  }
}

export class Lobby {
  /**
   * @param {object} o
   * @param {string} o.game        서버의 게임 id ('deep-sea' 등)
   * @param {string} o.title       화면에 보일 게임 이름
   * @param {(s:object, isFirst:boolean)=>void} o.onGameState  게임 중 상태
   * @param {()=>void} o.onLeaveGame   게임 화면을 닫아야 할 때 (대기방 복귀, 나가기)
   * @param {()=>void} o.onBack        대기방 화면에서 뒤로/나가기를 눌렀을 때
   * @param {boolean} [o.offline]       오프라인 테이블 모드를 고를 수 있는 게임인지
   */
  constructor(o) {
    Object.assign(this, o);
    this.active = false;
    this.local = false; // true: 이 기기 안의 서버 (봇 연습 · 한 기기 모드)
    this.spectator = false; // true: 📺 테이블 화면 (참가하지 않고 보기만)
    document.body.insertAdjacentHTML('beforeend', TEMPLATE(o.title));
    this.bind();
  }

  call(action, payload = {}) {
    return api(action, payload, { local: this.local });
  }

  get mode() {
    return this.state?.mode || 'online';
  }

  bind() {
    const onlineAction = async (btn, fn) => {
      if (!onlineReady()) return toast('온라인 서버가 아직 설정되지 않았어요.');
      if (btn.disabled) return;
      btn.disabled = true;
      const label = btn.innerHTML;
      btn.textContent = '연결 중…';
      try {
        await fn();
      } catch (err) {
        this.audio?.error();
        toast(err.message, 2600);
      } finally {
        btn.disabled = false;
        btn.innerHTML = label;
      }
    };
    const nick = () => {
      const n = ($('#online-nick').value || '').trim();
      if (!n) {
        toast('닉네임을 먼저 적어 주세요.');
        $('#online-nick').focus();
        return null;
      }
      common.save('nick', n);
      return n;
    };
    $('#btn-create-room').addEventListener('click', (e) => {
      const n = nick();
      if (n) onlineAction(e.currentTarget, () => this.create(n));
    });
    const join = (btn) => {
      const n = nick();
      const code = ($('#room-code').value || '').trim();
      if (!n) return;
      if (!/^[0-9]{4}$/.test(code)) return toast('방 코드 숫자 4자리를 입력해 주세요.');
      onlineAction(btn, () => this.join(code, n));
    };
    $('#btn-join-room').addEventListener('click', (e) => join(e.currentTarget));
    $('#room-code').addEventListener('keydown', (e) => e.key === 'Enter' && join($('#btn-join-room')));
    $('#room-code').addEventListener('input', (e) => (e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)));
    document.querySelector('[data-lobby-back]').addEventListener('click', () => this.onBack());
    $('#btn-lobby-leave').addEventListener('click', () => {
      this.leave();
      this.onBack();
    });
    $('#btn-lobby-start').addEventListener('click', () => {
      if (this.state.players.length < this.state.minPlayers) {
        this.audio?.error();
        return toast(`${this.state.minPlayers}명 이상 모여야 시작할 수 있어요. 봇을 넣어 보세요.`);
      }
      this.send('start');
    });
    $('#btn-copy-code').addEventListener('click', () => this.copy(this.code, `방 코드 ${this.code}를 복사했어요`));
    $('#btn-copy-link').addEventListener('click', () => this.copy(this.shareLink(), '초대 링크를 복사했어요'));
    $('#btn-copy-table').addEventListener('click', () => this.copy(this.shareLink() + '&view=table', '테이블 화면 링크를 복사했어요. 교실 TV나 패드에서 여세요'));
    document.querySelectorAll('#screen-lobby [data-bot]').forEach((b) => b.addEventListener('click', () => this.send('addBot', { difficulty: b.dataset.bot })));
    $('#lobby-players').addEventListener('click', (e) => {
      const id = e.target.closest('[data-remove]')?.dataset.remove;
      if (id) this.send('removeBot', { botId: id });
    });
  }

  async copy(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast(text, 4000);
    }
  }

  /** 참여 화면 열기 (초대 링크면 코드 미리 채움) */
  open(code = '') {
    const ready = onlineReady();
    $('#online-setup-note').hidden = ready;
    $('#btn-join-room').classList.toggle('is-off', !ready);
    $('#btn-create-room').classList.toggle('is-off', !ready);
    $('#online-nick').value = common.load('nick', '');
    $('#room-code').value = code;
    $('#mode-pick').hidden = !this.offline;
    showScreen('screen-online');
    if (!$('#online-nick').value) $('#online-nick').focus();
  }

  async create(name) {
    this.local = false;
    const mode = this.offline ? document.querySelector('input[name="room-mode"]:checked')?.value || 'online' : 'online';
    this.begin(await this.call('create', { game: this.game, name, mode }));
  }

  async join(code, name) {
    this.local = false;
    this.begin(await this.call('join', { game: this.game, code, name, pid: storedPid(code) }));
  }

  /** 봇과 연습: 이 기기 안의 서버에 방을 만들고 봇을 채운 뒤 바로 시작 (인터넷 없어도 됨) */
  async practice(name, bots, difficulty = 'normal') {
    this.local = true;
    const s = await this.call('create', { game: this.game, name });
    for (let i = 0; i < bots; i++) await this.call('addBot', { code: s.code, pid: s.me, difficulty });
    this.begin(await this.call('start', { code: s.code, pid: s.me }));
  }

  /** 한 기기 모드: 여러 사람이 한 화면에서. seatPids[자리] 로 그 사람 이름으로 보낼 수 있음 */
  async hotseat(names, extra = {}) {
    this.local = true;
    const s = await this.call('create', { game: this.game, name: names[0] });
    const pids = [s.me];
    for (const n of names.slice(1)) pids.push((await this.call('join', { game: this.game, code: s.code, name: n })).me);
    for (let i = 0; i < (extra.bots || 0); i++) await this.call('addBot', { code: s.code, pid: s.me, difficulty: extra.difficulty || 'normal' });
    this.seatPids = pids;
    this.begin(await this.call('start', { code: s.code, pid: s.me }));
  }

  /** 📺 테이블 화면: 참가하지 않고 공용 판만 보기 */
  async watch(code) {
    this.local = false;
    const s = await this.call('watch', { code, since: -1 });
    this.spectator = true;
    this.active = true;
    this.code = code;
    this.pid = null;
    this.version = -1;
    this.inGame = false;
    this.fails = 0;
    this.apply(s);
    this.schedulePoll();
  }

  begin(s) {
    this.active = true;
    this.code = s.code;
    this.pid = s.me;
    this.version = -1;
    this.inGame = false;
    this.fails = 0;
    this.spectator = false;
    this.idle = 0;
    if (!this.local) rememberPid(s.code, s.me);
    this.apply(s);
    this.schedulePoll();
  }

  leave() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timer);
    if (!this.spectator) this.call('leave', { code: this.code, pid: this.pid }).catch(() => {});
    if (!this.local) rememberPid(this.code, null);
    this.seatPids = null;
    if (this.inGame) {
      this.inGame = false;
      this.onLeaveGame();
    }
  }

  isHost() {
    return this.state && this.state.hostId === this.pid;
  }

  shareLink() {
    return `${location.origin}${location.pathname}?room=${this.code}`;
  }

  schedulePoll() {
    clearTimeout(this.timer);
    if (!this.active) return;
    let ms = this.state?.status === 'lobby' ? POLL_LOBBY_MS : POLL_GAME_MS;
    if (this.local) ms = POLL_LOCAL_MS;
    else if (this.mode === 'offline' || this.spectator) ms = Math.min(POLL_IDLE_MAX_MS, ms + this.idle * 400);
    this.timer = setTimeout(() => this.poll(), ms);
  }

  /** 한 기기 모드는 모든 자리를 번갈아 '접속 중'으로 표시 (자리 비움 → 봇 대신 두기 방지) */
  pollPid() {
    if (!this.seatPids) return this.pid;
    this.pollN = (this.pollN || 0) + 1;
    return this.seatPids[this.pollN % this.seatPids.length];
  }

  async poll() {
    if (!this.active) return;
    try {
      const s = this.spectator
        ? await this.call('watch', { code: this.code, since: this.version })
        : await this.call('poll', { code: this.code, pid: this.pollPid(), since: this.version });
      this.idle = s.same ? this.idle + 1 : 0;
      this.apply(s);
      this.fails = 0;
    } catch (err) {
      if (err.data?.gone) {
        toast(err.message, 2600);
        this.leave();
        this.onBack();
        return;
      }
      if (++this.fails === 3) toast('연결이 불안정해요. 다시 시도하는 중…', 2400);
    }
    this.schedulePoll();
  }

  /** 서버 요청. 실패하면 토스트를 띄우고 false */
  async send(action, payload = {}) {
    try {
      const s = await this.call(action, { code: this.code, pid: this.pid, ...payload });
      this.idle = 0;
      if (!s.left) this.apply(s);
      return true;
    } catch (err) {
      this.audio?.error();
      toast(err.message, 2400);
      return false;
    }
  }

  apply(s) {
    if (!this.active || s.same || s.version <= this.version) return;
    this.version = s.version;
    this.state = s;
    if (s.status === 'lobby' && this.spectator) {
      this.onGameState(s, !this.inGame);
      this.inGame = true;
      return;
    }
    if (s.status === 'lobby') {
      if (this.inGame) {
        this.inGame = false;
        this.onLeaveGame();
      }
      this.renderLobby(s);
      return;
    }
    const first = !this.inGame;
    this.inGame = true;
    this.onGameState(s, first);
  }

  renderLobby(s) {
    if (!$('#screen-lobby').classList.contains('is-active')) showScreen('screen-lobby');
    const host = this.isHost();
    $('#lobby-code').innerHTML = [...s.code].map((d) => `<span>${d}</span>`).join('');
    $('#lobby-players').innerHTML =
      s.players
        .map((p) => {
          const tags = [
            p.id === s.hostId ? '<span class="tag">👑 방장</span>' : '',
            p.id === this.pid ? '<span class="tag me">나</span>' : '',
            p.bot ? `<span class="tag">봇${p.difficulty ? ' · ' + (DIFF_NAME[p.difficulty] || '') : ''}</span>` : '',
            p.away ? '<span class="tag">💤 연결 끊김</span>' : '',
          ].join('');
          const remove = host && p.bot ? `<button class="icon-btn small" data-remove="${p.id}" aria-label="${esc(p.name)} 빼기">✕</button>` : '';
          return `<li><span class="avatar">${p.emoji}</span><span class="pname">${esc(p.name)}</span>${tags}${remove}</li>`;
        })
        .join('') +
      Array.from({ length: s.maxPlayers - s.players.length }, () => '<li class="empty"><span class="avatar">·</span><span class="pname">빈자리</span></li>').join('');
    const n = s.players.length;
    const offline = s.mode === 'offline';
    $('#lobby-mode').textContent = offline ? '🪑 오프라인 테이블 모드 · 패만 공유하고 판정은 얼굴 보며 말로!' : '🌐 온라인 모드 · 규칙은 자동으로 판정해요';
    $('#lobby-mode').classList.toggle('offline', offline);
    $('#btn-copy-table').hidden = !offline;
    $('#lobby-bots').hidden = offline;
    $('#lobby-host').hidden = !host;
    $('#lobby-count').textContent = `${n}/${s.maxPlayers}명`;
    const start = $('#btn-lobby-start');
    start.hidden = !host;
    start.classList.toggle('is-off', n < s.minPlayers);
    $('#lobby-hint').textContent = host
      ? n < s.minPlayers
        ? `${s.minPlayers - n}명 더 필요해요. ${offline ? '친구를 기다려 주세요.' : '친구를 기다리거나 봇을 넣으세요.'}`
        : '모두 모였으면 시작하세요!'
      : '방장이 시작하길 기다리는 중…';
    document.querySelectorAll('#screen-lobby [data-bot]').forEach((b) => b.classList.toggle('is-off', n >= s.maxPlayers));
  }
}
