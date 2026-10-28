// Čisté datové operace sdílené serverem (api/) i samostatnou HTML verzí.
import { slug } from './seed.js';

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const parseNum = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[\s ]|kč|czk|,-/gi, '');
  // 1.234,50 → 1234.50 ; 1234,5 → 1234.5
  const norm = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : null;
};

export function addPoint(list = [], value, key = 'p') {
  const d = todayIso();
  if (value == null) return list;
  return [...list.filter((x) => x.d !== d), { d, [key]: value }];
}

const ATTR_KEYS = ['metric', 'metricValue', 'consumption', 'energy', 'ean', 'photoQuery'];

// Sloučí vstup (formulář, CSV, feed) s uloženým produktem; cena a pořadí se přidají jako dnešní záznam historie.
export function merge(prev, input) {
  const competitors = (input.competitors || prev?.competitors || [])
    .filter((c) => c && c.name)
    .map((c) => {
      const old = (prev?.competitors || []).find((o) => o.name.toLowerCase() === c.name.trim().toLowerCase());
      return { name: c.name.trim(), url: c.url || old?.url || '', prices: addPoint(old?.prices || c.prices || [], parseNum(c.price)) };
    });
  const rank = parseNum(input.rank);
  const attrs = { ...(prev?.attrs || {}) };
  for (const k of ATTR_KEYS) {
    const v = input.attrs ? input.attrs[k] : undefined;
    if (v === undefined) continue;
    if (v === '' || v === null) delete attrs[k];
    else attrs[k] = ['metricValue', 'consumption'].includes(k) ? parseNum(v) : String(v);
  }
  return {
    ...(prev || {}),
    id: prev?.id || input.id || `${input.category}-${slug(input.name)}`,
    category: input.category ?? prev?.category,
    name: (input.name ?? prev?.name ?? '').trim(),
    subtitle: input.subtitle ?? prev?.subtitle ?? '',
    unit: input.unit || prev?.unit || 'Kč',
    demand: input.demand ?? prev?.demand ?? '',
    demandValue: parseNum(input.demandValue) ?? prev?.demandValue ?? 0,
    rank: rank ?? prev?.rank ?? null,
    prevRank: rank != null && prev?.rank != null && rank !== prev.rank ? prev.rank : prev?.prevRank ?? null,
    rankHistory: rank != null ? addPoint(prev?.rankHistory || [], rank, 'r') : prev?.rankHistory || [],
    image: input.image ?? prev?.image ?? '',
    photo: input.photo ?? prev?.photo ?? '',
    photoCredit: input.photoCredit ?? prev?.photoCredit ?? '',
    link: input.link ?? prev?.link ?? '',
    attrs,
    active: input.active ?? prev?.active ?? true,
    prices: addPoint(prev?.prices || [], parseNum(input.price)),
    competitors,
    sample: false,
    // Ruční cena přepíše i údaj o zdroji (např. „Dohledáno na webu (AI)“).
    ...(parseNum(input.price) != null ? { source: input.source || '', sourceUrl: '' } : {}),
    updatedAt: new Date().toISOString(),
  };
}

// Aplikuje import řádků do odvětví: co v importu chybí, vypadne z žebříčku (historie zůstane).
export function applyImport(existingInCategory, categoryId, rows) {
  const touched = new Set();
  const out = rows.map((r, i) => {
    const id = `${categoryId}-${slug(r.name)}`;
    touched.add(id);
    const prev = existingInCategory.find((p) => p.id === id);
    return merge(prev, { ...r, rank: r.rank ?? i + 1, id, category: categoryId, active: true });
  });
  for (const p of existingInCategory) {
    if (!touched.has(p.id) && p.active !== false) out.push({ ...p, active: false, prevRank: p.rank, rank: null });
  }
  return out;
}

