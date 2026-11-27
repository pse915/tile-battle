// 온라인 대기방 서버 주소 — 게임마다 서버를 나눠 씀
//  · gas: 구글 앱스크립트 (흑백 뒤집기, 비밀번호 해독반)
//  · coolify: 집 서버 server/node-server.mjs (나머지 모든 게임)
// 방 코드 끝자리로 서버를 구분: Coolify 방은 홀수, 앱스크립트 방은 짝수 (코드만 넣어도 맞는 서버로 감)
export const SERVERS = {
  gas: 'https://script.google.com/macros/s/AKfycbydwV7YAkVpkI1nnMneIX_YVsYtEcyHIBTxZ8bmyvag2qOFUPhfjrlQtUqNCUYl1alhWw/exec',
  coolify: 'https://games-api.diple.dpdns.org/',
};
export const GAME_SERVER = {
  // 앱스크립트: 흑백 뒤집기, 비밀번호 해독반 (2~4명 차례 게임, 가벼움)
  'flip-duel': 'gas',
  'code-breaker': 'gas',
  // 나머지는 모두 집 서버(Coolify)
};
export const serverFor = (game) => SERVERS[GAME_SERVER[game] || 'coolify'];
export const serverForCode = (code) => SERVERS[Number(String(code).slice(-1)) % 2 ? 'coolify' : 'gas'];
// 게임 이름 없이 오는 요청(예전 타일 배틀 클라이언트)의 기본 서버
export const ONLINE_URL = SERVERS.coolify;
