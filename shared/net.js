// 앱스크립트 웹 앱과 주고받기
import { ONLINE_URL } from './config.js';

/** 테스트용: ?api=주소 로 서버를 바꿀 수 있음 (탭을 닫으면 원래대로) */
export function apiUrl() {
  const q = new URLSearchParams(location.search).get('api');
  if (q) {
    try {
      sessionStorage.setItem('games:api', q);
    } catch {
      /* 무시 */
    }
    return q;
  }
  try {
    return sessionStorage.getItem('games:api') || ONLINE_URL;
  } catch {
    return ONLINE_URL;
  }
}

export const onlineReady = () => !!apiUrl();

/**
 * 서버 호출. text/plain으로 보내야 앱스크립트에서 CORS 사전 요청이 생기지 않음.
 * 실패하면 Error(사용자에게 보여줄 한국어 메시지)를 던짐.
 */
export async function api(action, payload = {}) {
  let res;
  try {
    res = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
      redirect: 'follow',
    });
  } catch {
    throw Object.assign(new Error('서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.'), { network: true });
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw Object.assign(new Error('서버 응답을 읽을 수 없어요. 서버 주소 설정을 확인해 주세요.'), { network: true });
  }
  if (!data.ok) throw Object.assign(new Error(data.error || '알 수 없는 오류예요.'), { data });
  return data;
}
