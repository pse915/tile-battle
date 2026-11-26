// ===== 공용 오프라인 테이블 모드 =====
// 패드·폰은 있는데 실물 카드가 없을 때: 서버는 섞기, 나눠주기, 비공개 패, 공용 영역만 관리.
// 규칙 판정·힌트·봇·승패 판정은 하지 않고, 모든 동작을 로그로 모두에게 공개함.
//
// 게임 모듈은 offline: { … } 으로 '구성품 정의'만 넘김:
//   deck(n) → ['카드코드', …]           전체 카드 (엔진이 섞음)
//   deal(n) → 한 사람당 처음 나눠줄 장수
//   zones: [{ id, name, kind: 'pile' | 'rows', perSeat? }]
//        pile: 낼 때마다 한 묶음씩 쌓임(맨 위 묶음이 크게 보임) / rows: 줄을 자유롭게 만들고 고침
//   name(code) → 로그에 쓸 이름 ('빨강 7')
//   back(code)? → 남들에게 보이는 뒷면 정보 ('b' 검정 타일 등). 기본 ''
//   sort(a, b)? → 패 자동 정렬 비교 함수 (코드끼리)
//   keepOrder? → 새 카드만 정렬 자리에 끼우고 기존 순서(손으로 옮긴 조커 등)는 유지
//   secret(n)? → 한 사람에 1장씩 비밀로 받는 카드 (역할 카드)
//   blind? → 내 패도 못 봄 (뒤집어 쌓아 둔 더미)
//   hideOrder? → 내 패 구성은 보이지만 자리는 모름 (남이 자리로 고름)
//   pickPassesTurn? → 남의 카드를 뒤집으면 그 사람 차례로
//   setup(ot, n)? → 처음 판 꾸미기 (버린 더미에 1장 뒤집기 등)
//   actions: 화면에 보일 동작 목록 (클라이언트 참고용)
//   minPlayers?, maxPlayers?

const OT_UNDO = 6;

function otShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function offlineModule(g) {
  const cfg = g.offline;
  const zoneDefs = cfg.zones || [];
  const nameOf = (c) => (cfg.name ? cfg.name(c.f) : c.f);
  const backOf = (f) => (cfg.back ? cfg.back(f) : '');
  const sortHand = (h) => {
    if (cfg.sort && !cfg.hideOrder) h.sort((a, b) => cfg.sort(a.f, b.f));
  };
  // keepOrder: 이미 손으로 옮겨 둔 순서(조커 자리 등)는 그대로 두고, 새 카드만 정렬된 자리에 끼워 넣음
  const addToHand = (ot, seat, cards) => {
    const h = ot.hands[seat];
    if (cfg.keepOrder && cfg.sort && !cfg.hideOrder) {
      cards.forEach((c) => {
        const i = h.findIndex((x) => cfg.sort(c.f, x.f) < 0);
        h.splice(i < 0 ? h.length : i, 0, c);
      });
    } else {
      ot.hands[seat] = h.concat(cards);
      sortHand(ot.hands[seat]);
    }
  };
  const zoneDef = (zid) => zoneDefs.find((z) => z.id === String(zid).split(':')[0]);
  const zoneTitle = (room, zid) => {
    const d = zoneDef(zid);
    const seat = String(zid).split(':')[1];
    return (d ? d.name : zid) + (seat != null && room.players[seat] ? '(' + room.players[seat].name + ')' : '');
  };
  const listNames = (cards) => {
    const names = cards.map(nameOf);
    return names.length > 4 ? names.slice(0, 4).join(', ') + ' 외 ' + (names.length - 4) + '장' : names.join(', ');
  };

  function newTable(n) {
    const codes = otShuffle(cfg.deck(n).slice());
    let uid = 1;
    const ot = { draw: [], hands: [], secrets: [], zones: {}, turn: 0, round: 1, undo: [], lastBy: -1, winner: null };
    ot.draw = codes.map((f) => ({ id: uid++, f, up: false }));
    zoneDefs.forEach((z) => {
      if (z.perSeat) for (let i = 0; i < n; i++) ot.zones[z.id + ':' + i] = [];
      else ot.zones[z.id] = [];
    });
    const per = typeof cfg.deal === 'function' ? cfg.deal(n) : cfg.deal || 0;
    for (let i = 0; i < n; i++) {
      ot.hands.push(ot.draw.splice(0, per));
      sortHand(ot.hands[i]);
    }
    if (cfg.secret) ot.secrets = otShuffle(cfg.secret(n).slice()).map((f) => ({ id: uid++, f, up: false }));
    ot.uid = uid;
    if (cfg.setup) cfg.setup(ot, n);
    return ot;
  }

  function log(room, seat, text) {
    pushEvent(room, { type: 'ot', seat, text: (seat >= 0 ? room.players[seat].name + ': ' : '') + text });
  }

  /** 카드 id로 위치 찾기: 내 패 또는 테이블 영역 */
  function takeFrom(ot, seat, ids, allowHand, allowZones) {
    const want = ids.map(Number);
    const got = [];
    want.forEach((id) => {
      let card = null;
      if (allowHand) {
        const h = ot.hands[seat];
        const i = h.findIndex((c) => c.id === id);
        if (i >= 0) card = h.splice(i, 1)[0];
      }
      if (!card && allowZones) {
        Object.keys(ot.zones).some((zid) =>
          ot.zones[zid].some((row, r) => {
            const i = row.findIndex((c) => c.id === id);
            if (i < 0) return false;
            card = row.splice(i, 1)[0];
            if (!row.length) ot.zones[zid].splice(r, 1);
            return true;
          }),
        );
      }
      if (!card) fail('그 카드를 찾을 수 없어요. 화면이 바뀌었을 수 있어요.');
      got.push(card);
    });
    return got;
  }

  function putTo(room, ot, zid, row, cards) {
    if (!ot.zones[zid]) fail('그런 자리가 없어요.');
    const rows = ot.zones[zid];
    const d = zoneDef(zid);
    cards.forEach((c) => (c.up = true));
    const r = Number(row);
    if (d && d.kind === 'rows' && Number.isInteger(r) && r >= 0 && r < rows.length) {
      rows[r] = rows[r].concat(cards);
      if (cfg.sortRow) rows[r].sort((a, b) => cfg.sortRow(a.f, b.f));
    } else rows.push(cards);
  }

  function snapshot(ot) {
    const copy = JSON.parse(JSON.stringify(ot));
    delete copy.undo;
    ot.undo.push(copy);
    while (ot.undo.length > OT_UNDO) ot.undo.shift();
  }

  function seatArg(room, v) {
    const s = Number(v);
    if (!Number.isInteger(s) || s < 0 || s >= room.players.length) fail('누구인지 알 수 없어요.');
    return s;
  }

  return {
    title: g.title,
    minPlayers: cfg.minPlayers || g.minPlayers,
    maxPlayers: cfg.maxPlayers || g.maxPlayers,
    reset(room) {
      room.ot = null;
      g.reset(room);
    },
    start(room) {
      room.ot = newTable(room.players.length);
      room.status = 'playing';
      log(room, -1, '카드를 섞어 나눠 줬어요. 규칙은 직접 말로 지켜 주세요!');
    },
    act(room, seat, req, isHost) {
      const ot = room.ot;
      if (!ot) fail('아직 시작하지 않았어요.');
      const a = req.action;
      const hostOnly = () => isHost || fail('방장만 할 수 있어요.');
      if (room.status === 'finished' && a !== 'ot_reshuffle') fail('끝난 판이에요. 방장이 다시 섞을 수 있어요.');
      if (a === 'ot_undo') {
        if (!isHost && ot.lastBy !== seat) fail('되돌리기는 방장이나 방금 움직인 사람만 할 수 있어요.');
        const prev = ot.undo.pop();
        if (!prev) fail('더 되돌릴 수 없어요.');
        prev.undo = ot.undo;
        room.ot = prev;
        room.ot.lastBy = -1;
        log(room, seat, '↩️ 방금 동작을 되돌렸어요');
        return;
      }
      if (a !== 'ot_reshuffle' && a !== 'ot_end') snapshot(ot);
      ot.lastBy = seat;
      switch (a) {
        case 'ot_play': {
          if (cfg.blind) fail('이 게임은 맨 위 카드 뒤집기로 내요.');
          const cards = takeFrom(ot, seat, req.ids || [], true, false);
          if (!cards.length) fail('낼 카드를 고르세요.');
          putTo(room, ot, String(req.zone), req.row, cards);
          log(room, seat, listNames(cards) + ' → ' + zoneTitle(room, req.zone));
          break;
        }
        case 'ot_move': {
          const cards = takeFrom(ot, seat, req.ids || [], true, true);
          if (!cards.length) fail('옮길 카드를 고르세요.');
          putTo(room, ot, String(req.zone), req.row, cards);
          log(room, seat, listNames(cards) + ' 옮김 → ' + zoneTitle(room, req.zone));
          break;
        }
        case 'ot_take': {
          const cards = takeFrom(ot, seat, req.ids || [], false, true);
          cards.forEach((c) => (c.up = false));
          addToHand(ot, seat, cards);
          log(room, seat, listNames(cards) + ' 가져감');
          break;
        }
        case 'ot_draw': {
          const n = Math.max(1, Math.min(10, Number(req.n) || 1));
          const back = req.back == null ? null : String(req.back);
          const got = [];
          for (let k = 0; k < n; k++) {
            const i = back == null ? 0 : ot.draw.findIndex((c) => backOf(c.f) === back);
            if (i < 0 || !ot.draw.length) break;
            got.push(ot.draw.splice(i, 1)[0]);
          }
          if (!got.length) fail('뽑을 카드가 없어요.');
          addToHand(ot, seat, got);
          log(room, seat, '카드 ' + got.length + '장 뽑음' + (back ? ' (' + (cfg.backName ? cfg.backName(back) : back) + ')' : ''));
          break;
        }
        case 'ot_reveal': {
          const c = ot.hands[seat].find((x) => x.id === Number(req.id));
          if (!c) fail('내 카드가 아니에요.');
          c.up = !!req.up;
          log(room, seat, (c.up ? '🔓 공개: ' : '🔒 다시 숨김: ') + (c.up ? nameOf(c) : '카드 1장'));
          break;
        }
        case 'ot_order': {
          const ids = (req.ids || []).map(Number);
          const h = ot.hands[seat];
          if (ids.length !== h.length) fail('순서를 바꿀 수 없어요.');
          const next = ids.map((id) => h.find((c) => c.id === id));
          if (next.some((c) => !c)) fail('순서를 바꿀 수 없어요.');
          ot.hands[seat] = next;
          log(room, seat, '패 순서를 바꿈');
          break;
        }
        case 'ot_give': {
          const to = seatArg(room, req.to);
          if (to === seat) fail('다른 사람을 고르세요.');
          const h = ot.hands[seat];
          let card;
          if (req.top || cfg.blind) card = h.shift();
          else {
            const i = h.findIndex((c) => c.id === Number(req.id));
            if (i >= 0) card = h.splice(i, 1)[0];
          }
          if (!card) fail('줄 카드가 없어요.');
          card.up = false;
          addToHand(ot, to, [card]);
          log(room, seat, room.players[to].name + '에게 카드 1장 줌');
          break;
        }
        case 'ot_pick': {
          const t = seatArg(room, req.target);
          if (t === seat) fail('다른 사람의 카드를 고르세요.');
          const h = ot.hands[t];
          const i = Number(req.index);
          if (!Number.isInteger(i) || i < 0 || i >= h.length) fail('그 자리에 카드가 없어요.');
          const card = h.splice(i, 1)[0];
          const zid = String(req.zone || (zoneDefs[0] && zoneDefs[0].id));
          putTo(room, ot, zid, -1, [card]);
          if (cfg.pickPassesTurn) ot.turn = t;
          log(room, seat, room.players[t].name + '의 카드를 뒤집음 → ' + nameOf(card));
          break;
        }
        case 'ot_flipTop': {
          const card = ot.hands[seat].shift();
          if (!card) fail('뒤집을 카드가 없어요.');
          const def = zoneDefs[0];
          const zid = req.zone ? String(req.zone) : def.perSeat ? def.id + ':' + seat : def.id;
          putTo(room, ot, zid, -1, [card]);
          if (cfg.flipPassesTurn) ot.turn = nextSeat(room, seat);
          log(room, seat, '뒤집음 → ' + nameOf(card));
          break;
        }
        case 'ot_collect': {
          const to = seatArg(room, req.to);
          let got = [];
          Object.keys(ot.zones).forEach((zid) => {
            if (req.zone && zid.split(':')[0] !== String(req.zone)) return;
            ot.zones[zid].forEach((row) => (got = got.concat(row)));
            ot.zones[zid] = [];
          });
          if (!got.length) fail('가져갈 카드가 없어요.');
          got.forEach((c) => (c.up = false));
          addToHand(ot, to, got);
          log(room, seat, '테이블 카드 ' + got.length + '장 → ' + room.players[to].name);
          break;
        }
        case 'ot_recycle': {
          const zid = String(req.zone || zoneDefs[0].id);
          const rows = ot.zones[zid] || fail('그런 자리가 없어요.');
          if (rows.length < 2) fail('다시 섞을 카드가 부족해요.');
          const keep = rows.pop();
          let back = [];
          rows.forEach((r) => (back = back.concat(r)));
          back.forEach((c) => (c.up = false));
          ot.zones[zid] = [keep];
          ot.draw = otShuffle(ot.draw.concat(back));
          log(room, seat, zoneTitle(room, zid) + ' 아래 카드 ' + back.length + '장을 섞어 뽑을 더미로');
          break;
        }
        case 'ot_redeal': {
          hostOnly();
          const per = Math.max(1, Math.min(20, Number(req.count) || 1));
          let all = [];
          ot.hands.forEach((h) => (all = all.concat(h)));
          otShuffle(all);
          if (all.length < per * room.players.length) fail('카드가 모자라요. 장수를 줄여 주세요.');
          ot.hands = room.players.map(() => all.splice(0, per));
          ot.draw = ot.draw.concat(all); // 남는 카드는 뽑을 더미로 (사라지지 않게)
          ot.hands.forEach((h) => sortHand(h));
          ot.round++;
          log(room, seat, '🔄 ' + ot.round + '라운드: 모은 카드를 섞어 ' + per + '장씩 다시 나눔');
          break;
        }
        case 'ot_turn': {
          ot.turn = req.to != null ? seatArg(room, req.to) : nextSeat(room, ot.turn);
          log(room, seat, '➡️ ' + room.players[ot.turn].name + ' 차례');
          break;
        }
        case 'ot_end': {
          hostOnly();
          const w = Number(req.winner);
          ot.winner = Number.isInteger(w) && w >= 0 && w < room.players.length ? w : -1;
          room.status = 'finished';
          room.resultText = '오프라인 모드 · ' + (ot.winner >= 0 ? '승자: ' + room.players[ot.winner].name : '승자 없음');
          log(room, seat, '🏁 게임 끝! ' + (ot.winner >= 0 ? room.players[ot.winner].name + ' 승리' : ''));
          break;
        }
        case 'ot_reshuffle': {
          hostOnly();
          room.ot = newTable(room.players.length);
          room.status = 'playing';
          log(room, seat, '🔀 처음부터 다시 섞어 나눔');
          break;
        }
        default:
          fail('오프라인 모드에서 할 수 없는 동작이에요.');
      }
    },
    actor() {
      return -1; // 오프라인 모드는 봇·자리 비움 대신 두기 없음
    },
    botDelay() {
      return 999999;
    },
    botMove() {},
    playerView(room, p, i) {
      const ot = room.ot;
      if (!ot) return { count: 0 };
      return { count: ot.hands[i].length };
    },
    view(room, mySeat) {
      const ot = room.ot;
      if (!ot) return { ot: null };
      const finished = room.status === 'finished';
      const pub = (c) => ({ id: c.id, b: backOf(c.f), f: c.up ? c.f : null, up: c.up });
      let mine = [];
      if (mySeat >= 0) {
        const h = ot.hands[mySeat];
        if (cfg.blind) mine = [];
        else if (cfg.hideOrder) mine = h.map((c) => ({ f: c.f, up: c.up })).sort((a, b) => (cfg.sort ? cfg.sort(a.f, b.f) : a.f < b.f ? -1 : 1));
        else mine = h.map((c) => ({ id: c.id, f: c.f, up: c.up, b: backOf(c.f) }));
      }
      const drawBacks = {};
      if (cfg.back) ot.draw.forEach((c) => (drawBacks[backOf(c.f)] = (drawBacks[backOf(c.f)] || 0) + 1));
      const zones = {};
      Object.keys(ot.zones).forEach((zid) => (zones[zid] = ot.zones[zid].map((row) => row.map((c) => ({ id: c.id, f: c.f })))));
      return {
        ot: {
          drawCount: ot.draw.length,
          drawBacks,
          zones,
          hand: mine,
          hands: ot.hands.map((h) => h.map(pub)),
          secret: mySeat >= 0 && ot.secrets[mySeat] ? ot.secrets[mySeat].f : null,
          secrets: finished && ot.secrets.length ? ot.secrets.map((c) => c.f) : null,
          turn: ot.turn,
          round: ot.round,
          winner: ot.winner,
          lastBy: ot.lastBy,
          undoCount: ot.undo.length,
        },
      };
    },
    onLeave() {},
  };
}

function nextSeat(room, s) {
  return (s + 1) % room.players.length;
}