// CSV: pořadí;název;podtitul;cena;poptávka;konkurence (Alza=24990|Datart=25490)
export function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sep = lines[0]?.includes('\t') ? '\t' : ';';
  const rows = [];
  for (const line of lines) {
    const c = line.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
    if (!c[1] || parseNum(c[0]) == null) continue; // přeskočí hlavičku
    rows.push({
      rank: parseNum(c[0]),
      name: c[1],
      subtitle: c[2] || '',
      price: c[3],
      demand: c[4] || '',
      competitors: (c[5] || '')
        .split('|')
        .map((s) => s.split('='))
        .filter(([n, p]) => n && p)
        .map(([n, p]) => ({ name: n.trim(), price: p })),
    });
  }
  return rows;
}

// ---------- Tisková zpráva SDA → žebříček aut ----------
const titleModel = (m) =>
  m
    .toLowerCase()
    .split(/([\s-])/)
    .map((w) => (w.length <= 2 && /\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');

export function parseSda(text) {
  const t = String(text).replace(/ /g, ' ');
  const period = (t.match(/(\d{1,2}\s*[–-]\s*\d{1,2}\/\d{4})|(\d{1,2}\/\d{4})/) || [])[0];
  const re = /([A-ZŠČŘŽÝÁÍÉÚŮ][a-zěščřžýáíéúůó]+(?:[- ][A-Z][a-z]+)?)\s+([A-Z0-9][A-Z0-9ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ.\-]*(?:\s[A-Z0-9][A-Z0-9.\-]*)?)\s*(?:s|–|-|—)\s*(\d[\d ]*)\s*ks/g;
  const rows = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(t)) && rows.length < 10) {
    const name = `${m[1]} ${titleModel(m[2])}`;
    if (seen.has(name)) continue;
    seen.add(name);
    const count = parseInt(m[3].replace(/\s/g, ''), 10);
    rows.push({
      rank: rows.length + 1,
      name,
      subtitle: '',
      demand: `${count.toLocaleString('cs-CZ')} registrací${period ? ` (${period.replace(/\s/g, '')})` : ''}`,
      demandValue: count,
    });
  }
  return rows;
}

// ---------- Obecný textový žebříček (knihy, top seznamy) ----------
// Řádky typu „1. Autor: Název – 499 Kč“, „2) Název – podtitul“ nebo jen názvy pod sebou.
export function parseRankingText(text) {
  const rows = [];
  for (const raw of String(text).split(/\r?\n/)) {
    let line = raw.replace(/ /g, ' ').trim();
    if (!line) continue;
    let rank = null;
    const rm = line.match(/^#?\s*(\d{1,3})\s*[.)\]:-]\s*/);
    if (rm) {
      rank = parseInt(rm[1], 10);
      line = line.slice(rm[0].length);
    }
    let price = null;
    const pm = line.match(/[\s,(–-]*(\d[\d ]*(?:[.,]\d{1,2})?)\s*(?:Kč|CZK|,-)\)?\s*$/i);
    if (pm) {
      price = parseNum(pm[1]);
      line = line.slice(0, pm.index).trim().replace(/[–-]$/, '').trim();
    }
    let name = line, subtitle = '';
    const colon = line.indexOf(':');
    const dash = line.search(/\s[–—-]\s/);
    if (colon > 0 && (dash < 0 || colon < dash)) {
      subtitle = line.slice(0, colon).trim();
      name = line.slice(colon + 1).trim();
    } else if (dash > 0) {
      name = line.slice(0, dash).trim();
      subtitle = line.slice(dash).replace(/^\s[–—-]\s/, '').trim();
    }
    if (!name || name.length < 2) continue;
    rows.push({ rank: rank ?? rows.length + 1, name, subtitle, price, demand: '' });
  }
  return rows.sort((a, b) => a.rank - b.rank).slice(0, 50);
}

// ---------- XML/CSV feedy e-shopů ----------
// Podporované formáty: Heureka/Zboží XML (SHOPITEM), Google Merchant (RSS item / Atom entry s g:…),
// obecné XML affiliate sítí (<product> / <item> s name/price/url) a CSV/TSV s hlavičkou nebo bez ní.
const ENT = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', nbsp: ' ' };
const decode = (s) =>
  String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&(lt|gt|quot|apos|nbsp|amp);/g, (_, e) => ENT[e])
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tag = (block, names) => {
  for (const n of names) {
    const m = block.match(new RegExp(`<${esc(n)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(n)}>`, 'i'));
    if (m) {
      const v = decode(m[1]);
      if (v) return v;
    }
  }
  return '';
};
const money = (v) => parseNum(String(v || '').replace(/\b[A-Z]{3}\b/g, ''));
const MAX_ITEMS = 300000;

