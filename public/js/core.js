// Společný stav, formátování, odkazy a drobné UI pomůcky.
import { CATEGORIES, GROUPS, categoryById } from '../lib/categories.js';
import { summarize, analyzeFull, buyScore, minMax, discountCheck, seasonality } from '../lib/analytics.js';
import { affiliate } from '../lib/dataops.js';
import { t, lang, locale } from './i18n.js';

export const S = {
  data: null, // { mode, meta, settings, products, seasons }
  sum: new Map(),
  full: new Map(),
  config: null,
  user: null, // { uid, email, name } po přihlášení
  profile: null, // uživatelská data ze serveru
  standalone: false, // samostatná HTML verze
  hash: location.protocol === 'file:',
  redraw: null,
};

// ---------- Úložiště v prohlížeči ----------
export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('pm-' + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('pm-' + k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
};

// ---------- Formátování ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const nf = (d, min = d) => new Intl.NumberFormat(locale(), { maximumFractionDigits: d, minimumFractionDigits: min });
export const decimals = (v) => (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
export const compact = (v) => new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: Math.abs(v) < 10 ? 2 : 1 }).format(v);

export const CURRENCIES = { CZK: 'Kč', EUR: '€', USD: '$' };
export const currency = () => store.get('currency', 'CZK');
export function rates() {
  return S.data?.meta?.rates || { USD: 21.2, EUR: 24.4 };
}
// Převod částky v Kč do zvolené měny (jen pro jednotky začínající „Kč“).
export function conv(v, unit = 'Kč') {
  const cur = currency();
  if (v == null || cur === 'CZK' || !String(unit || 'Kč').startsWith('Kč')) return { v, unit: unit || 'Kč' };
  const r = rates()[cur];
  if (!r) return { v, unit };
  return { v: v / r, unit: String(unit || 'Kč').replace(/^Kč/, CURRENCIES[cur]) };
}
export function money(v, unit = 'Kč', noUnit = false) {
  if (v == null || !Number.isFinite(v)) return '—';
  const c = conv(v, unit);
  const n = nf(decimals(c.v), 0).format(c.v);
  if (noUnit) return n;
  return `${n} ${esc(c.unit)}`;
}
export const unitOf = (unit) => conv(1, unit).unit;
export function pct(v, withSign = true) {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = nf(1).format(Math.abs(v)) + ' %';
  if (!withSign) return s;
  return (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + s;
}
export const pctClass = (v) => (v == null ? 'chg-flat' : v > 0.5 ? 'chg-up' : v < -0.5 ? 'chg-down' : 'chg-flat');
export const dateFmt = (d, opts = { day: 'numeric', month: 'numeric', year: 'numeric' }) =>
  d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString(locale(), opts) : '—';
export const monthName = (m, style = 'long') => new Date(Date.UTC(2026, m, 15)).toLocaleDateString(locale(), { month: style });

// ---------- Odvětví ----------
export const catName = (c) => (c ? (lang() === 'en' ? c.en : c.name) : '');
export const catNote = (c) => (lang() === 'en' ? c.sourceNoteEn : c.sourceNote);
export const catPriceLabel = (c) => (lang() === 'en' ? c.priceLabelEn : c.priceLabel);
export const catDemandLabel = (c) => (lang() === 'en' ? c.demandLabelEn : c.demandLabel);
export const groupName = (g) => (lang() === 'en' ? g.en : g.name);
export { CATEGORIES, GROUPS, categoryById };

// ---------- Produkty ----------
export function sum(p) {
  if (!S.sum.has(p.id)) {
    const s = summarize(p);
    if (s.ch365 == null && p.stats?.ch365 != null) s.ch365 = p.stats.ch365;
    S.sum.set(p.id, s);
  }
  return S.sum.get(p.id);
}
// Nákupní pohled na produkt: skóre Kup teď / Počkej, roční rozpětí, slevy, sezónnost.
// U lehkých dat (130 dní) se rozpětí, slevy a sezónnost berou z p.stats, které spočítal server z celé historie.
const INSIGHT = new WeakMap(); // klíč = objekt souhrnu, takže se po úpravě dat (S.sum.clear()) přepočítá samo
export function insight(p) {
  const s = sum(p);
  if (INSIGHT.has(s)) return INSIGHT.get(s);
  const c = categoryById(p.category);
  const consumer = c?.kind !== 'investicni';
  const long = s.history.length > 1 && Date.parse(s.history[s.history.length - 1].d) - Date.parse(s.history[0].d) > 300 * 86400000;
  const r = long ? minMax(s.history, 365) : null;
  const min = r ? r.min.p : p.stats?.min365 ?? minMax(s.history, 365)?.min.p ?? null;
  const max = r ? r.max.p : p.stats?.max365 ?? minMax(s.history, 365)?.max.p ?? null;
  const discount = consumer ? (p.stats?.discount !== undefined && !long ? p.stats.discount : discountCheck(s.history)) : null;
  const own = consumer ? (long ? seasonality(s.history) : p.stats?.season || null) : null;
  const catSeason = consumer ? (S.data.seasons || {})[p.category] || null : null;
  const season = own && own.amplitude >= (catSeason?.amplitude ?? 0) * 0.5 ? own : catSeason || own;
  const score = consumer && !p.free ? buyScore({ price: s.price, forecast: s.forecast, trend: s.trend, min, max, discount, season }) : null;
  const out = { score, min, max, discount, season, consumer };
  INSIGHT.set(s, out);
  return out;
}

export const productById = (id) => S.data.products.find((p) => p.id === id);
export const byCat = (id) => S.data.products.filter((p) => p.category === id && p.active !== false && p.rank).sort((a, b) => a.rank - b.rank);
export const allRanked = () => S.data.products.filter((p) => p.active !== false && p.rank);

// Plná historie produktu (u živých dat se stahuje až pro detail).
export async function fullProduct(id) {
  const p = productById(id);
  if (p && p.full !== false) return p;
  if (S.full.has(id)) return S.full.get(id);
  try {
    const r = await fetch(`/api/data?id=${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(r.status);
    const full = (await r.json()).product;
    S.full.set(id, full);
    return full;
  } catch {
    return p;
  }
}

const FULL_CACHE = new Map();
export function analysis(p) {
  const key = p.id + ':' + (p.prices?.length || 0) + ':' + (p.prices?.at?.(-1)?.p ?? '');
  if (!FULL_CACHE.has(key)) FULL_CACHE.set(key, analyzeFull(p, { seasonal: categoryById(p.category)?.kind !== 'investicni' }));
  return FULL_CACHE.get(key);
}

export function priceText(p, s) {
  if (p.free) return t('Zdarma');
  return money(s.price, p.unit);
}

// Bezpečný odkaz: jen http(s). Odkazy pocházejí i z cizích feedů e-shopů, takže „javascript:…“ se nesmí dostat do href.
export function safeHref(u) {
  try {
    const url = new URL(String(u || ''), location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}
export const affiliateUrl = (url) => safeHref(affiliate(safeHref(url), S.data?.settings?.affiliates || []));

// ---------- Odkazy a navigace ----------
export const link = (path) => (S.hash ? '#' + path : path);
export const productLink = (id) => link(`/produkt/${encodeURIComponent(id)}`);
export const catLink = (id) => link(`/kategorie/${id}`);
// Navigace s historií: u každého záznamu si pamatuje pozici scrollu (obnoví se tlačítkem Zpět).
const scrollKey = () => history.state?.k;
export function saveScroll() {
  const k = scrollKey();
  if (!k) return;
  try {
    const m = JSON.parse(sessionStorage.getItem('pm-scroll') || '{}');
    m[k] = window.scrollY;
    const keys = Object.keys(m);
    if (keys.length > 80) delete m[keys[0]];
    sessionStorage.setItem('pm-scroll', JSON.stringify(m));
  } catch {}
}
export function savedScroll() {
  try {
    return JSON.parse(sessionStorage.getItem('pm-scroll') || '{}')[scrollKey()] ?? null;
  } catch {
    return null;
  }
}
const newKey = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function navigate(path, replace = false, opts = {}) {
  S.navOpts = opts;
  if (S.hash) {
    if (replace) history.replaceState({ k: history.state?.k || newKey() }, '', '#' + path);
    else {
      saveScroll();
      history.pushState({ k: newKey() }, '', '#' + path);
    }
    window.dispatchEvent(new Event('pm-route'));
    return;
  }
  if (replace) history.replaceState({ k: history.state?.k || newKey() }, '', path);
  else {
    saveScroll();
    history.pushState({ k: newKey() }, '', path);
  }
  window.dispatchEvent(new Event('pm-route'));
}

// Změní jen parametry v adrese (filtry, výběr) bez nového záznamu v historii a bez překreslení.
export function setQuery(params) {
  const [path, qs = ''] = currentPath().split('?');
  const q = new URLSearchParams(qs);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '' || v === false) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  const url = path + (s ? '?' + s : '');
  history.replaceState(history.state, '', S.hash ? '#' + url : url);
}
export function currentPath() {
  if (S.hash) return (location.hash.replace(/^#/, '') || '/');
  return location.pathname + location.search;
}

// ---------- Trendy, štítky ----------
export const ARROW = {
  roste: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2l4 5H7v3H5V7H2z" fill="currentColor"/></svg>',
  klesa: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10L2 5h3V2h2v3h3z" fill="currentColor"/></svg>',
  drzi: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 5h8v2H2z" fill="currentColor"/></svg>',
};
ARROW.neznamy = ARROW.drzi;
export const chip = (tr) => `<span class="chip ${tr.dir}">${ARROW[tr.dir]}${esc(t(tr.label))}</span>`;

export function rankMove(p) {
  if (p.prevRank == null) return S.data.mode === 'live' ? `<span class="move new">${t('nové')}</span>` : '';
  const d = p.prevRank - p.rank;
  if (d > 0) return `<span class="move up" title="${esc(t('Posun nahoru o {n}', { n: d }))}">▲ ${d}</span>`;
  if (d < 0) return `<span class="move down" title="${esc(t('Posun dolů o {n}', { n: -d }))}">▼ ${-d}</span>`;
  return `<span class="move" title="${esc(t('Beze změny pořadí'))}">=</span>`;
}

export const ICON = {
  burger: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  photo: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/></svg>',
  compare: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 4v16M16 4v16M4 8h8M12 16h8"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.4 3.8 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.2 0 5.4 2.9 4.2 6.2C19.5 15.4 12 20 12 20z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M12 8v5M12 16v.5"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M4 7l11-3v3M16 13.5h2"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z" fill="currentColor"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15l3-3 3 3 2-2 3 3"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6 8.5-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

// ---------- Toast ----------
export function toast(msg, tone = 'info', ms = 4000) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.innerHTML = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

// ---------- Soubory ----------
export function downloadFile(name, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// CSV s BOM, aby ho Excel otevřel s diakritikou.
export function toCsv(rows) {
  const cell = (v) => {
    const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

export const slugFile = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- Rozvržení stránky: hero na fotce + obsahový list ----------
export function hero({ crumb = '', eyebrow = '', title = '', lead = '', aside = '', below = '', size = '', titleAttrs = '' }) {
  return `<section class="hero ${size}">
    <div class="hero-in">
      <div class="hero-main">
        ${crumb ? `<nav class="crumb" aria-label="${esc(t('Drobečková navigace'))}">${crumb}</nav>` : ''}
        ${eyebrow ? `<p class="eyebrow on-photo">${eyebrow}</p>` : ''}
        <h1 class="hero-title" tabindex="-1" ${titleAttrs}>${title}</h1>
        ${lead ? `<p class="hero-lead">${lead}</p>` : ''}
        ${below}
      </div>
      ${aside ? `<div class="hero-aside">${aside}</div>` : ''}
    </div>
    <p class="credit" id="photo-credit" hidden></p>
  </section>`;
}
export const sheet = (html, cls = '') => `<div class="sheet ${cls}"><div class="sheet-in">${html}</div></div>`;

// ---------- Skóre Kup teď / Počkej ----------
// Kruhový ukazatel 0–100; barva podle doporučení. Tooltip vysvětlí nejsilnější důvod.
export function scoreBadge(sc, { size = '', tip = true } = {}) {
  if (!sc) return `<span class="score none ${size}" ${tip ? `data-tip="${esc(t('Na skóre je zatím málo dat.'))}"` : ''}><b>–</b></span>`;
  const why = sc.reasons[0] ? t(sc.reasons[0].key, sc.reasons[0].params) : '';
  return `<span class="score ${sc.tone} ${size}" style="--v:${sc.score}" ${tip ? `data-tip="${esc(`${t(sc.label)} (${sc.score}/100). ${why}`)}" tabindex="0"` : ''} aria-label="${esc(t('Skóre nákupu {n} ze 100: {l}', { n: sc.score, l: t(sc.label) }))}"><b>${sc.score}</b></span>`;
}
// Kdy koupit (krátký text): „teď“, „do 30 dní“, „v prosinci“.
export function scoreWhen(sc, unit = 'Kč') {
  if (!sc) return '';
  if (sc.tone === 'buy') return t('Teď je dobrá chvíle');
  if (sc.when?.type === 'days') return t('Do 30 dní může klesnout na {p}', { p: money(sc.when.price, unit) });
  if (sc.when?.type === 'month') return t('Nejlevněji bývá v měsíci {m}', { m: monthName(sc.when.month) });
  return sc.tone === 'wait' ? t('Počkej na lepší cenu') : t('Na načasování moc nezáleží');
}
