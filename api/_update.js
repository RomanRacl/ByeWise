// Denní aktualizace: komodity a akcie (Yahoo + ČNB), krypto (CoinGecko), hry (Steam), feedy e-shopů.
// Pak vyhodnotí hlídače cen, v pondělí pošle týdenní souhrn a v neděli udělá zálohu.
import { loadAll, saveProducts, setMeta, getMeta, getSettings, setDoc, getDoc, listCollection, getDb, getBucket, todayIso, audit } from './_db.js';
import {
  cnbRates, COMMODITIES, STOCKS, yahooHistory, relativeVolume, cryptoTop, cryptoHistory,
  steamTopSellers, steamMostPlayed, steamAppDetails, steamPlayers,
} from './_sources.js';
import { safeFetch } from './_security.js';
import { sendEmail, sendPush, notifyAdmin, emailEnabled, pushEnabled, emailLayout, esc, siteUrl } from './_notify.js';
import { slug, seedProducts } from '../public/lib/seed.js';
import { addPoint, parseFeed, matchFeedItem, prepareFeed, todayIso as dayIso, parseCsuFuel, mergeHistory, CSU_FUEL_URL } from '../public/lib/dataops.js';
import { summarize, clean, last, scoreProduct, seasonality, categorySeasonality } from '../public/lib/analytics.js';
import { categoryById, CATEGORIES } from '../public/lib/categories.js';

const fmt = (n, d = 0) => Number(n).toLocaleString('cs-CZ', { maximumFractionDigits: d, minimumFractionDigits: d });
const round = (x) => (x >= 100 ? Math.round(x) : +x.toFixed(x < 10 ? 4 : 2));
const now = () => new Date().toISOString();

async function pool(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.allSettled(items.slice(i, i + size).map(fn))));
  return out;
}

function rankedProducts(category, list, existing) {
  // list: [{ id, name, subtitle, unit, demand, demandValue, prices, extra }] seřazené podle poptávky
  return list.map((x, idx) => {
    const prev = existing.get(x.id);
    const top = idx < 10;
    return {
      ...(prev || {}),
      ...x.extra,
      id: x.id,
      category,
      name: x.name,
      subtitle: x.subtitle,
      unit: x.unit,
      demand: x.demand,
      demandValue: x.demandValue,
      rank: top ? idx + 1 : null,
      prevRank: prev?.active === false ? null : prev?.rank ?? null,
      rankHistory: top ? addPoint(prev?.rankHistory || [], idx + 1, 'r') : prev?.rankHistory || [],
      active: top,
      prices: x.prices,
      competitors: prev?.competitors || [],
      sample: false,
      updatedAt: now(),
    };
  });
}

