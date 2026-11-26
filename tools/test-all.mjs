// 모든 테스트 한 번에: node tools/test-all.mjs
// 1) Code.gs 다시 빌드  2) 게임별 규칙 자가 테스트  3) tests/*.test.mjs 서버 흐름 테스트
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
execFileSync(process.execPath, [join(root, 'tools/build-gs.mjs')], { stdio: 'inherit' });

const quiet = console.table;
console.table = () => {};
for (const g of readdirSync(join(root, 'games'))) {
  const f = join(root, 'games', g, 'js/rules.js');
  if (!existsSync(f)) continue;
  const m = await import(pathToFileURL(f).href);
  if (!m.runSelfTests) continue;
  const r = m.runSelfTests(false);
  const ok = r.passed === r.total;
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} 규칙 ${g}: ${r.passed}/${r.total}`);
  if (!ok) (r.results || []).filter((x) => !x.pass).forEach((x) => console.log('   ✗', x.name));
}
console.table = quiet;

for (const t of readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.mjs'))) {
  try {
    const out = execFileSync(process.execPath, [join(root, 'tests', t)], { encoding: 'utf8' });
    console.log(`✅ ${t}: ${out.trim().split('\n').pop()}`);
  } catch (err) {
    failed++;
    console.log(`❌ ${t}\n${(err.stdout || '') + (err.stderr || '')}`);
  }
}
console.log(failed ? `\n실패 ${failed}개` : '\n모두 통과!');
process.exit(failed ? 1 : 0);
