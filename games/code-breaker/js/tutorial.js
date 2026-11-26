// 비밀번호 해독반 튜토리얼 (6단계, 4단계는 직접 추측해 보기)
import { TutorialRunner } from '../../../shared/tutorial-core.js';
import { $, toast } from '../../../shared/ui-core.js';
import { tileImg, backImg } from './cards.js';

const ME = { name: '나', emoji: '🙂' };
const SENIOR = { name: '선배 봇', emoji: '🦉' };
const T = (id, c, n, up = false) => ({ id, c, n, up });
const img = (c, n) => `<img class="tut-tile" src="${n == null ? backImg(c) : tileImg(c, n)}" alt="">`;

export function startTutorial({ stage, game, store, audio, shell, onDone }) {
  shell.enterHud();
  stage.setTitleMode(false);
  stage.clear();
  $('#hud-body').innerHTML = '';
  $('#hud-round').textContent = '튜토리얼';
  const players = [ME, SENIOR];
  const show = (rows, opts = {}) => game.showLocal({ rows, hold: [[], 0], pile: { b: 8, w: 8 }, phase: 'guess', fresh: opts.fresh || 0, out: [false, false] }, players, opts);

  const myRow = () => [T(1, 'b', 1), T(2, 'b', 4), T(3, 'w', 6), T(4, 'b', 9)];
  const seniorTask = (solved) => [T(11, 'b', null), T(12, 'w', 3, true), solved ? T(13, 'b', 5, true) : T(13, 'b', null), T(14, 'w', 5, true), T(15, 'w', null)];

  const t = new TutorialRunner({
    store,
    onDone: () => {
      game.clearLabels();
      stage.clear();
      onDone();
    },
    steps: [
      {
        title: '방과 후 암호 동아리에 온 걸 환영해요! 🔐',
        html: `<p>모두 <b>숫자 타일</b>로 만든 비밀번호를 하나씩 세워 두고 있어요. 타일 앞면은 <b>주인만</b> 볼 수 있고, 남들은 <b>뒷면 색</b>(검정 ${img('b')} / 흰색 ${img('w')})만 봐요.</p>
               <p>남의 비밀번호를 추리해서 다 풀어 버리고, <b>마지막까지 내 비밀번호를 지키면</b> 승리!</p>`,
        enter: () => show([myRow(), [T(11, 'b', null), T(12, 'w', null), T(13, 'b', null), T(14, 'w', null)]], { instant: true }),
      },
      {
        title: '비밀번호는 언제나 작은 수부터',
        html: `<p>타일은 검정 0~11, 흰색 0~11, 그리고 조커 2개. 내 줄은 <b>왼쪽부터 작은 수 → 큰 수</b>로 저절로 정렬돼요.</p>
               <p>숫자가 같으면 <b>검정이 왼쪽</b>: ${img('b', 5)} ${img('w', 5)}</p>
               <p>아래에 서 있는 게 내 줄이에요. 상대 줄도 똑같은 규칙으로 서 있어요!</p>`,
        spot: () => stage.rowRect(0),
        enter: () => show([myRow(), [T(11, 'b', null), T(12, 'w', null), T(13, 'b', null), T(14, 'w', null)]], { instant: true }),
      },
      {
        title: '정렬 규칙으로 후보 좁히기',
        html: `<p>선배 줄이 ${img('b')} ${img('w', 3)} ${img('b')} ${img('w', 5)} ${img('w')} 이고, 흰3·흰5는 이미 공개됐어요.</p>
               <p>가운데 검정은 <b>흰3보다 크고 흰5보다 작아야</b> 해요 → 검정 <b>4</b> 아니면 <b>5</b>.</p>
               <p>그런데 <b>검정 4는 내 줄에 있죠?</b> ${img('b', 4)} 그러면 남은 건…?</p>`,
        spot: () => stage.rowRect(1),
        enter: () => show([myRow(), seniorTask(false)], { instant: true }),
      },
      {
        title: '직접 추측해 보기 🔍',
        html: `<p>빛나는 선배의 가운데 검정 타일! 숫자를 눌러 맞혀 보세요. (이 연습엔 조커가 없어요)</p>
               <div class="tut-pad" id="tut-pad">${Array.from({ length: 12 }, (_, v) => `<button class="btn small cb-num" data-tg="${v}">${v}</button>`).join('')}<button class="btn small cb-num joker" data-tg="12">🔑 조커</button></div>`,
        spot: () => stage.tileRect(13),
        enter: () => {
          show([myRow(), seniorTask(false)], { instant: true });
          stage.select(13);
        },
        task: () =>
          new Promise((resolve) => {
            const pad = $('#tut-pad');
            const onTap = async (e) => {
              const b = e.target.closest('[data-tg]');
              if (!b) return;
              const v = Number(b.dataset.tg);
              audio.dial();
              await stage.pulse(13);
              if (v !== 5) {
                audio.ng();
                stage.shake(13);
                b.classList.add('is-off');
                return toast(v === 4 ? '검정 4는 내 줄에 있어요! 다른 숫자는?' : '흰3보다 크고 흰5보다 작은 검정이에요.', 2400);
              }
              pad.removeEventListener('click', onTap);
              audio.ok();
              stage.select(0);
              await show([myRow(), seniorTask(true)]);
              resolve();
            };
            pad.addEventListener('click', onTap);
          }),
        exit: () => stage.select(0),
      },
      {
        title: '맞히면 계속? 틀리면 내 타일 공개!',
        html: `<p>내 차례에는 먼저 <b>가운데 더미에서 원하는 색 타일 1개</b>를 뽑고 나서 추리해요.</p>
               <ul><li><b>맞히면</b> 그 타일이 공개되고, <b>계속 추리</b>하거나 <b>멈출</b> 수 있어요. 멈추면 뽑은 타일은 숨긴 채 내 줄에 들어가요.</li>
               <li><b>틀리면</b> 방금 뽑은 타일이 <b>모두에게 공개</b>돼요! (더미가 비어 뽑은 게 없으면 내 숨긴 타일 하나를 골라 공개)</li></ul>
               <p>지금 내 줄에 들어온 흰2가 틀려서 눕혀지는 걸 보세요.</p>`,
        spot: () => stage.rowRect(0),
        enter: async () => {
          const row = [T(1, 'b', 1), T(5, 'w', 2), T(2, 'b', 4), T(3, 'w', 6), T(4, 'b', 9)];
          await show([row, seniorTask(true)], { fresh: 5 });
          await stage.wait(0.9);
          row[1] = T(5, 'w', 2, true);
          audio.ng();
          await show([row, seniorTask(true)]);
          audio.flip();
        },
      },
      {
        title: '조커와 승리',
        html: `<p>조커 ${img('b', 12)} 는 <b>아무 자리에나</b> 놓을 수 있어서 정렬 추리를 헷갈리게 해요. 조커라고 생각되면 <b>🔑 조커</b> 버튼으로 추측!</p>
               <p>타일이 <b>모두 공개되면 탈락</b>, 마지막 한 명이 승리예요.</p>
               <p>🤖 봇과 연습(봇 1~3명, 쉬움·보통·어려움), 🌐 온라인 방(오프라인 테이블 모드도 있어요)으로 해 보세요. 추리 중엔 <b>💡 후보</b> 버튼으로 남은 후보를 볼 수 있어요.</p>`,
      },
    ],
  });
  t.start();
  return t;
}
