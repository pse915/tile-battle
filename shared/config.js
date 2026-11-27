// 온라인 대기방 서버 주소 — 게임마다 서버를 나눠 씀
//  · gas: 구글 앱스크립트 (차례대로 하는 게임, 집 서버 부담 줄이기)
//  · coolify: 집 서버 server/node-server.mjs (반응 속도가 중요한 게임, 서라벌학교여행)
// 방 코드 끝자리로 서버를 구분: Coolify 방은 홀수, 앱스크립트 방은 짝수 (코드만 넣어도 맞는 서버로 감)
export const SERVERS = {
  gas: 'https://script.google.com/macros/s/AKfycbydwV7YAkVpkI1nnMneIX_YVsYtEcyHIBTxZ8bmyvag2qOFUPhfjrlQtUqNCUYl1alhWw/exec',
  coolify: 'https://games-api.diple.dpdns.org/',
};
export const GAME_SERVER = {
  'lunch-five': 'coolify',
  'color-rush': 'coolify',
  'school-trip': 'coolify',
  // 나머지(타일 배틀, 심해 보물섬, 흑백 뒤집기, 비밀번호 해독반, 숫자 블록 정원)는 gas
};
export const serverFor = (game) => SERVERS[GAME_SERVER[game] || 'gas'];
export const serverForCode = (code) => SERVERS[Number(String(code).slice(-1)) % 2 ? 'coolify' : 'gas'];
// 예전 코드 호환용 (기본 서버)
export const ONLINE_URL = SERVERS.gas;
