// 숫자 블록 정원 — 서버 상태를 받아 3D 판·이름표·내 받침대(DOM)를 그리고, 턴 동안의 임시 배치를 만들어 보냄
// 조작: 탭으로 고르기(여러 개) → 판의 줄 / '새 세트' / 내 받침대를 탭해서 놓기. 꾹 눌러(마우스는 끌어서) 드래그도 됨.
// 턴 동안의 배치는 이 화면에서만 바뀌고, '턴 끝내기' 때 { board, played } 를 한 번에 보내 서버가 검사함
import { $, esc, banner, toast, modal, confetti } from '../../../shared/ui-core.js';
import { OfflineTable } from '../../../shared/offline-table.js';
import { analyzeSet, orderSet, jokerValues, sortTiles, kindOf, tileName, FIRST_MELD, handScore } from './rules.js';
import { faceUrl, backUrl, TILE_RATIO } from './cards.js';

const setKey = (s) => s.slice().sort((a, b) => a - b).join(',');

/** 🪑 오프라인 테이블 모드 화면 설정 (서버 구성품: server/games/number-garden.js의 offline) */
const OFFLINE_CFG = {
  zones: [{ id: 'table', name: '판', kind: 'rows' }],
  actions: { draw: true, play: true, move: true, take: true },
  cardImg: (c) => faceUrl(Number(c)),
  backImg: () => backUrl(),
  tips: '한 줄 = 세트 하나 · 첫 등록 30점과 세트 확인은 말로! 판에서 가져오기는 정직하게',
  cardRatio: TILE_RATIO,
};

