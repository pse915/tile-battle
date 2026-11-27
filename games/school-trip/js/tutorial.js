// 서라벌학교여행 튜토리얼 (6단계, 3·4단계는 직접 주사위 굴리고 실 사 보기)
import { TutorialRunner } from '../../../shared/tutorial-core.js';
import { $ } from '../../../shared/ui-core.js';
import { CELLS, START_MONEY, SALARY } from './rules.js';

export function startTutorial({ view, store, audio, shell, onDone }) {
  shell.enterHud();
  view.setTitleMode(false);
  $('#hud-round').textContent = '튜토리얼';
  $('#hud-body').innerHTML = `<div class="k-bottom st-bottom"><div class="st-flag" id="tut-flag"></div><div class="k-actions" id="tut-acts"></div></div>`;
  const fake = () => ({
    n: 2,
    players: [
      { cash: START_MONEY, pos: 0, jail: 0, elev: false, pass: 0, out: false },
      { cash: START_MONEY, pos: 0, jail: 0, elev: false, pass: 0, out: false },
    ],
    own: new Array(40).fill(-1),
    lvl: new Array(40).fill(0),
    turn: 0,
    phase: 'roll',
  });
  let st = fake();
  const acts = (html = '', flag = '') => {
    $('#tut-acts').innerHTML = html;
    $('#tut-flag').textContent = flag;
  };
  const waitBtn = (id) => new Promise((res) => $('#' + id).addEventListener('click', res, { once: true }));

  const t = new TutorialRunner({
    store,
    onDone: () => {
      view.showHints([]);
      onDone();
    },
    steps: [
      {
        title: '서라벌학교여행에 온 걸 환영해요! 🏫',
        html: `<p>서라벌여중 1층부터 4층까지 <b>교실(실)을 사 모으는</b> 주사위 보드게임이에요.</p><p>모두 <b>${START_MONEY}만 원</b>으로 시작하고, <b>교문</b>을 지날 때마다 용돈 <b>${SALARY}만 원</b>을 받아요.</p>`,
        spot: () => view.boardRect(),
        enter: () => {
          st = fake();
          view.sync(st);
          acts();
        },
      },
      {
        title: '특별한 칸 네 곳',
        html: '<p>🛏️ <b>숙직실</b>: 보내지면 3턴 쉬기 (더블이나 50만 원으로 탈출)<br>💝 <b>복지실</b>: 복지 기부함에 쌓인 돈을 모두 받아요<br>🛗 <b>엘리베이터</b>: 다음 차례에 원하는 칸으로 슝!<br>💌 <b>행운 쪽지</b>: 장학금? 급식 당번비? 뽑아 봐야 알아요</p>',
        enter: () => view.showHints([10, 20, 30, 2]),
        exit: () => view.showHints([]),
      },
      {
        title: '직접 해 보기 ① 주사위 굴리기',
        html: '<p>아래 <b>🎲 주사위 굴리기</b>를 눌러 보세요. 주사위 두 개의 합만큼 말이 시계 방향으로 통통 뛰어가요. <b>더블</b>이면 한 번 더!</p>',
        spot: () => $('#tut-acts'),
        enter: () => {
          st = fake();
          view.sync(st);
          acts('<button class="btn primary" id="tut-roll">🎲 주사위 굴리기</button>', '내 차례 · 주사위를 굴려요!');
        },
        task: async () => {
          await waitBtn('tut-roll');
          acts('', '');
          audio.dice();
          await view.rollDice([1, 2], () => audio.diceLand());
          await view.hop(0, 0, 3, (k) => audio.tap(k));
          st.players[0].pos = 3;
          view.sync(st);
          $('#tut-flag').textContent = `🎲 1 + 2 = 3 · ${CELLS[3].name} 도착!`;
        },
      },
      {
        title: '직접 해 보기 ② 실 사기',
        html: `<p>주인 없는 실에 멈추면 <b>살지 말지</b> 고를 수 있어요. ${CELLS[3].name}을(를) 사 보세요!</p><p class="note">칸을 누르면 언제든 주인·값·통행료표를 볼 수 있어요.</p>`,
        spot: () => $('#tut-acts'),
        enter: () => {
          st.players[0].pos = 3;
          view.sync(st);
          view.showHints([3]);
          acts(`<button class="btn primary" id="tut-buy">🏷️ 사기 ${CELLS[3].price}만</button>`, `${CELLS[3].name} (${CELLS[3].price}만) 살까요?`);
        },
        task: async () => {
          await waitBtn('tut-buy');
          audio.buy();
          st.own[3] = 0;
          view.setOwner(3, 0, 0);
          view.showHints([]);
          acts('', `${CELLS[3].name}은(는) 이제 내 실!`);
        },
      },
      {
        title: '통행료와 건물',
        html: '<p>남의 실에 멈추면 <b>통행료</b>를 자동으로 내요. 돈이 모자라면 건물 → 땅 순으로 반값에 팔고, 그래도 못 내면 <b>파산</b>!</p><p>내 실에 다시 멈추면 🪑 책상 → 📚 책장 → 🏫 리모델링을 지어 통행료를 올려요. 같은 색 3칸을 모두 가지면 통행료 <b>2배</b>. ⭐ 명소는 건물 없이 통행료가 높아요.</p>',
        spot: () => view.cellRect(3),
        enter: () => {
          st.own[3] = 0;
          st.lvl[3] = 3;
          view.sync(st);
          acts('', '🏫 리모델링까지 지으면 통행료가 쑥!');
        },
      },
      {
        title: '이기는 법',
        html: '<p>한 명 빼고 모두 파산하면 승리! 수업 시간용으로 <b>정한 바퀴 수</b>(10·15·20)가 끝나면 <b>총자산(현금+땅값+건물값)</b> 1등이 이겨요.</p><p>🤖 봇과 연습, 👥 한 기기 여러 명, 🌐 온라인 방으로 해 보세요!</p>',
        enter: () => {
          st = fake();
          view.sync(st);
          acts();
        },
      },
    ],
  });
  t.start();
  return t;
}