export function parseFeed(text) {
  const items = [];
  const src = String(text);
  let format = 'csv';
  const push = (it) => {
    if (items.length < MAX_ITEMS && it.name && it.price > 0 && it.price < 1e9) items.push({ ...it, name: it.name.slice(0, 300), url: /^https?:\/\//i.test(it.url || '') ? it.url : '' });
  };
  if (/<SHOPITEM[\s>]/i.test(src)) {
    format = 'heureka';
    for (const m of src.matchAll(/<SHOPITEM[\s>][\s\S]*?<\/SHOPITEM>/gi)) {
      const b = m[0];
      push({ name: tag(b, ['PRODUCTNAME', 'PRODUCT']), price: money(tag(b, ['PRICE_VAT', 'PRICE'])), url: tag(b, ['URL']), ean: tag(b, ['EAN']), brand: tag(b, ['MANUFACTURER']), group: tag(b, ['ITEMGROUP_ID']) });
    }
  } else if (/<(item|entry)[\s>]/i.test(src) && /g:|<price|<title/i.test(src)) {
    format = 'google';
    for (const m of src.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)) {
      const b = m[0];
      if (/out[ _]of[ _]stock|discontinued/i.test(tag(b, ['g:availability', 'availability']))) continue;
      push({ name: tag(b, ['g:title', 'title']), price: money(tag(b, ['g:sale_price', 'sale_price']) || tag(b, ['g:price', 'price'])), url: tag(b, ['g:link', 'link', 'g:canonical_link']), ean: tag(b, ['g:gtin', 'gtin']), brand: tag(b, ['g:brand', 'brand']), group: tag(b, ['g:item_group_id']) });
    }
  } else if (/<(product|PRODUCT|Product)[\s>]/.test(src)) {
    format = 'xml';
    for (const m of src.matchAll(/<(product)[\s>][\s\S]*?<\/\1>/gi)) {
      const b = m[0];
      push({
        name: tag(b, ['name', 'productname', 'product_name', 'title']),
        price: money(tag(b, ['price_vat', 'price_with_vat', 'sale_price', 'price'])),
        url: tag(b, ['deeplink', 'tracking_url', 'url', 'link', 'product_url']),
        ean: tag(b, ['ean', 'gtin', 'ean13']),
        brand: tag(b, ['brand', 'manufacturer']),
      });
    }
  } else {
    const lines = src.split(/\r?\n/).filter((l) => l.trim());
    const sep = (lines[0] || '').includes('\t') ? '\t' : (lines[0] || '').split(';').length >= (lines[0] || '').split(',').length ? ';' : ',';
    const split = (l) => l.split(sep).map((x) => x.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    const head = split(lines[0] || '').map((h) => h.toLowerCase());
    const col = (names) => head.findIndex((h) => names.includes(h));
    const hasHead = col(['name', 'název', 'nazev', 'title', 'product', 'productname']) >= 0 && col(['price', 'cena', 'price_vat']) >= 0;
    const ix = hasHead
      ? { name: col(['name', 'název', 'nazev', 'title', 'product', 'productname']), price: col(['price_vat', 'price', 'cena']), url: col(['url', 'link', 'odkaz', 'deeplink']), ean: col(['ean', 'gtin']) }
      : { name: 0, price: 1, url: 2, ean: 3 };
    for (const line of lines.slice(hasHead ? 1 : 0)) {
      const c = split(line);
      push({ name: c[ix.name] || '', price: parseNum(c[ix.price]), url: ix.url >= 0 ? c[ix.url] || '' : '', ean: ix.ean >= 0 ? c[ix.ean] || '' : '' });
    }
  }
  items.format = format;
  return items;
}

// Tokeny pro párování: bez diakritiky, čísla oddělená od jednotek („256GB“ → 256 gb, „100ml“ → 100 ml).
export const searchTokens = (s) => tokens(s);
const tokens = (s) =>
  slug(String(s).replace(/(\d)([a-z])/gi, '$1 $2').replace(/([a-z])(\d)/gi, (m, a, d) => (/[a-z]/i.test(a) && /^(e|s)$/i.test(a) ? m : `${a} ${d}`)))
    .split('-')
    .filter(Boolean);
// Slova příslušenství: když jsou v položce feedu a ne v názvu produktu, nejde o produkt samotný.
export const ACCESSORY = new Set(['kryt', 'obal', 'pouzdro', 'flip', 'ochranne', 'ochranny', 'sklo', 'folie', 'nabijecka', 'nabijeci', 'kabel', 'adapter', 'drzak', 'reminek', 'remen', 'naramek', 'nahradni', 'tester', 'vzorek', 'miniatura', 'naplne', 'naplni', 'filtr', 'filtry', 'sacky', 'kartac', 'hlavice', 'stojan', 'podlozka', 'taska', 'batoh', 'brasna', 'skin', 'case', 'cover', 'tempered', 'protector', 'charger', 'cable', 'strap', 'refill', 'set', 'sada', 'darkova', 'repasovany', 'repasovana', 'rozbaleno', 'pouzite', 'bazar']);
// Označení variant modelu: „iPhone 17“ nesmí spárovat „iPhone 17 Pro“.
const VARIANT = new Set(['pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'fe', 'neo', 'edge', 'air', 'prime', 'xl', 'xxl']);

// Předzpracuje položky feedu (tokeny jen jednou – feed může mít desítky tisíc položek).
export function prepareFeed(items) {
  if (!items._prepared) {
    for (const it of items) it._tok = new Set(tokens(it.name));
    items._prepared = true;
  }
  return items;
}

/**
 * Najde položku feedu pro produkt: nejdřív podle EAN, jinak shodou slov.
 * Musí sedět všechna slova z názvu a všechna čísla z názvu i podtitulu (např. 256 GB, 100 ml),
 * položka nesmí být příslušenství ani jiná varianta modelu a cena musí dávat smysl.
 */
export function matchFeedItem(product, items, lastPrice = null) {
  prepareFeed(items);
  const sane = (it) => !lastPrice || (it.price >= lastPrice * 0.45 && it.price <= lastPrice * 2.2);
  const ean = product.attrs?.ean;
  if (ean) {
    const hit = items.filter((i) => i.ean && i.ean.replace(/\D/g, '') === String(ean).replace(/\D/g, '') && sane(i));
    if (hit.length) return { ...hit.reduce((a, b) => (b.price < a.price ? b : a)), byEan: true };
  }
  const nameTok = tokens(product.name);
  const want = [...new Set([...nameTok, ...tokens(product.subtitle || '')])];
  const mine = new Set(want);
  const nums = want.filter((t) => /\d/.test(t));
  let best = null;
  for (const it of items) {
    const have = it._tok;
    if (!nameTok.every((t) => have.has(t))) continue;
    if (!nums.every((n) => have.has(n))) continue;
    let bad = false;
    for (const t of have) {
      if ((ACCESSORY.has(t) || VARIANT.has(t)) && !mine.has(t)) {
        bad = true;
        break;
      }
    }
    if (bad || !sane(it)) continue;
    const cover = want.filter((t) => have.has(t)).length / want.length;
    if (cover < 0.6) continue;
    // Méně slov navíc = přesnější shoda; při shodě levnější nabídka.
    const extra = have.size - want.filter((t) => have.has(t)).length;
    const score = cover * 10 - extra * 0.2;
    if (!best || score > best.score || (score === best.score && it.price < best.item.price)) best = { item: it, score };
  }
  return best ? best.item : null;
}

// ---------- Affiliate odkazy ----------
// rules: [{ domain: 'alza.cz', template: '{url}?idp=123' }] – {url} nebo {url_enc}
export function affiliate(url, rules = []) {
  if (!url) return url;
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
  const rule = rules.find((r) => r.domain && (host === r.domain || host.endsWith('.' + r.domain)));
  if (!rule || !rule.template) return url;
  return rule.template.replace('{url_enc}', encodeURIComponent(url)).replace('{url}', url);
}

export function parseAffiliateRules(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.split('|').map((x) => x.trim()))
    .filter(([d, t]) => d && t)
    .map(([domain, template]) => ({ domain: domain.replace(/^www\./, ''), template }));
}

// ---------- Ceny pohonných hmot z ČSÚ (otevřená data, týdenní průměr za ČR) ----------
// Formát CSV od ČSÚ se občas mění (oddělovač, názvy sloupců), proto se sloupce poznávají podle názvu i obsahu:
// hodnota = cena, období = datum (konec týdne), text = druh paliva, území = jen celá ČR.
export const CSU_FUEL_URL = 'https://vdb.czso.cz/pll/eweb/cenyphm.data';
const FUELS = [
  ['Natural 95', /natural\s*95|benz[ií]n|automobilov[ýy] benz/i],
  ['Nafta', /nafta|diesel/i],
  ['LPG', /\bLPG\b|autoplyn/i],
];
function csvRows(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const cnt = (ch) => lines[0].split(ch).length;
  const sep = cnt('\t') > 1 && cnt('\t') >= cnt(';') ? '\t' : cnt(';') >= cnt(',') ? ';' : ',';
  const split = (line) => {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
      } else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i] || 'c' + i, v])));
}
const csuDate = (v) => {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
};
export function parseCsuFuel(text) {
  const rows = csvRows(text);
  if (!rows.length) return {};
  const keys = Object.keys(rows[0]);
  const valueKey = keys.find((k) => /hodnota|value|^cena|price/.test(k)) || keys.find((k) => rows.slice(0, 50).every((r) => !r[k] || /^\d+([.,]\d+)?$/.test(r[k])));
  const dateKeys = [...keys.filter((k) => /obdobido|do$|datum_do|konec/.test(k)), ...keys.filter((k) => /obdob[ií]|datum|t[ýy]den|week|od$/.test(k))];
  const areaKey = keys.find((k) => /uzemi.*txt|uzemi_text|uzemi$|^uzemi_nazev/.test(k));
  const sums = {};
  for (const r of rows) {
    const price = parseNum(r[valueKey]);
    if (!(price > 5 && price < 200)) continue;
    if (areaKey && r[areaKey] && !/česk|cesk|ČR|^CZ$/i.test(r[areaKey])) continue;
    const textAll = keys.filter((k) => k !== valueKey && !dateKeys.includes(k)).map((k) => r[k]).join(' ');
    // Jen běžná paliva: bez topných olejů a prémiových variant (98, aditivovaná nafta…).
    if (/topn|olej|heating|pr[ée]mi|premium|verva|v-power|\b98\b|super plus/i.test(textAll)) continue;
    const fuel = FUELS.find(([, re]) => re.test(textAll))?.[0];
    if (!fuel) continue;
    const d = dateKeys.map((k) => csuDate(r[k])).find(Boolean);
    if (!d) continue;
    const key = fuel + '|' + d;
    (sums[key] ||= []).push(price);
  }
  const out = {};
  for (const [key, list] of Object.entries(sums)) {
    const [fuel, d] = key.split('|');
    (out[fuel] ||= []).push({ d, p: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100 });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.d < b.d ? -1 : 1));
  return out;
}