// ---------- Jednotlivé zdroje ----------
async function yahooGroup(defs, category, existing, rates, conv) {
  const res = await pool(defs, 6, async (c) => ({ c, ...(await yahooHistory(c.sym)) }));
  const ok = [];
  const errors = [];
  res.forEach((r, i) => (r.status === 'fulfilled' && r.value.rows.length ? ok.push(r.value) : errors.push(`${defs[i].sym}: ${r.reason?.message || 'bez dat'}`)));
  const list = ok
    .map(({ c, rows, currency }) => {
      const rate = conv(c, currency);
      if (!rate) {
        errors.push(`${c.sym}: chybí kurz ${currency}`);
        return null;
      }
      const rv = relativeVolume(rows);
      return {
        id: `${category}-${slug(c.name)}`,
        name: c.name,
        subtitle: c.subtitle,
        unit: c.unit || 'Kč',
        demand: rv ? `${fmt(rv, 2)}× průměru` : 'objem neznámý',
        demandValue: rv ?? 0,
        prices: rows.map((r) => ({ d: r.d, p: round((r.close / (c.div || 1)) * rate) })),
        extra: { source: `Yahoo Finance ${c.sym}, kurz ČNB ${rates.date}` },
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.demandValue - a.demandValue);
  return { products: rankedProducts(category, list, existing), errors, count: ok.length };
}

async function crypto(existing) {
  const top = await cryptoTop(10);
  const errors = [];
  const hist = await pool(top, 3, (c) => cryptoHistory(c.id));
  const list = top.map((c, i) => {
    const id = `krypto-${slug(c.name)}`;
    const prev = existing.get(id);
    const h = hist[i].status === 'fulfilled' ? hist[i].value : null;
    if (!h) errors.push(`${c.id}: historie nedostupná`);
    return {
      id,
      name: c.name,
      subtitle: c.symbol,
      unit: 'Kč',
      demand: `${fmt(c.volume / 1e9, 1)} mld. Kč za 24 h`,
      demandValue: c.volume,
      prices: h ? [...h.slice(0, -1), { d: todayIso(), p: c.price }] : addPoint(prev?.prices || [], c.price),
      extra: { image: c.image, source: 'CoinGecko', link: `https://www.coingecko.com/cs/coins/${c.id}` },
    };
  });
  return { products: rankedProducts('krypto', list, existing), errors, count: list.length };
}

async function games(existing) {
  let list = await steamTopSellers();
  if (list.length < 10) {
    const have = new Set(list.map((g) => g.appid));
    const ids = (await steamMostPlayed()).filter((id) => !have.has(id)).slice(0, 20);
    for (const id of ids) {
      if (list.length >= 10) break;
      try {
        const d = await steamAppDetails(id);
        if (d && d.price !== null) list.push(d);
      } catch {}
    }
  }
  list = list.slice(0, 10);
  const players = await Promise.all(list.map((g) => steamPlayers(g.appid)));
  const products = list.map((g, idx) => {
    const id = `hry-${g.appid}`;
    const prev = existing.get(id);
    return {
      ...(prev || {}),
      id,
      category: 'hry',
      name: g.name,
      subtitle: g.discount ? `Sleva ${g.discount} % (původně ${fmt(g.originalPrice)} Kč)` : g.developer || prev?.subtitle || 'Steam',
      unit: 'Kč',
      demand: players[idx] != null ? `${fmt(players[idx])} hráčů online` : 'Top seller Steam',
      demandValue: players[idx] ?? 0,
      rank: idx + 1,
      prevRank: prev?.active === false ? null : prev?.rank ?? null,
      rankHistory: addPoint(prev?.rankHistory || [], idx + 1, 'r'),
      active: true,
      free: g.price === 0,
      discount: g.discount || 0,
      prices: g.price > 0 ? addPoint(prev?.prices || [], g.price) : prev?.prices || [],
      competitors: prev?.competitors || [],
      image: g.image,
      link: `https://store.steampowered.com/app/${g.appid}/`,
      source: 'Steam Store (cc=cz)',
      sample: false,
      updatedAt: now(),
    };
  });
  const ids = new Set(products.map((g) => g.id));
  for (const p of existing.values()) {
    if (p.category === 'hry' && p.active !== false && !ids.has(p.id)) products.push({ ...p, active: false, prevRank: p.rank, rank: null });
  }
  return { products, errors: [], count: list.length };
}

// ---------- Pohonné hmoty: týdenní průměr ČR z otevřených dat ČSÚ ----------
// Natural 95, nafta a LPG se plní samy včetně historie (každý týden jeden bod). Ostatní položky odvětví
// (Natural 98, prémiová nafta, CNG, nabíjení) zůstávají ruční.
export async function fuelPrices(existing, fetchText = async () => {
  const r = await fetch(CSU_FUEL_URL, { headers: { 'User-Agent': 'BuyWise/3 (+ceny PHM)' }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`ČSÚ ${r.status}`);
  return r.text();
}) {
  const series = parseCsuFuel(await fetchText());
  const names = Object.keys(series);
  if (!names.length) throw new Error('ČSÚ: v datech nejsou ceny paliv (možná se změnil formát souboru)');
  const seed = new Map(seedProducts().map((p) => [p.id, p]));
  const products = [];
  const errors = [];
  for (const name of names) {
    const id = `pohonne-${slug(name)}`;
    const prev = existing.get(id) || seed.get(id);
    if (!prev) continue;
    const pts = series[name];
    const lastD = pts[pts.length - 1].d;
    if (Date.now() - Date.parse(lastD) > 21 * 86400000) errors.push(`ČSÚ: poslední cena ${name} je z ${lastD} (data jsou stará)`);
    // Ukázkové (vymyšlené) ceny se nahradí celou skutečnou historií.
    const base = prev.sample ? [] : prev.prices || [];
    products.push({
      ...prev,
      prices: mergeHistory(base, pts),
      sample: false,
      source: `ČSÚ – průměrná cena v ČR, týden do ${lastD.split('-').reverse().join('. ').replace(/^0/, '')}`,
      updatedAt: now(),
    });
  }
  return { products, errors, count: products.length };
}

// Ceny prodejců z feedů – aktualizuje existující produkty v odvětví.
// U odvětví s „nejnižší cenou“ (elektro, mobily, sport, kosmetika) se z dnešních cen prodejců
// spočítá i hlavní cena produktu (lze vypnout u feedu volbou mainPrice: false).
export const LOWEST_PRICE_CATEGORIES = new Set(['elektro', 'mobily', 'sport', 'kosmetika']);
export async function feeds(settings, state, fetcher = (url) => safeFetch(url, { headers: { 'User-Agent': 'BuyWise/3 (+feed)' } })) {
  const errors = [];
  const touched = new Map();
  const mainFor = new Set();
  const perFeed = [];
  const offers = []; // celé feedy pro vyhledávání „jakéhokoli produktu“
  let matched = 0;
  for (const f of settings.feeds || []) {
    if (!f.url || !f.category || !f.competitor) continue;
    try {
      const items = prepareFeed(parseFeed(await fetcher(f.url)));
      if (!items.length) throw new Error('feed neobsahuje žádné položky');
      offers.push({ shop: f.competitor, category: f.category, items: items.slice(0, OFFERS_PER_FEED).map((it) => [it.name, it.price, it.url || '', it.ean || '']) });
      let n = 0;
      for (const p of state.values()) {
        if (p.category !== f.category || p.active === false) continue;
        const lastPrice = last(clean(p.prices))?.p || null;
        const hit = matchFeedItem(p, items, lastPrice);
        if (!hit) continue;
        matched++;
        n++;
        const cur = touched.get(p.id) || { ...p, competitors: [...(p.competitors || [])] };
        const i = cur.competitors.findIndex((c) => c.name.toLowerCase() === f.competitor.toLowerCase());
        const old = i >= 0 ? cur.competitors[i] : { name: f.competitor, url: '', prices: [] };
        const next = { ...old, url: hit.url || old.url, prices: addPoint(old.prices || [], hit.price) };
        if (i >= 0) cur.competitors[i] = next;
        else cur.competitors.push(next);
        cur.updatedAt = now();
        touched.set(p.id, cur);
      }
      perFeed.push(`${f.competitor} (${f.category}): ${n} z ${items.length}`);
      if (f.mainPrice !== false && LOWEST_PRICE_CATEGORIES.has(f.category)) mainFor.add(f.category);
    } catch (e) {
      errors.push(`Feed ${f.competitor} (${f.category}): ${e.message}`);
    }
  }
  // Hlavní cena = nejnižší dnešní cena u prodejců z feedů.
  const today = dayIso();
  for (const p of touched.values()) {
    if (!mainFor.has(p.category)) continue;
    const todays = p.competitors.map((c) => (c.prices || []).find((x) => x.d === today)?.p).filter((x) => x > 0);
    if (todays.length) {
      p.prices = addPoint(p.prices || [], Math.min(...todays));
      p.sample = false;
    }
  }
  return { products: [...touched.values()], errors, count: matched, perFeed, offers };
}

// ---------- Index nabídek pro vyhledávání ----------
// Firestore má limit 1 MB na dokument → položky se ukládají po dávkách (offers/{obchod}-{n}).
export const OFFERS_PER_FEED = 60000;
const CHUNK_BYTES = 700 * 1024;
export async function saveOffers(list) {
  const db = await getDb();
  if (!db) return { chunks: 0 };
  const prev = (await getDoc('meta/offers')) || { docs: [] };
  const docs = [];
  const at = now();
  for (const src of list) {
    const base = `${slug(src.shop)}-${slug(src.category)}`.slice(0, 60);
    let chunk = [];
    let size = 0;
    let n = 0;
    const flush = async () => {
      if (!chunk.length) return;
      const id = `${base}-${n++}`;
      await db.collection('offers').doc(id).set({ shop: src.shop, category: src.category, at, items: JSON.stringify(chunk) });
      docs.push(id);
      chunk = [];
      size = 0;
    };
    for (const it of src.items) {
      const len = JSON.stringify(it).length + 1;
      if (size + len > CHUNK_BYTES) await flush();
      chunk.push(it);
      size += len;
    }
    await flush();
  }
  // Smazat dávky, které už neexistují (odebraný feed nebo menší feed).
  for (const id of prev.docs || []) if (!docs.includes(id)) await db.collection('offers').doc(id).delete().catch(() => {});
  await setDoc('meta/offers', { docs, at, shops: [...new Set(list.map((x) => x.shop))], count: list.reduce((a, x) => a + x.items.length, 0) }, false);
  return { chunks: docs.length };
}

// ---------- Hlídače cen ----------
export async function evaluateAlerts(products, onlyIds = null) {
  const db = await getDb();
  if (!db) return { sent: 0 };
  const byId = new Map(products.map((p) => [p.id, p]));
  const alerts = await listCollection('alerts', ['active', '==', true]);
  let sent = 0;
  const site = siteUrl();
  for (const a of alerts) {
    if (onlyIds && !onlyIds.includes(a.productId)) continue;
    const p = byId.get(a.productId);
    if (!p) continue;
    const l = last(clean(p.prices));
    if (!l) continue;
    const target = a.type === 'drop' ? a.basePrice * (1 - a.value / 100) : a.value;
    if (!(l.p <= target)) continue;
    const url = `${site}/produkt/${encodeURIComponent(p.id)}`;
    const title = `${p.name}: ${fmt(l.p, l.p < 100 ? 2 : 0)} ${p.unit || 'Kč'}`;
    const body = a.type === 'drop' ? `Cena klesla o ${fmt(a.value)} % a víc.` : `Cena klesla pod ${fmt(a.value, a.value < 100 ? 2 : 0)} ${p.unit || 'Kč'}.`;
    const update = { active: false, triggeredAt: now(), triggeredPrice: l.p };
    if (a.email && (a.channels || []).includes('email') && emailEnabled()) {
      try {
        await sendEmail({
          to: a.email,
          subject: `Hlídač ceny: ${title}`,
          html: emailLayout(title, `<p>${esc(body)}</p><p><a href="${esc(url)}" style="display:inline-block;background:#16222b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Zobrazit produkt</a></p>`, 'Hlídač se po odeslání vypnul. Znovu ho zapneš na stránce produktu. '),
        });
        sent++;
      } catch (e) {
        update.lastError = e.message;
      }
    }
    if (a.pushSub && pushEnabled()) {
      const r = await sendPush(a.pushSub, { title: `Hlídač ceny: ${p.name}`, body: `${body} Teď ${fmt(l.p, l.p < 100 ? 2 : 0)} ${p.unit || 'Kč'}.`, url: `/produkt/${encodeURIComponent(p.id)}` });
      if (r.ok) sent++;
      if (r.gone) update.pushSub = null;
    }
    await db.collection('alerts').doc(a.id).set(update, { merge: true });
  }
  return { sent };
}

// ---------- Skóre všech spotřebních produktů (pro e-maily) ----------
const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
export function scoreAll(products) {
  const seasons = {};
  for (const c of CATEGORIES) {
    if (c.kind === 'investicni') continue;
    seasons[c.id] = categorySeasonality(products.filter((p) => p.category === c.id && p.rank).map((p) => seasonality(clean(p.prices))));
  }
  const out = new Map();
  for (const p of products) {
    if (p.active === false || categoryById(p.category)?.kind === 'investicni') continue;
    out.set(p.id, scoreProduct(p, seasons[p.category]));
  }
  return out;
}
const whenText = (sc, unit) =>
  !sc ? '' : sc.tone === 'buy' ? 'teď je dobrá chvíle' : sc.when?.type === 'days' ? `počkej do 30 dní (odhad ${fmt(sc.when.price, sc.when.price < 100 ? 2 : 0)} ${unit})` : sc.when?.type === 'month' ? `nejlevněji bývá v měsíci ${MONTHS[sc.when.month]}` : 'na načasování moc nezáleží';

// ---------- Týdenní e-mail „BuyWise týden“ ----------
export function digestHtml(products, user = {}, sponsor = null, scores = scoreAll(products)) {
  const site = siteUrl();
  const favorites = user.favorites || [];
  const wishlist = user.wishlist || [];
  const rows = products.filter((p) => p.active !== false && p.rank).map((p) => ({ p, s: scores.get(p.id)?.s || summarize(p), sc: scores.get(p.id)?.score || null, d: scores.get(p.id)?.discount || null }));
  const byId = new Map(products.map((p) => [p.id, p]));
  const price = (v, u) => `${fmt(v, v < 100 ? 2 : 0)} ${esc(u || 'Kč')}`;
  const li = (p, v) => `<li style="margin:5px 0"><a href="${esc(site)}/produkt/${encodeURIComponent(p.id)}" style="color:#16222b;font-weight:bold">${esc(p.name)}</a> <span style="color:#6f7d86">(${esc(categoryById(p.category)?.name || '')})</span> ${v}</li>`;
  const pct = (v) => `${v > 0 ? '+' : '−'}${fmt(Math.abs(v), 1)} %`;
  const badge = (sc) => (sc ? `<span style="display:inline-block;min-width:26px;text-align:center;border-radius:12px;padding:1px 6px;font-weight:bold;color:#fff;background:${sc.tone === 'buy' ? '#1e7a4c' : sc.tone === 'wait' ? '#b8441c' : '#5f6d76'}">${sc.score}</span>` : '');
  const sec = (title, list, fn, lead = '') => (list.length ? `<h2 style="font-size:16px;margin:20px 0 4px">${title}</h2>${lead ? `<p style="margin:0 0 6px;color:#4c5c66;font-size:14px">${lead}</p>` : ''}<ul style="padding-left:18px;margin:0">${list.map(fn).join('')}</ul>` : '');
  const consumer = rows.filter((x) => x.sc);
  const wish = wishlist.map((w) => ({ w, p: byId.get(w.id) })).filter((x) => x.p).map((x) => ({ ...x, ...(rows.find((r) => r.p.id === x.p.id) || { s: summarize(x.p), sc: scores.get(x.p.id)?.score }) }));
  const buy = consumer.filter((x) => x.sc.tone === 'buy').sort((a, b) => b.sc.score - a.sc.score).slice(0, 5);
  const down = rows.filter((x) => x.s.ch7 != null && x.s.ch7 < -0.5).sort((a, b) => a.s.ch7 - b.s.ch7).slice(0, 5);
  const up = rows.filter((x) => x.s.ch7 != null && x.s.ch7 > 0.5).sort((a, b) => b.s.ch7 - a.s.ch7).slice(0, 5);
  const fake = rows.filter((x) => x.d?.suspicious).slice(0, 5);
  const wait = consumer.filter((x) => x.sc.tone === 'wait').sort((a, b) => a.sc.score - b.sc.score).slice(0, 5);
  const fav = rows.filter((x) => favorites.includes(x.p.id) && !wishlist.some((w) => w.id === x.p.id));
  return (
    `<p style="margin:0 0 4px;font-size:15px">Kupuj chytře. Tady je, co se tento týden dělo s cenami.</p>` +
    sec('Tvůj seznam přání', wish, (x) => li(x.p, `${badge(x.sc)} ${price(x.s.price, x.p.unit)}${x.w.target ? `, cíl ${price(x.w.target, x.p.unit)}${x.s.price <= x.w.target ? ' <b style="color:#1e7a4c">– cíl splněn!</b>' : ''}` : ''}<br><span style="color:#4c5c66">${esc(whenText(x.sc, x.p.unit || 'Kč'))}</span>`)) +
    sec('Vyplatí se koupit teď', buy, (x) => li(x.p, `${badge(x.sc)} ${price(x.s.price, x.p.unit)}`), 'Skóre 60 a víc: cena je nízko, nečeká se zlevnění.') +
    sec('Zlevnilo za týden', down, (x) => li(x.p, `<b style="color:#1e7a4c">${pct(x.s.ch7)}</b> na ${price(x.s.price, x.p.unit)}`)) +
    sec('Zdražilo za týden', up, (x) => li(x.p, `<b style="color:#b8441c">${pct(x.s.ch7)}</b> na ${price(x.s.price, x.p.unit)}`)) +
    sec('Pozor na tyto akce', fake, (x) => li(x.p, `cena byla zvednuta na ${price(x.d.peak, x.p.unit)} a pak „zlevněna“; před zdražením stála asi ${price(x.d.prior, x.p.unit)}`), 'Sleva proti původní ceně je jen zdánlivá.') +
    sec('Vyplatí se počkat', wait, (x) => li(x.p, `${badge(x.sc)} ${esc(whenText(x.sc, x.p.unit || 'Kč'))}`)) +
    sec('Tvoje oblíbené', fav, (x) => li(x.p, `${price(x.s.price, x.p.unit)}${x.s.ch30 != null ? `, ${pct(x.s.ch30)} za 30 dní` : ''}`)) +
    `<p style="margin:22px 0 0"><a href="${esc(site)}/" style="display:inline-block;background:#16222b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Otevřít BuyWise</a></p>` +
    (sponsor?.text ? `<p style="margin-top:18px;padding:10px;background:#fff7d6;border-radius:8px">Partner týdne: ${sponsor.url ? `<a href="${esc(sponsor.url)}">${esc(sponsor.text)}</a>` : esc(sponsor.text)}</p>` : '')
  );
}

export async function sendWeeklyDigest(products, settings) {
  if (!emailEnabled()) return { sent: 0, skipped: 'e-maily nejsou nastavené' };
  const users = await listCollection('users', ['weeklyDigest', '==', true]);
  const scores = scoreAll(products);
  let sent = 0;
  for (const u of users) {
    if (!u.email) continue;
    try {
      await sendEmail({
        to: u.email,
        subject: 'BuyWise týden: co zlevnilo, co zdražilo a co se vyplatí koupit',
        html: emailLayout('BuyWise týden', digestHtml(products, u, settings.sponsor, scores), `Odběr zrušíš v aplikaci na stránce Seznam přání. `),
      });
      sent++;
    } catch {}
  }
  return { sent };
}

// ---------- Seznam přání: e-mail při dosažení cílové ceny ----------
export async function checkWishlists(products) {
  if (!emailEnabled()) return { sent: 0 };
  const users = await listCollection('users', ['wishAlerts', '==', true]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const site = siteUrl();
  let sent = 0;
  for (const u of users) {
    if (!u.email || !Array.isArray(u.wishlist)) continue;
    let changed = false;
    const hits = [];
    for (const w of u.wishlist) {
      const p = byId.get(w.id);
      const l = p && last(clean(p.prices));
      if (!l || !w.target || l.p > w.target) continue;
      const mark = `target:${l.p}`;
      if (w.notified === mark) continue;
      w.notified = mark;
      changed = true;
      hits.push({ p, price: l.p, target: w.target });
    }
    if (!hits.length) continue;
    try {
      await sendEmail({
        to: u.email,
        subject: hits.length === 1 ? `BuyWise: ${hits[0].p.name} je pod tvou cílovou cenou` : `BuyWise: ${hits.length} přání je pod cílovou cenou`,
        html: emailLayout('Cílová cena dosažena', `<ul style="padding-left:18px">${hits.map((h) => `<li style="margin:6px 0"><a href="${esc(site)}/produkt/${encodeURIComponent(h.p.id)}" style="color:#16222b;font-weight:bold">${esc(h.p.name)}</a>: ${fmt(h.price, h.price < 100 ? 2 : 0)} ${esc(h.p.unit || 'Kč')} (cíl ${fmt(h.target, h.target < 100 ? 2 : 0)})</li>`).join('')}</ul>`, 'Cílovou cenu změníš na stránce Seznam přání. '),
      });
      sent++;
    } catch {}
    if (changed) await setDoc(`users/${u.id}`, { wishlist: u.wishlist });
  }
  return { sent };
}

// ---------- Záloha ----------
export async function backup(products, settings) {
  const bucket = await getBucket();
  if (!bucket) return { skipped: 'FIREBASE_STORAGE_BUCKET není nastavený' };
  const name = `zalohy/buywise-${todayIso()}.json`;
  await bucket.file(name).save(JSON.stringify({ version: 2, exported: now(), settings, products }), { contentType: 'application/json' });
  return { file: name };
}

// ---------- Hlavní běh ----------
const pragueDay = () => new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague', weekday: 'short' });

export async function runUpdate({ trigger = 'cron', weekly = false } = {}) {
  const startedAt = now();
  const log = [];
  const errors = [];
  const sources = {};
  const settings = await getSettings();
  const prevMeta = (await getMeta()) || {};
  const all = await loadAll({ includeInactive: true });
  const existing = new Map(all.map((p) => [p.id, p]));

  let rates;
  try {
    rates = await cnbRates();
    sources.cnb = { ok: true, at: now(), msg: `kurz ${rates.date}` };
  } catch (e) {
    rates = prevMeta.rates;
    sources.cnb = { ok: false, at: now(), msg: e.message };
    errors.push(`ČNB: ${e.message}`);
  }

  const changed = new Map();
  const put = (list) => list.forEach((p) => changed.set(p.id, p));
  const run = async (key, label, fn) => {
    try {
      const r = await fn();
      put(r.products);
      sources[key] = { ok: !r.errors.length, at: now(), msg: `${label}: ${r.count}${r.errors.length ? `, chyby: ${r.errors.length}` : ''}${r.perFeed?.length ? ` (${r.perFeed.join('; ')})` : ''}` };
      log.push(sources[key].msg);
      errors.push(...r.errors);
    } catch (e) {
      sources[key] = { ok: false, at: now(), msg: e.message };
      errors.push(`${label}: ${e.message}`);
    }
  };

  if (rates?.USD) {
    await run('komodity', 'Komodity', () => yahooGroup(COMMODITIES, 'komodity', existing, rates, () => rates.USD));
    await run('akcie', 'Akcie', () => yahooGroup(STOCKS, 'akcie', existing, rates, (c, cur) => rates[cur] ?? (cur === 'CZK' ? 1 : null)));
  } else errors.push('Chybí kurz USD – komodity a akcie přeskočeny');
  await run('krypto', 'Krypto', () => crypto(existing));
  await run('hry', 'PC hry', () => games(existing));

  // Stav po automatických zdrojích (pro párování feedů).
  const state = new Map(existing);
  for (const [id, p] of changed) state.set(id, p);
  await run('pohonne', 'Pohonné hmoty (ČSÚ)', () => fuelPrices(existing));
  let feedOffers = null;
  if ((settings.feeds || []).length)
    await run('feedy', 'Ceny z feedů', async () => {
      const r = await feeds(settings, state);
      feedOffers = r.offers;
      return r;
    });
  if (feedOffers) {
    try {
      const o = await saveOffers(feedOffers);
      log.push(`Index vyhledávání: ${feedOffers.reduce((a, x) => a + x.items.length, 0)} nabídek (${o.chunks} dávek)`);
    } catch (e) {
      errors.push(`Index vyhledávání: ${e.message}`);
    }
  }
  for (const [id, p] of changed) state.set(id, p);

  // Režim schvalování: ceny se uloží, změny pořadí čekají na schválení.
  let toSave = [...changed.values()];
  let pending = null;
  if (settings.requireApproval && trigger === 'cron') {
    const proposals = [];
    toSave = toSave.map((p) => {
      const prev = existing.get(p.id);
      const rankChanged = (prev?.rank ?? null) !== (p.rank ?? null) || (prev?.active !== false) !== (p.active !== false);
      if (!rankChanged) return p;
      proposals.push({ id: p.id, name: p.name, category: p.category, rank: p.rank ?? null, active: p.active !== false, oldRank: prev?.rank ?? null, oldActive: prev ? prev.active !== false : false });
      return { ...p, rank: prev?.rank ?? null, prevRank: prev?.prevRank ?? null, active: prev ? prev.active !== false : false, rankHistory: prev?.rankHistory || [] };
    });
    if (proposals.length) {
      pending = { createdAt: now(), proposals };
      await setDoc('meta/pending', pending, false);
      log.push(`Ke schválení: ${proposals.length} změn pořadí`);
    }
  }
  if (toSave.length) await saveProducts(toSave);
  for (const p of toSave) state.set(p.id, p);
  const finalProducts = [...state.values()];

  // Hlídače
  try {
    const a = await evaluateAlerts(finalProducts);
    if (a.sent) log.push(`Hlídače: odesláno ${a.sent} upozornění`);
  } catch (e) {
    errors.push(`Hlídače: ${e.message}`);
  }

  try {
    const w = await checkWishlists(finalProducts);
    if (w.sent) log.push(`Seznamy přání: odesláno ${w.sent} e-mailů`);
  } catch (e) {
    errors.push(`Seznamy přání: ${e.message}`);
  }

  // Týdenní úlohy
  const day = pragueDay();
  const today = todayIso();
  const extra = {};
  if ((day === 'Mon' || weekly) && prevMeta.lastDigest !== today) {
    try {
      const d = await sendWeeklyDigest(finalProducts, settings);
      extra.lastDigest = today;
      log.push(`Týdenní souhrn: ${d.sent ?? 0} e-mailů${d.skipped ? ` (${d.skipped})` : ''}`);
    } catch (e) {
      errors.push(`Týdenní souhrn: ${e.message}`);
    }
  }
  if ((day === 'Sun' || weekly) && prevMeta.lastBackup !== today) {
    try {
      const b = await backup(finalProducts, settings);
      if (b.file) {
        extra.lastBackup = today;
        log.push(`Záloha: ${b.file}`);
      } else log.push(`Záloha přeskočena: ${b.skipped}`);
    } catch (e) {
      errors.push(`Záloha: ${e.message}`);
    }
  }

  const status = { lastRun: startedAt, finishedAt: now(), trigger, log, errors, sources, ...(rates ? { rates } : {}), ...extra };
  await setMeta(status);
  if (errors.length) {
    await notifyAdmin(`Aktualizace dat skončila s chybami (${errors.length}):\n${errors.slice(0, 15).join('\n')}`);
  }
  if (trigger !== 'cron') await audit(trigger, 'aktualizace', 'živá data', log.join('; '));
  return status;
}
