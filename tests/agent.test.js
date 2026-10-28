// AI cenový agent: kontrola výsledků (proti vymyšleným cenám) a celý běh s falešným Claude API a Firestore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const P = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
Object.assign(process.env, {
  FIREBASE_PROJECT_ID: 'test', FIREBASE_CLIENT_EMAIL: 'x@test', FIREBASE_PRIVATE_KEY: 'k', FIREBASE_STORAGE_BUCKET: 'b',
  ADMIN_PASSWORD: 'tajne-heslo', CRON_SECRET: 'cronsecret123456', SITE_URL: 'https://buywise.test',
});

const A = await import(`${P}/api/_agent.js`);

// Odpověď Claude API: výsledky hledání (alza.cz, datart.cz) + JSON s cenami.
const searchBlock = { type: 'web_search_tool_result', tool_use_id: 's1', content: [
  { type: 'web_search_result', url: 'https://www.alza.cz/iphone-17-pro', title: 'iPhone 17 Pro', encrypted_content: 'x' },
  { type: 'web_search_result', url: 'https://www.datart.cz/galaxy-a16', title: 'Galaxy A16', encrypted_content: 'x' },
] };
let answer = [];
let calls = [];
let pauseOnce = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.hostname === 'api.anthropic.com') {
    const body = JSON.parse(opts.body);
    calls.push({ headers: opts.headers, body });
    if (pauseOnce) {
      pauseOnce = false;
      return json({ stop_reason: 'pause_turn', content: [searchBlock], usage: { input_tokens: 10000, output_tokens: 100, server_tool_use: { web_search_requests: 2 } } });
    }
    return json({ stop_reason: 'end_turn', content: [searchBlock, { type: 'text', text: 'Here are the prices:\n```json\n' + JSON.stringify(answer) + '\n```' }], usage: { input_tokens: 20000, output_tokens: 1000, server_tool_use: { web_search_requests: 3 } } });
  }
  if (u.hostname === 'discord.test' || u.hostname === 'api.resend.com') return json({});
  throw new Error('neočekávaný fetch ' + url);
};

test('agent: výběr JSON z odpovědi', () => {
  assert.deepEqual(A.extractJson([{ type: 'text', text: 'Úvod\n```json\n[{"id":"a","price":1}]\n```' }]), [{ id: 'a', price: 1 }]);
  assert.deepEqual(A.extractJson([{ type: 'text', text: 'Výsledek: [{"id":"b","price":2}] hotovo' }]), [{ id: 'b', price: 2 }]);
  assert.equal(A.extractJson([{ type: 'text', text: 'Nic jsem nenašel.' }]), null);
});

test('agent: kontrola výsledků proti halucinacím', () => {
  const products = [
    { id: 'x-a', name: 'A', category: 'mobily', prices: [{ d: '2026-10-01', p: 1000 }] },
    { id: 'x-b', name: 'B', category: 'mobily', prices: [{ d: '2026-10-01', p: 1000 }] },
    { id: 'x-c', name: 'C', category: 'mobily', prices: [{ d: '2026-10-01', p: 1000 }], sample: true },
    { id: 'x-d', name: 'D', category: 'mobily', prices: [] },
  ];
  const seen = new Set(['https://www.alza.cz/a', 'https://datart.cz/b']);
  const v = A.validateResults([
    { id: 'x-a', price: '1 049,90', source_url: 'https://alza.cz/a', shops: [{ name: 'Alza', price: 1049.9, url: 'https://www.alza.cz/a' }, { name: 'Podvod', price: 10, url: 'https://www.alza.cz/x' }, { name: 'Jinde', price: 1000, url: 'https://neznamy.cz/x' }] },
    { id: 'x-b', price: 1600, source_url: 'https://datart.cz/b' }, // +60 % → ke schválení
    { id: 'x-c', price: 1500, source_url: 'https://datart.cz/b' }, // ukázková cena: tolerance 60 %
    { id: 'x-d', price: 500, source_url: 'https://vymyslene.cz/d' }, // zdroj nebyl ve výsledcích
    { id: 'hacker', price: 1, source_url: 'https://alza.cz/a' },
    { id: 'x-a', price: 2, source_url: 'https://alza.cz/a' }, // duplicita
    { id: 'x-d', price: -5, source_url: 'https://alza.cz/a' },
    { id: 'x-d', price: 5, source_url: 'javascript:alert(1)' },
  ], products, { seen, maxJump: 35 });
  assert.deepEqual(v.accepted.map((x) => x.id), ['x-a', 'x-c']);
  assert.equal(v.accepted[0].price, 1049.9);
  assert.deepEqual(v.accepted[0].shops.map((s) => s.name), ['Alza'], 'nesmyslná cena a neověřený obchod vyřazeny');
  assert.deepEqual(v.review.map((x) => [x.id, x.jump]), [['x-b', 60]]);
  const why = v.rejected.map((x) => x.why).join('|');
  assert.match(why, /nebyl ve výsledcích/);
  assert.match(why, /neznámé ID/);
  assert.match(why, /neplatná cena/);
  assert.match(why, /chybí odkaz/);
});

