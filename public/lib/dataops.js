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
const decode = (s) =>
  String(s ?? '')
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();
const tag = (block, names) => {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i'));
    if (m) return decode(m[1]);
  }
  return '';
};

// Podporuje Heureka XML (SHOPITEM), Google Merchant (item/entry s g:…) a CSV „název;cena;odkaz;ean“.
export function parseFeed(text) {
  const items = [];
  const src = String(text);
  if (/<SHOPITEM/i.test(src)) {
    for (const m of src.matchAll(/<SHOPITEM[\s>][\s\S]*?<\/SHOPITEM>/gi)) {
      const b = m[0];
      const price = parseNum(tag(b, ['PRICE_VAT', 'PRICE']));
      const name = tag(b, ['PRODUCTNAME', 'PRODUCT']);
      if (name && price) items.push({ name, price, url: tag(b, ['URL']), ean: tag(b, ['EAN']) });
    }
  } else if (/<(item|entry)[\s>]/i.test(src)) {
    for (const m of src.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)) {
      const b = m[0];
      const price = parseNum(tag(b, ['g:sale_price', 'g:price', 'price']).replace(/[A-Z]{3}/, ''));
      const name = tag(b, ['g:title', 'title']);
      if (name && price) items.push({ name, price, url: tag(b, ['g:link', 'link']), ean: tag(b, ['g:gtin', 'gtin']) });
    }
  } else {
    for (const line of src.split(/\r?\n/)) {
      const c = line.split(/[;\t]/).map((x) => x.trim().replace(/^"|"$/g, ''));
      const price = parseNum(c[1]);
      if (c[0] && price) items.push({ name: c[0], price, url: c[2] || '', ean: c[3] || '' });
    }
  }
  return items;
}

const tokens = (s) => slug(s).split('-').filter((t) => t.length > 0);

// Najde položku feedu odpovídající produktu (EAN, jinak shoda slov včetně všech čísel z názvu).
export function matchFeedItem(product, items) {
  const ean = product.attrs?.ean;
  if (ean) {
    const hit = items.filter((i) => i.ean && i.ean === ean);
    if (hit.length) return hit.reduce((a, b) => (b.price < a.price ? b : a));
  }
  const want = tokens(`${product.name} ${product.subtitle || ''}`);
  const nameTok = tokens(product.name);
  const nums = want.filter((t) => /\d/.test(t));
  let best = null;
  for (const it of items) {
    const have = new Set(tokens(it.name));
    if (!nums.every((n) => have.has(n))) continue;
    const coverName = nameTok.filter((t) => have.has(t)).length / nameTok.length;
    if (coverName < 1) continue;
    const cover = want.filter((t) => have.has(t)).length / want.length;
    if (cover < 0.7) continue;
    if (!best || cover > best.cover || (cover === best.cover && it.price < best.item.price)) best = { item: it, cover };
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