export class GardenGame {
  constructor(stage, lobby, shell, audio) {
    this.stage = stage;
    this.lobby = lobby;
    this.shell = shell;
    this.audio = audio;
    this.state = null;
    this.work = null;
    this.sel = [];
    this.queue = [];
    this.busy = false;
    this.seenSeq = 0;
    this.mode = null;
    this.sortMode = shell.store.load('sort', 'color');
    this.boardOpen = true;
    this.drag = null;
    this.tutorialEnd = null;
    this.labelFn = () => this.placeLabels();
    // 드래그 중에는 화면 스크롤 막기 (터치)
    document.addEventListener(
      'touchmove',
      (e) => {
        if (this.drag && this.drag.on) e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener('pointermove', (e) => this.dragMove(e));
    window.addEventListener('pointerup', (e) => this.dragEnd(e));
    window.addEventListener('pointercancel', () => this.dragCancel());
  }

  get me() {
    return this.state ? this.state.mySeat : -1;
  }

  // ---------- 화면 만들기 ----------
  enter(mode) {
    this.mode = mode;
    this.epoch = (this.epoch || 0) + 1; // 이전 연출·끝 화면 기다림은 버림
    this.busy = false;
    this.queue = [];
    this.shell.enterHud();
    this.stage.setTitleMode(false);
    this.ot = null;
    this.work = null;
    this.sel = [];
    this.seenSeq = 0;
    this.endShown = false;
    this.stage.clearBoard();
    if (mode === 'offline') {
      $('#hud-body').innerHTML = '';
      this.ot = new OfflineTable({ root: $('#hud-body'), lobby: this.lobby, cfg: { ...OFFLINE_CFG, onLog: () => this.audio.place() }, audio: this.audio });
      return;
    }
    $('#hud-body').innerHTML = `
      <div class="ng-top">
        <ul class="ng-players" id="ng-players"></ul>
        <button class="btn small ng-toggle" id="ng-toggle"></button>
      </div>
      <div class="ng-board" id="ng-board" aria-label="판"></div>
      <div class="k-bottom ng-bottom" id="ng-bottom">
        <div class="ng-status" id="ng-status"></div>
        <div class="k-hand ng-hand" id="ng-hand" aria-label="내 받침대"></div>
        <div class="k-actions ng-actions">
          <button class="btn small" id="ng-sort"></button>
          <button class="btn small" id="ng-undo">↩️ 되돌리기</button>
          <button class="btn small" id="ng-draw"></button>
          <button class="btn small primary" id="ng-end">✔ 턴 끝내기</button>
        </div>
      </div>`;
    const body = $('#hud-body');
    body.classList.toggle('ng-watch', mode === 'watch');
    body.onclick = (e) => this.onClick(e);
    body.onpointerdown = (e) => this.dragStart(e);
    body.oncontextmenu = (e) => e.target.closest('.ng-tile') && e.preventDefault();
    $('#ng-toggle').onclick = () => {
      this.boardOpen = !this.boardOpen;
      this.render();
    };
    $('#ng-sort').onclick = () => {
      this.sortMode = this.sortMode === 'color' ? 'num' : 'color';
      this.shell.store.save('sort', this.sortMode);
      this.render();
    };
    $('#ng-undo').onclick = () => this.undo();
    $('#ng-draw').onclick = () => this.drawPass();
    $('#ng-end').onclick = () => this.endTurn();
    this.boardOpen = true;
    this.stage.s.frame.add(this.labelFn);
    // 아래 받침대 높이만큼 판 영역을 줄임
    const bottom = $('#ng-bottom');
    const fit = () => body.style.setProperty('--ng-bh', bottom.hidden ? '0px' : bottom.offsetHeight + 'px');
    this.ro?.disconnect();
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    this.ro?.observe(bottom);
    fit();
  }

  exit() {
    this.mode = null;
    this.epoch = (this.epoch || 0) + 1;
    this.busy = false;
    this.state = null;
    this.work = null;
    this.sel = [];
    this.queue = [];
    this.ot = null;
    this.tutorialEnd = null;
    this.dragCancel();
    this.stage.s.frame.delete(this.labelFn);
    this.ro?.disconnect();
    this.ro = null;
    this.stage.clearBoard();
    $('#labels').innerHTML = '';
    const body = $('#hud-body');
    if (body) {
      body.onclick = body.onpointerdown = body.oncontextmenu = null;
      body.classList.remove('ng-watch');
    }
  }

  // ---------- 상태 받기 ----------
  onState(s, first) {
    const wantMode = s.mode === 'offline' ? 'offline' : s.mySeat < 0 ? 'watch' : this.lobby.local ? 'practice' : 'online';
    if (first || wantMode !== this.mode) this.enter(wantMode);
    if (this.mode === 'offline') {
      this.state = s;
      this.ot.render(s);
      if (s.ot) {
        this.stage.setSeats(s.players.length, s.mySeat);
        this.stage.setCounts(s.ot.hands.map((h) => h.length));
        this.stage.setPool(s.ot.drawCount);
      }
      return;
    }
    this.queue.push(s);
    this.pump();
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    const epoch = this.epoch;
    const stale = () => epoch !== this.epoch;
    try {
      while (this.queue.length) {
        const s = this.queue.shift();
        if (!this.mode) break;
        const prev = this.state;
        this.state = s;
        const ng = s.ng;
        if (!ng) {
          this.render();
          continue;
        }
        this.stage.setSeats(s.players.length, s.mySeat);
        const evs = (s.events || []).filter((e) => e.seq > this.seenSeq);
        const firstSync = !prev || !prev.ng || !this.seenSeq;
        this.seenSeq = Math.max(this.seenSeq, ...(s.events || []).map((e) => e.seq || 0));
        const wasMine = !!this.work;
        this.syncWork();
        if (firstSync || evs.some((e) => e.type === 'start')) {
          if (evs.some((e) => e.type === 'start')) this.endShown = false;
          this.stage.clearBoard();
          await this.stage.setBoard(this.displayBoard(), { instant: true });
          if (stale()) return;
        } else {
          const anims = [];
          let from = -1;
          for (const e of evs) {
            const p = s.players[e.seat];
            if (e.type === 'draw') {
              anims.push(this.stage.drawFly(e.seat));
              if (e.seat !== this.me) this.audio.draw();
            } else if (e.type === 'pass') {
              toast(`${p.emoji} ${p.name}: 낼 게 없어서 넘겼어요`);
            } else if (e.type === 'play') {
              from = e.seat;
              if (e.seat !== this.me) {
                this.audio.place();
                setTimeout(() => this.audio.setDone(), 250);
                if (e.firstMeld) toast(`🌸 ${p.name} 첫 등록! (${e.meld}점)`, 2200);
              }
            }
          }
          anims.push(this.stage.setBoard(this.displayBoard(), { fromSeat: from }));
          await Promise.all(anims);
          if (stale()) return;
        }
        this.stage.setCounts(ng.counts);
        this.stage.setPool(ng.pool);
        if (this.work && !wasMine && !firstSync) {
          this.audio.myTurn();
          this.boardOpen = true;
        }
        this.render();
        if (s.status === 'finished' && !this.endShown) {
          this.endShown = true;
          await this.showEnd(s);
          if (stale()) return;
        }
      }
    } finally {
      if (!stale()) this.busy = false;
    }
  }

  isMyTurn() {
    const s = this.state;
    return !!(s && s.ng && s.status === 'playing' && !s.ng.over && s.mySeat >= 0 && s.ng.turn === s.mySeat);
  }

  /** 내 차례가 시작되면 턴 시작 상태를 저장하고 임시 배치를 만듦 */
  syncWork() {
    const ng = this.state.ng;
    if (!this.isMyTurn()) {
      this.work = null;
      this.sel = [];
      return;
    }
    if (this.work && this.work.turnNo === ng.turnNo) return;
    this.work = {
      turnNo: ng.turnNo,
      startBoard: ng.board.map((x) => x.slice()),
      startHand: ng.hand.slice(),
      startKeys: new Set(ng.board.map(setKey)),
      board: ng.board.map((x) => x.slice()),
      hand: ng.hand.slice(),
      played: new Set(),
    };
    this.sel = [];
  }

  displayBoard() {
    return this.work ? this.work.board : this.state && this.state.ng ? this.state.ng.board : [];
  }
  displayHand() {
    const h = this.work ? this.work.hand : this.state && this.state.ng ? this.state.ng.hand : [];
    return sortTiles(h, this.sortMode);
  }

  /** 지금 배치 검사: 고칠 줄 수, 첫 등록 점수, 판 보존 여부 */
  analysis() {
    const w = this.work;
    const ng = this.state.ng;
    const opened = ng.opened[this.me];
    let bad = 0;
    let meld = 0;
    const keys = {};
    for (const set of w.board) {
      const a = analyzeSet(set);
      if (!a.ok) bad++;
      else if (set.every((id) => w.played.has(id))) meld += a.value;
      const k = setKey(set);
      keys[k] = (keys[k] || 0) + 1;
    }
    let intact = true;
    for (const set of w.startBoard) {
      const k = setKey(set);
      if (keys[k] > 0) keys[k]--;
      else intact = false;
    }
    const played = w.played.size;
    let reason = '';
    if (!played) reason = '손에서 1개 이상 판에 놓아야 해요. 낼 게 없으면 ‘뽑고 넘기기’!';
    else if (bad) reason = `빨간 줄 ${bad}개를 고쳐 주세요. (세트는 3개 이상)`;
    else if (!opened && !intact) reason = '첫 등록 전에는 판의 세트를 건드릴 수 없어요. 되돌리기를 눌러 보세요.';
    else if (!opened && meld < FIRST_MELD) reason = `첫 등록은 내 패만으로 ${FIRST_MELD}점 이상! (지금 ${meld}점)`;
    return { bad, meld, intact, played, opened, canEnd: !reason, reason };
  }

  // ---------- 그리기 ----------
  render() {
    const s = this.state;
    if (!s || this.mode === 'offline' || !$('#ng-board')) return;
    const ng = s.ng;
    if (!ng) {
      $('#ng-board').innerHTML = '<p class="ng-empty">방장이 게임을 시작하길 기다리는 중…</p>';
      $('#ng-bottom').hidden = true;
      return;
    }
    $('#hud-round').textContent = `${ng.turnNo}번째 차례 · 더미 ${ng.pool}장`;
    this.renderPlayers();
    this.renderBoard();
    this.renderHand();
    this.renderLabels();
  }

  renderPlayers() {
    const s = this.state;
    const ng = s.ng;
    $('#ng-players').innerHTML = s.players
      .map(
        (p, i) => `<li class="ng-chip${i === ng.turn && !ng.over ? ' turn' : ''}${i === this.me ? ' me' : ''}">
          <span class="av">${p.emoji}</span><span class="nm">${esc(p.name)}${i === this.me ? ' (나)' : ''}${p.away ? ' 💤' : ''}</span>
          <span class="ct" title="남은 타일">🀫${ng.counts[i]}</span><span class="op" title="${ng.opened[i] ? '첫 등록 함' : '아직 첫 등록 전'}">${ng.opened[i] ? '🌸' : '🌱'}</span></li>`,
      )
      .join('');
  }

  tileHtml(id, src, { fresh = false, jv = null, cls = '' } = {}) {
    const sel = this.sel.includes(id);
    return `<button class="ng-tile${cls}${sel ? ' sel' : ''}${fresh ? ' fresh' : ''}" data-id="${id}" data-src="${src}" aria-label="${tileName(id)}"><img src="${faceUrl(kindOf(id))}" alt="" draggable="false">${jv != null ? `<i class="jv">${jv}</i>` : ''}</button>`;
  }

  renderBoard() {
    const el = $('#ng-board');
    const top = el.scrollTop;
    const board = this.displayBoard();
    const w = this.work;
    const watching = this.me < 0;
    const open = this.boardOpen || watching;
    el.classList.toggle('closed', !open);
    $('#ng-toggle').hidden = watching;
    $('#ng-toggle').textContent = open ? '🔽 판 접고 3D 보기' : `🌼 판 펼치기 (${board.length}줄)`;
    if (!open) {
      el.innerHTML = '';
      return;
    }
    const picking = this.sel.length > 0;
    const rows = board.map((set, i) => {
      const a = analyzeSet(set);
      const jv = jokerValues(set);
      const changed = w && !w.startKeys.has(setKey(set));
      const cls = !a.ok ? ' bad' : changed ? ' good' : '';
      const tag = a.ok ? `${a.kind === 'run' ? '꽃줄' : '꽃다발'} ${a.value}` : set.length < 3 ? '✖ 3개 이상' : '✖ 세트 아님';
      const tiles = orderSet(set)
        .map((id) => this.tileHtml(id, 'board', { fresh: w && w.played.has(id), jv: jv[id] }))
        .join('');
      return `<div class="ng-set${cls}" data-set="${i}"><div class="ng-tiles">${tiles}${picking && w ? '<span class="ng-drop">⬇ 여기</span>' : ''}</div><span class="ng-tag">${tag}</span></div>`;
    });
    if (w) rows.push(`<button class="ng-set ng-new${picking ? ' hot' : ''}" data-set="new">＋ 새 세트 만들기${picking ? ` (${this.sel.length}개 놓기)` : ''}</button>`);
    if (!board.length && !w) rows.push('<p class="ng-empty">아직 판이 비어 있어요. 첫 등록(30점)을 기다리는 중 🌱</p>');
    el.innerHTML = rows.join('');
    el.scrollTop = top;
  }

  renderHand() {
    const s = this.state;
    const ng = s.ng;
    const bottom = $('#ng-bottom');
    if (this.me < 0) {
      bottom.hidden = true;
      return;
    }
    bottom.hidden = false;
    const handEl = $('#ng-hand');
    const left = handEl.scrollLeft;
    const hand = this.displayHand();
    handEl.innerHTML = hand.map((id) => this.tileHtml(id, 'hand', { cls: ' k-card' })).join('') || '<span class="ng-empty">받침대가 비었어요!</span>';
    handEl.scrollLeft = left;
    handEl.classList.toggle('hot', this.sel.some((id) => this.work && this.work.played.has(id)));
    $('#ng-sort').textContent = this.sortMode === 'color' ? '🎨 색순 정렬' : '🔢 숫자순 정렬';
    const mine = !!this.work;
    const st = $('#ng-status');
    const drawBtn = $('#ng-draw');
    const endBtn = $('#ng-end');
    const undoBtn = $('#ng-undo');
    drawBtn.textContent = ng.pool > 0 ? '🌱 뽑고 넘기기' : '⏭ 넘기기';
    if (!mine) {
      const tp = s.players[ng.turn];
      st.innerHTML = ng.over ? '🏁 게임 끝!' : `${tp.emoji} <b>${esc(tp.name)}</b> 차례… <small>내 점수 ${handScore(ng.hand)}점</small>`;
      st.className = 'ng-status';
      [drawBtn, endBtn, undoBtn].forEach((b) => b.classList.add('is-off'));
      return;
    }
    const a = this.analysis();
    drawBtn.classList.remove('is-off');
    undoBtn.classList.toggle('is-off', !a.played && !this.movedBoard());
    endBtn.classList.toggle('is-off', !a.canEnd);
    let txt;
    if (!a.opened) txt = `🌸 첫 등록 <b class="${a.meld >= FIRST_MELD ? 'ok' : ''}">${a.meld}</b> / ${FIRST_MELD}점`;
    else txt = `🌼 이번 턴 <b>${a.played}</b>개 냄`;
    if (a.bad) txt += ` · <span class="warn">빨간 줄 ${a.bad}개</span>`;
    else if (!a.opened && !a.intact) txt += ' · <span class="warn">판의 세트는 아직 못 건드려요</span>';
    else if (a.canEnd) txt += ' · <span class="ok">턴 끝내기 가능!</span>';
    else if (!a.played) txt += this.sel.length ? ' · 놓을 줄을 탭하세요' : ' · 타일을 탭해서 고르세요';
    st.innerHTML = `<span class="me-turn">내 차례</span> ${txt}`;
    st.className = 'ng-status mine';
  }

  movedBoard() {
    const w = this.work;
    return w.board.length !== w.startBoard.length || w.board.some((s) => !w.startKeys.has(setKey(s)));
  }

  renderLabels() {
    const s = this.state;
    const box = $('#labels');
    if (!s || !s.ng) return (box.innerHTML = '');
    const ng = s.ng;
    box.innerHTML = s.players
      .map((p, i) =>
        i === this.me
          ? ''
          : `<div class="seat-label${i === ng.turn && !ng.over ? ' turn' : ''}" data-seat="${i}"><span class="avatar">${p.emoji}</span><span><span class="name">${esc(p.name)}</span><span class="meta">🀫 ${ng.counts[i]} · ${ng.opened[i] ? '🌸 등록' : '🌱 등록 전'}</span></span></div>`,
      )
      .join('');
    this.placeLabels();
  }

  placeLabels() {
    document.querySelectorAll('#labels .seat-label').forEach((el) => {
      const p = this.stage.s.project(this.stage.seatAnchor(Number(el.dataset.seat), 1.2));
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    });
  }

  // ---------- 조작 ----------
  canPick(id, quiet = false) {
    const w = this.work;
    if (!w) {
      if (!quiet) toast(this.me < 0 ? '보기만 하는 화면이에요.' : '내 차례에 옮길 수 있어요.');
      return false;
    }
    if (w.hand.includes(id) || w.played.has(id)) return true;
    if (!this.state.ng.opened[this.me]) {
      if (!quiet) {
        this.audio.error();
        toast('첫 등록 전에는 판의 타일을 옮길 수 없어요. (이번에 낸 타일은 괜찮아요)', 2400);
      }
      return false;
    }
    return true;
  }

  setOf(id) {
    return this.work ? this.work.board.findIndex((s) => s.includes(id)) : -1;
  }

  onClick(e) {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    const tile = e.target.closest('.ng-tile');
    if (tile) {
      const id = Number(tile.dataset.id);
      const src = tile.dataset.src;
      if (this.sel.includes(id)) {
        this.sel = this.sel.filter((x) => x !== id);
        this.audio.pick();
        return this.render();
      }
      // 손에서 고른 게 있으면 판의 타일을 눌러도 그 줄에 놓기
      if (src === 'board' && this.sel.length && this.sel.some((x) => this.work && this.work.hand.includes(x))) return this.dropTo(this.setOf(id));
      if (!this.canPick(id)) return;
      this.sel.push(id);
      this.audio.pick();
      return this.render();
    }
    const set = e.target.closest('[data-set]');
    if (set && this.sel.length) return this.dropTo(set.dataset.set === 'new' ? 'new' : Number(set.dataset.set));
    if (e.target.closest('#ng-hand') && this.sel.length) return this.dropTo('hand');
  }

  /** 고른 타일을 target(줄 번호 / 'new' / 'hand')으로 옮기기 */
  dropTo(target, ids = this.sel.slice()) {
    const w = this.work;
    if (!w || !ids.length) return;
    if (target === 'hand') {
      if (ids.some((id) => !w.played.has(id) && !w.hand.includes(id))) {
        this.audio.error();
        toast('판에 있던 타일은 내 패로 가져올 수 없어요. 이번에 낸 타일만 되돌릴 수 있어요.', 2600);
        return;
      }
      if (ids.every((id) => w.hand.includes(id))) {
        this.sel = [];
        return this.render();
      }
    }
    if (typeof target === 'number' && (target < 0 || !w.board[target])) return;
    const gone = new Set(ids);
    const destBefore = typeof target === 'number' ? analyzeSet(w.board[target]).ok : false;
    w.hand = w.hand.filter((id) => !gone.has(id));
    w.board = w.board.map((s) => s.filter((id) => !gone.has(id)));
    let dest = null;
    if (target === 'hand') {
      ids.forEach((id) => {
        w.hand.push(id);
        w.played.delete(id);
      });
    } else {
      ids.forEach((id) => {
        if (w.startHand.includes(id)) w.played.add(id);
      });
      if (target === 'new') {
        dest = ids.slice();
        w.board.push(dest);
      } else {
        dest = w.board[target];
        dest.push(...ids);
      }
    }
    w.board = w.board.filter((s) => s.length);
    this.sel = [];
    if (dest && analyzeSet(dest).ok && !destBefore) this.audio.setDone();
    else this.audio.place(ids.length);
    if (navigator.vibrate) navigator.vibrate(8);
    this.render();
    this.stage.setBoard(w.board, { fromSeat: this.me });
  }

  undo() {
    const w = this.work;
    if (!w) return;
    w.board = w.startBoard.map((x) => x.slice());
    w.hand = w.startHand.slice();
    w.played = new Set();
    this.sel = [];
    this.audio.pick();
    this.render();
    this.stage.setBoard(w.board, { fromSeat: this.me });
  }

  async endTurn() {
    if (!this.work || this.sending) return;
    const a = this.analysis();
    if (!a.canEnd) {
      this.audio.error();
      return toast(a.reason, 2600);
    }
    const board = this.work.board.map((s) => orderSet(s));
    const played = [...this.work.played];
    if (this.tutorialEnd) return this.tutorialEnd(board, played);
    this.sending = true;
    const ok = await this.lobby.send('endTurn', { board, played });
    this.sending = false;
    if (ok) {
      this.audio.bloom();
      if (!a.opened) banner('🌸 첫 등록!');
    }
  }

  async drawPass() {
    if (!this.work || this.sending) return;
    if (this.tutorialEnd) return toast('튜토리얼에서는 직접 세트를 만들어 내 보세요!');
    if (this.work.played.size) {
      const go = await modal({
        title: '뽑고 넘길까요?',
        html: '<p>이번 턴에 놓은 타일은 모두 <b>되돌리고</b> 더미에서 1개 뽑아요.</p>',
        buttons: [
          { label: '계속 놓기', value: false },
          { label: '되돌리고 뽑기', value: true, primary: true },
        ],
      });
      if (!go || !this.work) return;
      this.undo();
    }
    this.sending = true;
    const ok = await this.lobby.send('draw');
    this.sending = false;
    if (ok) this.audio.draw();
  }

  // ---------- 드래그 (꾹 눌러 끌기 / 마우스는 바로 끌기) ----------
  dragStart(e) {
    const tile = e.target.closest('.ng-tile');
    if (!tile || !this.work || e.button > 0) return;
    const id = Number(tile.dataset.id);
    this.drag = { id, x: e.clientX, y: e.clientY, on: false, touch: e.pointerType !== 'mouse', pid: e.pointerId };
    if (this.drag.touch) {
      const d = this.drag;
      d.timer = setTimeout(() => this.drag === d && this.beginDrag(d.x, d.y), 260);
    }
  }

  beginDrag(x, y) {
    const d = this.drag;
    if (!d || d.on) return;
    if (!this.sel.includes(d.id)) {
      if (!this.canPick(d.id)) return this.dragCancel();
      this.sel = [d.id];
    }
    d.on = true;
    d.ids = this.sel.slice();
    const ghost = document.createElement('div');
    ghost.className = 'ng-ghost';
    ghost.innerHTML = d.ids
      .slice(0, 5)
      .map((id) => `<img src="${faceUrl(kindOf(id))}" alt="">`)
      .join('') + (d.ids.length > 5 ? `<b>+${d.ids.length - 5}</b>` : '');
    document.body.appendChild(ghost);
    d.ghost = ghost;
    this.audio.pick();
    if (navigator.vibrate) navigator.vibrate(12);
    this.render();
    this.moveGhost(x, y);
  }

  moveGhost(x, y) {
    const d = this.drag;
    d.ghost.style.transform = `translate(${x - 24}px, ${y - 70}px)`;
    const el = document.elementFromPoint(x, y);
    const t = el && (el.closest('[data-set]') || el.closest('#ng-hand'));
    if (t !== d.hot) {
      d.hot?.classList.remove('drop-hi');
      t?.classList.add('drop-hi');
      d.hot = t;
    }
  }

  dragMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (!d.on) {
      if (d.touch) {
        if (dist > 10) this.dragCancel(); // 스크롤하려는 손가락
        return;
      }
      if (dist > 6) this.beginDrag(e.clientX, e.clientY);
      if (!this.drag || !this.drag.on) return;
    }
    if (dist > 10) d.moved = true;
    this.moveGhost(e.clientX, e.clientY);
  }

  dragEnd(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    if (!d.on) return this.dragCancel();
    const t = d.hot;
    this.dragCancel();
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 400);
    if (!t || !d.moved) return this.render(); // 꾹 누르기만 했으면 고르기만
    if (t.id === 'ng-hand') this.dropTo('hand', d.ids);
    else this.dropTo(t.dataset.set === 'new' ? 'new' : Number(t.dataset.set), d.ids);
  }

