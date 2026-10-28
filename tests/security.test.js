// Bezpečnostní testy: simulované útoky na API (hádání hesla, CSRF, SSRF, XSS přes odkazy, podvržené soubory…).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const P = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
Object.assign(process.env, {
  FIREBASE_PROJECT_ID: 'test', FIREBASE_CLIENT_EMAIL: 'x@test', FIREBASE_PRIVATE_KEY: 'k', FIREBASE_STORAGE_BUCKET: 'b',
  ADMIN_PASSWORD: 'velmi-dlouhe-heslo-123', CRON_SECRET: 'cronsecret123456', SITE_URL: 'https://buywise.test',
  VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv',
});
let fetched = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  fetched.push(u.href);
  const body = (t, status = 200, headers = {}) => ({ ok: status < 400, status, text: async () => t, arrayBuffer: async () => new TextEncoder().encode(t).buffer, headers: { get: (k) => headers[k.toLowerCase()] ?? null } });
  if (u.hostname === 'shop.test' && u.pathname === '/redirect') return body('', 302, { location: 'http://169.254.169.254/latest/meta-data/' });
  if (u.hostname === 'shop.test' && u.pathname === '/huge') return body('x', 200, { 'content-length': String(500 * 1024 * 1024) });
  if (u.hostname === 'shop.test') return body('<SHOP><SHOPITEM><PRODUCTNAME>Apple iPhone 17 256 GB</PRODUCTNAME><PRICE_VAT>22990</PRICE_VAT><URL>javascript:alert(document.cookie)</URL></SHOPITEM></SHOP>');
  if (u.hostname === 'buywise.test') return body('<!doctype html><html><head><title>X</title>\n  <meta name="description" content="y" /></head><body></body></html>');
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
  await h({ method, headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers }, body, query, url }, res);
  return res;
};

