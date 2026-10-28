// GET /api/data            – aktivní produkty (lehká verze: posledních 130 dní historie) + nastavení pro web
// GET /api/data?id=…       – jeden produkt s celou historií
// GET /api/data?view=config – veřejná konfigurace (přihlášení, push, funkce)
// GET /api/data?view=status – stav aktualizací pro stránku Stav
import { projectId, getDb, loadAll, getProduct, getMeta, getSettings, getDoc, hasFirebase } from './_db.js';
import { emailEnabled, pushEnabled } from './_notify.js';
import { validId, publicError } from './_security.js';
import { demoProducts, DEMO_RATES } from '../public/lib/seed.js';
import { CATEGORIES, categoryById } from '../public/lib/categories.js';
import { clean, changePct, seasonality, categorySeasonality, minMax, discountCheck } from '../public/lib/analytics.js';

let demoCache = null;
const demo = () => (demoCache ||= demoProducts());
const LIGHT_DAYS = 130;

export function lighten(p) {
  const cut = new Date(Date.now() - LIGHT_DAYS * 86400000).toISOString().slice(0, 10);
  const trim = (arr = []) => {
    const f = arr.filter((x) => x.d >= cut);
    // U řídkých dat nechá aspoň posledních 8 záznamů, aby šel spočítat trend.
    return f.length >= 8 ? f : arr.slice(-8);
  };
  const h = clean(p.prices);
  return {
    ...p,
    prices: trim(p.prices),
    competitors: (p.competitors || []).map((c) => ({ ...c, prices: trim(c.prices) })),
    stats: fullStats(p, h),
    full: false,
  };
}

// Údaje z celé historie, které lehká verze (130 dní) sama nespočítá: roční rozpětí, kontrola slev, sezónnost produktu.
export function fullStats(p, h = clean(p.prices)) {
  const r = minMax(h, 365);
  const out = { ch365: changePct(h, 365), min365: r ? r.min.p : null, max365: r ? r.max.p : null };
  if (categoryById(p.category)?.kind !== 'investicni') {
    out.discount = discountCheck(h);
    const se = seasonality(h);
    if (se) out.season = { ...se, profile: se.profile.map((v) => (v == null ? null : Math.round(v * 10) / 10)) };
  }
  return out;
}

// Sezónní profil každého odvětví z celé historie (v lehkých datech by na něj nebylo dost dní).
export function seasonsOf(products) {
  const out = {};
  for (const c of CATEGORIES) {
    if (c.kind === 'investicni') continue;
    const s = categorySeasonality(products.filter((p) => p.category === c.id && p.rank).map((p) => seasonality(clean(p.prices))));
    if (s) out[c.id] = s;
  }
  return out;
}
let demoSeasons = null;

const publicSettings = (s) => ({ inflation: s.inflation || null, affiliates: s.affiliates || [], sponsor: s.sponsor || null, backgrounds: s.backgrounds || {} });

export default async function handler(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  try {
    if (q.view === 'config') {
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.status(200).json({
        firebase: process.env.FIREBASE_WEB_API_KEY
          ? {
              apiKey: process.env.FIREBASE_WEB_API_KEY,
              authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId()}.firebaseapp.com`,
              projectId: projectId(),
              appId: process.env.FIREBASE_APP_ID || undefined,
            }
          : null,
        vapidPublicKey: pushEnabled() ? process.env.VAPID_PUBLIC_KEY : null,
        features: { database: hasFirebase(), email: emailEnabled(), push: pushEnabled(), auth: !!process.env.FIREBASE_WEB_API_KEY },
      });
    }

    const db = await getDb().catch((e) => (console.error('[data] Firebase', e), null));
    const dbBroken = hasFirebase() && !db;

    if (q.view === 'status') {
      res.setHeader('Cache-Control', 's-maxage=60');
      if (!db) return res.status(200).json({ mode: 'demo', meta: null });
      const [meta, products, pending] = await Promise.all([getMeta(), loadAll({ includeInactive: true }), getDoc('meta/pending')]);
      const counts = {};
      for (const p of products) if (p.active !== false) counts[p.category] = (counts[p.category] || 0) + 1;
      const stale = products.filter((p) => p.active !== false && p.updatedAt && Date.now() - Date.parse(p.updatedAt) > 45 * 86400000).length;
      return res.status(200).json({ mode: 'live', meta, counts, total: products.length, stale, pending: pending?.proposals?.length || 0 });
    }

    if (q.id) {
      if (!validId(q.id)) return res.status(404).json({ error: 'Produkt nenalezen' });
      const p = db ? await getProduct(q.id) : demo().find((x) => x.id === q.id);
      if (!p) return res.status(404).json({ error: 'Produkt nenalezen' });
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json({ product: { ...p, full: true } });
    }

    let products = [];
    let meta = null;
    let settings = {};
    let mode = dbBroken ? 'db-error' : 'demo';
    if (db) {
      try {
        [products, meta, settings] = await Promise.all([loadAll(), getMeta(), getSettings()]);
        mode = products.length ? 'live' : 'empty';
      } catch (e) {
        // Databáze nedostupná (špatné nastavení): web běží dál s ukázkovými daty a správce to uvidí v pruhu.
        console.error('[data] Firebase', e);
        mode = 'db-error';
      }
    }
    if (!products.length) products = demo();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    res.status(200).json({
      mode,
      meta: meta ? { finishedAt: meta.finishedAt, rates: meta.rates || null } : { rates: DEMO_RATES },
      settings: publicSettings(settings),
      seasons: mode === 'demo' || mode === 'db-error' ? (demoSeasons ||= seasonsOf(products)) : seasonsOf(products),
      products: products.map(lighten),
    });
  } catch (e) {
    publicError(res, e, 'data');
  }
}
