// 공용 오프라인 테이블 모드 화면 (패만 공유, 판정은 말로)
// 서버 엔진(server/offline-table.js)이 보내는 state.ot를 그리고, 범용 동작을 보냄.
// 3D 테이블은 뒤에서 분위기만 내고, 카드 조작은 휴대폰에서도 편한 HTML로 함.
import { $, esc, toast, modal, banner, confetti } from './ui-core.js';

// 스타일은 이 모듈을 불러오는 순간 한 번 붙임 (게임마다 CSS 구성이 달라도 똑같이 보이게)
if (typeof document !== 'undefined' && !document.getElementById('ot-css')) {
  const link = document.createElement('link');
  link.id = 'ot-css';
  link.rel = 'stylesheet';
  link.href = new URL('./offline-table.css', import.meta.url).href;
  document.head.appendChild(link);
}

/** 공용 HUD가 없는 예전 게임(타일 배틀, 심해 보물섬)용: 위쪽 바가 달린 전체 화면 칸을 만듦 */
export function createOfflineRoot(title, onMenu) {
  removeOfflineRoot();
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="ot-root" class="ot-root"><div class="ot-bar"><button class="icon-btn" id="ot-menu" aria-label="메뉴">☰</button><span>${esc(title)}</span></div><div id="ot-body"></div></div>`,
  );
  $('#ot-menu').addEventListener('click', onMenu);
  return $('#ot-body');
}
export function removeOfflineRoot() {
  document.getElementById('ot-root')?.remove();
}

/**
 * cfg:
 *   zones: [{ id, name, kind: 'pile'|'rows', perSeat? }]   (서버 offline.zones와 같게)
 *   actions: { draw, play, take, move, reveal, give, pick, flipTop, collect, redeal, recycle, order }
 *   cardImg(code) → 이미지 주소,  backImg(b) → 뒷면 이미지 주소
 *   backs?: [{ b, label }]       색깔별로 뽑기 (비밀번호 해독반)
 *   secretImg?(code), secretName?(code)
 *   redealDefault?(round) → 다시 나눌 장수
 *   tips: '이렇게 하세요' 안내 한 줄
 *   cardRatio?: 카드 세로/가로 비 (기본 1.45)
 */
export class OfflineTable {
  constructor({ root, lobby, cfg, audio, onExit }) {
    this.root = root;
    this.lobby = lobby;
    this.cfg = cfg;
    this.audio = audio;
    this.onExit = onExit;
    this.sel = { src: null, ids: [] };
    this.target = null; // pick 할 때 고른 { seat, index }
    this.seenSeq = 0;
    this.endShown = false;
  }

  mount() {
    this.root.innerHTML = `
      <div class="ot" style="--card-ratio:${this.cfg.cardRatio || 1.45}">
        <div class="ot-top">
          <span class="ot-turn" id="ot-turn"></span>
          <button class="btn small" id="ot-next">➡️ 턴 넘기기</button>
          <button class="btn small" id="ot-undo">↩️ 되돌리기</button>
          <button class="btn small" id="ot-host">👑 방장 메뉴</button>
          <button class="btn small" id="ot-secret" hidden>🎭 내 비밀 카드</button>
        </div>
        <ul class="ot-players" id="ot-players"></ul>
        <div class="ot-zones" id="ot-zones"></div>
        <ol class="ot-log" id="ot-log" aria-label="동작 기록"></ol>
        <div class="ot-me" id="ot-me">
          <div class="ot-hand-head"><span id="ot-hand-title">내 패</span><span class="ot-tip" id="ot-tip"></span></div>
          <div class="ot-hand" id="ot-hand"></div>
          <div class="ot-actions" id="ot-actions"></div>
        </div>
      </div>`;
    $('#ot-next').addEventListener('click', () => this.send('ot_turn'));
    $('#ot-undo').addEventListener('click', () => this.send('ot_undo'));
    $('#ot-host').addEventListener('click', () => this.hostMenu());
    $('#ot-secret').addEventListener('click', () => this.showSecret());
    this.root.querySelector('.ot').addEventListener('click', (e) => this.onClick(e));
    this.endShown = false;
    this.seenSeq = 0;
  }

  async send(action, payload = {}) {
    const keep = { sel: this.sel, target: this.target };
    this.sel = { src: null, ids: [] };
    this.target = null;
    const ok = await this.lobby.send(action, payload);
    if (!ok) Object.assign(this, keep);
    if (this.state) this.render(this.state);
    return ok;
  }

  get me() {
    return this.state.mySeat;
  }

  render(s) {
    if (!this.root.querySelector('.ot')) this.mount();
    this.state = s;
    const ot = s.ot;
    if (!ot) return;
    const spectator = this.me < 0;
    const host = s.hostId === s.me;
    this.root.querySelector('.ot').classList.toggle('is-watch', spectator);
    // 차례
    const tp = s.players[ot.turn];
    $('#ot-turn').innerHTML = `${ot.round > 1 ? `<b>${ot.round}R</b> · ` : ''}${tp ? `${tp.emoji} <b>${esc(tp.name)}</b> 차례` : ''}${ot.turn === this.me ? ' (나!)' : ''}`;
    $('#ot-turn').classList.toggle('mine', ot.turn === this.me);
    $('#ot-next').hidden = spectator;
    $('#ot-undo').hidden = spectator || !(host || ot.lastBy === this.me) || !ot.undoCount;
    $('#ot-host').hidden = spectator || !host;
    $('#ot-secret').hidden = spectator || !ot.secret;
    this.renderPlayers(s);
    this.renderZones(s);
    this.renderLog(s);
    $('#ot-me').hidden = spectator;
    if (!spectator) this.renderHand(s);
    // 새 기록 → 소리
    const evs = (s.events || []).filter((e) => e.type === 'ot' && e.seq > this.seenSeq);
    if (this.seenSeq && evs.length) this.cfg.onLog ? this.cfg.onLog(evs) : this.audio?.click();
    this.seenSeq = Math.max(this.seenSeq, ...(s.events || []).map((e) => e.seq || 0));
    if (s.status === 'finished' && !this.endShown) {
      this.endShown = true;
      this.showEnd(s);
    }
    if (s.status !== 'finished') this.endShown = false;
  }

  cardHtml(c, { sel = false, hidden = false, small = false, data = '' } = {}) {
    const img = c.f ? this.cfg.cardImg(c.f) : this.cfg.backImg(c.b || '');
    return `<button class="ot-card${sel ? ' sel' : ''}${small ? ' small' : ''}${c.up ? ' up' : ''}${hidden ? ' back' : ''}" ${data}><img src="${img}" alt="" draggable="false"></button>`;
  }

  renderPlayers(s) {
    const ot = s.ot;
    const pick = this.cfg.actions.pick;
    $('#ot-players').innerHTML = s.players
      .map((p, i) => {
        if (i === this.me && !pick) return '';
        const hand = ot.hands[i] || [];
        const showCards = this.cfg.showOthers !== false && hand.length <= 16 && (pick || this.cfg.backs || hand.some((c) => c.up));
        const cards = showCards
          ? `<div class="ot-mini">${hand
              .map((c, k) => {
                const isT = this.target && this.target.seat === i && this.target.index === k;
                const canPick = pick && i !== this.me && ot.turn === this.me;
                return this.cardHtml(c, { small: true, sel: isT, hidden: !c.f, data: canPick ? `data-pick="${i}:${k}"` : 'disabled' });
              })
              .join('')}</div>`
          : '';
        return `<li class="${i === ot.turn ? 'turn' : ''}${i === this.me ? ' me' : ''}">
          <span class="who">${p.emoji} ${esc(p.name)}${p.away ? ' 💤' : ''}</span>
          <span class="cnt">🂠 ${hand.length}</span>${cards}</li>`;
      })
      .join('');
  }

  renderZones(s) {
    const ot = s.ot;
    const parts = [];
    // 뽑을 더미
    if (this.cfg.actions.draw || this.cfg.actions.recycle) {
      const draws = this.cfg.backs
        ? this.cfg.backs.map((b) => `<button class="ot-pile-btn" data-draw="${b.b}" ${this.me < 0 ? 'disabled' : ''}><img src="${this.cfg.backImg(b.b)}" alt=""><span>${b.label} 뽑기<br><b>${ot.drawBacks[b.b] || 0}</b>장</span></button>`).join('')
        : `<button class="ot-pile-btn" data-draw="" ${this.me < 0 ? 'disabled' : ''}><img src="${this.cfg.backImg('')}" alt=""><span>뽑기<br><b>${ot.drawCount}</b>장</span></button>`;
      parts.push(`<section class="ot-zone draw"><h4>뽑을 더미</h4><div class="ot-draws">${draws}</div></section>`);
    }
    for (const z of this.cfg.zones) {
      const ids = z.perSeat ? s.players.map((_, i) => `${z.id}:${i}`) : [z.id];
      for (const zid of ids) {
        const rows = ot.zones[zid] || [];
        const seat = z.perSeat ? Number(zid.split(':')[1]) : null;
        const title = z.perSeat ? `${s.players[seat].emoji} ${esc(s.players[seat].name)}` : esc(z.name);
        const count = rows.reduce((n, r) => n + r.length, 0);
        let body;
        if (z.kind === 'rows') {
          body = rows
            .map(
              (row, r) =>
                `<div class="ot-row" data-row="${zid}:${r}">${row.map((c) => this.cardHtml(c, { sel: this.isSel('zone', c.id), data: `data-zcard="${c.id}"` })).join('')}<span class="ot-row-drop">＋여기</span></div>`,
            )
            .join('') + `<button class="ot-row new" data-row="${zid}:-1">＋ 새 줄 만들기</button>`;
        } else if (z.spread) {
          // 뒤집힌 카드를 모두 펼쳐 보여 주기 (심해 보물섬 탐험대)
          const all = rows.flat();
          body = `<div class="ot-pile spread">${all.length ? all.map((c) => this.cardHtml(c, { small: all.length > 12, data: 'disabled' })).join('') : '<span class="ot-empty">아직 없어요</span>'}</div>`;
        } else {
          const top = rows[rows.length - 1] || [];
          const under = rows.length > 1 ? `<span class="ot-under">아래 ${count - top.length}장</span>` : '';
          body = `<div class="ot-pile" data-row="${zid}:-1">${top.length ? top.map((c) => this.cardHtml(c, { sel: this.isSel('zone', c.id), data: `data-zcard="${c.id}"` })).join('') : '<span class="ot-empty">비어 있음</span>'}${under}</div>`;
        }
        parts.push(`<section class="ot-zone ${z.kind}${z.perSeat ? ' per' : ''}"><h4>${title} <small>${count}장</small></h4>${body}</section>`);
      }
    }
    $('#ot-zones').innerHTML = parts.join('');
  }

  renderLog(s) {
    const logs = (s.events || []).filter((e) => e.type === 'ot').slice(-6);
    $('#ot-log').innerHTML = logs.map((e) => `<li>${esc(e.text)}</li>`).join('');
    $('#ot-log').scrollTop = 1e6;
  }

  isSel(src, id) {
    return this.sel.src === src && this.sel.ids.includes(id);
  }

  renderHand(s) {
    const ot = s.ot;
    const a = this.cfg.actions;
    const mineCount = (ot.hands[this.me] || []).length;
    $('#ot-tip').textContent = this.cfg.tips || '';
    let hand;
    if (a.flipTop) {
      $('#ot-hand-title').textContent = `내 더미 ${mineCount}장 (뒤집혀 있어 나도 못 봐요)`;
      hand = `<div class="ot-blind"><img src="${this.cfg.backImg('')}" alt=""><b>${mineCount}</b></div>`;
    } else if (this.cfg.hideOrder) {
      $('#ot-hand-title').textContent = `내 카드 ${mineCount}장 (자리는 섞여 있어요)`;
      hand = ot.hand.map((c) => this.cardHtml(c, { data: 'disabled' })).join('');
    } else {
      $('#ot-hand-title').textContent = `내 패 ${mineCount}장`;
      hand = ot.hand.map((c) => this.cardHtml(c, { sel: this.isSel('hand', c.id), data: `data-hcard="${c.id}"` })).join('') || '<span class="ot-empty">패가 비었어요</span>';
    }
    $('#ot-hand').innerHTML = hand;
    $('#ot-hand').classList.toggle('blind', !!a.flipTop);
    // 동작 버튼
    const btn = (act, label, extra = '') => `<button class="btn small${extra}" data-act="${act}">${label}</button>`;
    const b = [];
    const n = this.sel.ids.length;
    if (a.flipTop) b.push(btn('flipTop', '🃏 맨 위 카드 뒤집기', ' primary'));
    if (a.pick && ot.turn === this.me) b.push(btn('pick', this.target ? '🔍 고른 카드 뒤집기' : '🔑 내 차례! 남의 카드를 고르세요', this.target ? ' primary' : ' is-off'));
    else if (a.pick) b.push(`<span class="ot-hint">🔑 ${esc(s.players[ot.turn]?.name || '')}님이 카드를 고르는 중</span>`);
    if (this.sel.src === 'hand' && n) {
      for (const z of this.cfg.zones) if (z.kind === 'pile' && !z.perSeat && a.play) b.push(btn(`play:${z.id}`, `▶ ${z.name}에 내기 (${n})`, ' primary'));
      if (this.cfg.zones.some((z) => z.kind === 'rows')) b.push(`<span class="ot-hint">↑ 판의 줄이나 ‘새 줄’을 눌러 내려놓기</span>`);
      if (a.give && n === 1) b.push(btn('give', '🎁 주기'));
      if (a.reveal && n === 1) {
        const c = ot.hand.find((x) => x.id === this.sel.ids[0]);
        b.push(btn('reveal', c && c.up ? '🔒 다시 숨기기' : '🔓 공개하기'));
      }
      if (a.order && n === 1) b.push(btn('left', '◀'), btn('right', '▶'));
      b.push(btn('clear', '선택 취소'));
    } else if (this.sel.src === 'zone' && n) {
      if (a.take) b.push(btn('take', `✋ 내 패로 가져오기 (${n})`, ' primary'));
      if (this.cfg.zones.some((z) => z.kind === 'rows')) b.push(`<span class="ot-hint">↑ 다른 줄을 눌러 옮기기</span>`);
      b.push(btn('clear', '선택 취소'));
    } else if (!a.flipTop && !a.pick) {
      b.push(`<span class="ot-hint">카드를 눌러 고른 뒤 할 일을 고르세요</span>`);
    }
    if (a.give && a.flipTop) b.push(btn('giveTop', '🎁 맨 위 1장 주기'));
    if (a.collect) b.push(btn('collect', '🧺 테이블 카드 가져가기'));
    if (a.recycle) b.push(btn('recycle', '♻️ 버린 더미 섞기'));
    $('#ot-actions').innerHTML = b.join('');
  }

  async onClick(e) {
    const t = e.target.closest('[data-hcard],[data-zcard],[data-row],[data-act],[data-draw],[data-pick]');
    if (!t || this.me < 0) return;
    const s = this.state;
    if (t.dataset.hcard) return this.toggle('hand', Number(t.dataset.hcard));
    if (t.dataset.zcard) {
      // 패에서 고른 게 있으면 그 카드가 있는 줄에 내려놓기, 아니면 테이블 카드 고르기
      const row = t.closest('[data-row]');
      if (this.sel.src === 'hand' && row) return this.drop(row.dataset.row);
      if (!this.cfg.actions.take && !this.cfg.actions.move) return;
      return this.toggle('zone', Number(t.dataset.zcard));
    }
    if (t.dataset.pick) {
      const [seat, index] = t.dataset.pick.split(':').map(Number);
      this.target = { seat, index };
      return this.render(s);
    }
    if (t.dataset.draw != null) {
      const back = t.dataset.draw;
      return this.send('ot_draw', back ? { n: 1, back } : { n: 1 });
    }
    if (t.dataset.row) return this.drop(t.dataset.row);
    const act = t.dataset.act;
    if (!act) return;
    if (act.startsWith('play:')) return this.send('ot_play', { ids: this.sel.ids, zone: act.slice(5), row: -1 });
    if (act === 'clear') {
      this.sel = { src: null, ids: [] };
      return this.render(s);
    }
    if (act === 'take') return this.send('ot_take', { ids: this.sel.ids });
    if (act === 'reveal') {
      const c = s.ot.hand.find((x) => x.id === this.sel.ids[0]);
      return this.send('ot_reveal', { id: this.sel.ids[0], up: !(c && c.up) });
    }
    if (act === 'left' || act === 'right') {
      const ids = s.ot.hand.map((c) => c.id);
      const i = ids.indexOf(this.sel.ids[0]);
      const j = act === 'left' ? i - 1 : i + 1;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const keep = this.sel.ids[0];
      const ok = await this.lobby.send('ot_order', { ids });
      if (ok) {
        this.sel = { src: 'hand', ids: [keep] };
        this.render(this.state);
      }
      return;
    }
    if (act === 'give' || act === 'giveTop') {
      const to = await this.choosePlayer('누구에게 줄까요?');
      if (to == null) return;
      return this.send('ot_give', act === 'give' ? { id: this.sel.ids[0], to } : { top: true, to });
    }
    if (act === 'flipTop') return this.send('ot_flipTop');
    if (act === 'pick') {
      if (!this.target) return toast('먼저 다른 사람의 카드를 고르세요.');
      return this.send('ot_pick', { target: this.target.seat, index: this.target.index });
    }
    if (act === 'collect') {
      const to = await this.choosePlayer('테이블 카드를 누가 가져갈까요?', true);
      if (to == null) return;
      return this.send('ot_collect', { to });
    }
    if (act === 'recycle') return this.send('ot_recycle', {});
  }

  /** 'zone:row' 자리에 고른 카드 내려놓기 (zone은 'open:2'처럼 콜론이 들어갈 수 있음) */
  drop(key) {
    const k = key.lastIndexOf(':');
    const zone = key.slice(0, k);
    const row = Number(key.slice(k + 1));
    if (!this.sel.ids.length) return;
    if (this.sel.src === 'hand' && this.cfg.actions.play) return this.send('ot_play', { ids: this.sel.ids, zone, row });
    if (this.sel.src === 'zone' && this.cfg.actions.move) return this.send('ot_move', { ids: this.sel.ids, zone, row });
  }

  toggle(src, id) {
    if (this.sel.src !== src) this.sel = { src, ids: [] };
    const i = this.sel.ids.indexOf(id);
    if (i >= 0) this.sel.ids.splice(i, 1);
    else this.sel.ids.push(id);
    if (!this.sel.ids.length) this.sel.src = null;
    this.audio?.click();
    this.render(this.state);
  }

  async choosePlayer(title, includeMe = false) {
    const s = this.state;
    return modal({
      title,
      html: '<p class="note">고르면 바로 기록에 남아요.</p>',
      buttons: [
        ...s.players.map((p, i) => ({ label: `${p.emoji} ${p.name}${i === this.me ? ' (나)' : ''}`, value: i })).filter((b) => includeMe || b.value !== this.me),
        { label: '취소', value: null },
      ],
    });
  }

  async hostMenu() {
    const s = this.state;
    const a = this.cfg.actions;
    const choice = await modal({
      title: '👑 방장 메뉴',
      html: '<p class="note">오프라인 모드는 판정이 없어요. 필요한 정리를 여기서 하세요.</p>',
      buttons: [
        ...(a.redeal ? [{ label: '🔄 모아서 다시 나누기 (다음 라운드)', value: 'redeal' }] : []),
        { label: '🏁 게임 끝 · 승자 정하기', value: 'end' },
        { label: '🔀 처음부터 다시 섞기', value: 'reshuffle' },
        { label: '🚪 대기방으로', value: 'lobby' },
        { label: '닫기', value: null, primary: true },
      ],
    });
    if (choice === 'redeal') {
      const def = this.cfg.redealDefault ? this.cfg.redealDefault(s.ot.round) : 5;
      const count = await modal({
        title: '몇 장씩 나눌까요?',
        html: '<p class="note">모든 사람의 패를 모아 섞은 뒤 똑같이 나눠요.</p>',
        buttons: [Math.max(1, def - 1), def, def + 1].map((n) => ({ label: `${n}장`, value: n, primary: n === def })),
      });
      if (count) this.send('ot_redeal', { count });
    } else if (choice === 'end') {
      const w = await modal({
        title: '누가 이겼나요?',
        html: '',
        buttons: [...s.players.map((p, i) => ({ label: `${p.emoji} ${p.name}`, value: i })), { label: '승자 없음', value: -1 }],
      });
      if (w != null) this.send('ot_end', { winner: w });
    } else if (choice === 'reshuffle') this.send('ot_reshuffle');
    else if (choice === 'lobby') this.lobby.send('lobby');
  }

  showSecret() {
    const f = this.state.ot.secret;
    modal({
      title: '🎭 내 비밀 카드',
      html: `<div class="ot-secret"><img src="${this.cfg.secretImg(f)}" alt=""><p>${esc(this.cfg.secretName ? this.cfg.secretName(f) : f)}</p><p class="note">다른 사람에게 보여 주지 마세요!</p></div>`,
    });
  }

  showEnd(s) {
    const ot = s.ot;
    const w = s.players[ot.winner];
    if (w) {
      banner(`${w.emoji} ${w.name} 승리!`);
      if (ot.winner === this.me) confetti();
    }
    const secrets = ot.secrets
      ? `<ul class="end-roles">${s.players.map((p, i) => `<li><span class="who">${p.emoji} ${esc(p.name)}</span><img src="${this.cfg.secretImg(ot.secrets[i])}" alt="">${esc(this.cfg.secretName ? this.cfg.secretName(ot.secrets[i]) : '')}</li>`).join('')}</ul>`
      : '';
    const host = s.hostId === s.me;
    modal({
      title: '🏁 게임 끝',
      html: `<p>${w ? `<b>${esc(w.name)}</b> 승리!` : '승자 없이 끝났어요.'}</p>${secrets}${host ? '' : '<p class="note">방장이 다시 섞거나 대기방으로 갈 수 있어요.</p>'}`,
      buttons: host
        ? [
            { label: '대기방으로', value: 'lobby' },
            { label: '🔀 다시 섞기', value: 'again', primary: true },
          ]
        : [{ label: '확인', value: null, primary: true }],
    }).then((v) => {
      if (v === 'again') this.send('ot_reshuffle');
      else if (v === 'lobby') this.lobby.send('lobby');
    });
  }
}
