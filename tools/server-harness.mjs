// 테스트용: server/Code.gs를 node vm에서 앱스크립트처럼 돌리는 도우미
//   import { createServer } from './server-harness.mjs';
//   const srv = createServer();            // 새 메모리 서버
//   const s = srv.req('create', { game: 'flip-duel', name: '가' });
//   srv.req('poll', { code: s.code, pid: s.me, since: -1 });
//   srv.ctx                                  // vm 컨텍스트 (FDRules 등 이름공간 꺼내기: srv.ns('FDRules'))
//   srv.advance(ms)                          // 시계를 앞으로 (봇 생각 시간 건너뛰기)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function createServer() {
  let offset = 0;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) {
      super(...(a.length ? a : [RealDate.now() + offset]));
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  const store = new Map();
  const cache = {
    get(k) {
      const v = store.get(k);
      if (!v) return null;
      if (v.exp < FakeDate.now()) return store.delete(k), null;
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
    put: (k, val, sec = 600) => {
      if (val.length > 100000) throw new Error('CacheService 값이 100KB를 넘음: ' + k + ' ' + val.length);
      store.set(k, { val, exp: FakeDate.now() + sec * 1000 });
    },
    remove: (k) => store.delete(k),
  };
  const ctx = vm.createContext({
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
    Utilities: { getUuid: () => randomUUID() },
    Math,
    Date: FakeDate,
    JSON,
    console,
  });
  vm.runInContext(readFileSync(join(root, 'server/Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  const req = (action, payload = {}) => {
    const out = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, ...payload }) } }).text);
    return out;
  };
  /** 실패하면 예외 */
  const must = (action, payload = {}) => {
    const r = req(action, payload);
    if (!r.ok) throw new Error(action + ' 실패: ' + r.error);
    return r;
  };
  return {
    ctx,
    req,
    must,
    ns: (name) => vm.runInContext(name, ctx),
    advance: (ms) => (offset += ms),
    /** 방에 저장된 원본 상태 (숨김 정보 포함 — 테스트에서만) */
    raw: (code) => JSON.parse(cache.get('room_' + code)),
  };
}
