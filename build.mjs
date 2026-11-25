// scenarios/*.txt と src/pages から src/assets.js を生成する。
// 台本はここで検証し、エラーがあればビルドを失敗させる（＝デプロイされない）。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('./src/engine.cjs');
const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const files = readdirSync(new URL('./scenarios/', import.meta.url)).filter((f) => f.endsWith('.txt')).sort();
const scenarios = [];
let failed = false;
for (const f of files) {
  const id = f.replace(/\.txt$/, '');
  if (!/^_?[a-z0-9-]{1,40}$/.test(id)) { console.error(`✗ ${f}: ファイル名は半角英小文字・数字・ハイフンにしてください（例 01-mystery.txt）`); failed = true; continue; }
  const text = r(`./scenarios/${f}`);
  const sc = E.parse(text);
  let errs;
  if (sc.errors.length) errs = sc.errors.map((e) => `${e.line}行目：${e.msg}`);
  else {
    const R = E.validate(sc, { limit: 5000000 });
    errs = R.errors.map((e) => `${e.msg}（例：${e.path.join(' → ')}）`);
    if (R.aborted) errs.push('全ルートの検証が最後まで終わりませんでした（分岐や履歴の参照が多すぎます）。ネロに相談してください');
  }
  if (errs.length) { console.error(`✗ ${f}\n  ` + errs.join('\n  ')); failed = true; continue; }
  if (sc.rules.S !== 7 || sc.rules.F !== 7) console.warn(`△ ${f}: 規定回数が SPARK ${sc.rules.S} / FATE ${sc.rules.F} です（基本は7：7）`);
  scenarios.push({ id, staffOnly: id.startsWith('_'), title: sc.meta.title, genre: sc.meta.genre || '', credit: sc.meta.credit || '', text });
  console.log(`✓ ${f}  ${sc.meta.title}（結末 ${sc.endings.length} 種：${sc.endings.map((e, i) => `No.${i + 1} ${e}`).join('、')}）`);
}
if (failed) { console.error('台本にエラーがあるため、ビルドを中止しました。'); process.exit(1); }
if (!scenarios.length) { console.error('scenarios/ に台本がありません。'); process.exit(1); }

const engine = r('./src/engine.cjs').replace(/<\/script/gi, '<\\/script');
const app = r('./src/pages/app.html').replace('/*__ENGINE__*/', () => engine);
const out = `// 自動生成（node build.mjs）。直接編集しないでください
export const APP_HTML = ${JSON.stringify(app)};
export const LOGIN_HTML = ${JSON.stringify(r('./src/pages/login.html'))};
export const CLOSED_HTML = ${JSON.stringify(r('./src/pages/closed.html'))};
export const SCENARIOS = ${JSON.stringify(scenarios)};
`;
writeFileSync(new URL('./src/assets.js', import.meta.url), out);
console.log(`assets.js を生成しました（台本 ${scenarios.length} 本）`);
