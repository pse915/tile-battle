// 공용 대기방(server/core.js) + 오프라인 테이블 엔진 + 게임별 규칙과 모듈 → server/Code.gs (앱스크립트에 붙여 넣을 한 파일)
// 실행: node tools/build-gs.mjs
//
// 브라우저용 ES 모듈(rules.js, ai.js …)은 이름이 겹치지 않도록 이름공간으로 감쌈:
//   const TileRules = (() => { …원래 코드…; return { 내보낸 이름들 }; })();
// import { a } from './rules.js' 는 const { a } = TileRules; 로 바뀜
// 같은 Code.gs를 브라우저도 불러 씀 (shared/local-server.js: 봇 연습·한 기기 모드)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 게임을 추가할 때: 브라우저 모듈은 LIBS에, 서버 모듈은 MODULES에 한 줄씩
const LIBS = [
  { file: 'games/tile-battle/js/rules.js', ns: 'TileRules' },
  { file: 'games/tile-battle/js/ai.js', ns: 'TileAI' },
  { file: 'games/deep-sea/js/rules.js', ns: 'DSRules' },
  { file: 'games/deep-sea/js/bot.js', ns: 'DSBot' },
  { file: 'games/flip-duel/js/rules.js', ns: 'FDRules' },
  { file: 'games/color-rush/js/rules.js', ns: 'CRRules' },
  { file: 'games/code-breaker/js/rules.js', ns: 'CBRules' },
  { file: 'games/number-garden/js/rules.js', ns: 'NGRules' },
  { file: 'games/lunch-five/js/rules.js', ns: 'LFRules' },
];
const MODULES = [
  'server/games/tile-battle.js',
  'server/games/deep-sea.js',
  'server/games/flip-duel.js',
  'server/games/color-rush.js',
  'server/games/code-breaker.js',
  'server/games/number-garden.js',
  'server/games/lunch-five.js',
];

function wrap({ file, ns }) {
  const src = readFileSync(join(root, file), 'utf8');
  const dir = dirname(file);
  const exported = [...src.matchAll(/^export\s+(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const body = src
    .replace(/^import\s*\{([^}]+)\}\s*from\s*'([^']+)';?\s*$/gm, (_, names, from) => {
      const target = LIBS.find((l) => l.file === join(dir, from).split('\\').join('/'));
      if (!target) throw new Error(`${file}: ${from} 을(를) LIBS에서 찾을 수 없어요`);
      return `const {${names}} = ${target.ns};`;
    })
    .replace(/^export\s+(?=(const|let|function|class)\b)/gm, '');
  return `const ${ns} = (() => {\n${body}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

let out = `// ⚠️ 자동 생성 파일입니다. 직접 고치지 말고 tools/build-gs.mjs를 다시 실행하세요.
// 학교 게임 모음 — 공용 온라인 대기방 서버 (Google Apps Script)
// 포함된 게임: ${MODULES.filter((m) => existsSync(join(root, m))).map((m) => basename(m, '.js')).join(', ')}
// 설정 방법은 README.md의 '온라인 대기방 설정'을 보세요.
`;
for (const f of ['server/core.js', 'server/offline-table.js']) out += `\n// ==================== ${f} ====================\n` + readFileSync(join(root, f), 'utf8');
const missing = [...LIBS.map((l) => l.file), ...MODULES].filter((f) => !existsSync(join(root, f)));
if (missing.length) console.warn('⚠️ 아직 없는 파일은 건너뜀:', missing.join(', '));
const has = (f) => !missing.includes(f);
for (const lib of LIBS.filter((l) => has(l.file))) out += `\n// ==================== ${lib.ns} (${lib.file}) ====================\n` + wrap(lib);
for (const m of MODULES.filter(has)) out += `\n// ==================== ${m} ====================\n` + readFileSync(join(root, m), 'utf8');

writeFileSync(join(root, 'server/Code.gs'), out);
console.log('server/Code.gs 생성 완료 (' + out.length + '자)');
