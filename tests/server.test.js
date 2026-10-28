// Integrační test serveru: falešný Firestore (tests/fakes) a falešná externí API (Steam, Yahoo, CoinGecko, ČNB, Resend…).
// Spouští se přes `npm test` (loader tests/fake-loader.mjs).
import { test } from "node:test";
// Integrační test serveru s falešným Firestore a falešnými externími API.
import assert from 'node:assert/strict';
const P = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
Object.assign(process.env, {
  FIREBASE_PROJECT_ID: 'test', FIREBASE_CLIENT_EMAIL: 'x@test', FIREBASE_PRIVATE_KEY: 'k', FIREBASE_STORAGE_BUCKET: 'b',
  FIREBASE_WEB_API_KEY: 'web', ADMIN_PASSWORD: 'tajne-heslo', ADMIN_EMAILS: 'boss@firma.cz', CRON_SECRET: 'cronsecret123456',
  RESEND_API_KEY: 're_x', MAIL_FROM: 'BuyWise <noreply@x.cz>', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv',
  DISCORD_WEBHOOK_URL: 'https://discord.test/hook', SITE_URL: 'https://buywise.test',
});
const DAY = 86400000;
const emails = [];
const discord = [];
let yahooFail = new Set();
const days = (n) => Array.from({ length: n }, (_, i) => Math.floor((Date.now() - (n - 1 - i) * DAY) / 1000));
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o), headers: new Map() });
  const text = (t) => ({ ok: true, status: 200, text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, headers: { get: () => null } });
  if (u.hostname === 'www.cnb.cz') return text('28.10.2026 #209\nzemě|měna|množství|kód|kurz\nEMU|euro|1|EUR|24,350\nUSA|dolar|1|USD|21,100\n');
  if (u.hostname.endsWith('finance.yahoo.com')) {
    const sym = decodeURIComponent(u.pathname.split('/').pop());
    if (yahooFail.has(sym)) return json({}, 500);
    const ts = days(400);
    const base = sym.length * 10;
    const cur = sym.endsWith('.PR') ? 'CZK' : sym.endsWith('.DE') || sym.endsWith('.AS') ? 'EUR' : 'USD';
    return json({ chart: { result: [{ meta: { currency: cur }, timestamp: ts, indicators: { quote: [{ close: ts.map((_, i) => base + i * 0.1), volume: ts.map((_, i) => (i > 380 ? 2000 + sym.charCodeAt(0) * 10 : 1000)) }] } }] } });
  }
  if (u.hostname === 'api.coingecko.com') {
    if (u.pathname.endsWith('/markets'))
      return json([
        { id: 'tether', name: 'Tether', symbol: 'usdt', current_price: 21, total_volume: 9e11, price_change_percentage_24h: 0.01 },
        ...Array.from({ length: 12 }, (_, i) => ({ id: `coin${i}`, name: `Coin ${i}`, symbol: `c${i}`, current_price: 1000 - i, total_volume: 1e11 - i * 1e9, price_change_percentage_24h: 2, image: 'https://img/c.png' })),
      ]);
    return json({ prices: days(366).map((t, i) => [t * 1000, 900 + i]) });
  }
  if (u.hostname === 'store.steampowered.com' && u.pathname.includes('featuredcategories'))
    return json({ top_sellers: { items: [
      { id: 1, type: 0, name: 'Hra A', final_price: 149900, original_price: 179900, discount_percent: 17, header_image: 'a.jpg' },
      { id: 2, type: 0, name: 'Hra B', final_price: 0, original_price: 0 },
      { id: 3, type: 1, name: 'Bundle' },
      { id: 4, type: 0, name: 'Steam Deck OLED', final_price: 1 },
    ] } });
  if (u.hostname === 'api.steampowered.com' && u.pathname.includes('GetMostPlayedGames')) return json({ response: { ranks: Array.from({ length: 15 }, (_, i) => ({ appid: 100 + i })) } });
  if (u.hostname === 'store.steampowered.com' && u.pathname.includes('appdetails')) {
    const id = u.searchParams.get('appids');
    return json({ [id]: { success: true, data: { name: `Hra ${id}`, is_free: false, price_overview: { final: 49900, initial: 49900, discount_percent: 0 }, developers: ['Studio'] } } });
  }
  if (u.hostname === 'api.steampowered.com') return json({ response: { player_count: 1234 } });
  if (u.hostname === 'api.resend.com') {
    emails.push(JSON.parse(opts.body));
    return json({ id: 'e1' });
  }
  if (u.hostname === 'discord.test') {
    discord.push(JSON.parse(opts.body));
    return json({});
  }
  if (u.hostname === 'feeds.test') return text('<SHOP><SHOPITEM><PRODUCTNAME>Apple iPhone 17 256 GB</PRODUCTNAME><PRICE_VAT>22 990</PRICE_VAT><URL>https://www.alza.cz/iphone</URL></SHOPITEM></SHOP>');
  if (u.hostname === 'buywise.local' || u.hostname === 'buywise.test') return text('<!doctype html><html><head><title>X</title>\n  <meta name="description" content="y" /></head><body></body></html>');
  throw new Error('neočekávaný fetch ' + url);
};