  dragCancel() {
    const d = this.drag;
    if (!d) return;
    clearTimeout(d.timer);
    d.ghost?.remove();
    d.hot?.classList.remove('drop-hi');
    this.drag = null;
  }

  // ---------- 끝 ----------
  async showEnd(s) {
    const ng = s.ng;
    const w = ng.winner;
    const wp = s.players[w];
    const meWin = w === this.me;
    banner(`${wp.emoji} ${wp.name} 승리!`);
    if (meWin) {
      this.audio.win();
      confetti(3, ['#ff6b7a', '#ffd34d', '#6aa8ff', '#c08cff', '#7ee08a']);
      this.stage.celebrate();
    } else if (this.me >= 0) this.audio.lose();
    else this.audio.win();
    await new Promise((r) => setTimeout(r, 1300));
    if (this.state !== s) return;
    const order = s.players.map((p, i) => i).sort((a, b) => ng.scores[a] - ng.scores[b]);
    const emptied = ng.counts[w] === 0;
    const rows = order
      .map((i) => {
        const p = s.players[i];
        const tiles = (ng.hands ? ng.hands[i] : []).slice(0, 18).map((id) => `<img src="${faceUrl(kindOf(id))}" alt="">`).join('');
        return `<li class="${i === w ? 'win' : ''}"><span class="who">${i === w ? '🏆 ' : ''}${p.emoji} ${esc(p.name)}</span><b>${ng.scores[i]}점</b><div class="ng-left">${tiles || '<small>다 냈어요!</small>'}</div></li>`;
      })
      .join('');
    const host = s.hostId === s.me;
    const v = await modal({
      title: `${wp.emoji} ${wp.name} 승리!`,
      html: `<p class="note">${emptied ? '받침대의 타일을 모두 냈어요!' : '더미가 비고 아무도 못 내서, 남은 점수가 가장 적은 사람이 이겼어요.'} (새싹은 ${30}점)</p><ul class="ng-result">${rows}</ul>`,
      buttons: this.me < 0 ? [{ label: '확인', value: null, primary: true }] : [{ label: '메뉴로', value: 'menu' }, ...(host ? [{ label: '🔁 한 판 더', value: 'again', primary: true }] : [{ label: '방장을 기다릴게요', value: 'wait', primary: true }])],
    });
    if (v === 'menu') return this.onMenu?.();
    if (v === 'again') {
      try {
        await this.lobby.call('lobby', { code: this.lobby.code, pid: this.lobby.pid });
        await this.lobby.send('start');
      } catch (err) {
        toast(err.message);
      }
    }
  }

  // ---------- 튜토리얼: 서버 없이 화면만 ----------
  /** fake: { board, hand, opened(내 첫 등록 여부) }, onEnd(board, played) → 검사·다음 단계 */
  startLocal({ board, hand, opened, onEnd }) {
    if (this.mode !== 'tutorial') this.enter('tutorial');
    this.tutorialEnd = onEnd || null;
    this.seenSeq = 0;
    this.work = null;
    const s = {
      status: 'playing',
      mode: 'online',
      mySeat: 0,
      me: 'me',
      players: [
        { name: '나', emoji: '🙂' },
        { name: '꿀벌 봇', emoji: '🐝' },
      ],
      ng: { board, hand, counts: [hand.length, 14], opened: [!!opened, true], pool: 40, turn: onEnd ? 0 : 1, turnNo: Math.floor(Math.random() * 1e6), last: null, over: false },
      events: [],
    };
    this.state = s;
    this.stage.setSeats(2, 0);
    this.stage.setCounts(s.ng.counts);
    this.stage.setPool(40);
    this.syncWork();
    this.render();
    this.stage.setBoard(this.displayBoard(), { instant: true });
  }
}
