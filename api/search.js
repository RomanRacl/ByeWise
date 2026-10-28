// GET /api/search?q=iphone 17 – vyhledá produkt ve všech nabídkách z feedů obchodů (i mimo sledované top 10)
// a vrátí skupiny stejného produktu s cenami v jednotlivých obchodech, od nejlevnější.
// Zdroje: index z feedů (meta/offers + offers/*) a ceny prodejců u sledovaných produktů.
import { getDb, getDoc, loadAll } from './_db.js';
import { demoProducts } from '../public/lib/seed.js';
import { clean, last } from '../public/lib/analytics.js';
import { buildSearchIndex, searchOffers } from '../public/lib/dataops.js';
import { clientIp, rateLimit, tooMany, publicError } from './_security.js';

const TTL = 10 * 60 * 1000;
let cache = null; // { at, index, shops, updatedAt }

// Ceny prodejců u sledovaných produktů (poslední známá cena každého prodejce).
function trackedSources(products) {
  const byShop = new Map();
  for (const p of products) {
    if (p.active === false) continue;
    for (const c of p.competitors || []) {
      const l = last(clean(c.prices));
      if (!l || !c.name) continue;
      if (!byShop.has(c.name)) byShop.set(c.name, []);
      byShop.get(c.name).push([`${p.name}${p.subtitle ? ' ' + p.subtitle : ''}`, l.p, c.url || '', p.attrs?.ean || '']);
    }
  }
  return [...byShop.entries()].map(([shop, items]) => ({ shop, items }));
}

async function loadIndex() {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const db = await getDb().catch(() => null);
  const sources = [];
  let updatedAt = null;
  let products;
  if (db) {
    const meta = (await getDoc('meta/offers')) || { docs: [] };
    updatedAt = meta.at || null;
    const snaps = await Promise.all((meta.docs || []).map((id) => db.collection('offers').doc(id).get()));
    for (const s of snaps) {
      if (!s.exists) continue;
      const d = s.data();
      try {
        sources.push({ shop: d.shop, items: JSON.parse(d.items) });
      } catch {}
    }
    products = await loadAll();
  }
  if (!products || !products.length) products = demoProducts();
  sources.push(...trackedSources(products));
  const index = buildSearchIndex(sources);
  cache = { at: Date.now(), index, shops: new Set(sources.map((x) => x.shop)).size, updatedAt, offers: index.length };
  return cache;
}

export default async function handler(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const query = String(q.q || '').trim().slice(0, 80);
  if (query.length < 2) return res.status(400).json({ error: 'Zadej aspoň 2 znaky' });
  const lim = await rateLimit('search', clientIp(req), { limit: 90, windowSec: 60, persist: false });
  if (!lim.ok) return tooMany(res, lim.retryAfter);
  try {
    const idx = await loadIndex();
    const r = searchOffers(idx.index, query, { limit: Math.min(40, +q.limit || 20) });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.json({ q: query, ...r, shops: idx.shops, offers: idx.offers, updatedAt: idx.updatedAt });
  } catch (e) {
    return publicError(res, e, 'search');
  }
}
