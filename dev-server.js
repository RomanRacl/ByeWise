// Lokální spuštění bez Vercelu: `npm run dev` → http://localhost:3000
// Obslouží statické soubory z /public, endpointy z /api a adresy aplikace (/produkt/…, /kategorie/…) stejně jako Vercel.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

// Volitelně načte .env.local (FIREBASE_*, ADMIN_PASSWORD, CRON_SECRET…).
try {
  const env = await readFile('.env.local', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
} catch {}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8',
};
const PORT = process.env.PORT || 3000;
// Stejné bezpečnostní hlavičky jako na Vercelu (vercel.json), ať se CSP a spol. projeví už při vývoji.
const VERCEL = JSON.parse(await readFile('vercel.json', 'utf8'));
const HEADERS = Object.fromEntries((VERCEL.headers.find((h) => h.source === '/(.*)')?.headers || []).map((h) => [h.key, h.value]));
// Na http://localhost nemá smysl HSTS ani přesměrování na https.
delete HEADERS['Strict-Transport-Security'];
if (HEADERS['Content-Security-Policy']) HEADERS['Content-Security-Policy'] = HEADERS['Content-Security-Policy'].replace(/;\s*upgrade-insecure-requests/, '');
const SPA = /^\/(kategorie|produkt|porovnat|oblibene|portfolio|stav|admin|prani|kalendar|pozor|rozpocet|hledat)(\/|$)/;
const API = { '/sitemap.xml': 'sitemap' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
  const apiName = API[url.pathname] || (url.pathname.startsWith('/api/') ? url.pathname.slice(5).replace(/[^a-z0-9]/g, '') : null);
  if (apiName) {
    try {
      const mod = await import(`./api/${apiName}.js`);
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4.5 * 1024 * 1024) return res.writeHead(413).end(); // stejný limit jako Vercel
      }
      // Jako Vercel: JSON se rozparsuje jen s Content-Type application/json.
      req.body = /application\/json/i.test(req.headers['content-type'] || '') ? (body ? JSON.parse(body) : {}) : body;
      req.query = Object.fromEntries(url.searchParams);
      res.status = (c) => ((res.statusCode = c), res);
      res.json = (o) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(o));
        return res;
      };
      res.send = (s) => (res.end(s), res);
      return await mod.default(req, res);
    } catch (e) {
      console.error(e);
      res.statusCode = e instanceof SyntaxError ? 400 : 500;
      return res.end(JSON.stringify({ error: e instanceof SyntaxError ? 'Neplatný JSON' : 'Chyba serveru' }));
    }
  }
  let path = SPA.test(url.pathname) ? 'public/index.html' : normalize(join('public', decodeURIComponent(url.pathname)));
  if (!path.startsWith('public')) return res.writeHead(403).end();
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end('Nenalezeno');
  }
}).listen(PORT, () => console.log(`BuyWise běží na http://localhost:${PORT}`));