test('agent: zápis ceny – ukázková historie pryč, zdroj s odkazem', () => {
  const p = { id: 'x', name: 'X', sample: true, prices: [{ d: '2025-01-01', p: 9 }, { d: '2025-02-01', p: 10 }], competitors: [{ name: 'Fake', prices: [{ d: '2025-01-01', p: 9 }] }] };
  const out = A.applyResult(p, { price: 12, url: 'https://alza.cz/x', sourceName: 'alza.cz', asOf: '2026-10-27', shops: [{ name: 'Alza', price: 12, url: 'https://alza.cz/x' }] });
  assert.equal(out.sample, false);
  assert.equal(out.prices.length, 1);
  assert.equal(out.prices[0].p, 12);
  assert.deepEqual(out.competitors.map((c) => c.name), ['Alza']);
  assert.equal(out.source, 'Dohledáno na webu (AI): alza.cz, 27. 10. 2026');
  assert.equal(out.sourceUrl, 'https://alza.cz/x');
  // Skutečná historie zůstává
  const again = A.applyResult(out, { price: 13, url: 'https://alza.cz/x', sourceName: 'alza.cz', asOf: '', shops: [] });
  assert.equal(again.prices.at(-1).p, 13);
  assert.equal(again.competitors.length, 1);
});

test('agent: odhad nákladů', () => {
  const c = A.estimateCost({ input_tokens: 1e6, output_tokens: 1e5, server_tool_use: { web_search_requests: 10 } });
  assert.equal(Math.round(c * 100) / 100, 3 + 1.5 + 0.1);
  assert.ok(A.AGENT_CATEGORIES.includes('mobily') && !A.AGENT_CATEGORIES.includes('krypto') && !A.AGENT_CATEGORIES.includes('hry'));
});

const mkRes = () => {
  const r = { statusCode: 200, headers: {}, body: null };
  r.setHeader = (k, v) => (r.headers[k] = v);
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (o) => ((r.body = o), r);
  r.send = (s) => ((r.body = s), r);
  r.end = (s) => ((r.body = s ?? r.body), r);
  return r;
};
const call = async (mod, { method = 'POST', headers = {}, body = {} } = {}) => {
  const h = (await import(`${P}/api/${mod}.js`)).default;
  const res = mkRes();
  if (method === 'POST') headers = { 'content-type': 'application/json', ...headers };
  await h({ method, headers, body, query: {}, url: '/' }, res);
  return res;
};

