// Veřejné API: GET /api/v1                      – seznam odvětví
//              GET /api/v1?category=elektro     – žebříček odvětví se souhrnnými statistikami
//              GET /api/v1?id=elektro-apple-…   – produkt s historií cen
// Pokud je nastavená proměnná API_KEYS (čárkami oddělené klíče), vyžaduje hlavičku x-api-key nebo ?key=.
import { getDb, loadAll, getProduct } from './_db.js';
import { demoProducts } from '../public/lib/seed.js';
import { CATEGORIES, categoryById } from '../public/lib/categories.js';
import { summarize } from '../public/lib/analytics.js';

let demoCache = null;

function stats(p) {
  const s = summarize(p);
  return {
    id: p.id,
    rank: p.rank,
    name: p.name,
    subtitle: p.subtitle,
    unit: p.unit,
    demand: p.demand,
    price: s.price,
    priceDate: s.priceDate,
    change7d: s.ch7,
    change30d: s.ch30,
    trend: s.trend.dir,
    forecast30d: s.forecast ? { price: s.forecast.endPrice, changePct: s.forecast.changePct, low: s.forecast.lo, high: s.forecast.hi } : null,
    sample: !!p.sample,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-api-key');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const keys = String(process.env.API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (keys.length && !keys.includes(String(req.headers['x-api-key'] || q.key || ''))) {
    return res.status(401).json({ error: 'Chybí nebo je neplatný API klíč (hlavička x-api-key)' });
  }
  try {
    const db = await getDb();
    const all = db ? await loadAll() : (demoCache ||= demoProducts());
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    if (q.id) {
      const p = db ? await getProduct(q.id) : all.find((x) => x.id === q.id);
      if (!p) return res.status(404).json({ error: 'Produkt nenalezen' });
      return res.json({ ...stats(p), category: p.category, history: p.prices, competitors: (p.competitors || []).map((c) => ({ name: c.name, history: c.prices })) });
    }
    if (q.category) {
      const c = categoryById(q.category);
      if (!c) return res.status(404).json({ error: 'Neznámé odvětví' });
      const items = all.filter((p) => p.category === c.id && p.rank).sort((a, b) => a.rank - b.rank).map(stats);
      return res.json({ category: c.id, name: c.name, source: c.sourceNote, items });
    }
    return res.json({
      demo: !db,
      categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, nameEn: c.en, group: c.group, source: c.source, url: `/api/v1?category=${c.id}` })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
