// 개발용 서버: 정적 파일 + POST /api 에서 server/Code.gs를 앱스크립트처럼 실행
// 실행: node tools/dev-server.mjs  →  http://localhost:5173/?api=/api
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5173);

// ---- 앱스크립트 서비스 흉내 ----
const store = new Map();
const CacheService = {
  getScriptCache: () => ({
    get: (k) => {
      const v = store.get(k);
      if (!v) return null;
      if (v.exp < Date.now()) return store.delete(k), null;
      return v.val;
    },
    getAll(keys) {
      const o = {};
      for (const k of keys) {
        const v = this.get(k);
        if (v != null) o[k] = v;
      }
      return o;
    },
    put: (k, val, sec = 600) => store.set(k, { val, exp: Date.now() + sec * 1000 }),
    remove: (k) => store.delete(k),
  }),
};
const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
const ContentService = {
  MimeType: { JSON: 'json' },
  createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
};
const Utilities = { getUuid: () => randomUUID() };

// Code.gs가 다시 빌드되면 자동으로 새로 불러옴 (방 상태는 그대로 유지)
let ctx = null;
let loadedAt = 0;
function server() {
  const file = join(root, 'server/Code.gs');
  const m = statSync(file).mtimeMs;
  if (!ctx || m !== loadedAt) {
    const next = vm.createContext({ CacheService, LockService, ContentService, Utilities, Math, Date, JSON, console });
    try {
      vm.runInContext(readFileSync(file, 'utf8'), next, { filename: 'Code.gs' });
      ctx = next;
      loadedAt = m;
      console.log('Code.gs 불러옴');
    } catch (err) {
      console.error('Code.gs 오류:', err.message);
      if (!ctx) throw err;
    }
  }
  return ctx;
}

const TYPES = { '.gs': 'text/plain', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain' };

http
  .createServer((req, res) => {
    if (req.method === 'POST' && req.url.startsWith('/api')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        // 실제 앱스크립트처럼 약간의 지연
        setTimeout(() => {
          const out = server().doPost({ postData: { contents: body } });
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(out.text);
        }, 120);
      });
      return;
    }
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(root, p);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': (TYPES[extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  })
  .listen(PORT, () => console.log(`dev server: http://localhost:${PORT}/?api=/api`));
