// 7F7S クローズドβテスト用 Worker
// - 共通ID・パスワード（シークレット）でログイン → 署名付きCookie
// - BETA_OPEN が "true" 以外のときは「テストは終了しました」だけを表示
// - 台本はログイン後のみ配信。評価・プレイ記録は D1 に保存（名前・アカウント・IPは保存しない）
import { APP_HTML, SCENARIOS, LOGIN_HTML, CLOSED_HTML } from './assets.js';

// 「_」で始まる台本はスタッフ確認用（テスト回が staff で始まるときだけ表示）
const visibleScenarios = (env) => SCENARIOS.filter((s) => !s.staffOnly || String(env.TEST_ROUND || '').startsWith('staff'));

const COOKIE = 'fb_session';
const SESSION_DAYS = 14;
const enc = new TextEncoder();

const baseHeaders = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};
const html = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", ...extra } });
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8' } });

async function sha256Hex(s) {
  const b = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(s)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  if (x.byteLength !== y.byteLength) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}
const configured = (env) => !!(env.BETA_ID && env.BETA_PASSWORD && env.COOKIE_SECRET);
// 認証情報が変わると、それまでのCookieはすべて無効になる
const credVersion = async (env) => (await sha256Hex(`${env.BETA_ID}\n${env.BETA_PASSWORD}`)).slice(0, 16);

