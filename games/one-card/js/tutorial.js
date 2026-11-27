// 원카드 튜토리얼 (6단계, 2·4·5단계는 직접 해 보기) — 서버 없이 규칙 엔진으로 꾸민 판
import { TutorialRunner } from '../../../shared/tutorial-core.js';
import { $, toast } from '../../../shared/ui-core.js';
import { makeDeck, shuffle, normOpts, publicView, play, draw, pass, callLast, catchLast } from './rules.js';
import { cardImg } from './cards.js';

const PLAYERS = [
  { id: 'me', name: '나', emoji: '🙂' },
  { id: 'b1', name: '다람쥐 봇', emoji: '🐿️' },
  { id: 'b2', name: '부엉이 봇', emoji: '🦉' },
  { id: 'b3', name: '판다 봇', emoji: '🐼' },
];

export function startTutorial({ game, store, audio, onDone }) {
  let g = null;
  let seq = 1000;
  let version = 0;
  let events = [];
  let guard = null;
  let after = null;

  const stateOf = () => ({
    ok: true,
    version: ++version,
    status: g.phase === 'over' ? 'finished' : 'playing',
    mode: 'online',
    me: 'me',
    hostId: 'me',
    mySeat: 0,
    players: PLAYERS.map((p) => ({ ...p, bot: p.id !== 'me', away: false })),
    oc: publicView(g, 0),
    events: events.slice(-40),
    seq,
  });
  const push = (evs) => evs.forEach((e) => events.push({ ...e, seq: ++seq }));

  /** 꾸민 판: hands[0]이 내 패, top은 맨 위 카드 */
  const setup = (hands, top, extra = {}) => {
    const used = hands.flat().concat(top);
    const rest = shuffle(makeDeck().filter((c) => used.indexOf(c) < 0)).slice(0, 30);
    g = {
      n: 4,
      opts: normOpts({}),
      deckSize: 54,
      hands: hands.map((h) => h.slice()),
      draw: rest,
      discard: ['c4', 'h4', top],
      suit: top[0] === 'X' ? null : top[0],
      dir: 1,
      turn: 0,
      phase: 'play',
      attack: 0,
      drawn: null,
      unsafe: -1,
      catchTried: false,
      status: ['in', 'in', 'in', 'in'],
      places: [],
      busted: [],
      ranking: null,
      winner: -1,
      moves: 0,
      ...extra,
    };
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
      if (action === 'play') evs = play(g, 0, payload.card, { suit: payload.suit, call: payload.call });
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

  const imgs = (codes) => `<p class="oc-tut-cards">${codes.map((c) => `<img src="${cardImg(c)}" alt="">`).join('')}</p>`;
  const others = (n) => [Array(n).fill('d9'), Array(n).fill('c9'), Array(n).fill('s9')].map((h, i) => h.map((c, k) => (k ? ['d', 'c', 's'][i] + '3456'[k % 4] : c)));

  const t = new TutorialRunner({
    store,
    onDone: () => {
      game.exit();
      onDone();
    },
    steps: [
      {
        title: '원카드에 온 걸 환영해요! 🃏',
        html: `<p>손에 든 카드를 <b>가장 먼저 다 내면</b> 1등이에요.</p>
               <p>가운데 <b>버린 더미 맨 위 카드</b>와 <b>무늬(♠♥♦♣)</b>가 같거나 <b>숫자/문자</b>가 같으면 낼 수 있어요.</p>
               <p>왼쪽 위에 <b>지금 무늬</b>, 둘레의 화살표 링은 차례가 도는 방향이에요.</p>`,
        spot: () => game.view.centerRect(),
        enter: () => setup([['h3', 'd8', 's5', 'cT', 'dK'], ...others(7)], 'd5'),
      },
      {
        title: '직접 내 보기 ①',
        html: '<p>맨 위 카드는 <b>♦ 5</b>. ♦ 카드나 숫자 5면 낼 수 있어요.</p><p>아래 손패에서 <b>초록 테두리</b> 카드 하나를 눌러 내 보세요!</p>',
        spot: () => $('#oc-bottom'),
        enter: () => setup([['h3', 'd8', 's5', 'cT', 'hK'], ...others(7)], 'd5'),
        task: () =>
          new Promise((res) => {
            after = (a) => a === 'play' && res();
          }),
      },
      {
        title: '공격 카드와 특수 카드',
        html: `${imgs(['h2', 'dA', 'sA', 'XB', 'XC'])}
               <p><b>2</b> +2 · <b>A</b> +3 · <b>♠A</b> +5 · <b>흑백 조커</b> +5 · <b>컬러 조커</b> +7 — 다음 사람이 그만큼 뽑아야 해요!</p>
               ${imgs(['sJ', 'hQ', 'dK', 'c7'])}
               <p><b>J</b> 건너뛰기 · <b>Q</b> 방향 바꾸기 · <b>K</b> 한 번 더 · <b>7</b> 무늬 바꾸기</p>`,
        enter: () => setup([['h2', 'dA', 'sA', 'XB', 'XC'], ...others(6)], 'h8'),
      },
      {
        title: '직접 해 보기 ② 공격 막기!',
        html: '<p>앗, 판다 봇이 <b>♣ 2</b>로 <b>+2 공격</b>을 했어요!</p><p>같은 숫자 공격(2)이나 같은 무늬의 더 센 공격(♣A), 조커로 <b>막고 넘길 수</b> 있어요. 막으면 공격이 쌓여서 다음 사람에게 가요.</p><p><b>초록 테두리</b> 카드로 막아 보세요!</p>',
        spot: () => $('#oc-bottom'),
        enter: () => setup([['h2', 'cA', 'd9', 's6', 'h4'], ...others(5)], 'c2', { attack: 2, suit: 'c' }),
        task: () =>
          new Promise((res) => {
            guard = (a) => (a === 'draw' ? '받지 말고 초록 카드로 막아 보세요!' : null);
            after = (a, p, evs) => evs.some((e) => e.type === 'play' && e.defend) && res();
          }),
      },
      {
        title: '직접 해 보기 ③ 못 막으면 받기',
        html: '<p>이번엔 <b>+5 공격</b>! 그런데 막을 카드가 없어요.</p><p>막을 수 없을 땐 <b>😣 +5장 받기</b>를 눌러 쌓인 만큼 가져가요. 눌러 보세요.</p><p>손패가 <b>20장</b>(파산 장수)이 되면 탈락이니 조심!</p>',
        spot: () => $('#oc-actions'),
        enter: () => setup([['h3', 'd9', 's6'], ...others(5)], 'XB', { attack: 5, suit: null }),
        task: () =>
          new Promise((res) => {
            after = (a, p, evs) => evs.some((e) => e.type === 'take') && res();
          }),
      },
      {
        title: '📣 원카드!',
        html: `<p>카드가 <b>2장</b> 남았을 때 한 장을 내면 1장이 남죠? 그때 <b>📣 원카드!</b> 버튼을 먼저 누르고 내요.</p>
               <p>깜빡하면 다른 사람이 <b>👉 지적하기</b>를 눌러 나에게 <b>1장 벌칙</b>! 봇도 가끔 깜빡하니 노려 보세요 😆</p>
               <p>🤖 <b>봇과 연습</b>, 👥 <b>한 기기 여러 명</b>, 🌐 <b>온라인 방</b>에서 해 보세요. 실물 카드 없이 모일 땐 <b>오프라인 테이블 모드</b>!</p>`,
        spot: () => $('#oc-bottom'),
        enter: () => setup([['h3', 'h9'], ...others(4)], 'h6'),
      },
    ],
  });
  t.start();
  return t;
}
