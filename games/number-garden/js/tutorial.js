// 숫자 블록 정원 튜토리얼 (6단계, 4·5단계는 직접 세트를 만들어 내 보기)
import { TutorialRunner } from '../../../shared/tutorial-core.js';
import { $, toast } from '../../../shared/ui-core.js';
import { checkTurn } from './rules.js';

// 타일 id: 꽃색(0 동백 · 1 개나리 · 2 수국 · 3 제비꽃), 숫자, 벌(0/1)
const T = (c, n, copy = 0) => copy * 52 + c * 13 + n - 1;
const SPROUT = 104;

export function startTutorial({ game, store, audio, shell, onDone }) {
  shell.enterHud();
  document.body.classList.add('ng-tut');
  const show = (board, hand, extra = {}) => game.startLocal({ board, hand, opened: true, ...extra });

  /** 직접 해 보기: 턴 끝내기를 눌렀을 때 규칙 엔진으로 검사 */
  const task = ({ board, hand, opened, minPlayed = 1, hint }) =>
    new Promise((resolve) => {
      game.startLocal({
        board,
        hand,
        opened,
        onEnd: (nb, played) => {
          const g = { over: false, turn: 0, board, hands: [hand], opened: [opened, true] };
          const c = checkTurn(g, 0, nb, played);
          if (!c.ok) {
            audio.error();
            return toast(c.reason, 2600);
          }
          if (played.length < minPlayed) {
            audio.error();
            return toast(hint, 2600);
          }
          audio.bloom();
          show(nb, hand.filter((id) => !played.includes(id)));
          resolve();
        },
      });
    });

  const startHand = [T(1, 10), T(1, 11), T(1, 12), T(0, 2), T(2, 5), T(3, 5), T(0, 9), T(3, 13)];

  const t = new TutorialRunner({
    store,
    onDone: () => {
      document.body.classList.remove('ng-tut');
      game.tutorialEnd = null;
      onDone();
    },
    steps: [
      {
        title: '숫자 블록 정원에 온 걸 환영해요! 🌷',
        html: '<p>학교 화단에 <b>숫자 꽃 블록</b>을 심는 게임이에요. 1~13 숫자가 <b>네 가지 꽃</b>(●동백 · ✚개나리 · ◆수국 · ▲제비꽃)으로 있어요.</p><p>아래 <b>내 받침대</b>의 블록을 판에 세트로 내려놓아 <b>먼저 다 내면 승리!</b></p>',
        spot: () => $('#ng-hand'),
        enter: () => show([], startHand, { opened: false }),
      },
      {
        title: '세트 ① 꽃줄',
        html: '<p><b>같은 꽃</b>으로 <b>숫자가 이어지게 3개 이상</b> 놓으면 꽃줄이에요. (13 다음 1은 안 이어져요)</p><p>🌱 <b>새싹</b>은 아무 블록 대신 쓸 수 있어요. 오른쪽 아래 작은 숫자가 새싹이 대신하는 숫자예요.</p>',
        spot: () => $('#ng-board'),
        enter: () =>
          show(
            [
              [T(0, 3), T(0, 4), T(0, 5), T(0, 6)],
              [T(2, 9), SPROUT, T(2, 11)],
            ],
            [],
          ),
      },
      {
        title: '세트 ② 꽃다발',
        html: '<p><b>같은 숫자</b>를 <b>서로 다른 꽃</b>으로 3~4개 모으면 꽃다발이에요. 같은 꽃이 두 번 들어가면 안 돼요.</p><p>판의 줄이 <b style="color:#16a34a">초록</b>이면 맞는 세트, <b style="color:#dc2626">빨강</b>이면 고쳐야 하는 줄이에요.</p>',
        spot: () => $('#ng-board'),
        enter: () =>
          show(
            [
              [T(0, 7), T(1, 7), T(2, 7)],
              [T(0, 12), T(2, 12), T(3, 12), SPROUT],
              [T(1, 4), T(1, 4, 1), T(3, 4)],
            ],
            [],
          ),
      },
      {
        title: '직접 해 보기 ① 첫 등록 (30점)',
        html: '<p>처음엔 <b>내 패만으로 합 30점 이상</b>을 내야 해요. ✚개나리 <b>10·11·12</b>를 하나씩 탭해 고르고, <b>‘＋ 새 세트’</b>를 탭한 뒤 <b>‘✔ 턴 끝내기’</b>!</p><p class="note">끌어다 놓아도 돼요 (휴대폰은 꾹 누른 채 끌기). 잘못 놓으면 ‘되돌리기’.</p>',
        task: () => task({ board: [], hand: startHand, opened: false, hint: '' }),
      },
      {
        title: '직접 해 보기 ② 판 고치기',
        html: '<p>첫 등록 뒤에는 <b>판의 세트를 쪼개고 합쳐도</b> 돼요. 단, 턴이 끝날 때 <b>모든 줄이 맞는 세트</b>여야 하고 판의 블록을 내 패로 가져올 순 없어요.</p><p>●동백 <b>8</b>을 <b>새 세트</b>로 옮기고 내 <b>8</b> 두 개를 붙여 꽃다발을 만들어 보세요. ◆수국 4는 수국 꽃줄 끝에! (2개 이상 내기)</p>',
        task: () =>
          task({
            board: [
              [T(0, 5), T(0, 6), T(0, 7), T(0, 8)],
              [T(2, 1), T(2, 2), T(2, 3)],
            ],
            hand: [T(1, 8), T(3, 8), T(2, 4), T(0, 13), T(1, 2)],
            opened: true,
            minPlayed: 2,
            hint: '내 패에서 2개 이상 내 보세요. 8 꽃다발을 만들어요!',
          }),
      },
      {
        title: '낼 게 없으면? 그리고 끝!',
        html: '<p>낼 게 없거나 아끼고 싶으면 <b>🌱 뽑고 넘기기</b> — 더미에서 1개 받고 차례가 넘어가요.</p><p>받침대를 <b>다 비우면 승리</b>! 더미가 비고 아무도 못 내면 <b>남은 점수가 가장 적은 사람</b>이 이겨요 (새싹은 30점).</p><p>🤖 봇과 연습, 🌐 온라인 방(🪑 오프라인 테이블 모드 포함)에서 해 보세요!</p>',
        enter: () => show([[T(1, 10), T(1, 11), T(1, 12)]], startHand.slice(3)),
      },
    ],
  });
  t.start();
  return t;
}
