// AI 플레이어 — 쉬움 / 보통 / 어려움
import { legalPlays, valueOf, rankOf } from './rules.js';

/** 조합의 '아까움' 정도: 높은 숫자와 2를 많이 쓸수록 큼 */
function cost(play, maxN) {
  let c = 0;
  for (const t of play.tiles) {
    const r = rankOf(t.n, maxN) / (maxN - 1); // 0..1
    c += r * r * 3 + (t.n === 2 ? 3 : 0);
  }
  return c / play.tiles.length;
}

/** 이 조합을 내면 다른 페어·트리플이 깨지는가 */
function breaksGroups(play, hand) {
  let broken = 0;
  for (const n of new Set(play.tiles.map((t) => t.n))) {
    const total = hand.filter((t) => t.n === n).length;
    const usedN = play.tiles.filter((t) => t.n === n).length;
    if (total - usedN === 1) broken++; // 묶음을 쪼개 한 장만 외톨이로 남김
  }
  return broken;
}

/**
 * @param {object} p
 * @param {Array} p.hand  AI 손패
 * @param {object|null} p.table  바닥 조합 (null이면 선)
 * @param {number} p.maxN
 * @param {string|null} p.mustId  첫 수 필수 타일
 * @param {'easy'|'normal'|'hard'} p.difficulty
 * @param {number[]} p.oppCounts  다른 플레이어 남은 타일 수
 * @returns {Array|null} 낼 타일 배열, 패스면 null
 */
export function chooseMove({ hand, table, maxN, mustId = null, difficulty = 'normal', oppCounts = [], rnd = Math.random }) {
  const plays = legalPlays(hand, table, maxN, mustId);
  if (!plays.length) return null;
  const leading = !table;

  // 한 번에 다 털 수 있으면 무조건 낸다
  const finisher = plays.find((p) => p.tiles.length === hand.length);
  if (finisher) return finisher.tiles;

  if (difficulty === 'easy') {
    if (!leading && rnd() < 0.3) return null;
    // 무작위지만 너무 센 패는 조금 덜 고르게
    const weighted = plays.map((p) => ({ p, w: 1 / (1 + cost(p, maxN)) }));
    let r = rnd() * weighted.reduce((s, x) => s + x.w, 0);
    for (const x of weighted) if ((r -= x.w) <= 0) return x.p.tiles;
    return plays[0].tiles;
  }

  const minOpp = oppCounts.length ? Math.min(...oppCounts) : 13;
  const danger = difficulty === 'hard' && minOpp <= 2;

  const score = (p) => {
    let s = cost(p, maxN) + breaksGroups(p, hand) * 0.8;
    if (leading) s -= p.tiles.length * 0.9; // 선일 때는 여러 장을 한 번에 털기
    if (danger) {
      s -= p.combo.key / 10000; // 위험할 때는 센 패로 막기
      if (leading && p.tiles.length === minOpp) s += 2; // 상대가 낼 수 있는 장수는 피하기
    }
    return s;
  };

  const sorted = plays.slice().sort((a, b) => score(a) - score(b));
  const best = sorted[0];

  if (difficulty === 'hard' && !leading && !danger) {
    // 2나 아주 센 패를 아직 많이 남은 상황에서 쓰지 않기
    const usesTwo = best.tiles.some((t) => t.n === 2);
    const strong = best.tiles.every((t) => valueOf(t, maxN) >= (maxN - 2) * 4);
    if ((usesTwo || strong) && hand.length > 4 && minOpp > 4) return null;
  }
  if (difficulty === 'normal' && !leading && best.tiles.some((t) => t.n === 2) && hand.length > 6 && rnd() < 0.5) return null;

  return best.tiles;
}

/** 힌트: 사람에게 추천할 가장 약한 조합 */
export function hintMove(hand, table, maxN, mustId) {
  const plays = legalPlays(hand, table, maxN, mustId);
  if (!plays.length) return null;
  plays.sort((a, b) => cost(a, maxN) - cost(b, maxN) - (table ? 0 : (b.tiles.length - a.tiles.length) * 0.4));
  return plays[0].tiles;
}
