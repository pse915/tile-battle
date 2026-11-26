// 브라우저 안에서 server/Code.gs를 그대로 돌리는 '내 기기 서버'
// 봇 연습·한 기기 모드에 씀 → 인터넷이나 앱스크립트 없이도 바로 시작, 반응도 빠름
// 앱스크립트 서비스(CacheService 등)는 메모리 흉내로 대신함

let runner = null;

function makeServices() {
  const store = new Map();
  const cache = {
    get(k) {
      const v = store.get(k);
      if (!v) return null;
      if (v.exp < Date.now()) {
        store.delete(k);
        return null;
      }
      return v.val;
    },
    getAll(keys) {
      const o = {};
      for (const k of keys) {
        const v = cache.get(k);
        if (v != null) o[k] = v;
      }
      return o;
    },
    put(k, val, sec = 600) {
      store.set(k, { val, exp: Date.now() + sec * 1000 });
    },
    remove(k) {
      store.delete(k);
    },
  };
  const uuid = () =>
    crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
  return {
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
    Utilities: { getUuid: uuid },
  };
}

/** (요청 객체) → 응답 객체. 처음 한 번 Code.gs를 받아 옴 */
export async function localServer() {
  if (runner) return runner;
  const res = await fetch(new URL('../server/Code.gs', import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error('게임 파일을 불러오지 못했어요. 새로고침해 주세요.');
  const src = await res.text();
  const s = makeServices();
  // eslint-disable-next-line no-new-func
  const srv = new Function('CacheService', 'LockService', 'ContentService', 'Utilities', `${src}\n;return { handleRequest };`)(
    s.CacheService,
    s.LockService,
    s.ContentService,
    s.Utilities,
  );
  runner = (req) => {
    try {
      // 서버처럼 JSON으로 주고받아 상태가 섞이지 않게 함
      return JSON.parse(JSON.stringify(srv.handleRequest(JSON.parse(JSON.stringify(req)))));
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  };
  return runner;
}
