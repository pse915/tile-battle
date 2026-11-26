// 급식 다섯! 튜토리얼 (5단계, 4단계는 직접 종을 쳐 보기: 5가 되는 판 / 안 되는 판 구분)
import { TutorialRunner } from '../../../shared/tutorial-core.js';
import { $, toast } from '../../../shared/ui-core.js';
import { MENUS, MENU_NAME, cardMenu, cardCount, TARGET } from './rules.js';
import { cardImage, menuImage } from './cards.js';

const N = 4;
const lf = (tops, piles = [14, 14, 14, 14]) => ({
  piles,
  open: tops.map((c) => ({ top: c, count: c ? 2 : 0 })),
  out: [],
});

const QUIZ = [
  ['tteok2', 'milk3', 'tteok3', 'gimbap1'],
  ['pudding4', 'donkatsu2', 'pudding2', null],
  ['milk5', 'gimbap2', 'tteok1', 'donkatsu3'],
  ['gimbap3', 'gimbap1', 'donkatsu4', 'tteok2'],
  ['donkatsu1', 'pudding1', 'donkatsu2', 'donkatsu2'],
];

function sumsOf(tops) {
  const s = {};
  tops.forEach((c) => c && (s[cardMenu(c)] = (s[cardMenu(c)] || 0) + cardCount(c)));
  return s;
}

const img = (c) => `<img class="lf-tcard" src="${cardImage(c)}" alt="">`;

export function startTutorial({ view, store, audio, shell, onDone }) {
  shell.enterHud();
  view.setTitleMode(false);
  view.setCamera('side');
  $('#hud-round').textContent = '튜토리얼';
  view.setLayout(N, { me: 0 });
  view.sync(lf([null, null, null, null]));
  let demo = 0;

  const t = new TutorialRunner({
    store,
    onDone: () => {
      view.onPick = null;
      onDone();
    },
    steps: [
      {
        title: '급식 다섯!에 온 걸 환영해요 🍱',
        html: `<p>급식실 테이블에 둘러앉아 카드를 뒤집다가, <b>같은 메뉴가 딱 5개</b>가 되면 가운데 <b>종</b>을 먼저 치는 게임이에요!</p>
          <p class="lf-menus">${MENUS.map((m) => `<span><img src="${menuImage(m)}" alt="">${MENU_NAME[m]}</span>`).join('')}</p>
          <p>카드마다 메뉴가 <b>1~5개</b> 그려져 있어요.</p>`,
        enter: () => view.sync(lf([null, null, null, null])),
      },
      {
        title: '차례대로 한 장씩 뒤집기',
        html: '<p>카드는 모두에게 똑같이 나눠 <b>뒤집어 쌓아</b> 둬요. 내 것도 못 봐요!</p><p>차례가 되면 내 더미 맨 위 카드를 뒤집어 내 앞 <b>공개 더미</b>에 올려요. 셀 때는 <b>사람마다 맨 위 카드만</b> 봐요.</p>',
        spot: () => view.openRect(),
        enter: async () => {
          const id = ++demo;
          view.sync(lf([null, null, null, null]));
          const seq = ['milk2', 'pudding1', 'gimbap3', 'tteok4'];
          for (let i = 0; i < N && id === demo; i++) {
            audio.flip();
            await view.animateFlip(i, seq[i], 0.35);
          }
        },
        exit: () => demo++,
      },
      {
        title: '합이 정확히 5면 종!',
        html: `<p>보이는 맨 위 카드에서 <b>한 메뉴를 모두 더해 딱 5</b>가 되면 종을 쳐요.</p>
          <div class="lf-ex">${img('tteok2')}<b>+</b>${img('tteok3')}<b>= 5</b><span class="yes">🔔 종!</span></div>
          <div class="lf-ex">${img('gimbap4')}<b>+</b>${img('gimbap2')}<b>= 6</b><span class="no">✋ 아니에요</span></div>
          <div class="lf-ex">${img('milk5')}<b>혼자 5</b><span class="yes">🔔 종!</span></div>
          <p class="note">다른 메뉴끼리는 더하지 않아요. 4나 6은 꽝!</p>`,
        enter: () => view.sync(lf(['tteok2', 'milk1', 'tteok3', 'gimbap4'])),
        spot: () => view.openRect(),
      },
      {
        title: '직접 해 보기: 칠까, 말까?',
        html: `<p>테이블을 보고 5가 되면 <b>🔔 종 치기</b>(또는 가운데 종 누르기), 아니면 <b>🙅 안 쳐요</b>를 누르세요.</p>
          <div class="lf-quiz"><button class="btn primary" id="lf-q-ring">🔔 종 치기</button><button class="btn" id="lf-q-pass">🙅 안 쳐요</button></div>
          <p class="lf-quiz-n" id="lf-q-n"></p>`,
        enter: () => view.sync(lf(QUIZ[0])),
        task: () =>
          new Promise((resolve) => {
            let k = 0;
            const show = () => {
              view.sync(lf(QUIZ[k]));
              const n = $('#lf-q-n');
              if (n) n.textContent = `${k + 1} / ${QUIZ.length}번째 테이블`;
            };
            const answer = (ring) => {
              const s = sumsOf(QUIZ[k]);
              const five = Object.keys(s).find((m) => s[m] === TARGET);
              const desc = Object.keys(s)
                .map((m) => `${MENU_NAME[m]} ${s[m]}`)
                .join(', ');
              if (ring) {
                audio.bell();
                view.ringBell(!!five);
              }
              if (!!five === ring) {
                audio.correct();
                toast(five ? `정답! ${MENU_NAME[five]}가 딱 5개 🎉` : `맞아요! (${desc}) 5인 메뉴가 없어요`, 2000);
                k++;
                if (k >= QUIZ.length) {
                  view.onPick = null;
                  $('#lf-q-ring')?.setAttribute('disabled', '');
                  $('#lf-q-pass')?.setAttribute('disabled', '');
                  resolve();
                } else setTimeout(show, 500);
              } else {
                audio.wrong();
                toast(five ? `앗! ${MENU_NAME[five]}가 딱 5개였어요. 다시!` : `땡! (${desc}) 5인 메뉴가 없어요. 다시!`, 2400);
              }
            };
            $('#lf-q-ring').addEventListener('click', () => answer(true));
            $('#lf-q-pass').addEventListener('click', () => answer(false));
            view.onPick = (d) => d.bell && answer(true);
            show();
          }),
        exit: () => (view.onPick = null),
      },
      {
        title: '맞히면 꿀꺽, 틀리면 나눠 주기',
        html: `<ul>
            <li>🔔 <b>가장 먼저 맞게 친 사람</b>이 공개된 카드를 <b>모두</b> 가져가 내 더미 아래에 넣어요.</li>
            <li>😵 <b>틀리게 치면</b> 다른 모든 사람에게 카드를 <b>1장씩</b> 줘요.</li>
            <li>더미가 다 떨어지면 탈락! 마지막까지 남은 사람, 또는 정해진 장수를 다 뒤집었을 때 카드가 가장 많은 사람이 이겨요.</li>
          </ul>
          <p>👥 <b>한 기기 파티 모드</b>로 패드 하나에 둘러앉아 대결하거나, 🤖 봇과 연습, 🌐 온라인 방도 있어요.</p>`,
      },
    ],
  });
  t.start();
  return t;
}