const mkRes = () => {
  const r = { statusCode: 200, headers: {}, body: null };
  r.setHeader = (k, v) => (r.headers[k] = v);
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (o) => ((r.body = o), r);
  r.send = (s) => ((r.body = s), r);
  r.end = (s) => ((r.body = s ?? r.body), r);
  return r;
};
const call = async (mod, { method = 'POST', headers = {}, body = {}, query = {}, url = '/' } = {}) => {
  const h = (await import(`${P}/api/${mod}.js`)).default;
  const res = mkRes();
  if (method === 'POST' && !headers['content-type']) headers = { 'content-type': 'application/json', ...headers };
  await h({ method, headers, body, query, url }, res);
  return res;
};
// Administrace: přihlášení heslem → HttpOnly cookie s relací, dál se posílá cookie + hlavička x-bw-admin.
let adminCookie = '';
const loginAdmin = async () => {
  const r = await call('admin', { body: { action: 'login', password: 'tajne-heslo' } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.match(r.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
  adminCookie = r.headers['Set-Cookie'].split(';')[0];
};
const admin = (body) => call('admin', { headers: { cookie: adminCookie, 'x-bw-admin': '1' }, body });
const sec = await import(`${P}/api/_security.js`);
// Falešné DNS: veřejné adresy pro testovací servery, privátní pro „útočníka“.
sec._setResolver(async (h) => (h === 'evil.test' ? ['10.0.0.5'] : h === 'rebind.test' ? ['127.0.0.1'] : ['93.184.216.34']));

test('server: aktualizace, administrace, hlídače, API', { timeout: 120000 }, async () => {
// 1) Cron bez klíče
assert.equal((await call('cron', { headers: {} })).statusCode, 401);

// 2) Výchozí data + první aktualizace
await loginAdmin();
let r = await admin({ action: 'seed' });
assert.ok(r.body.added > 50, 'seed ' + JSON.stringify(r.body));
yahooFail = new Set(['SB=F']);
r = await call('cron', { headers: { authorization: 'Bearer cronsecret123456' } });
assert.equal(r.statusCode, 200, JSON.stringify(r.body));
assert.ok(r.body.errors.some((e) => e.includes('SB=F')), 'chyba Yahoo zaznamenána');
assert.ok(discord.length === 1, 'admin dostal upozornění na Discord');
const { STORE, FILES } = await import(`${P}/tests/fakes/firebase-admin/store.js`);
const prod = (id) => STORE.get(`products/${id}`);
assert.equal([...STORE.keys()].filter((k) => k.startsWith('products/komodity-') && prod(k.split('/')[1]).active).length, 10);
assert.equal(prod('komodity-ropa-brent').prices.at(-1).p, Math.round((40 + 399 * 0.1) * 21.1));
const cez = prod('akcie-cez');
assert.ok(cez && Math.abs(cez.prices.at(-1).p - (60 + 39.9)) < 0.01, 'ČEZ v CZK bez přepočtu ' + cez?.prices.at(-1).p);
const sap = prod('akcie-sap');
assert.ok(sap.prices.at(-1).p > 1000, 'SAP přepočten z EUR');
assert.equal([...STORE.keys()].filter((k) => k.startsWith('products/krypto-')).length, 10);
assert.ok(!STORE.has('products/krypto-tether'), 'bez stablecoinů');
assert.equal(prod('hry-1').prices.at(-1).p, 1499);
assert.equal(prod('hry-1').discount, 17);
assert.equal(prod('hry-2').free, true);
assert.ok(!STORE.has('products/hry-3') && !STORE.has('products/hry-4'));
assert.equal([...STORE.keys()].filter((k) => k.startsWith('products/hry-') && prod(k.split('/')[1]).active).length, 10);
assert.equal(prod('hry-1').rankHistory.at(-1).r, 1);

// 3) Admin – uložení, hromadná úprava, import textu, nastavení, historie
r = await admin({ action: 'save', product: { id: 'elektro-apple-iphone-17', name: 'Apple iPhone 17', category: 'elektro', price: '23 990', rank: 1, competitors: [{ name: 'Alza', price: '23990' }] } });
assert.equal(r.body.product.prices.at(-1).p, 23990);
r = await admin({ action: 'bulkSave', category: 'elektro', items: [{ id: 'elektro-apple-iphone-17', price: 23890 }, { id: 'elektro-apple-airpods-4', price: 4790, rank: 2 }] });
assert.equal(r.body.saved, 2);
r = await admin({ action: 'importRows', category: 'knihy', source: 'text', rows: [{ rank: 1, name: 'Nová kniha', subtitle: 'Autor', price: 399 }] });
assert.equal(r.body.imported, 1);
assert.equal(prod('knihy-onyxova-boure').active, false);
r = await admin({ action: 'setSettings', settings: { inflation: { yoy: 2.4, label: 'září 2026' }, affiliates: [{ domain: 'alza.cz', template: '{url}?idp=1' }], requireApproval: true, feeds: [{ category: 'elektro', competitor: 'Alza', url: 'https://feeds.test/alza.xml', mainPrice: false }], sponsor: { text: 'Partner', url: 'https://p.cz' } } });
assert.equal(r.body.settings.requireApproval, true);
r = await admin({ action: 'testFeed', category: 'elektro', url: 'https://feeds.test/alza.xml' });
assert.equal(r.body.matched[0].price, 22990);
r = await admin({ action: 'audit' });
assert.ok(r.body.entries.length >= 4);

// 4) Hlídače: uživatel + push bez přihlášení
const bearer = { authorization: 'Bearer tok-u1-jan@email.cz' };
r = await call('user', { headers: bearer, body: { action: 'me' } });
assert.equal(r.body.user.email, 'jan@email.cz');
r = await call('user', { headers: bearer, body: { action: 'addAlert', productId: 'elektro-apple-iphone-17', type: 'below', value: 23000, channels: ['email'] } });
assert.ok(r.body.alert, JSON.stringify(r.body));
r = await call('user', { body: { action: 'pushAlert', productId: 'elektro-apple-iphone-17', type: 'drop', value: 2, basePrice: 23890, subscription: { endpoint: 'https://push.test/1', keys: { p256dh: 'a', auth: 'b' } } } });
assert.ok(r.body.token);
r = await call('user', { headers: bearer, body: { action: 'saveFavorites', favorites: ['elektro-apple-iphone-17', 'krypto-coin-0'] } });
r = await call('user', { headers: bearer, body: { action: 'savePortfolio', portfolio: [{ productId: 'krypto-coin-0', qty: 2, buyPrice: 800 }] } });
assert.equal(r.body.portfolio.length, 1);
r = await call('user', { headers: bearer, body: { action: 'setDigest', on: true } });
assert.equal(r.body.weeklyDigest, true);
// Seznam přání s cílovou cenou (e-mail po dosažení cíle při denní aktualizaci)
r = await call('user', { headers: bearer, body: { action: 'saveWishlist', wishlist: [{ id: 'elektro-apple-iphone-17', target: 23000, addedPrice: 24990 }, { id: 'sport-nike-pegasus-41' }, { bad: 1 }] } });
assert.equal(r.body.wishlist.length, 2, 'neplatná položka přání vyřazena');
assert.equal(STORE.get('users/u1').wishAlerts, true, 'příznak pro e-maily seznamu přání');
// Nahrání vlastní fotky do Storage
const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('IHDR…')]).toString('base64');
assert.equal((await admin({ action: 'uploadPhoto', dataUrl: 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64') })).statusCode, 400, 'podvržený obrázek odmítnut');
r = await admin({ action: 'uploadPhoto', dataUrl: png, name: 'Škoda Octavia' });
assert.ok(r.body.url?.startsWith('https://firebasestorage.googleapis.com/v0/b/test-bucket/o/fotky%2Fskoda-octavia-') && r.body.url.includes('token='), JSON.stringify(r.body));
assert.ok([...FILES.keys()].some((k) => k.startsWith('fotky/skoda-octavia-')), 'fotka uložena');
assert.equal((await admin({ action: 'uploadPhoto', dataUrl: 'data:text/html;base64,PGI+' })).statusCode, 400, 'jiný typ souboru odmítnut');
r = await admin({ action: 'save', product: { id: 'auta-skoda-octavia', name: 'Škoda Octavia', category: 'auta', photo: 'data:image/png;base64,AAAA' } });
assert.equal(r.body.product.photo, '', 'vložená data místo odkazu se neuloží');
assert.equal((await call('user', { body: { action: 'me' } })).statusCode, 401);

// 5) Druhý běh: feed zlevní iPhone na 22 990 → spustí hlídače; schvalování pořadí; týdenní úlohy
yahooFail = new Set(['SB=F', 'PL=F', 'ZS=F']); // změní pořadí komodit
emails.length = 0;
r = await admin({ action: 'update', weekly: true });
assert.equal(r.statusCode, 200, JSON.stringify(r.body));
const iph = prod('elektro-apple-iphone-17');
assert.equal(iph.competitors.find((c) => c.name === 'Alza').prices.at(-1).p, 22990, 'cena z feedu');
const alertMail = emails.find((e) => e.subject.startsWith('Hlídač'));
assert.ok(!alertMail, 'hlídač na hlavní cenu se nespustí z ceny prodejce');
// Hlavní cenu sníží administrátor → hlídač se spustí po uložení
r = await admin({ action: 'save', product: { id: 'elektro-apple-iphone-17', name: 'Apple iPhone 17', category: 'elektro', price: 22900 } });
assert.ok(emails.some((e) => e.subject.startsWith('Hlídač ceny: Apple iPhone 17')), 'e-mail hlídače odeslán');
assert.ok(globalThis.__PUSH__.length >= 1, 'push hlídače odeslán');
const digest = emails.find((e) => e.subject.startsWith('BuyWise týden'));
assert.ok(digest && digest.html.includes('Tvůj seznam přání') && digest.html.includes('Partner') && digest.html.includes('Zlevnilo za týden'), 'týdenní souhrn BuyWise týden');
assert.ok([...FILES.keys()].some((k) => k.startsWith('zalohy/')), 'záloha uložena');
// Automatický běh se schvalováním: změna dostupnosti dat přeskupí komodity.
yahooFail = new Set(['BZ=F']);
const brentBefore = prod('komodity-ropa-brent').rank;
r = await call('cron', { headers: { authorization: 'Bearer cronsecret123456' } });
assert.equal(r.statusCode, 200);
assert.equal(prod('komodity-ropa-brent').rank, brentBefore, 'pořadí se bez schválení nemění');
const wishMail = emails.find((e) => e.subject.includes('pod tvou cílovou cenou'));
assert.ok(wishMail && wishMail.html.includes('Apple iPhone 17'), 'e-mail: přání pod cílovou cenou');
assert.ok(STORE.get('users/u1').wishlist[0].notified?.startsWith('target:'), 'přání označeno jako oznámené');
const n1 = emails.filter((e) => e.subject.includes('pod tvou cílovou cenou')).length;
await call('cron', { headers: { authorization: 'Bearer cronsecret123456' } });
assert.equal(emails.filter((e) => e.subject.includes('pod tvou cílovou cenou')).length, n1, 'stejné upozornění se neposílá znovu');
r = await admin({ action: 'pending' });
assert.ok(r.body.pending?.proposals?.length > 0, 'změny pořadí čekají');
r = await admin({ action: 'approve' });
assert.ok(r.body.applied > 0);

// 6) Více adminů přes Google účet
assert.equal((await call('admin', { headers: { authorization: 'Bearer tok-b-boss@firma.cz' }, body: { action: 'status' } })).statusCode, 200);
assert.equal((await call('admin', { headers: { authorization: 'Bearer tok-c-cizi@x.cz' }, body: { action: 'status' } })).statusCode, 401);

// 7) Veřejná data, API, sitemap, SEO stránka
r = await call('data', { method: 'GET', query: {} });
assert.equal(r.body.mode, 'live');
assert.ok(r.body.products.every((p) => p.prices.length <= 140), 'lehká data');
assert.equal(r.body.settings.affiliates.length, 1);
r = await call('data', { method: 'GET', query: { id: 'komodity-ropa-brent' } });
assert.ok(r.body.product.prices.length > 300, 'plná historie');
r = await call('data', { method: 'GET', query: { view: 'config' } });
assert.equal(r.body.features.push, true);
r = await call('data', { method: 'GET', query: { view: 'status' } });
assert.ok(r.body.meta.sources.hry.ok);
r = await call('v1', { method: 'GET', query: { category: 'krypto' } });
assert.equal(r.body.items.length, 10);
r = await call('sitemap', { method: 'GET', headers: { host: 'buywise.test' } });
assert.ok(r.body.includes('/produkt/'));
r = await call('page', { method: 'GET', headers: { host: 'buywise.local', 'x-forwarded-proto': 'https' }, url: '/produkt/elektro-apple-iphone-17' });
assert.ok(r.body.includes('og:title') && r.body.includes('Apple iPhone 17'), r.body.slice(0, 300));

// 8) Obnova ze zálohy
r = await admin({ action: 'backup' });
const bk = r.body.backup;
r = await admin({ action: 'restore', products: bk.products, settings: bk.settings });
assert.equal(r.body.restored, bk.products.length);
});