// Sloučí historii: body se stejným datem přepíše, ostatní ponechá.
export function mergeHistory(list = [], points = []) {
  const m = new Map(list.map((x) => [x.d, x]));
  for (const x of points) m.set(x.d, { d: x.d, p: x.p });
  return [...m.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
}

// ---------- Vyhledávání v nabídkách obchodů ----------
// Index: [{ shop, items: [[název, cena, odkaz, ean], …] }]. Vrací skupiny stejného produktu s cenami v obchodech.
const COLORS = new Set(['cerna', 'cerny', 'cerne', 'bila', 'bily', 'bile', 'modra', 'modry', 'zelena', 'zeleny', 'seda', 'sedy', 'stribrna', 'stribrny', 'zlata', 'zlaty', 'ruzova', 'ruzovy', 'fialova', 'cervena', 'cerveny', 'zluta', 'oranzova', 'black', 'white', 'blue', 'green', 'gray', 'grey', 'silver', 'gold', 'pink', 'purple', 'red', 'yellow', 'orange', 'navy', 'titanium', 'graphite', 'midnight', 'starlight', 'cosmic', 'deep', 'mist', 'sage', 'lavender', 'teal', 'ultramarine']);
export function buildSearchIndex(sources) {
  const rows = [];
  for (const src of sources) {
    for (const [name, price, url, ean] of src.items || []) {
      if (!name || !(price > 0)) continue;
      const tok = tokens(name);
      rows.push({ name, price, url: url || '', ean: ean || '', shop: src.shop, tok, set: new Set(tok) });
    }
  }
  return rows;
}
export function searchOffers(index, query, { limit = 20 } = {}) {
  const q = tokens(query).slice(0, 8);
  if (!q.length) return { groups: [], total: 0 };
  const wantsAccessory = q.some((t) => ACCESSORY.has(t));
  const last = q[q.length - 1];
  const full = q.slice(0, -1);
  const hits = [];
  for (const r of index) {
    // Všechna slova dotazu; poslední stačí jako začátek slova (hledání při psaní).
    if (!full.every((t) => r.set.has(t))) continue;
    if (!r.set.has(last) && !(last.length >= 2 && r.tok.some((t) => t.startsWith(last)))) continue;
    if (!wantsAccessory && r.tok.some((t) => ACCESSORY.has(t))) continue;
    hits.push(r);
  }
  const groups = new Map();
  for (const r of hits) {
    const key = r.ean || r.tok.filter((t) => !COLORS.has(t)).join('-');
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, name: r.name, ean: r.ean, offers: new Map(), extra: r.tok.length - q.length }));
    if (r.name.length < g.name.length) g.name = r.name;
    const cur = g.offers.get(r.shop);
    if (!cur || r.price < cur.price) g.offers.set(r.shop, { shop: r.shop, price: r.price, url: r.url, name: r.name });
  }
  const out = [...groups.values()].map((g) => {
    const offers = [...g.offers.values()].sort((a, b) => a.price - b.price);
    // Relevance: méně slov navíc, víc obchodů, shoda celé fráze na začátku názvu.
    const starts = tokens(g.name).slice(0, q.length).join(' ') === q.join(' ');
    return { name: g.name, ean: g.ean, minPrice: offers[0].price, maxPrice: offers[offers.length - 1].price, shops: offers.length, offers, score: (starts ? 5 : 0) + Math.min(offers.length, 6) - g.extra * 0.6 };
  });
  out.sort((a, b) => b.score - a.score || a.minPrice - b.minPrice);
  return { groups: out.slice(0, limit).map(({ score, ...g }) => g), total: out.length };
}

