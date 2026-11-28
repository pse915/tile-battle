// 보석 공방 튜토리얼 (6단계): 쉬운 봇 2명과 진짜 판을 펼쳐 놓고 화면 곳곳을 짚어 줌. 언제든 건너뛰기 → 그대로 이어서 하기
import { TutorialRunner } from '../../../shared/tutorial-core.js';
import { $ } from '../../../shared/ui-core.js';

export function startTutorial({ store, onDone }) {
  const steps = [
    {
      title: '💎 보석 공방에 온 걸 환영해요',
      html: '<p>보석을 모아 <b>공방 카드</b>를 사고, 먼저 <b>15점</b>을 모으면 이겨요. 내 차례에는 아래 셋 중 <b>하나만</b> 해요.</p>',
    },
    {
      title: '1. 보석 가져오기',
      html: '<p>탁자 위 보석 더미나 아래 동그라미를 눌러 <b>서로 다른 색 3개</b>를 고르고 <b>가져오기</b>. 같은 색을 두 번 누르면 <b>2개</b>(4개 이상 남았을 때).</p>',
      spot: () => $('.gw-pickrow') || $('#gw-me'),
    },
    {
      title: '2. 카드 사기',
      html: '<p>카드 <b>왼쪽 위 숫자는 점수</b>, <b>오른쪽 위 보석은 할인</b>, 아래는 값이에요. 초록 테두리 카드는 지금 살 수 있어요. 눌러서 <b>사기</b>!</p>',
      spot: () => $('#gw-market .gw-row:last-child'),
    },
    {
      title: '할인이 핵심',
      html: '<p>산 카드는 그 색 보석을 <b>영원히 1개씩 깎아 줘요</b>. 싼 카드로 할인을 쌓으면 나중엔 비싼 카드도 공짜로 살 수 있어요.</p>',
      spot: () => $('#gw-me-gems'),
    },
    {
      title: '3. 찜하기 · 후원자',
      html: '<p>원하는 카드를 <b>찜</b>하면(3장까지) 남이 못 사가고 <b>황금(만능)</b> 1개를 받아요. 맨 위 줄 <b>후원자</b>는 할인 조건을 채우면 저절로 찾아와 <b>+3점</b>!</p>',
      spot: () => $('.gw-patrons'),
    },
    {
      title: '이제 직접 해 봐요!',
      html: '<p>보석은 <b>10개까지</b> 들 수 있어요. 다른 사람 이름표를 누르면 산 카드를 볼 수 있어요. 쉬운 봇 둘과 이 판을 그대로 이어서 해 보세요.</p>',
      spot: () => $('#gw-players'),
    },
  ];
  const t = new TutorialRunner({ steps, store, onDone });
  // 판이 그려진 뒤에 시작
  setTimeout(() => t.start(), 400);
  return t;
}