test('agent: administrace, schvalování, denní běh a rozpočet', { timeout: 60000 }, async () => {
  const login = await call('admin', { body: { action: 'login', password: 'tajne-heslo' } });
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  const admin = (body) => call('admin', { headers: { cookie, 'x-bw-admin': '1' }, body });
  assert.ok((await admin({ action: 'seed' })).body.added > 50);
  const { STORE } = await import(`${P}/tests/fakes/firebase-admin/store.js`);
  const prod = (id) => STORE.get(`products/${id}`);

  // Bez klíče: srozumitelná chyba
  let r = await admin({ action: 'agentRun', category: 'mobily' });
  assert.equal(r.statusCode, 400);
  assert.match(r.body.error, /TAVILY_API_KEY/);
  r = await admin({ action: 'agentStatus' });
  assert.equal(r.body.configured, false);

  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  answer = [
    { id: 'mobily-apple-iphone-17-pro', price: 32490, source_url: 'https://www.alza.cz/iphone-17-pro', source_name: 'Alza.cz', as_of: '2026-10-28', shops: [{ name: 'Alza', price: 32490, url: 'https://www.alza.cz/iphone-17-pro' }, { name: 'Datart', price: 32990, url: 'https://www.datart.cz/galaxy-a16' }] },
    { id: 'mobily-samsung-galaxy-a16', price: 12000, source_url: 'https://www.datart.cz/galaxy-a16', source_name: 'Datart' }, // 4290 → 12000: ke schválení
    { id: 'mobily-google-pixel-10', price: 19990, source_url: 'https://www.vymysleny-obchod.cz/pixel' }, // neověřený zdroj
    { id: 'krypto-bitcoin', price: 1, source_url: 'https://www.alza.cz/iphone-17-pro' }, // cizí odvětví
  ];
  pauseOnce = true;
  r = await admin({ action: 'agentRun', category: 'mobily' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(calls.length, 2, 'pause_turn → pokračování');
  assert.equal(calls[0].headers['x-api-key'], 'sk-ant-test');
  assert.equal(calls[0].body.tools[0].type, 'web_search_20250305');
  assert.equal(calls[0].body.tools[0].user_location.country, 'CZ');
  assert.match(calls[0].body.messages[0].content, /mobily-apple-iphone-17-pro/);
  assert.equal(calls[1].body.messages.length, 2, 'pokračování nese přerušenou odpověď');
  assert.equal(r.body.result.updated, 1);
  assert.equal(r.body.result.review, 1);
  const ip = prod('mobily-apple-iphone-17-pro');
  assert.equal(ip.sample, false);
  assert.equal(ip.prices.at(-1).p, 32490);
  assert.equal(ip.prices.length, 1, 'ukázková historie nahrazena');
  assert.equal(ip.sourceUrl, 'https://www.alza.cz/iphone-17-pro');
  assert.match(ip.source, /Dohledáno na webu \(AI\): Alza\.cz, 28\. 10\. 2026/);
  assert.deepEqual(ip.competitors.map((c) => [c.name, c.prices.at(-1).p]), [['Alza', 32490], ['Datart', 32990]]);
  assert.equal(prod('mobily-google-pixel-10').sample, true, 'neověřená cena se neuložila');
  assert.equal(prod('mobily-samsung-galaxy-a16').prices.at(-1).p !== 12000, true);

  // Fronta ke schválení
  r = await admin({ action: 'agentStatus' });
  assert.equal(r.body.configured, true);
  assert.equal(r.body.review.length, 1);
  assert.equal(r.body.review[0].old, prod('mobily-samsung-galaxy-a16').prices.at(-1).p);
  assert.ok(r.body.state.costUsd > 0 && r.body.state.searches === 5);
  r = await admin({ action: 'agentApprove', ids: ['mobily-samsung-galaxy-a16', '../hack'] });
  assert.equal(r.body.applied, 1);
  assert.equal(prod('mobily-samsung-galaxy-a16').prices.at(-1).p, 12000);
  assert.equal((await admin({ action: 'agentStatus' })).body.review.length, 0);

  // Oficiální zdroje agent nepřepisuje
  r = await admin({ action: 'agentRun', category: 'krypto' });
  assert.equal(r.statusCode, 502);
  assert.match(r.body.error, /oficiálního zdroje/);

  // Ruční uložení ceny smaže údaj o AI zdroji
  const saved = await admin({ action: 'save', product: { id: 'mobily-apple-iphone-17-pro', category: 'mobily', name: 'Apple iPhone 17 Pro', price: 31990 } });
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body));
  assert.equal(prod('mobily-apple-iphone-17-pro').sourceUrl, '');

  // Nastavení agenta se uloží a nepřepíše ho běžné nastavení
  r = await admin({ action: 'setSettings', settings: { agent: { enabled: true, schedule: 'rotate', perDay: 2, budgetUsd: 1, maxJump: 500, searchLimit: 'x' } } });
  assert.deepEqual(r.body.settings.agent, { enabled: true, schedule: 'rotate', searchLimit: 900, perDay: 2, budgetUsd: 1, maxJump: 90 });

  // Denní cron: střídá odvětví od posledního místa
  assert.equal((await call('agent', { method: 'GET', headers: {} })).statusCode, 401);
  calls = [];
  answer = [];
  const before = STORE.get('meta/agent').cursor || 0;
  r = await call('agent', { method: 'GET', headers: { authorization: 'Bearer cronsecret123456' } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.done.length, 2);
  assert.deepEqual(r.body.done.map((d) => d.category), [A.AGENT_CATEGORIES[before % A.AGENT_CATEGORIES.length], A.AGENT_CATEGORIES[(before + 1) % A.AGENT_CATEGORIES.length]]);
  assert.equal(STORE.get('meta/agent').cursor, (before + 2) % A.AGENT_CATEGORIES.length);

  // Rozpočet vyčerpán → stop
  STORE.set('meta/agent', { ...STORE.get('meta/agent'), costUsd: 5 });
  r = await admin({ action: 'agentRun', category: 'sport' });
  assert.equal(r.statusCode, 402);
  assert.match(r.body.error, /rozpočet/);
  r = await call('agent', { method: 'GET', headers: { authorization: 'Bearer cronsecret123456' } });
  assert.equal(r.body.done.length, 0);
  assert.match(r.body.errors[0], /rozpočet/);
});

test('měsíční souhrn cen přes administraci', { timeout: 30000 }, async () => {
  const login = await call('admin', { body: { action: 'login', password: 'tajne-heslo' } });
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  const admin = (body) => call('admin', { headers: { cookie, 'x-bw-admin': '1' }, body });
  const { STORE } = await import(`${P}/tests/fakes/firebase-admin/store.js`);
  let r = await admin({ action: 'listAll' });
  assert.ok(r.body.products.length > 100 && r.body.products[0].prices.length <= 1);
  const rank = STORE.get('products/pojisteni-povinne-ruceni')?.rank;
  r = await admin({ action: 'importPrices', rows: [
    { id: 'pojisteni-povinne-ruceni', price: 4321, source: 'Srovnávač', url: 'https://www.srovnavac.cz/pr', date: '2026-11-01', shops: [{ name: 'Kooperativa', price: 4500, url: 'javascript:x' }] },
    { id: '../hack', price: 1 },
    { id: 'nic-takoveho', price: 5 },
    { id: 'auta-skoda-octavia', price: -1 },
  ] });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.updated, 1);
  assert.deepEqual(r.body.unknown, ['nic-takoveho']);
  const p = STORE.get('products/pojisteni-povinne-ruceni');
  assert.equal(p.prices.at(-1).p, 4321);
  assert.equal(p.rank, rank);
  assert.equal(p.sourceUrl, 'https://www.srovnavac.cz/pr');
  assert.equal(p.competitors.at(-1).url, '');
  assert.equal((await admin({ action: 'importPrices', rows: [] })).statusCode, 400);
});