// ---------- Měsíční souhrn cen (všechna odvětví najednou) ----------
// Šablona: administrace stáhne seznam produktů, Claude doplní sloupce cena/zdroj/odkaz/datum/prodejci,
// soubor se nahraje zpět. Mění se jen ceny – pořadí v žebříčcích zůstává.
export const PRICE_SHEET_COLUMNS = ['id', 'odvětví', 'produkt', 'podtitul', 'jednotka', 'poslední cena', 'cena', 'zdroj', 'odkaz', 'datum', 'prodejci'];
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function priceSheetCsv(products, catName = (id) => id) {
  const lines = products
    .filter((p) => p.active !== false)
    .sort((a, b) => a.category.localeCompare(b.category) || (a.rank ?? 99) - (b.rank ?? 99))
    .map((p) => {
      const l = (p.prices || []).filter((x) => x && x.p != null).at(-1);
      return [p.id, catName(p.category), p.name, p.subtitle || '', p.unit || 'Kč', l ? `${String(l.p).replace('.', ',')}${p.sample ? ' (ukázka)' : ` (${l.d})`}` : '', '', '', '', '', ''].map(csvCell).join(';');
    });
  return '﻿' + [PRICE_SHEET_COLUMNS.join(';'), ...lines].join('\r\n') + '\r\n';
}

