// 흑백 뒤집기 대전 튜토리얼 (5단계, 3·4단계는 직접 두어 보기)
import { TutorialRunner } from '../../../shared/tutorial-core.js';
import { $, toast } from '../../../shared/ui-core.js';
import { newBoard, legalMoves, flipsFor, BLACK, WHITE } from './rules.js';

export function startTutorial({ view, store, audio, shell, onDone }) {
  shell.enterHud();
  view.setTitleMode(false);
  $('#hud-round').textContent = '튜토리얼';
  let board = newBoard();
  const show = (legal = [], last = -1) => {
    view.setBoard(board, last);
    view.showHints(legal);
  };
  const waitMove = (allowed) =>
    new Promise((resolve) => {
      view.onCell = async (i) => {
        if (!allowed.includes(i)) {
          audio.error();
          return toast('빛나는 칸에 두어 보세요!');
        }
        view.onCell = null;
        view.showHints([]);
        const flips = flipsFor(board, BLACK, i);
        await view.animateMove(i, BLACK, flips, { place: () => audio.place(), flip: (k) => audio.flip(k) });
        board[i] = BLACK;
        flips.forEach((f) => (board[f] = BLACK));
        resolve();
      };
    });

  // 모서리 연습판: 흑이 A1을 잡으면 대각선이 한 번에 뒤집힘
  const cornerBoard = () => {
    const b = new Array(64).fill(0);
    [9, 18, 27, 1, 8, 10, 17].forEach((i) => (b[i] = WHITE));
    [36, 2, 16, 26, 11, 19, 3].forEach((i) => (b[i] = BLACK));
    return b;
  };

  const t = new TutorialRunner({
    store,
    onDone: () => {
      view.onCell = null;
      view.showHints([]);
      onDone();
    },
    steps: [
      {
        title: '흑백 뒤집기 대전에 온 걸 환영해요! ⚫⚪',
        html: '<p>두 사람이 <b>흑돌</b>과 <b>백돌</b>을 번갈아 두는 게임이에요.</p><p>마지막에 <b>내 색 돌이 더 많은 쪽</b>이 이겨요. 흑이 먼저 둬요.</p>',
        enter: () => {
          board = newBoard();
          show();
        },
      },
      {
        title: '끼우면 뒤집혀요',
        html: '<p>상대 돌을 <b>내 돌 두 개 사이에</b> 끼우면 (가로·세로·대각선) 그 돌이 내 색으로 뒤집혀요.</p><p>그래서 <b>상대 돌을 하나라도 끼울 수 있는 칸</b>에만 둘 수 있어요. 노란 고리가 둘 수 있는 칸이에요.</p>',
        spot: () => view.boardRect(),
        enter: () => {
          board = newBoard();
          show(legalMoves(board, BLACK));
        },
      },
      {
        title: '직접 두어 보기 ①',
        html: '<p>빛나는 칸 중 아무 곳이나 눌러 흑돌을 두어 보세요. 사이에 낀 백돌이 뒤집혀요!</p>',
        spot: () => view.boardRect(),
        enter: () => {
          board = newBoard();
          show(legalMoves(board, BLACK));
        },
        task: () => waitMove(legalMoves(board, BLACK)),
      },
      {
        title: '직접 두어 보기 ② 모서리는 보물',
        html: '<p>모서리 돌은 <b>절대 다시 뒤집히지 않아요.</b> 왼쪽 위 모서리(A1)에 두어 보세요. 대각선과 가로·세로가 한꺼번에 뒤집혀요!</p>',
        spot: () => view.cellRect(0),
        enter: () => {
          board = cornerBoard();
          show([0]);
        },
        task: () => waitMove([0]),
      },
      {
        title: '쉬기와 끝',
        html: '<p>둘 곳이 없으면 그 사람은 <b>한 번 쉬고</b> 상대가 이어서 둬요.</p><p>둘 다 둘 곳이 없으면 끝! 돌이 많은 쪽이 이겨요.</p><p>🤖 봇과 연습(쉬움·보통·어려움), 👥 한 기기 2인 대전, 🌐 온라인 방으로 친구와 해 보세요.</p>',
      },
    ],
  });
  t.start();
  return t;
}
