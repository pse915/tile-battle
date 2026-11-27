// 학교 게임 모음 — 직접 운영하는 서버 (Coolify 등 Docker)
// 앱스크립트용 server/Code.gs를 그대로 node에서 돌림 (CacheService·LockService 흉내)
// 실행: node server/node-server.mjs   (PORT 기본 8080, DATA_DIR 기본 ./data)
//   GET  /        → 상태 확인 (게임 목록)
//   GET  /health  → ok
//   POST /        → 게임 요청 (앱스크립트 웹 앱과 같은 형식, text/plain JSON)
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || join(root, 'data');
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
mkdirSync(DATA_DIR, { recursive: true });
const SNAPSHOT = join(DATA_DIR, 'rooms.json');
const LOG = join(DATA_DIR, 'room-log.csv');

// ---- 캐시 (메모리 + 주기적 파일 저장 → 재시작해도 방 유지) ----
let store = new Map();
try {
  if (existsSync(SNAPSHOT)) store = new Map(Object.entries(JSON.parse(readFileSync(SNAPSHOT, 'utf8'))));
} catch (err) {
  console.error('방 저장 파일을 읽지 못함:', err.message);
}
let dirty = false;
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
    if (k.startsWith('room_')) dirty = true;
  },
  remove(k) {
    store.delete(k);
    dirty = true;
  },
};
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (v.exp < now) store.delete(k);
  if (!dirty) return;
  dirty = false;
  const rooms = {};
  for (const [k, v] of store) if (k.startsWith('room_')) rooms[k] = v;
  try {
    writeFileSync(SNAPSHOT + '.tmp', JSON.stringify(rooms));
    renameSync(SNAPSHOT + '.tmp', SNAPSHOT);
  } catch (err) {
    console.error('방 저장 실패:', err.message);
  }
}, 5000).unref();

// ---- 시트 대신 CSV 기록 (SpreadsheetApp 흉내) ----
const csv = (v) => `"${String(v instanceof Date ? v.toISOString() : v).replace(/"/g, '""')}"`;
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n') row.push(cell), rows.push(row), (row = []), (cell = '');
    else if (c !== '\r') cell += c;
  }
  return rows;
}
const readLog = () => (existsSync(LOG) ? parseCsv(readFileSync(LOG, 'utf8')) : []);
const sheet = {
  getLastRow: () => readLog().length,
  // getRange(행, 열, 행 수, 열 수).getValues() — 1부터 셈
  getRange: (r, c, n, m) => ({ getValues: () => readLog().slice(r - 1, r - 1 + n).map((x) => x.slice(c - 1, c - 1 + m)) }),
  appendRow: (row) => appendFileSync(LOG, row.map(csv).join(',') + '\n'),
};
const SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }),
  openById: () => SpreadsheetApp.getActiveSpreadsheet(),
};

const ctx = vm.createContext({
  CacheService: { getScriptCache: () => cache },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }, // node는 한 줄로 처리되어 잠금 불필요
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => randomUUID() },
  SpreadsheetApp,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  ROOM_CODE_ODD: true, // 집 서버 방 코드는 끝자리 홀수 (앱스크립트는 짝수)
  Math,
  Date,
  JSON,
  console,
});
vm.runInContext(readFileSync(join(root, 'server/Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      return res.end();
    }
    if (req.method === 'GET') {
      res.writeHead(200, headers);
      if (req.url.startsWith('/health')) return res.end('{"ok":true}');
      return res.end(ctx.doGet().text);
    }
    if (req.method !== 'POST') {
      res.writeHead(405, headers);
      return res.end('{"ok":false}');
    }
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 200000) req.destroy();
    });
    req.on('end', () => {
      let out;
      try {
        out = ctx.doPost({ postData: { contents: body } }).text;
      } catch (err) {
        out = JSON.stringify({ ok: false, error: String(err.message || err) });
      }
      res.writeHead(200, headers);
      res.end(out);
    });
  })
  .listen(PORT, () => console.log(`학교 게임 서버: http://localhost:${PORT}  (데이터: ${DATA_DIR})`));