test('bezpečnost: přihlášení administrace a relace', async () => {
  const sec = await import(`${P}/api/_security.js`);
  sec._setResolver(async (h) => (h === 'evil.test' ? ['10.0.0.5'] : h === 'v6.test' ? ['::1'] : ['93.184.216.34']));

  // Bez relace nic
  assert.equal((await call('admin', { body: { action: 'status' } })).statusCode, 401);
  // Staré posílání hesla v hlavičce už nefunguje
  assert.equal((await call('admin', { headers: { 'x-admin-password': 'velmi-dlouhe-heslo-123' }, body: { action: 'status' } })).statusCode, 401);

  // Hádání hesla: po 8 pokusech 429 a ani správné heslo už neprojde
  for (let i = 0; i < 8; i++) {
    const r = await call('admin', { headers: { 'x-forwarded-for': '198.51.100.9' }, body: { action: 'login', password: 'spatne' + i } });
    assert.ok(r.statusCode === 401 || r.statusCode === 429, String(r.statusCode));
  }
  let r = await call('admin', { headers: { 'x-forwarded-for': '198.51.100.9' }, body: { action: 'login', password: 'velmi-dlouhe-heslo-123' } });
  assert.equal(r.statusCode, 429, 'útočník je zablokovaný');
  assert.ok(+r.headers['Retry-After'] > 0);

  // Správné přihlášení z jiné IP
  r = await call('admin', { body: { action: 'login', password: 'velmi-dlouhe-heslo-123' } });
  assert.equal(r.statusCode, 200);
  const cookie = r.headers['Set-Cookie'];
  assert.match(cookie, /^bw_admin=[^;]+; Path=\/api\/admin; HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/);
  const c = cookie.split(';')[0];
  assert.ok(!c.includes('velmi-dlouhe-heslo'), 'heslo není v cookie');

  // CSRF: cookie bez hlavičky x-bw-admin neplatí
  assert.equal((await call('admin', { headers: { cookie: c }, body: { action: 'status' } })).statusCode, 401);
  r = await call('admin', { headers: { cookie: c, 'x-bw-admin': '1' }, body: { action: 'status' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.weakPassword, false);

  // Podvržený nebo upravený token
  const [b, sig] = c.slice('bw_admin='.length).split('.');
  const forged = Buffer.from(JSON.stringify({ who: 'hacker', exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal((await call('admin', { headers: { cookie: `bw_admin=${forged}.${sig}`, 'x-bw-admin': '1' }, body: { action: 'status' } })).statusCode, 401);
  assert.equal((await call('admin', { headers: { cookie: `bw_admin=${b}.x${sig.slice(1)}`, 'x-bw-admin': '1' }, body: { action: 'status' } })).statusCode, 401);
  // Prošlá relace
  const old = sec.signSession('x', -1);
  assert.equal((await call('admin', { headers: { cookie: `bw_admin=${old}`, 'x-bw-admin': '1' }, body: { action: 'status' } })).statusCode, 401);
  // Změna hesla zneplatní všechny relace
  process.env.ADMIN_PASSWORD = 'nove-heslo-po-uniku-456';
  assert.equal((await call('admin', { headers: { cookie: c, 'x-bw-admin': '1' }, body: { action: 'status' } })).statusCode, 401);
  process.env.ADMIN_PASSWORD = 'velmi-dlouhe-heslo-123';
  // Odhlášení smaže cookie
  r = await call('admin', { headers: { cookie: c, 'x-bw-admin': '1' }, body: { action: 'logout' } });
  assert.match(r.headers['Set-Cookie'], /Max-Age=0/);

  // Formulář z cizího webu (urlencoded / text) odmítnut
  assert.equal((await call('admin', { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: { action: 'login', password: 'x' } })).statusCode, 415);
  assert.equal((await call('user', { headers: { 'content-type': 'text/plain' }, body: '{"action":"pushAlert"}' })).statusCode, 415);
});

test('bezpečnost: SSRF, XSS přes odkazy, podvržené soubory, vstupy', async () => {
  const sec = await import(`${P}/api/_security.js`);
  let r = await call('admin', { body: { action: 'login', password: 'velmi-dlouhe-heslo-123' } });
  const H = { cookie: r.headers['Set-Cookie'].split(';')[0], 'x-bw-admin': '1' };
  const admin = (body) => call('admin', { headers: H, body });

  // SSRF: vnitřní adresy, metadata cloudu, přesměrování dovnitř, DNS na privátní IP, jiné protokoly, porty
  for (const url of ['http://127.0.0.1/admin', 'http://169.254.169.254/latest/meta-data/', 'http://localhost:3000/', 'https://evil.test/feed.xml', 'https://v6.test/', 'file:///etc/passwd', 'ftp://shop.test/x', 'https://shop.test:22/', 'https://user:pw@shop.test/', 'http://[::1]/', 'http://10.1.2.3/']) {
    fetched = [];
    r = await admin({ action: 'testFeed', category: 'elektro', url });
    assert.equal(r.statusCode, 400, `${url} → ${r.statusCode} ${JSON.stringify(r.body)}`);
    assert.equal(fetched.length, 0, `${url} se nesmí stáhnout`);
  }
  r = await admin({ action: 'testFeed', category: 'elektro', url: 'https://shop.test/redirect' });
  assert.equal(r.statusCode, 400, 'přesměrování do vnitřní sítě zastaveno');
  assert.ok(!fetched.some((u) => u.includes('169.254')));
  r = await admin({ action: 'testFeed', category: 'elektro', url: 'https://shop.test/huge' });
  assert.match(r.body.error, /moc velký/);

  // XSS: odkazy javascript: se neuloží (produkt, prodejce, sponzor, affiliate šablona, feed)
  r = await admin({ action: 'save', product: { name: 'Test', category: 'elektro', link: 'javascript:alert(1)', image: 'data:text/html,<script>', competitors: [{ name: 'Zlý', price: 10, url: 'JaVaScRiPt:alert(1)' }] } });
  assert.equal(r.body.product.link, '');
  assert.equal(r.body.product.image, '');
  assert.equal(r.body.product.competitors[0].url, '');
  r = await admin({ action: 'setSettings', settings: { sponsor: { text: 'x', url: 'javascript:alert(1)' }, affiliates: [{ domain: 'alza.cz', template: 'javascript:alert("{url}")' }, { domain: 'ok.cz', template: 'https://p.cz/?u={url_enc}' }], feeds: [{ category: 'elektro', competitor: 'X', url: 'javascript:1' }, { category: 'neexistuje', competitor: 'X', url: 'https://a.cz' }], backgrounds: { auta: [{ url: 'javascript:1' }], '../x': [{ url: 'https://a.cz/a.jpg' }] } } });
  assert.equal(r.body.settings.sponsor.url, '');
  assert.deepEqual(r.body.settings.affiliates.map((a) => a.domain), ['ok.cz']);
  assert.equal(r.body.settings.feeds.length, 0);
  assert.deepEqual(r.body.settings.backgrounds, {});

  // Neplatná ID (pokus o cestu v databázi)
  assert.equal((await admin({ action: 'save', product: { id: '../meta/settings', name: 'x', category: 'elektro' } })).statusCode, 400);
  assert.equal((await admin({ action: 'delete', id: 'users/abc' })).statusCode, 400);
  assert.equal((await admin({ action: 'restore', products: [{ id: 'a/b', category: 'elektro', name: 'x' }] })).statusCode, 400);
  assert.equal((await call('data', { method: 'GET', query: { id: '../../users/u1' } })).statusCode, 404);
  assert.equal((await call('v1', { method: 'GET', query: { id: 'x/y' } })).statusCode, 404);

  // Podvržený obrázek (HTML/SVG s typem image/png)
  r = await admin({ action: 'uploadPhoto', dataUrl: 'data:image/png;base64,' + Buffer.from('<html><script>alert(1)</script>').toString('base64') });
  assert.equal(r.statusCode, 400);
  r = await admin({ action: 'uploadPhoto', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' });
  assert.equal(r.statusCode, 400);

  // Feed: odkaz javascript: z cizího feedu se zahodí
  const { parseFeed } = await import(`${P}/public/lib/dataops.js`);
  assert.equal(parseFeed('<SHOP><SHOPITEM><PRODUCTNAME>A</PRODUCTNAME><PRICE_VAT>1</PRICE_VAT><URL>javascript:alert(1)</URL></SHOPITEM></SHOP>')[0].url, '');

  // Uživatelské API: zahlcení push hlídači z jedné IP, neplatné vstupy
  let last;
  for (let i = 0; i < 22; i++) last = await call('user', { headers: { 'x-forwarded-for': '192.0.2.50' }, body: { action: 'deleteAlertToken', id: 'abc', token: 'x' } });
  assert.equal(last.statusCode, 429);
  assert.equal((await call('user', { headers: { authorization: 'Bearer tok-u9-a@b.cz' }, body: { action: 'addAlert', productId: '../x', type: 'below', value: 10, channels: ['email'] } })).statusCode, 400);
  r = await call('user', { headers: { authorization: 'Bearer tok-u9-a@b.cz' }, body: { action: 'saveFavorites', favorites: ['ok-id', '<script>', 'a/b', 123] } });
  assert.deepEqual(r.body.favorites, ['ok-id']);

  // Cron: špatný nebo krátký klíč
  assert.equal((await call('cron', { headers: { authorization: 'Bearer cronsecret12345' } })).statusCode, 401);
  assert.equal((await call('cron', { headers: { authorization: 'Bearer cronsecret1234567' } })).statusCode, 401);

  // Chyby serveru neprozrazují podrobnosti
  const res = mkRes();
  sec.publicError(res, new Error('FIREBASE_PRIVATE_KEY je špatný na řádku 3'), 'test');
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes('FIREBASE'));

  // SEO stránka nebere kostru z podvržené hlavičky Host
  fetched = [];
  await call('page', { method: 'GET', headers: { host: 'attacker.example', 'x-forwarded-host': 'attacker.example' }, url: '/produkt/x' });
  assert.ok(fetched.every((u) => u.startsWith('https://buywise.test/')), fetched.join());
});

test('bezpečnost: pomocné funkce', async () => {
  const sec = await import(`${P}/api/_security.js`);
  assert.equal(sec.cleanUrl('javascript:alert(1)'), '');
  assert.equal(sec.cleanUrl(' https://a.cz/x?y=1 '), 'https://a.cz/x?y=1');
  assert.equal(sec.cleanUrl('data:image/png;base64,AAAA'), '');
  assert.equal(sec.cleanUrl('data:image/png;base64,AAAA', { allowData: true }), 'data:image/png;base64,AAAA');
  assert.equal(sec.validId('elektro-apple-iphone-17'), true);
  for (const bad of ['', '-x', 'A', 'a/b', 'a..b/c', 'a'.repeat(121), null]) assert.equal(sec.validId(bad), false, String(bad));
  assert.equal(sec.safeEqual('abc', 'abc'), true);
  assert.equal(sec.safeEqual('abc', 'abd'), false);
  assert.equal(sec.safeEqual('abc', 'abcd'), false);
  assert.equal(sec.imageKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sec.imageKind(Buffer.from('RIFF0000WEBPxxxx')), 'image/webp');
  assert.equal(sec.imageKind(Buffer.from('<svg>')), null);
});

test('diagnostika nastavení: vysvětlí chybu, ale neprozradí tajné hodnoty', async () => {
  const db = await import(`${P}/api/_db.js`);
  const saved = { ...process.env };
  process.env.FIREBASE_PRIVATE_KEY = '"-----BEGIN PRIVATE KEY-----\\nTAJNE-TAJNE';
  process.env.ADMIN_PASSWORD = 'kratke';
  process.env.CRON_SECRET = 'abc';
  const c = db.checkConfig();
  assert.match(c.FIREBASE_PRIVATE_KEY, /chybí konec/);
  assert.match(c.ADMIN_PASSWORD, /slabé/);
  assert.match(c.CRON_SECRET, /moc krátký/);
  const all = JSON.stringify(c);
  for (const secret of ['TAJNE-TAJNE', 'kratke', 'abc"']) assert.ok(!all.includes(secret), 'neobsahuje ' + secret);
  assert.match(db.explainFirebaseError(new Error('Failed to parse private key: Error: error:1E08010C:DECODER routines::unsupported')), /FIREBASE_SERVICE_ACCOUNT/);
  assert.match(db.explainFirebaseError(new Error('5 NOT_FOUND: The database (default) does not exist for project x')), /není vytvořená databáze/);
  assert.match(db.explainFirebaseError(new Error('invalid_grant: Invalid JWT Signature.')), /nepřijal přihlašovací údaje/);
  Object.assign(process.env, saved);
});

test('přihlašovací údaje Firebase: celý JSON klíče i opravy poškozeného klíče', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const db = await import(`${P}/api/_db.js`);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const saved = { ...process.env };
  const json = JSON.stringify({ type: 'service_account', project_id: 'buywise-x', client_email: 'firebase-adminsdk-a@buywise-x.iam.gserviceaccount.com', private_key: privateKey }, null, 2);
  // 1) Celý JSON soubor v jedné proměnné (i base64)
  for (const v of [json, Buffer.from(json).toString('base64')]) {
    delete process.env.FIREBASE_PROJECT_ID; delete process.env.FIREBASE_CLIENT_EMAIL; delete process.env.FIREBASE_PRIVATE_KEY;
    process.env.FIREBASE_SERVICE_ACCOUNT = v;
    assert.equal(db.hasFirebase(), true);
    assert.equal(db.projectId(), 'buywise-x');
    assert.equal(db.checkConfig().FIREBASE_SERVICE_ACCOUNT, 'ok');
  }
  process.env.FIREBASE_SERVICE_ACCOUNT = '{ "project_id": "x", ';
  assert.match(db.checkConfig().FIREBASE_SERVICE_ACCOUNT, /není platný JSON/);
  // 2) Samostatné proměnné s poškozeným klíčem – opraví se, useknutý se pozná
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  Object.assign(process.env, { FIREBASE_PROJECT_ID: 'buywise-x', FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-a@buywise-x.iam.gserviceaccount.com' });
  const escaped = JSON.stringify(privateKey).slice(1, -1);
  for (const v of [escaped, `"${escaped}",`, privateKey.replace(/\n/g, ' '), privateKey.replace(/\n/g, '\r\n')]) {
    process.env.FIREBASE_PRIVATE_KEY = v;
    assert.equal(db.checkConfig().FIREBASE_PRIVATE_KEY, 'ok', 'opravitelná varianta');
  }
  process.env.FIREBASE_PRIVATE_KEY = escaped.slice(0, 1200) + '\\n-----END PRIVATE KEY-----\\n';
  assert.match(db.checkConfig().FIREBASE_PRIVATE_KEY, /moc krátký|poškozený/);
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});
