// 온라인 대기방과 온라인 대전 화면 — 서버(앱스크립트)가 규칙을 판정하고, 여기서는 보여 주기만 함
import { checkPlay, sortTiles } from './rules.js';
import { hintMove } from './ai.js';
import { wait } from '../../../shared/anim.js';
import { audio } from './audio.js';
import { api } from '../../../shared/net.js';
import * as ui from './ui.js';
import { tileImage, tileBackImage } from './tiles.js';
import { tileLabel } from './rules.js';
import { OfflineTable, createOfflineRoot, removeOfflineRoot } from '../../../shared/offline-table.js';

/** 🪑 오프라인 테이블 모드 화면 설정 (서버 구성품: server/games/tile-battle.js의 offline) */
const tileOf = (code) => {
  const [n, s] = code.split('-').map(Number);
  return { id: code, n, s };
};
const OFFLINE_CFG = {
  zones: [{ id: 'center', name: '가운데', kind: 'pile' }],
  actions: { play: true, take: true },
  cardImg: (code) => tileImage(tileOf(code)),
  backImg: () => tileBackImage(),
  cardRatio: 1.43,
  tips: '족보는 말로 확인! 가운데보다 센 조합을 내고, 못 내면 ‘턴 넘기기’(패스). 점수 계산은 끝나고 함께',
};

const POLL_GAME_MS = 1300;
const POLL_LOBBY_MS = 2000;
const DIFF_NAME = { easy: '쉬움', normal: '보통', hard: '어려움' };

function rememberPid(code, pid) {
  try {
    sessionStorage.setItem(`tilebattle:room:${code}`, pid);
  } catch {
    /* 무시 */
  }
}
function storedPid(code) {
  try {
    return sessionStorage.getItem(`tilebattle:room:${code}`);
  } catch {
    return null;
  }
}

export class Online {
  constructor(stage, { onEnterGame, onExit }) {
    this.stage = stage;
    this.onEnterGame = onEnterGame;
    this.onExit = onExit;
    this.active = false;
    this.sortMode = 'num';
    this.queue = [];
  }

  // ---------- 방 만들기 / 참여 / 나가기 ----------
  async create(name) {
    const mode = document.querySelector('input[name="room-mode"]:checked')?.value || 'online';
    this.begin(await api('create', { name, mode }));
  }