async function makeCookie(env) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const ver = await credVersion(env);
  const sig = await hmacHex(env.COOKIE_SECRET, `${exp}.${ver}`);
  return `${COOKIE}=${exp}.${ver}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
async function isAuthed(request, env) {
  if (!configured(env)) return false;
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, ver, sig] = m[1].split('.');
  if (!exp || !ver || !sig || +exp < Date.now()) return false;
  if (!safeEqual(ver, await credVersion(env))) return false;
  return safeEqual(sig, await hmacHex(env.COOKIE_SECRET, `${exp}.${ver}`));
}

async function handleLogin(request, env) {
  if (!configured(env)) return html(LOGIN_HTML.replace('<!--MSG-->', '<p class="err">ただいま準備中です。</p>'), 503);
  if (env.LOGIN_RL) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'; // レート制限の判定にだけ使い、保存しない
    const { success } = await env.LOGIN_RL.limit({ key: `login:${ip}` });
    if (!success) return html(LOGIN_HTML.replace('<!--MSG-->', '<p class="err">試行回数が多すぎます。1分ほど待ってからもう一度お試しください。</p>'), 429);
  }
  const form = await request.formData();
  const id = String(form.get('id') || '').trim(), pw = String(form.get('pw') || '');
  const ok = safeEqual(await sha256Hex(id), await sha256Hex(env.BETA_ID)) & safeEqual(await sha256Hex(pw), await sha256Hex(env.BETA_PASSWORD));
  if (!ok) return html(LOGIN_HTML.replace('<!--MSG-->', '<p class="err">IDまたはパスワードが違います。</p>'), 401);
  return new Response(null, { status: 303, headers: { ...baseHeaders, Location: '/', 'Set-Cookie': await makeCookie(env) } });
}

// ---------- 評価・プレイ記録の検証 ----------
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const oneOf = (v, list) => (list.includes(v) ? v : null);
const GENRES = ['ミステリー・推理', 'ホラー・怪談', 'ファンタジー・魔法', '冒険・バトル', 'コメディ・ギャグ', '恋愛・ロマンス', '日常・ほのぼの', 'SF・近未来', '感動・ヒューマンドラマ', '心理戦・サスペンス', 'その他'];

function cleanFeedback(b, visible) {
  if (!b || typeof b !== 'object') return null;
  const playId = str(b.play_id, 64), playerId = str(b.player_id, 64);
  if (!playId || !/^[a-zA-Z0-9-]{8,64}$/.test(playId) || !playerId || !/^[a-zA-Z0-9-]{8,64}$/.test(playerId)) return null;
  const status = oneOf(b.status, ['completed', 'quit']);
  if (!status) return null;
  const a = b.answers && typeof b.answers === 'object' ? b.answers : {};
  const scale = (v) => int(v, 1, 5);
  const answers = {
    q1_clarity: scale(a.q1_clarity),
    q2_choice_fun: scale(a.q2_choice_fun),
    q3_dice_fun: scale(a.q3_dice_fun),
    q4_dice_reason: oneOf(a.q4_dice_reason, ['わかった', 'ときどきわからなかった', 'わからなかった']),
    q5_count: oneOf(a.q5_count, ['多い', 'ちょうどいい', '少ない']),
    q6_other_endings: scale(a.q6_other_endings),
    q7_system_fun: scale(a.q7_system_fun),
    q8_genres: Array.isArray(a.q8_genres) ? [...new Set(a.q8_genres.filter((g) => GENRES.includes(g)))] : [],
    q8_genre_other: str(a.q8_genre_other, 100) || '',
    q9_create: oneOf(a.q9_create, ['ぜひ作ってみたい', '機会があれば作ってみたい', '遊ぶ専門でいい', 'わからない']),
  };
  const sparks = Array.isArray(b.sparks) ? b.sparks.slice(0, 50).map((s) => ({
    title: str(s && s.title, 80) || '', n: int(s && s.n, 1, 99), label: str(s && s.label, 120) || '',
  })) : [];
  const fates = Array.isArray(b.fates) ? b.fates.slice(0, 50).map((f) => ({
    title: str(f && f.title, 80) || '', v: int(f && f.v, 1, 9),
    how: oneOf(f && f.how, ['通常', 'マジック', '手動']), rolls: int(f && f.rolls, 0, 999) ?? 0,
  })) : [];
  const scenarioId = str(b.scenario_id, 41);
  if (!scenarioId || !visible.some((s) => s.id === scenarioId)) return null;
  return {
    play_id: playId, player_id: playerId, status, scenario_id: scenarioId,
    scenario_title: str(b.scenario_title, 120) || '', scenario_hash: str(b.scenario_hash, 32) || '',
    ending: status === 'completed' ? str(b.ending, 120) : null,
    play_seconds: int(b.play_seconds, 0, 86400 * 7), pages: int(b.pages, 0, 100000),
    spark_used: sparks.length, fate_used: fates.length,
    sparks, fates, answers,
    comment: str(b.comment, 1000) || '',
    device: oneOf(b.device, ['mobile', 'pc']) || 'unknown',
  };
}

async function handleFeedback(request, env) {
  const len = +(request.headers.get('Content-Length') || 0);
  if (len > 64 * 1024) return json({ ok: false, error: 'too_large' }, 413);
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400); }
  const f = cleanFeedback(body, visibleScenarios(env));
  if (!f) return json({ ok: false, error: 'invalid' }, 400);
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO feedback
    (created_at, test_round, play_id, player_id, status, scenario_id, scenario_title, scenario_hash, ending, play_seconds, pages,
     spark_used, fate_used, sparks, fates, answers, comment, device)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    new Date().toISOString(), env.TEST_ROUND || 'beta', f.play_id, f.player_id, f.status, f.scenario_id, f.scenario_title, f.scenario_hash,
    f.ending, f.play_seconds, f.pages, f.spark_used, f.fate_used,
    JSON.stringify(f.sparks), JSON.stringify(f.fates), JSON.stringify(f.answers), f.comment, f.device,
  ).run();
  return json({ ok: true, duplicate: r.meta.changes === 0 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === '/favicon.ico') return new Response(null, { status: 204, headers: baseHeaders });
    if (p === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { ...baseHeaders, 'Content-Type': 'text/plain' } });
    if (env.BETA_OPEN !== 'true') {
      return p.startsWith('/api/') ? json({ ok: false, error: 'closed' }, 403) : html(CLOSED_HTML, 200);
    }
    if (p === '/login' && request.method === 'POST') return handleLogin(request, env);
    if (p === '/logout') return new Response(null, { status: 303, headers: { ...baseHeaders, Location: '/', 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` } });

    const authed = await isAuthed(request, env);
    if (p === '/' || p === '/login') {
      if (!authed) return html(LOGIN_HTML.replace('<!--MSG-->', ''));
      return html(APP_HTML.replace('__ROUND__', env.TEST_ROUND || 'beta'));
    }
    if (!authed) return p.startsWith('/api/') || p.startsWith('/scenario') ? json({ ok: false, error: 'login_required' }, 401) : Response.redirect(url.origin + '/', 303);
    if (p === '/scenarios' && request.method === 'GET') {
      return json(visibleScenarios(env).map(({ id, title, genre, credit }) => ({ id, title, genre, credit })));
    }
    if (p === '/scenario' && request.method === 'GET') {
      const s = visibleScenarios(env).find((x) => x.id === url.searchParams.get('id'));
      if (!s) return json({ ok: false, error: 'not_found' }, 404);
      return new Response(s.text, { headers: { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (p === '/api/feedback' && request.method === 'POST') {
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return json({ ok: false, error: 'bad_origin' }, 403);
      return handleFeedback(request, env);
    }
    return html('<!doctype html><meta charset="utf-8"><title>Not found</title><p>ページが見つかりません。</p>', 404);
  },
};