test('bezplatný bot: Tavily + Gemini, cena musí být v textu, běh 1. den v měsíci', { timeout: 30000 }, async () => {
  const { STORE } = await import(`${P}/tests/fakes/firebase-admin/store.js`);
  const prod = (id) => STORE.get(`products/${id}`);
  process.env.TAVILY_API_KEY = 'tvly-test';
  process.env.GEMINI_API_KEY = 'gem-test';
  assert.equal(A.provider(), 'free', 'bezplatná varianta má přednost');
  assert.match(A.providerLabel(), /Tavily \+ Gemini/);
  // Čísla v textu
  assert.ok(A.priceInText(32490, 'Cena: 32 490 Kč s DPH'));
  assert.ok(A.priceInText(1049.9, 'jen 1.049,90 Kč'));
  assert.ok(A.priceInText(25290, '25290,-'));
  assert.ok(!A.priceInText(32490, 'Cena 33 990 Kč, model 2026'));

  const searched = [];
  let geminiCalls = 0;
  let gemini429 = true;
  const fetchImpl = async (url, opts = {}) => {
    const json = (o, status = 200, headers = {}) => ({ ok: status < 400, status, json: async () => o, headers: { get: (k) => headers[k.toLowerCase()] ?? null } });
    if (url === A.TAVILY_URL) {
      const b = JSON.parse(opts.body);
      assert.equal(opts.headers.authorization, 'Bearer tvly-test');
      assert.equal(b.country, 'czech republic');
      searched.push(b.query);
      if (b.query.startsWith('Ferrari')) return json({ detail: { error: 'boom' } }, 500);
      const slugq = b.query.split(' ')[0].toLowerCase();
      return json({ results: [
        { url: `https://www.shop.cz/${slugq}`, title: b.query, content: `${b.query} – skladem za 12 345 Kč, dříve 13 990 Kč` },
        { url: `https://www.jiny.cz/${slugq}`, title: b.query, content: `Nabídka 12 990 Kč` },
      ] });
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      geminiCalls++;
      assert.equal(opts.headers['x-goog-api-key'], 'gem-test');
      const body = JSON.parse(opts.body);
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      if (gemini429) {
        gemini429 = false;
        return json({ error: { message: 'quota' } }, 429, { 'retry-after': '0.01' });
      }
      const ids = [...body.contents[0].parts[0].text.matchAll(/### id: (\S+)/g)].map((m) => m[1]);
      const prices = ids.map((id, i) => {
        const q = searched.find(() => true);
        return i === 0
          ? { id, price: 12345, source_url: `https://www.shop.cz/${prod(id).name.split(' ')[0].toLowerCase()}/`, source_name: 'Shop.cz', shops: [{ name: 'Jiný', price: 12990, url: `https://www.jiny.cz/${prod(id).name.split(' ')[0].toLowerCase()}` }, { name: 'Vymyšlený', price: 12000, url: `https://www.jiny.cz/${prod(id).name.split(' ')[0].toLowerCase()}` }] }
          : i === 1
          ? { id, price: 11111, source_url: `https://www.shop.cz/${prod(id).name.split(' ')[0].toLowerCase()}`, source_name: 'Shop.cz' } // číslo v textu není
          : { id, price: 12345, source_url: 'https://www.nenalezeno.cz/x' };
      });
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ prices }) }] } }] });
    }
    throw new Error('neočekávaný fetch ' + url);
  };
  // Nábytek: 1. produkt uložen (adresa s lomítkem na konci se toleruje), 2. zamítnut (cena není v textu), 3. zamítnut (zdroj nenalezen)
  STORE.set('meta/agent', { month: new Date().toISOString().slice(0, 7), searches: 0, monthDone: [], monthTries: {}, log: [] });
  STORE.set('meta/settings', { ...(STORE.get('meta/settings') || {}), agent: { enabled: true, schedule: 'monthly', searchLimit: 900, maxJump: 35 } });
  const r = await A.runAgentCategory('nabytek', { who: 'test', fetchImpl });
  assert.equal(geminiCalls, 2, '429 → počkat a znovu');
  // Ukázková cena 2 490 → nalezeno 12 345: velký skok čeká na schválení (i to je správně)
  assert.equal(r.updated, 0);
  assert.equal(r.review, 1);
  assert.equal(r.searches, 10);
  assert.equal(r.cost, 0);
  const first = r.reviewList[0];
  assert.equal(first.price, 12345);
  assert.deepEqual(first.shops.map((c) => c.name), ['Jiný'], 'prodejce s cenou mimo text vyřazen');
  assert.ok(r.rejectedList.some((x) => /není v textu/.test(x.why)));
  assert.ok(r.rejectedList.some((x) => /nebyl ve výsledcích/.test(x.why)));
  assert.deepEqual(STORE.get('meta/agent').monthDone, ['nabytek']);

  // Měsíční plán: 28. den nic, 1. den pokračuje se zbylými odvětvími
  let d = await A.runAgentDaily({ fetchImpl, now: () => Date.parse('2026-10-28T05:00:00Z') });
  assert.match(d.skipped, /1\. den/);
  let t = Date.parse('2026-10-01T04:00:00Z');
  d = await A.runAgentDaily({ fetchImpl, now: () => (t += 1000), timeBudgetMs: 250000 });
  assert.equal(d.done.length + d.errors.length, A.AGENT_CATEGORIES.length - 1, 'všechna zbylá odvětví');
  assert.ok(!d.done.some((x) => x.category === 'nabytek'), 'hotové odvětví se neopakuje');
  d = await A.runAgentDaily({ fetchImpl, now: () => Date.parse('2026-10-02T04:00:00Z') });
  assert.match(d.skipped || '', /už dohledané/);
  // Limit hledání
  STORE.set('meta/agent', { ...STORE.get('meta/agent'), monthDone: [], searches: 900 });
  d = await A.runAgentDaily({ fetchImpl, now: () => Date.parse('2026-10-01T04:00:00Z') });
  assert.equal(d.done.length, 0);
  assert.match(d.errors[0], /limit hledání/);
});

