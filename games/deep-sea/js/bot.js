// 심해 보물섬 탐험대 — 봇 (서버와 튜토리얼 공용, 순수 함수)
import { ROLE, summarize } from './rules.js';

/**
 * 라운드 시작에 봇이 할 말. 탐험대는 대체로 정직, 해적은 가끔 거짓말.
 * 반환: 말풍선 키 배열 (예: ['t1', 'm0'])
 */
export function botClaims(role, hand, rnd = Math.random) {
  const s = summarize(hand);
  let t = s.treasure;
  let m = s.monster > 0;
  if (role === ROLE.PIRATE) {
    if (m && rnd() < 0.75) m = false; // 문어를 숨김
    if (rnd() < 0.5) t = Math.max(0, Math.min(3, t + (rnd() < 0.5 ? 1 : -1)));
  } else if (rnd() < 0.08) {
    t = Math.max(0, t - 1); // 탐험대도 아주 가끔 헷갈림
  }
  return [`t${Math.min(3, t)}`, m ? 'm1' : 'm0'];
}

/**
 * 누구 카드를 뒤집을지 고름.
 * @param {object} p
 * @param {number} p.me        봇 자리
 * @param {string} p.role      봇 역할
 * @param {number[]} p.counts  자리별 남은 카드 수
 * @param {object} p.claims    { seat: { treasure, monster } } 이번 라운드 주장
 * @param {object} p.sus       { seat: 의심 점수 }  ("너 수상해"를 받은 횟수 등)
 * @param {object} p.flipped   { seat: { treasure, empty, monster } } 이번 라운드 그 자리에서 나온 카드
 * @returns {{target:number, index:number}}
 */
export function botChooseFlip({ me, role, counts, claims = {}, sus = {}, flipped = {}, rnd = Math.random }) {
  let best = -1;
  let bestScore = -Infinity;
  counts.forEach((cnt, seat) => {
    if (seat === me || !cnt) return;
    const c = claims[seat] || {};
    const f = flipped[seat] || {};
    // 남았을 것으로 보이는 보물 = 주장한 보물 - 이미 나온 보물
    const leftTreasure = Math.max(0, (c.treasure ?? 0.8) - (f.treasure || 0));
    const saysMonster = c.monster === true ? 1 : 0;
    const lied = (f.treasure || 0) > (c.treasure ?? 9) || (f.monster && c.monster === false) ? 1 : 0;
    let score;
    if (role === ROLE.CREW) {
      score = (leftTreasure / cnt) * 6 - saysMonster * 4 - (sus[seat] || 0) * 1.2 - lied * 2;
    } else {
      // 해적: 문어가 있을 법한 곳, 보물이 적은 곳을 노림
      score = saysMonster * 3 + (1 - leftTreasure / cnt) * 2 + (sus[seat] || 0) * 0.3;
    }
    score += rnd() * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = seat;
    }
  });
  return { target: best, index: Math.floor(rnd() * Math.max(1, counts[best] || 1)) };
}
