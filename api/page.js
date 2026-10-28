// SEO: /kategorie/:id, /produkt/:id a stránky nástrojů (/prani, /kalendar, /pozor, /rozpocet) vrací index.html s vyplněným titulkem, popisem a OG značkami
// (pro Google a náhledy při sdílení v Messengeru, WhatsAppu…). Aplikaci pak vykreslí prohlížeč.
import { getDb, getProduct } from './_db.js';
import { categoryById } from '../public/lib/categories.js';
import { demoProducts } from '../public/lib/seed.js';
import { summarize } from '../public/lib/analytics.js';
import { cleanUrl } from './_security.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Number(n).toLocaleString('cs-CZ', { maximumFractionDigits: n < 100 ? 2 : 0 });
let shell = null;
let demoCache = null;

export default async function handler(req, res) {
  // Kostru stránky bere z vlastní adresy (SITE_URL nebo adresa nasazení na Vercelu), nikdy z hlavičky Host
  // požadavku – podvržená hlavička by jinak mohla podstrčit cizí HTML do mezipaměti.
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(host || ''));
  const origin = (process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : local ? `${proto}://${host}` : '')).replace(/\/$/, '');
  if (!origin) {
    res.statusCode = 302;
    res.setHeader('Location', '/');
    return res.end();
  }
  const q = req.query || Object.fromEntries(new URL(req.url, origin).searchParams);
  const path = String(q.path || new URL(req.url, origin).pathname).replace(/[^\w\-/.%]/g, '').slice(0, 200);
  try {
    if (!shell) {
      const r = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(8000) });
      const html = r.ok ? await r.text() : '';
      if (!/<title>[\s\S]*?<\/title>/.test(html)) throw new Error('shell');
      shell = html;
    }
  } catch {
    res.statusCode = 302;
    res.setHeader('Location', '/');
    return res.end();
  }

  let title = 'BuyWise – Kupuj chytře. Víš, kdy cena klesne.';
  let desc = 'Deset nejžádanějších produktů v každém odvětví, skóre Kup teď / Počkej, vývoj cen, odhad na příští měsíc a srovnání prodejců.';
  let image = '';
  const PAGES = {
    '/prani': ['Seznam přání – BuyWise', 'Přidej si, co chceš koupit, a BuyWise ohlídá nejlepší okamžik i cílovou cenu.'],
    '/kalendar': ['Nákupní kalendář – kdy je co nejlevněji | BuyWise', 'Kdy v roce nakoupit nejlevněji: sezónnost cen podle odvětví a známé slevové akce v Česku.'],
    '/pozor': ['Pozor na tyto akce – falešné slevy | BuyWise', 'Slevy, které nejsou tak výhodné, jak vypadají: zdražení těsně před akcí a nejnižší cena za 30 dní.'],
    '/rozpocet': ['Rozpočtový poradce – co a kdy koupit | BuyWise', 'Zadej rozpočet a odvětví a zjisti, co se vejde a kdy to koupit nejlevněji.'],
  };
  if (PAGES[path]) [title, desc] = PAGES[path];
  const m = path.match(/^\/(kategorie|produkt)\/([^/]+)/);
  try {
    if (m && m[1] === 'kategorie') {
      const c = categoryById(decodeURIComponent(m[2]));
      if (c) {
        title = `${c.name}: 10 nejžádanějších a vývoj cen – BuyWise`;
        desc = c.sourceNote;
      }
    } else if (m) {
      const id = decodeURIComponent(m[2]);
      const db = await getDb();
      const p = db ? await getProduct(id) : (demoCache ||= demoProducts()).find((x) => x.id === id);
      if (p) {
        const s = summarize(p);
        const c = categoryById(p.category);
        title = `${p.name}${s.price ? ` za ${fmt(s.price)} ${p.unit || 'Kč'}` : ''} – vývoj ceny | BuyWise`;
        const parts = [];
        if (p.rank && c) parts.push(`${p.rank}. nejžádanější v odvětví ${c.name}.`);
        if (s.trend?.label) parts.push(`Cena: ${s.trend.label.toLowerCase()}.`);
        if (s.ch30 != null) parts.push(`Za 30 dní ${s.ch30 > 0 ? '+' : ''}${s.ch30.toFixed(1).replace('.', ',')} %.`);
        if (s.forecast) parts.push(`Odhad za měsíc ${fmt(s.forecast.endPrice)} ${p.unit || 'Kč'}.`);
        desc = parts.join(' ') || desc;
        image = cleanUrl(p.image) || '';
      }
    }
  } catch {}

  const url = `${origin}${path}`;
  const head = `<title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${esc(url)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="BuyWise" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:image" content="${esc(image || `${origin}/og.jpg`)}" />
  <meta property="og:locale" content="cs_CZ" />
  <meta name="twitter:card" content="summary_large_image" />`;
  const html = shell.replace(/<title>[\s\S]*?<\/title>\s*<meta name="description"[^>]*>/, head);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
  res.statusCode = 200;
  res.end(html);
}