test('bot: týdenní plán (1., 8., 15., 22. den) a období', async () => {
  const at = (d) => Date.parse(`2026-11-${String(d).padStart(2, '0')}T06:00:00Z`);
  assert.deepEqual(A.period('weekly', at(1)), { key: '2026-11/1', open: true, start: 1 });
  assert.equal(A.period('weekly', at(5)).open, true);
  assert.equal(A.period('weekly', at(6)).open, false);
  assert.equal(A.period('weekly', at(8)).key, '2026-11/2');
  assert.equal(A.period('weekly', at(22)).key, '2026-11/4');
  assert.equal(A.period('weekly', at(30)).key, '2026-11/4');
  assert.equal(A.period('weekly', at(30)).open, false);
  assert.deepEqual(A.period('monthly', at(7)), { key: '2026-11', open: true, start: 1 });
  assert.equal(A.period('monthly', at(8)).open, false);
  assert.equal(A.agentSettings({ agent: { schedule: 'weekly' } }).schedule, 'weekly');
  assert.equal(A.agentSettings({ agent: { schedule: 'hack' } }).schedule, 'monthly');
  // Rozpočet: 4 týdny × všechna odvětví se vejdou do bezplatných 1 000 hledání
  const { seedProducts } = await import(`${P}/public/lib/seed.js`);
  const n = seedProducts().filter((p) => A.AGENT_CATEGORIES.includes(p.category) && !A.OFFICIAL_IDS.has(p.id)).length;
  assert.ok(n * 4 <= 900, `${n} produktů × 4 = ${n * 4}`);
  console.log('hledání za běh:', n, '| za měsíc týdně:', n * 4);
});

