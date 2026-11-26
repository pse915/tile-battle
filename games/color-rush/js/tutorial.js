// 컬러 러시 튜토리얼 (6단계, 2·4·5단계는 직접 해 보기) — 서버 없이 규칙 엔진으로 꾸민 판
import { TutorialRunner } from '../../../shared/tutorial-core.js';
import { $, toast } from '../../../shared/ui-core.js';
import { makeDeck, shuffle, publicView, play, draw, pass, callLast, catchLast } from './rules.js';
import { cardImg } from './cards.js';

const PLAYERS = [
  { id: 'me', name: '나', emoji: '🙂' },
  { id: 'b1', name: '지우개 봇', emoji: '🧽' },
  { id: 'b2', name: '연필 봇', emoji: '✏️' },
  { id: 'b3', name: '자 봇', emoji: '📏' },
];

export function startTutorial({ game, store, audio, onDone }) {
  let g = null;
  let seq = 1000;
  let version = 0;
  let events = [];
  let guard = null; // (action, payload) → 막을 이유 문자열 | null
  let after = null; // (action, payload, evs) → void

  const stateOf = () => ({
    ok: true,
    version: ++version,
    status: g.phase === 'over' ? 'finished' : 'playing',
    mode: 'online',
    me: 'me',
    hostId: 'me',
    mySeat: 0,
    players: PLAYERS.map((p) => ({ ...p, bot: p.id !== 'me', away: false })),
    cr: publicView(g, 0),
    events: events.slice(-40),
    seq,
  });
  const push = (evs) => evs.forEach((e) => events.push({ ...e, seq: ++seq }));

  /** 꾸민 판: hands[0]이 내 패, top은 맨 위 카드 */
  const setup = (hands, top, extra = {}) => {
    const rest = shuffle(makeDeck()).slice(0, 40);
    g = { n: 4, hands: hands.map((h) => h.slice()), draw: rest, discard: ['c2', 'v5', top], color: extra.color || top[0], dir: 1, turn: 0, phase: 'play', drawn: null, unsafe: -1, catchTried: false, winner: -1, moves: 0, ...extra };
    push([{ type: 'start' }]);
    guard = null;
    after = null;
    game.onState(stateOf(), false);
  };

  const send = (action, payload) => {
    const why = guard?.(action, payload);
    if (why) {
      audio.error();
      toast(why, 2400);
      return false;
    }
    let evs;
    try {
      if (action === 'play') evs = play(g, 0, payload.card, { color: payload.color, call: payload.call });
      else if (action === 'draw') evs = draw(g, 0);
      else if (action === 'pass') evs = pass(g, 0);
      else if (action === 'call') evs = callLast(g, 0);
      else if (action === 'catch') evs = catchLast(g, 0);
      else return false;
    } catch (e) {
      audio.error();
      toast(e.message, 2400);
      return false;
    }
    push(evs);
    game.onState(stateOf(), false);
    after?.(action, payload, evs);
    return true;
  };

  game.startLocal(send);
  $('#hud-round').textContent = '튜토리얼';

  const imgs = (codes) => `<p class="cr-tut-cards">${codes.map((c) => `<img src="${cardImg(c)}" alt="">`).join('')}</p>`;
  const others = (n) => [Array(n).fill('v1'), Array(n).fill('o2'), Array(n).fill('c4')];

  const t = new TutorialRunner({
    store,
    onDone: () => {
      game.exit();
      onDone();
    },
    steps: [
      {
        title: '컬러 러시에 온 걸 환영해요! 🖍️',
        html: `<p>손에 든 카드를 <b>가장 먼저 다 내면</b> 이기는 게임이에요.</p>
               <p>가운데 <b>버린 더미 맨 위 카드</b>와 <b>색</b>이 같거나 <b>숫자/기호</b>가 같으면 낼 수 있어요.</p>
               <p>색은 4가지: 분필 ▲ · 형광 ★ · 크레용 ◆ · 잉크 💧. 둘레의 화살표 링이 <b>지금 색</b>으로 빛나고 차례가 도는 방향을 알려 줘요.</p>`,
        spot: () => game.view.centerRect(),
        enter: () => setup([['c3', 'p7', 'o5', 'v9', 'pS'], ...others(7)], 'p3'),
      },
      {
        title: '직접 내 보기 ①',
        html: '<p>맨 위 카드는 <b>형광 3</b>. 형광(★) 카드나 숫자 3이면 낼 수 있어요.</p><p>아래 손패에서 <b>초록 테두리</b> 카드 하나를 눌러 내 보세요!</p>',
        spot: () => $('#cr-bottom'),
        enter: () => setup([['c3', 'p7', 'o5', 'v9', 'pS'], ...others(7)], 'p3'),
        task: () =>
          new Promise((res) => {
            after = (a) => a === 'play' && res();
          }),
      },
      {
        title: '기능 카드',
        html: `${imgs(['oS', 'oR', 'oD', 'wW', 'wF'])}
               <ul>
                 <li><b>건너뛰기</b>: 다음 사람은 한 번 쉬어요.</li>
                 <li><b>방향 바꾸기</b>: 차례 방향이 거꾸로! (2명일 땐 건너뛰기와 같아요)</li>
                 <li><b>+2</b>: 다음 사람이 2장 뽑고 쉬어요.</li>
                 <li><b>색 바꾸기 · +4</b>: 언제나 낼 수 있고 색을 골라요. +4는 다음 사람이 4장!</li>
               </ul>`,
        enter: () => setup([['oS', 'oR', 'oD', 'wW', 'wF'], ...others(6)], 'o8'),
      },
      {
        title: '직접 해 보기 ② 마지막!',
        html: '<p>카드가 <b>2장</b> 남았을 때, 한 장을 내면 1장이 남죠? 그때 <b>📣 마지막!</b>을 외쳐야 해요.</p><p><b>📣 마지막!</b> 버튼을 먼저 누르고, 초록 테두리 카드를 내 보세요.</p>',
        spot: () => $('#cr-bottom'),
        enter: () => setup([['o4', 'c8'], ...others(5)], 'o1'),
        task: () =>
          new Promise((res) => {
            guard = (a, p) => (a === 'play' && !p.call ? '먼저 📣 마지막! 버튼을 누르고 내 보세요!' : null);
            after = (a, p, evs) => evs.some((e) => e.type === 'call') && res();
          }),
      },
      {
        title: '직접 해 보기 ③ 지적하기',
        html: '<p>앗! 지우개 봇이 한 장 남았는데 <b>마지막!을 깜빡했어요.</b></p><p>다음 사람이 움직이기 전에 <b>👉 지적하기</b>를 누르면 그 사람이 <b>2장</b>을 더 가져가요. 눌러 보세요!</p>',
        spot: () => $('#cr-actions'),
        enter: () => setup([['p2', 'p6', 'c1'], ['v7'], ...others(5).slice(1)], 'p9', { unsafe: 1, turn: 0 }),
        task: () =>
          new Promise((res) => {
            guard = (a) => (a === 'play' || a === 'draw' ? '먼저 👉 지적하기를 눌러 보세요! 내가 움직이면 기회가 사라져요.' : null);
            after = (a) => a === 'catch' && res();
          }),
      },
      {
        title: '낼 게 없으면 뽑기',
        html: `<p>낼 카드가 없으면 <b>🃏 1장 뽑기</b> (가운데 뽑을 더미를 눌러도 돼요). 뽑은 카드를 낼 수 있으면 <b>내기</b> 또는 <b>넘기기</b>를 골라요.</p>
               <p>봇도 가끔 마지막!을 깜빡하고, 내가 깜빡하면 봇이 지적해요! 😆</p>
               <p>🤖 <b>봇과 연습</b>(봇 1~5명)이나 🌐 <b>온라인 방</b>에서 친구와 해 보세요. 실물 카드 없이 모일 땐 <b>오프라인 테이블 모드</b>!</p>`,
        enter: () => setup([['v2', 'v8', 'o3'], ...others(4)], 'c6'),
      },
    ],
  });
  t.start();
  return t;
}
