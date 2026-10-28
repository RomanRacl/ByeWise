// /sitemap.xml (přes rewrite ve vercel.json) – seznam stránek pro vyhledávače.
import { getDb, loadAll } from './_db.js';
import { CATEGORIES } from '../public/lib/categories.js';
import { demoProducts } from '../public/lib/seed.js';

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const base = (process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://${host}`)).replace(/\/$/, '');
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  if (q.robots) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=86400');
    const txt = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`;
    return res.status(200).send ? res.status(200).send(txt) : res.end(txt);
  }
  const db = await getDb().catch(() => null);
  const products = db ? await loadAll() : demoProducts();
  const urls = [
    { loc: `${base}/`, pri: '1.0' },
    ...['kalendar', 'pozor', 'rozpocet'].map((x) => ({ loc: `${base}/${x}`, pri: '0.7' })),
    ...CATEGORIES.map((c) => ({ loc: `${base}/kategorie/${c.id}`, pri: '0.8' })),
    ...products.filter((p) => p.rank).map((p) => ({ loc: `${base}/produkt/${encodeURIComponent(p.id)}`, pri: '0.6', mod: (p.updatedAt || '').slice(0, 10) })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u.loc.replace(/&/g, '&amp;')}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ''}<changefreq>daily</changefreq><priority>${u.pri}</priority></url>`)
    .join('\n')}\n</urlset>\n`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600');
  res.status(200).send ? res.status(200).send(xml) : res.end(xml);
}
