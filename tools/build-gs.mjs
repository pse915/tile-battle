// js/rules.js + js/ai.js + server/room.js → server/Code.gs (앱스크립트에 붙여 넣을 한 파일)
// 실행: node tools/build-gs.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const strip = (src) =>
  src
    .replace(/^import[^;]+;\s*$/gm, '')
    .replace(/^export\s+(?=(const|function|class|let)\b)/gm, '')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');

const parts = [
  ['js/rules.js', '규칙 (js/rules.js와 같은 코드)'],
  ['js/ai.js', 'AI (js/ai.js와 같은 코드)'],
  ['server/room.js', '대기방 서버'],
];

let out = `// ⚠️ 자동 생성 파일입니다. 직접 고치지 말고 tools/build-gs.mjs를 다시 실행하세요.
// 시험 끝! 타일 배틀 — 온라인 대기방 서버 (Google Apps Script)
// 설정 방법은 README.md의 '온라인 대기방 설정'을 보세요.
`;
for (const [file, title] of parts) {
  out += `\n// ==================== ${title} ====================\n`;
  out += strip(readFileSync(join(root, file), 'utf8'));
}
writeFileSync(join(root, 'server/Code.gs'), out);
console.log('server/Code.gs 생성 완료 (' + out.length + '자)');