test('bot: OpenRouter jako bezplatné AI', async () => {
  const saved = { g: process.env.GEMINI_API_KEY };
  delete process.env.GEMINI_API_KEY;
  process.env.TAVILY_API_KEY = 'tvly-test';
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  assert.equal(A.provider(), 'free');
  assert.match(A.providerLabel(), /Tavily \+ OpenRouter \(google\/gemma-4-31b-it:free\)/);
  let body;
  const fetchImpl = async (url, opts) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(opts.headers.authorization, 'Bearer sk-or-test');
    body = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Tady:\n```json\n{"prices":[{"id":"a","price":5}]}\n```' } }] }), headers: { get: () => null } };
  };
  const out = await A.callFreeLLM('test', { fetchImpl });
  assert.equal(body.models.length, 3, 'záložní bezplatné modely');
  assert.ok(body.models.every((m) => m.endsWith(':free')));
  assert.deepEqual(A.parseFreeAnswer(out), [{ id: 'a', price: 5 }]);
  const err = await A.callFreeLLM('x', { fetchImpl: async () => ({ ok: false, status: 402, json: async () => ({ error: { message: 'Insufficient credits' } }), headers: { get: () => null } }) }).catch((e) => e);
  assert.match(err.message, /OpenRouter: účet má záporný zůstatek/);
  delete process.env.OPENROUTER_API_KEY;
  process.env.GEMINI_API_KEY = saved.g;
});