  /** 📺 테이블 화면: 참가하지 않고 공용 판만 보기 (오프라인 테이블 모드 방) */
  async watch(code) {
    const s = await api('watch', { code, since: -1 });
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

  async join(code, name) {
    this.begin(await api('join', { code, name, pid: storedPid(code) }));
  }

  begin(s) {
    this.active = true;
    this.code = s.code;
    this.pid = s.me;
    this.version = -1;
    this.inGame = false;
    this.queue = [];
    this.fails = 0;
    this.spectator = false;
    rememberPid(s.code, s.me);
    this.apply(s);
    this.schedulePoll();
  }

  /** 서버에 알리고 화면 정리 (기다리지 않음) */
  leave() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timer);
    if (!this.spectator) api('leave', { code: this.code, pid: this.pid }).catch(() => {});
    try {
      sessionStorage.removeItem(`tilebattle:room:${this.code}`);
    } catch {
      /* 무시 */
    }
    if (this.inGame) this.exitGameView();
  }

  isHost() {
    return this.state && this.state.hostId === this.pid;
  }

  // ---------- 폴링 ----------
  schedulePoll() {
    clearTimeout(this.timer);
    if (!this.active) return;
    let ms = this.state?.status === 'lobby' ? POLL_LOBBY_MS : POLL_GAME_MS;
    if (this.state?.mode === 'offline') ms = Math.min(3500, ms + (this.idle || 0) * 400); // 변화가 없으면 천천히
    this.timer = setTimeout(() => this.poll(), ms);
  }

  async poll() {
    if (!this.active) return;
    try {
      const s = this.spectator ? await api('watch', { code: this.code, since: this.version }) : await api('poll', { code: this.code, pid: this.pid, since: this.version });
      this.idle = s.same ? (this.idle || 0) + 1 : 0;
      this.fails = 0;
      this.apply(s);
    } catch (err) {
      if (err.data?.gone) {
        ui.toast(err.message, 2600);
        this.active = false;
        this.onExit();
        return;
      }
      if (++this.fails === 3) ui.toast('연결이 불안정해요. 다시 시도하는 중…', 2400);
    }
    this.schedulePoll();
  }

  async send(action, payload = {}) {
    this.pending = true;
    this.updateActions();
    try {
      const s = await api(action, { code: this.code, pid: this.pid, ...payload });
      if (s.left) return;
      this.apply(s);
    } catch (err) {
      audio.error();
      ui.toast(err.message, 2400);
    } finally {
      this.pending = false;
      this.updateActions();
    }
  }

  /** 오프라인 테이블 화면용: 성공하면 true */
  async sendOk(action, payload = {}) {
    try {
      const s = await api(action, { code: this.code, pid: this.pid, ...payload });
      this.idle = 0;
      if (!s.left) this.apply(s);
      return true;
    } catch (err) {
      audio.error();
      ui.toast(err.message, 2400);
      return false;
    }
  }

  // ---------- 상태 반영 ----------
  apply(s) {
    if (!this.active || s.same || s.version <= this.version) return;
    this.version = s.version;
    this.state = s;
    if (this.spectator && s.mode !== 'offline') {
      ui.toast('📺 테이블 화면은 오프라인 테이블 모드 방에서만 쓸 수 있어요.', 3000);
      this.active = false;
      return this.onExit();
    }
    if (s.mode === 'offline' && (s.status !== 'lobby' || this.spectator)) {
      if (!this.ot) {
        this.inGame = true;
        ui.showScreen(null);
        this.stage.setTitleMode(true);
        const root = createOfflineRoot('시험 끝! 타일 배틀 · 🪑 오프라인 테이블', () => this.onExit());
        this.ot = new OfflineTable({ root, lobby: { send: (a, p) => this.sendOk(a, p) }, cfg: OFFLINE_CFG, audio });
      }
      this.ot.render(s);
      return;
    }
    if (s.status === 'lobby') {
      if (this.inGame) this.exitGameView();
      this.lastSeq = s.seq;
      this.renderLobby(s);
      return;
    }
    if (!this.inGame) {
      this.lastSeq = s.seq;
      this.enterGameView(s);
      return;
    }
    for (const e of s.events) if (e.seq > this.lastSeq) this.queue.push(e);
    this.lastSeq = s.seq;
    this.drain();
  }

  async drain() {
    if (this.draining) return;
    this.draining = true;
    while (this.queue.length && this.active && this.inGame) await this.playEvent(this.queue.shift());
    this.draining = false;
    if (this.active && this.inGame) this.reconcile();
  }

  // ---------- 대기방 ----------
  renderLobby(s) {
    if (!document.getElementById('screen-lobby').classList.contains('is-active')) ui.showScreen('screen-lobby');
    const host = this.isHost();
    ui.$('#lobby-code').innerHTML = [...s.code].map((d) => `<span>${d}</span>`).join('');
    ui.$('#lobby-players').innerHTML = s.players
      .map((p) => {
        const tags = [
          p.id === s.hostId ? '<span class="tag">👑 방장</span>' : '',
          p.id === this.pid ? '<span class="tag me">나</span>' : '',
          p.bot ? `<span class="tag">봇 · ${DIFF_NAME[p.difficulty] || '보통'}</span>` : '',
          p.away ? '<span class="tag">💤 연결 끊김</span>' : '',
        ].join('');
        const remove = host && p.bot ? `<button class="icon-btn small" data-remove="${p.id}" aria-label="${ui.esc(p.name)} 빼기">✕</button>` : '';
        return `<li><span class="avatar">${p.emoji}</span><span class="pname">${ui.esc(p.name)}</span>${tags}${remove}</li>`;
      })
      .join('') +
      Array.from({ length: 5 - s.players.length }, () => '<li class="empty"><span class="avatar">·</span><span class="pname">빈자리</span></li>').join('');
    const n = s.players.length;
    const offline = s.mode === 'offline';
    ui.$('#lobby-mode').textContent = offline ? '🪑 오프라인 테이블 모드 · 패만 공유하고 판정은 얼굴 보며 말로!' : '🌐 온라인 모드 · 규칙은 자동으로 판정해요';
    ui.$('#lobby-mode').classList.toggle('offline', offline);
    ui.$('#btn-copy-table').hidden = !offline;
    ui.$('#lobby-bots').hidden = offline;
    ui.$('#lobby-host').hidden = !host;
    ui.$('#lobby-guest').hidden = host;
    ui.$('#lobby-guest-rounds').textContent = `${s.rounds}판`;
    const r = document.querySelector(`input[name="lrounds"][value="${s.rounds}"]`);
    if (r) r.checked = true;
    ui.$('#lobby-count').textContent = `${n}/5명`;
    const start = ui.$('#btn-lobby-start');
    start.hidden = !host;
    start.classList.toggle('is-off', n < 3);
    ui.$('#lobby-hint').textContent = host
      ? n < 3
        ? `${3 - n}명 더 필요해요. 친구를 기다리거나 봇을 넣으세요.`
        : '모두 모였으면 시작하세요!'
      : '방장이 시작하길 기다리는 중…';
    document.querySelectorAll('[data-bot]').forEach((b) => b.classList.toggle('is-off', n >= 5));
  }

  startGame() {
    if (this.state.players.length < 3) {
      audio.error();
      return ui.toast('3명 이상 모여야 시작할 수 있어요. 봇을 넣어 보세요.');
    }
    this.send('start');
  }

  shareLink() {
    return `${location.origin}${location.pathname}?room=${this.code}`;
  }

  // ---------- 게임 화면 ----------
  enterGameView(s) {
    this.inGame = true;
    this.mySeat = s.mySeat;
    this.maxN = s.players.length <= 3 ? 9 : s.players.length === 4 ? 13 : 15;
    ui.showScreen(null);
    this.stage.setTitleMode(false);
    this.stage.setSeats(s.players.length, s.mySeat);
    ui.buildLabels(s.players, s.mySeat);
    ui.setSortLabel(this.sortMode);
    ui.showHud(true);
    this.onEnterGame();
    this.unsubFrame = this.stage.onFrame(() => ui.positionLabels(this.stage));
    this.stage.clearCenter();
    this.stage.setHand(this.sorted(s.hand));
    this.stage.handEnabled = true;
    if (s.tableTiles.length && s.lastPlayer != null) this.stage.playToCenter(this.stage.spawnAtSeat(s.lastPlayer, s.tableTiles));
    ui.setRound(s.round, s.rounds);
    this.reconcile();
    if (s.result && s.status !== 'playing') this.showResult(s.result);
  }

  exitGameView() {
    if (this.ot) {
      this.ot = null;
      this.inGame = false;
      removeOfflineRoot();
      ui.closeModal();
      return;
    }
    this.inGame = false;
    this.queue = [];
    this.unsubFrame?.();
    this.stage.handEnabled = false;
    this.stage.setHand([]);
    this.stage.clearCenter();
    this.stage.setTurn(null);
    this.stage.setSeats(0, 0);
    ui.clearLabels();
    ui.showHud(false);
    ui.closeModal();
    this.stage.setTitleMode(true);
  }

  sorted(hand) {
    return sortTiles(hand, this.maxN, this.sortMode);
  }

  name(seat) {
    return ui.esc(this.state.players[seat]?.name || '');
  }

  async playEvent(e) {
    const s = this.state;
    if (e.type === 'round') {
      ui.closeModal();
      this.stage.clearCenter();
      this.stage.setHand(this.sorted(s.hand));
      ui.setRound(e.round, s.rounds);
      ui.setTableInfo(`<b>${this.name(e.starter)}</b>부터 구름 3으로 시작해요`);
      ui.banner(`라운드 ${e.round}`);
      audio.sweep();
      await wait(1);
    } else if (e.type === 'play') {
      let meshes;
      if (e.seat === this.mySeat) {
        const have = new Set(this.stage.handMeshes.map((m) => m.userData.tile.id));
        const ids = e.tiles.map((t) => t.id);
        meshes = this.stage.detachFromHand(ids.filter((id) => have.has(id)));
        const missing = e.tiles.filter((t) => !have.has(t.id));
        if (missing.length) meshes = meshes.concat(this.stage.spawnAtSeat(e.seat, missing));
      } else {
        meshes = this.stage.spawnAtSeat(e.seat, e.tiles);
        const row = this.stage.oppRows[e.seat];
        if (row) this.stage.setOppCount(e.seat, Math.max(0, row.userData.count - e.tiles.length));
      }
      ui.setTableInfo(`<b>${this.name(e.seat)}</b> · ${e.name} ${ui.comboText(e.tiles)}`);
      await this.stage.playToCenter(meshes, (j) => audio.place(j));
      if (e.size === 5) {
        ui.banner(e.name);
        this.stage.burst(0xffd84d, true);
        audio.special();
      } else if (e.tiles.some((t) => t.n === 2)) {
        this.stage.burst(0xff8a3d);
        audio.special();
      }
    } else if (e.type === 'pass') {
      ui.seatBubble(e.seat, '패스');
      audio.pass();
      await wait(0.3);
    } else if (e.type === 'sweep') {
      await wait(0.3);
      audio.sweep();
      await this.stage.sweepCenter();
      ui.setTableInfo(`모두 패스! <b>${this.name(e.leader)}</b>부터 새로 시작해요`);
    } else if (e.type === 'roundEnd') {
      this.stage.setTurn(null);
      ui.setTurnLabel(-1);
      ui.banner(`${s.players[e.winner]?.name || ''} 승리!`);
      if (e.winner === this.mySeat) {
        audio.win();
        ui.confetti(2.5);
      } else audio.lose();
      await wait(1.3);
      for (const tr of e.transfers) {
        this.stage.flyCoins(tr.from, tr.to, tr.amount, () => audio.chip());
        await wait(0.22);
      }
      await wait(0.5);
      e.chips.forEach((c, i) => this.stage.setChips(i, c));
      this.showResult(e);
    }
  }

  showResult(r) {
    const s = this.state;
    const host = this.isHost();
    const players = s.players.map((p, i) => ({ ...p, chips: r.chips[i] }));
    if (r.over) {
      ui.confetti(4);
      ui.modal({
        title: '최종 순위',
        html: ui.podiumHtml(players) + (host ? '' : '<p class="note">방장이 [대기방으로]를 누르면 같은 방에서 다시 할 수 있어요.</p>'),
        buttons: host
          ? [{ label: '나가기', value: 'exit' }, { label: '대기방으로', value: 'lobby', primary: true }]
          : [{ label: '나가기', value: 'exit' }, { label: '기다리기', value: 'wait', primary: true }],
      }).then((v) => this.onResult(v));
    } else {
      ui.modal({
        title: `라운드 ${r.round} 결과`,
        html: ui.resultTableHtml(players, r.scores, r.delta, r.winner) + (host ? '' : '<p class="note">방장이 다음 라운드를 시작하면 자동으로 넘어가요.</p>'),
        buttons: host ? [{ label: '다음 라운드', value: 'next', primary: true }] : [{ label: '확인', value: 'wait', primary: true }],
      }).then((v) => this.onResult(v));
    }
  }

  onResult(v) {
    if (v === 'next') this.send('next');
    else if (v === 'lobby') this.send('lobby');
    else if (v === 'exit') this.onExit();
  }

  /** 이벤트 연출이 끝난 뒤 서버 상태와 화면을 맞춤 */
  reconcile() {
    const s = this.state;
    s.players.forEach((p, i) => {
      this.stage.setOppCount(i, p.count);
      this.stage.setChips(i, p.chips);
      ui.updateLabel(i, { count: p.count, chips: p.chips, away: p.away });
    });
    const me = s.players[this.mySeat];
    if (me) ui.setMeBox(me, s.hand.length);
    const want = s.hand.map((t) => t.id).sort().join();
    const have = this.stage.handMeshes.map((m) => m.userData.tile.id).sort().join();
    if (want !== have) {
      const keep = [...this.stage.selected].filter((id) => s.hand.some((t) => t.id === id));
      this.stage.setHand(this.sorted(s.hand));
      this.stage.setSelection(keep);
    }
    this.stage.setTurn(s.current >= 0 ? s.current : null);
    ui.setTurnLabel(s.current);
    if (s.status === 'playing' && !s.table && s.current >= 0 && !s.mustId)
      ui.setTableInfo(`<b>${this.name(s.current)}</b>부터 새로 시작해요`);
    const myTurn = this.myTurn();
    if (myTurn && !this.wasMyTurn) audio.yourTurn();
    this.wasMyTurn = myTurn;
    this.updateActions();
  }

  myTurn() {
    const s = this.state;
    return !!s && s.status === 'playing' && s.current === this.mySeat && !this.queue.length && !this.draining;
  }

  selectedTiles() {
    return this.state.hand.filter((t) => this.stage.selected.has(t.id));
  }

  updateActions() {
    if (!this.inGame) return;
    const s = this.state;
    const myTurn = this.myTurn() && !this.pending;
    const check = checkPlay(this.selectedTiles(), s.table, this.maxN, s.mustId);
    ui.setActions({ myTurn, canPlay: check.ok, canPass: !!s.table });
  }

  // ---------- 입력 (main.js에서 연결) ----------
  onTileClick(tile) {
    const was = this.stage.selected.has(tile.id);
    this.stage.toggleSelect(tile.id);
    was ? audio.unpick() : audio.pick();
    this.updateActions();
  }

  handlePlay() {
    if (!this.myTurn() || this.pending) return ui.toast('아직 내 차례가 아니에요.');
    const tiles = this.selectedTiles();
    const check = checkPlay(tiles, this.state.table, this.maxN, this.state.mustId);
    if (!check.ok) {
      audio.error();
      return ui.toast(check.reason);
    }
    this.send('play', { tiles: tiles.map((t) => t.id) });
  }

  handlePass() {
    if (!this.myTurn() || this.pending) return ui.toast('아직 내 차례가 아니에요.');
    if (!this.state.table) {
      audio.error();
      return ui.toast('바닥이 비어 있을 때는 패스할 수 없어요. 아무 조합이나 내세요.');
    }
    this.send('pass');
  }

  handleHint() {
    if (!this.myTurn()) return ui.toast('내 차례에 쓸 수 있어요.');
    const tiles = hintMove(this.state.hand, this.state.table, this.maxN, this.state.mustId);
    if (!tiles) return ui.toast('낼 수 있는 조합이 없어요. 패스하세요.');
    this.stage.setSelection(tiles.map((t) => t.id));
    audio.pick();
    this.updateActions();
  }

  toggleSort() {
    this.sortMode = this.sortMode === 'num' ? 'suit' : 'num';
    ui.setSortLabel(this.sortMode);
    if (this.state) this.stage.orderHand(this.sorted(this.state.hand));
  }
}