const normKey = (k) => String(k).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const httpUrl = (u) => (/^https?:\/\/[^\s"<>]+$/i.test(String(u || '').trim()) ? String(u).trim().slice(0, 600) : '');
const isoDate = (v) => {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};
// Prodejci: „Alza=32490|Datart=32990“, volitelně s odkazem „Alza=32490=https://…“.
export function parseShops(text) {
  return String(text || '')
    .split('|')
    .map((x) => {
      const [name, price, ...url] = x.split('=');
      return { name: String(name || '').trim().slice(0, 60), price: parseNum(price), url: httpUrl(url.join('=')) };
    })
    .filter((x) => x.name && x.price > 0)
    .slice(0, 8);
}
export function parsePriceSheet(text) {
  const rows = csvRows(text);
  const out = [];
  for (const r of rows) {
    const g = {};
    for (const [k, v] of Object.entries(r)) g[normKey(k)] = v;
    const id = String(g.id || '').trim();
    const price = parseNum(g.cena ?? g.price);
    if (!id || !(price > 0)) continue;
    out.push({ id, name: g.produkt || '', price, source: String(g.zdroj || '').trim().slice(0, 80), url: httpUrl(g.odkaz || g.url), date: isoDate(g.datum), shops: parseShops(g.prodejci) });
  }
  return out;
}

// Zapíše nalezenou cenu (souhrn nebo AI agent): bod historie, prodejci, zdroj s odkazem.
// U ukázkového produktu zahodí vymyšlenou historii i prodejce – od teď jen skutečné ceny.
const dateCz = (d) => d.split('-').reverse().map((x, i) => (i < 2 ? String(+x) : x)).join('. ');
export function applyFoundPrice(p, { price, shops = [], label, sourceName = '', url = '', date = '' }) {
  const fake = !!p.sample;
  const competitors = fake ? [] : (p.competitors || []).map((c) => ({ ...c }));
  for (const s of shops) {
    const i = competitors.findIndex((c) => c.name.toLowerCase() === s.name.toLowerCase());
    const old = i >= 0 ? competitors[i] : { name: s.name, url: '', prices: [] };
    const next = { ...old, url: s.url || old.url, prices: addPoint(old.prices || [], s.price) };
    if (i >= 0) competitors[i] = next;
    else competitors.push(next);
  }
  return {
    ...p,
    prices: addPoint(fake ? [] : p.prices || [], price),
    competitors,
    sample: false,
    source: `${label}${sourceName ? `: ${sourceName}` : ''}, ${dateCz(date || todayIso())}`,
    sourceUrl: url || '',
    updatedAt: new Date().toISOString(),
  };
}
export function applyPriceSheet(products, rows) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const updated = [];
  const unknown = [];
  const seen = new Set();
  for (const r of rows) {
    const p = byId.get(r.id);
    if (!p || seen.has(r.id)) {
      if (!p) unknown.push(r.id);
      continue;
    }
    seen.add(r.id);
    updated.push(applyFoundPrice(p, { price: r.price, shops: r.shops || [], label: 'Měsíční souhrn cen', sourceName: r.source, url: r.url, date: r.date }));
  }
  return { updated, unknown };
}
