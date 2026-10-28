// BuyWise – start aplikace, hlavička, drawery, vyhledávání, router s přechody.
import {
  S, store, CATEGORIES, GROUPS, categoryById, catName, groupName, esc, link, catLink, productLink, navigate, currentPath, ICON, CURRENCIES, currency,
  sum, priceText, savedScroll, saveScroll, fullProduct, productById, safeHref, money,
} from './js/core.js';
import { t, lang, setLang } from './js/i18n.js';
import { hideTip as hideChartTip } from './js/chart.js';
import { favs, cmp, wish, initAuth, login, logout, authAvailable, checkLocalAlerts, checkWishes } from './js/user.js';
import { action, resetActions, installClickHandler, installTooltips, openDrawer, closeDrawer, drawerOpen, accordion, announce, transition, shareElement, hideTip, reducedMotion } from './js/ui.js';
import { setBackdrop, homePhotos, categoryPhotos, productPhotos, groupOf, refreshCredit } from './js/photos.js';
import { renderHome } from './js/views/home.js';
import { startTour, tourDone, homeSteps } from './js/tour.js';
import { renderCategory } from './js/views/category.js';
import { renderProduct } from './js/views/product.js';
import { renderCompare } from './js/views/compare.js';
import { renderFavorites } from './js/views/favorites.js';
import { renderPortfolio } from './js/views/portfolio.js';
import { renderStatus } from './js/views/status.js';
import { renderAdmin } from './js/views/admin.js';
import { renderWishlist } from './js/views/wishlist.js';
import { renderCalendar } from './js/views/calendar.js';
import { renderDeals } from './js/views/deals.js';
import { renderBudget } from './js/views/budget.js';
import { renderSearch, trackedMatches, fetchOffers } from './js/views/search.js';
import { seasonality, categorySeasonality, clean } from './lib/analytics.js';
import { demoProducts, DEMO_RATES } from './lib/seed.js';

const $main = document.getElementById('main');
const $header = document.getElementById('header');
const $banner = document.getElementById('banner');
let installPrompt = null;

// ---------- Data ----------
async function loadData() {
  try {
    const r = await fetch('/api/data', { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    if (!Array.isArray(j.products)) throw new Error('bad');
    return j;
  } catch {
    return { mode: 'demo', meta: { rates: DEMO_RATES }, settings: {}, products: demoProducts() };
  }
}

async function loadConfig() {
  try {
    const r = await fetch('/api/data?view=config');
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function computeSeasons() {
  if (S.data.seasons) return;
  const out = {};
  for (const c of CATEGORIES) {
    if (c.kind === 'investicni') continue;
    const s = categorySeasonality(S.data.products.filter((p) => p.category === c.id && p.rank).map((p) => seasonality(clean(p.prices))));
    if (s) out[c.id] = s;
  }
  S.data.seasons = out;
}

// ---------- Vzhled ----------
function applyTheme() {
  const th = store.get('theme', 'auto');
  if (th === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = th;
}

// Chytré nástroje BuyWise (v záložkách, menu i na přehledu).
export const TOOLS = [
  ['wish', '/prani', 'heart', 'Seznam přání'],
  ['calendar', '/kalendar', 'calendar', 'Nákupní kalendář'],
  ['deals', '/pozor', 'shield', 'Pozor na akce'],
  ['budget', '/rozpocet', 'wallet', 'Rozpočet'],
];

// ---------- Hlavička ----------
function renderHeader(route) {
  const favN = favs.list().length;
  const wishN = wish.list().length;
  $header.innerHTML = `
    <div class="top-inner">
      <button type="button" class="icon-btn only-mobile" data-action="open-nav" aria-label="${esc(t('Odvětví'))}" data-tip="${esc(t('Odvětví'))}">${ICON.burger}</button>
      <a class="brand" href="${link('/')}" aria-label="${esc(t('BuyWise – přehled'))}">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 7q0-2 2-2h15l9 11-9 11H5q-2 0-2-2z" fill="#FFC929"/><circle cx="10" cy="15" r="3.4" fill="#16222B"/><circle cx="17" cy="15" r="3.4" fill="#16222B"/><circle cx="10.9" cy="14.2" r="1.1" fill="#FFC929"/><circle cx="17.9" cy="14.2" r="1.1" fill="#FFC929"/><path d="M12.4 19h2.2l-1.1 2.2z" fill="#16222B"/></svg>
        <span class="brand-word">Buy<b>Wise</b></span>
      </a>
      <div class="search" role="search">
        <span class="search-ico">${ICON.search}</span>
        <input id="q" type="search" autocomplete="off" placeholder="${esc(t('Hledat jakýkoli produkt a jeho ceny…'))}" aria-label="${esc(t('Hledat'))}" aria-controls="qres" aria-expanded="false" aria-autocomplete="list">
        <kbd class="kbd" aria-hidden="true">/</kbd>
        <div id="qres" class="qres" role="listbox" hidden></div>
      </div>
      <nav class="tools" aria-label="${esc(t('Nástroje'))}">
        <a class="icon-btn" href="${link('/prani')}" aria-label="${esc(t('Seznam přání'))}" data-tip="${esc(t('Seznam přání'))}" ${route.name === 'wish' ? 'aria-current="page"' : ''}>${ICON.heart}${wishN ? `<span class="badge">${wishN}</span>` : ''}</a>
        <a class="icon-btn" href="${link('/oblibene')}" aria-label="${esc(t('Oblíbené a hlídače'))}" data-tip="${esc(t('Oblíbené a hlídače'))}" ${route.name === 'fav' ? 'aria-current="page"' : ''}>${ICON.star}${favN ? `<span class="badge">${favN}</span>` : ''}</a>
        <a class="icon-btn" href="${link('/portfolio')}" aria-label="${esc(t('Portfolio'))}" data-tip="${esc(t('Portfolio'))}" ${route.name === 'portfolio' ? 'aria-current="page"' : ''}>${ICON.briefcase}</a>
        <button type="button" class="icon-btn" data-action="open-settings" aria-label="${esc(t('Nastavení'))}" data-tip="${esc(t('Nastavení'))}">${S.user?.photo ? `<img class="avatar" src="${esc(S.user.photo)}" alt="">` : ICON.menu}</button>
      </nav>
    </div>
    <nav class="tabs" aria-label="${esc(t('Odvětví'))}">
      <a href="${link('/')}" ${route.name === 'home' ? 'aria-current="page"' : ''}>${t('Přehled')}</a>
      ${TOOLS.map(([name, path, icon, label]) => `<a class="tab-tool" href="${link(path)}" ${route.name === name ? 'aria-current="page"' : ''}>${ICON[icon]}${t(label)}</a>`).join('')}
      ${GROUPS.map((g) => `<span class="tab-group" aria-hidden="true">${esc(groupName(g))}</span>` + CATEGORIES.filter((c) => c.group === g.id).map((c) => `<a href="${catLink(c.id)}" data-prefetch-cat="${c.id}" ${route.cat === c.id ? 'aria-current="page"' : ''}>${esc(catName(c))}</a>`).join('')).join('')}
    </nav>`;
  bindSearch();
  // Aktivní záložku posunout do viditelné části.
  const cur = $header.querySelector('.tabs [aria-current="page"]');
  if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' in window ? 'instant' : 'auto' });
}

// ---------- Drawer: nastavení ----------
function settingsHtml() {
  const seg = (name, items, cur) => `<span class="seg">${items.map(([k, l]) => `<button type="button" data-action="${name}" data-v="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</span>`;
  return `
    <div class="set-row"><span>${t('Jazyk')}</span>${seg('set-lang', [['cs', 'Čeština'], ['en', 'English']], lang())}</div>
    <div class="set-row"><span>${t('Měna')}</span>${seg('set-cur', Object.entries(CURRENCIES), currency())}</div>
    <div class="set-row"><span>${t('Vzhled')}</span>${seg('set-theme', [['auto', t('Auto')], ['light', t('Světlý')], ['dark', t('Tmavý')]], store.get('theme', 'auto'))}</div>
    <div class="set-row"><span>${t('Pohyb na pozadí')}</span>${seg('set-motion', [['on', t('Zapnuto')], ['off', t('Vypnuto')]], store.get('motion', 'on'))}</div>
    ${!S.standalone && authAvailable() ? `<div class="set-row">${S.user ? `<span>${esc(S.user.email)}</span><button type="button" class="btn alt" data-action="logout">${t('Odhlásit')}</button>` : `<span>${t('Účet')}</span><button type="button" class="btn" data-action="open-login">${t('Přihlásit se')}</button>`}</div>` : ''}
    <ul class="drawer-links">
      ${TOOLS.map(([, path, icon, label]) => `<li><a href="${link(path)}">${ICON[icon]}${t(label)}</a></li>`).join('')}
      <li><a href="${link('/porovnat')}">${ICON.compare}${t('Porovnání produktů')}</a></li>
      <li><a href="${link('/oblibene')}">${ICON.star}${t('Oblíbené a hlídače')}</a></li>
      <li><a href="${link('/portfolio')}">${ICON.briefcase}${t('Portfolio')}</a></li>
      <li><a href="${link('/stav')}">${ICON.info}${t('Stav dat a přesnost odhadů')}</a></li>
      ${installPrompt ? `<li><button type="button" class="btn link" data-action="install">${ICON.download}${t('Nainstalovat jako aplikaci')}</button></li>` : ''}
      <li><a href="${link('/admin')}">${ICON.sliders}${S.standalone ? t('Úpravy dat') : t('Administrace')}</a></li>
    </ul>
    <button type="button" class="btn alt wide" data-action="start-tour">${ICON.play}${t('Spustit úvodní prohlídku')}</button>
    <p class="note">${t('Klávesové zkratky: / hledání, Esc zavře panel, šipky v žebříčku mění výběr.')}</p>`;
}
const openSettings = () => openDrawer({ id: 'settings', side: 'right', title: t('Nastavení'), html: settingsHtml(), label: t('Zavřít') });
const refreshSettings = () => {
  const body = document.querySelector('#settings .drawer-body');
  if (!body) return;
  // Zachovat fokus na právě zvoleném tlačítku (klávesnice) i po překreslení.
  const f = document.activeElement?.dataset;
  body.innerHTML = settingsHtml();
  document.getElementById('settings-title').textContent = t('Nastavení');
  document.querySelector('#settings .drawer-head [data-action="drawer-close"]')?.setAttribute('aria-label', t('Zavřít'));
  if (f?.action) body.querySelector(`[data-action="${f.action}"][data-v="${f.v}"]`)?.focus();
};

// ---------- Drawer: navigace (mobil) ----------
function navHtml(route) {
  return `<a class="nav-home" href="${link('/')}" ${route.name === 'home' ? 'aria-current="page"' : ''}>${t('Přehled')}</a>
    <ul class="nav-tools">${TOOLS.map(([name, path, icon, label]) => `<li><a href="${link(path)}" ${route.name === name ? 'aria-current="page"' : ''}>${ICON[icon]}<span>${t(label)}</span></a></li>`).join('')}</ul>
    <div class="acc-list">${GROUPS.map((g) =>
      accordion({
        title: esc(groupName(g)),
        group: 'nav',
        open: route.cat ? categoryById(route.cat)?.group === g.id : g.id === 'nakupy',
        body: `<ul class="nav-list">${CATEGORIES.filter((c) => c.group === g.id)
          .map((c) => {
            const top = S.data.products.filter((p) => p.category === c.id && p.rank === 1)[0];
            return `<li><a href="${catLink(c.id)}" ${route.cat === c.id ? 'aria-current="page"' : ''}><span>${esc(catName(c))}</span><small>${top ? esc(top.name) : ''}</small></a></li>`;
          })
          .join('')}</ul>`,
      })
    ).join('')}</div>`;
}

// ---------- Globální akce (jediný click handler je v ui.js) ----------
action('open-settings', openSettings);
action('open-nav', () => openDrawer({ id: 'nav', side: 'left', title: t('Odvětví'), html: navHtml(parseRoute()), label: t('Zavřít') }));
action('set-lang', (el) => {
  setLang(el.dataset.v);
  refreshSettings();
  route({ soft: true });
});
action('set-cur', (el) => {
  store.set('currency', el.dataset.v);
  refreshSettings();
  route({ soft: true });
});
action('set-theme', (el) => {
  store.set('theme', el.dataset.v);
  applyTheme();
  refreshSettings();
  S.redraw && S.redraw();
});
action('set-motion', (el) => {
  store.set('motion', el.dataset.v);
  document.documentElement.dataset.motion = el.dataset.v;
  refreshSettings();
});
action('logout', () => {
  closeDrawer();
  logout();
});
action('install', async () => {
  closeDrawer();
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
});
action('tray-clear', () => {
  cmp.set([]);
  renderTray(parseRoute());
});
action('reload', () => location.reload());
action('start-tour', async () => {
  closeDrawer({ keepFocus: true });
  if (parseRoute().name !== 'home') {
    navigate('/');
    await new Promise((r) => setTimeout(r, 700));
  }
  startTour(homeSteps());
});

// ---------- Vyhledávání ----------
function bindSearch() {
  const q = $header.querySelector('#q');
  const res = $header.querySelector('#qres');
  let active = -1;
  const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const close = () => {
    res.hidden = true;
    q.setAttribute('aria-expanded', 'false');
    q.removeAttribute('aria-activedescendant');
  };
  let timer = null;
  let token = 0;
  const label = (txt) => `<p class="q-label">${txt}</p>`;
  const search = () => {
    const raw = q.value.trim();
    const term = norm(raw);
    active = -1;
    clearTimeout(timer);
    if (term.length < 2) return close();
    const hits = trackedMatches(raw, 5);
    const tracked = hits
      .map((p, i) => {
        const s = sum(p);
        return `<a role="option" id="qo${i}" href="${productLink(p.id)}" data-prefetch="${esc(p.id)}"><span class="q-tag tag ${p.rank ? '' : 'dim'}">${p.rank || '–'}</span><span class="q-txt"><span class="nm">${esc(p.name)}</span><span class="muted small">${esc(catName(categoryById(p.category)))}</span></span><span class="pr">${priceText(p, s)}</span></a>`;
      })
      .join('');
    const all = `<a role="option" id="qo-all" class="q-all" href="${link('/hledat?q=' + encodeURIComponent(raw))}">${ICON.search}<span>${t('Ceny „{q}“ ve všech obchodech', { q: esc(raw) })}</span>${ICON.arrow}</a>`;
    res.innerHTML = (hits.length ? label(t('Sledované produkty')) + tracked : '') + `<div id="qshops">${term.length >= 3 ? label(t('V obchodech')) + '<p class="q-wait">…</p>' : ''}</div>` + all;
    res.hidden = false;
    q.setAttribute('aria-expanded', 'true');
    // Nabídky obchodů se dotáhnou se zpožděním (až uživatel dopíše).
    if (term.length < 3) return;
    const my = ++token;
    timer = setTimeout(async () => {
      const r = await fetchOffers(raw, 4);
      if (my !== token || res.hidden) return;
      const box = res.querySelector('#qshops');
      if (!box) return;
      box.innerHTML = r.groups?.length
        ? label(t('V obchodech')) +
          r.groups
            .slice(0, 4)
            .map((g, i) => `<a role="option" id="qs${i}" href="${link('/hledat?q=' + encodeURIComponent(g.name))}"><span class="q-shops">${g.shops}×</span><span class="q-txt"><span class="nm">${esc(g.name)}</span><span class="muted small">${g.shops > 1 ? t('{n} obchodů', { n: g.shops }) : esc(g.offers[0].shop)}</span></span><span class="pr"><small>${t('od')}</small> ${money(g.minPrice)}</span></a>`)
            .join('')
        : '';
    }, 280);
  };
  q.addEventListener('input', search);
  q.addEventListener('focus', search);
  q.addEventListener('keydown', (e) => {
    const opts = [...res.querySelectorAll('[role=option]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!opts.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.setAttribute('aria-selected', i === active));
      q.setAttribute('aria-activedescendant', opts[active].id);
      opts[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      // Enter bez výběru šipkami → stránka s cenami ve všech obchodech.
      const o = opts[active];
      const raw = q.value.trim();
      if (o || raw.length >= 2) {
        e.preventDefault();
        close();
        q.value = '';
        q.blur();
        navigate(o ? o.getAttribute('href').replace(/^#/, '') : '/hledat?q=' + encodeURIComponent(raw));
      }
    } else if (e.key === 'Escape') {
      close();
      q.blur();
    }
  });
}

// ---------- Lišta porovnání ----------
function renderTray(route) {
  let tray = document.getElementById('tray');
  const ids = cmp.list();
  if (!ids.length || route.name === 'compare' || route.name === 'admin') {
    tray?.classList.add('out');
    setTimeout(() => tray?.remove(), 250);
    return;
  }
  if (!tray) {
    tray = document.createElement('div');
    tray.id = 'tray';
    tray.className = 'tray';
    document.getElementById('app').appendChild(tray);
  }
  tray.classList.remove('out');
  const names = ids.map((id) => productById(id)?.name).filter(Boolean);
  tray.innerHTML = `<span>${ICON.compare}<strong>${t('Porovnání')} (${ids.length})</strong> <span class="muted">${esc(names.join(', '))}</span></span><a class="btn" href="${link('/porovnat')}">${t('Porovnat')}</a><button type="button" class="icon-btn" data-action="tray-clear" aria-label="${esc(t('Vyprázdnit porovnání'))}" data-tip="${esc(t('Vyprázdnit porovnání'))}">${ICON.close}</button>`;
}

function renderBanner() {
  const m = S.data.mode;
  const txt = S.standalone
    ? S.data.edited
      ? `<strong>${t('Samostatná HTML verze.')}</strong> ${t('Zobrazují se data uložená v tomto prohlížeči.')}`
      : `<strong>${t('Samostatná HTML verze s ukázkovými daty.')}</strong> ${t('Ceny a historie jsou vygenerované. Vlastní data přidáš v sekci Úpravy dat, živá data má verze na Vercelu.')}`
    : m === 'demo'
    ? `<strong>${t('Ukázková data.')}</strong> ${t('Ceny a historie jsou vygenerované pro náhled. Po připojení Firebase se zobrazí skutečná data.')}`
    : m === 'db-error'
    ? `<strong>${t('Databázi se nepodařilo načíst.')}</strong> ${t('Zobrazují se ukázková data. Správce: v Administraci uvidíš, které nastavení na Vercelu je špatně.')}`
    : m === 'empty'
    ? `<strong>${t('Databáze je zatím prázdná.')}</strong> ${t('V administraci klikni na „Naplnit výchozími daty“ a „Aktualizovat živá data“.')}`
    : '';
  $banner.className = txt ? 'banner' : '';
  $banner.innerHTML = txt ? `<div>${txt}</div>` : '';
  const meta = S.data.meta;
  const foot = document.getElementById('foot-meta');
  if (foot)
    foot.textContent = meta?.finishedAt
      ? t('Živá data aktualizována {d}.', { d: new Date(meta.finishedAt).toLocaleString(lang() === 'en' ? 'en-GB' : 'cs-CZ') }) + (meta.rates?.USD ? ` ${t('Kurz ČNB {r} Kč za USD.', { r: meta.rates.USD.toFixed(3) })}` : '')
      : '';
  const sp = S.data.settings?.sponsor;
  const spEl = document.getElementById('foot-sponsor');
  if (spEl) spEl.innerHTML = sp?.text ? `${t('Partner:')} ${safeHref(sp.url) ? `<a href="${esc(safeHref(sp.url))}" rel="sponsored noopener noreferrer" target="_blank">${esc(sp.text)}</a>` : esc(sp.text)}` : '';
  document.querySelectorAll('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
}

// ---------- Router ----------
function parseRoute() {
  const raw = currentPath();
  const [pathPart, qs = ''] = raw.split('?');
  const query = new URLSearchParams(qs);
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b] = parts;
  const base = { path: pathPart, query };
  if (a === 'kategorie' || a === 'k') return { ...base, name: 'cat', cat: b };
  if (a === 'produkt' || a === 'p') return { ...base, name: 'product', id: b, cat: productById(b)?.category };
  if (a === 'porovnat') return { ...base, name: 'compare' };
  if (a === 'oblibene') return { ...base, name: 'fav' };
  if (a === 'portfolio') return { ...base, name: 'portfolio' };
  if (a === 'stav') return { ...base, name: 'status' };
  if (a === 'prani') return { ...base, name: 'wish' };
  if (a === 'kalendar') return { ...base, name: 'calendar' };
  if (a === 'pozor') return { ...base, name: 'deals' };
  if (a === 'rozpocet') return { ...base, name: 'budget' };
  if (a === 'hledat') return { ...base, name: 'search' };
  if (a === 'admin') return { ...base, name: 'admin' };
  if (!a) return { ...base, name: 'home' };
  return { ...base, name: 'notfound' };
}

// Pozadí podle sekce.
function backdropFor(r) {
  if (r.name === 'cat' && categoryById(r.cat)) return setBackdrop('cat:' + r.cat, groupOf(r.cat), () => categoryPhotos(r.cat));
  if (r.name === 'product') {
    const p = productById(r.id);
    if (p) return setBackdrop('p:' + p.id, groupOf(p.category), () => productPhotos(p));
  }
  if (r.name === 'compare') {
    const first = productById(cmp.list()[0]);
    if (first) return setBackdrop('p:' + first.id, groupOf(first.category), () => productPhotos(first));
  }
  if (r.name === 'portfolio') return setBackdrop('cat:komodity', 'investice', () => categoryPhotos('komodity'));
  if (r.name === 'wish') {
    const first = productById(wish.list()[0]?.id);
    if (first) return setBackdrop('p:' + first.id, groupOf(first.category), () => productPhotos(first));
  }
  if (r.name === 'deals') return setBackdrop('cat:elektro', 'nakupy', () => categoryPhotos('elektro'));
  if (r.name === 'budget') {
    const c = r.query.get('odvetvi') && categoryById(r.query.get('odvetvi')) ? r.query.get('odvetvi') : 'elektro';
    return setBackdrop('cat:' + c, groupOf(c), () => categoryPhotos(c));
  }
  if (r.name === 'search') {
    const p = trackedMatches(r.query.get('q') || '', 1)[0];
    if (p) return setBackdrop('p:' + p.id, groupOf(p.category), () => productPhotos(p));
    return setBackdrop('cat:elektro', 'nakupy', () => categoryPhotos('elektro'));
  }
  if (r.name === 'calendar') return setBackdrop('cat:dovolene', 'domacnost', () => categoryPhotos('dovolene'));
  return setBackdrop('home', 'nakupy', homePhotos);
}

let last = { path: null, name: null, view: null, productId: null };

async function render(r) {
  resetActions();
  S.redraw = null;
  hideTip();
  hideChartTip();
  let ok = true;
  let view = null;
  if (r.name === 'cat') view = renderCategory($main, r.cat, r.query);
  else if (r.name === 'product') view = await renderProduct($main, r.id);
  else if (r.name === 'compare') view = renderCompare($main, r.query);
  else if (r.name === 'fav') view = renderFavorites($main);
  else if (r.name === 'portfolio') view = renderPortfolio($main, r.query);
  else if (r.name === 'status') view = await renderStatus($main);
  else if (r.name === 'admin') view = await renderAdmin($main);
  else if (r.name === 'wish') view = renderWishlist($main);
  else if (r.name === 'calendar') view = renderCalendar($main, r.query);
  else if (r.name === 'deals') view = renderDeals($main, r.query);
  else if (r.name === 'budget') view = renderBudget($main, r.query);
  else if (r.name === 'search') view = renderSearch($main, r.query);
  else if (r.name === 'home') view = renderHome($main) ?? true;
  else ok = false;
  if (!view) ok = false;
  if (!ok) {
    $main.innerHTML = `<section class="hero"><div class="hero-in"><div class="hero-main"><h1 class="hero-title" tabindex="-1">${t('Tahle stránka neexistuje')}</h1><p class="hero-lead">${t('Produkt mohl vypadnout z žebříčku.')} <a href="${link('/')}">${t('Zpět na přehled')}</a>.</p></div></div><p class="credit" id="photo-credit" hidden></p></section>`;
  }
  // Při návratu z detailu produktu „přistane“ cenovka zpátky na svůj řádek.
  if (last.productId && r.name !== 'product') {
    const row = $main.querySelector(`[data-pid="${CSS.escape(last.productId)}"]`);
    if (row) {
      shareElement(row.querySelector('.tag'), 'pm-tag');
      shareElement(row.querySelector('.nm'), 'pm-title');
    }
  }
  refreshCredit();
  return typeof view === 'object' ? view : null;
}

function clearSharedNames() {
  document.querySelectorAll('[style*="view-transition-name"]').forEach((el) => {
    if (!el.closest('.hero-title') && !el.classList.contains('hero-tag')) el.style.viewTransitionName = '';
  });
}

async function route(opts = {}) {
  const r = parseRoute();
  const navOpts = S.navOpts || {};
  S.navOpts = {};
  if (drawerOpen() && !opts.keepDrawer && !opts.soft) closeDrawer({ keepFocus: true });
  // Jen jiné parametry na stejné stránce – pohled se aktualizuje bez nového přechodu.
  if (!opts.soft && r.path === last.path && last.view?.update) {
    last.view.update(r.query);
    return;
  }
  const samePage = r.path === last.path;
  const doRender = async () => {
    renderHeader(r);
    renderBanner();
    last.view = await render(r);
  };
  if (opts.soft || !last.name) await doRender();
  else await transition(doRender, { kind: navOpts.back ? 'back' : 'page' });
  clearSharedNames();
  renderTray(r);
  backdropFor(r);
  if (r.name === 'product') last.productId = r.id;
  else if (r.name !== 'cat' && r.name !== 'home') last.productId = null;
  // Scroll a fokus
  if (!opts.soft && !samePage) {
    const y = navOpts.restore ? savedScroll() : null;
    window.scrollTo({ top: y ?? 0, behavior: 'instant' });
    const h1 = $main.querySelector('h1');
    if (h1 && last.name) h1.focus({ preventScroll: true });
    announce(document.title);
  }
  last.path = r.path;
  last.name = r.name;
  // Úvodní prohlídka při první návštěvě přehledu.
  if (r.name === 'home' && !tourDone() && !opts.soft) setTimeout(() => parseRoute().name === 'home' && !drawerOpen() && !tourDone() && startTour(homeSteps()), 1200);
}

// ---------- Interní odkazy, kliknutí mimo ----------
function onLink(href, a, e) {
  if (S.hash) {
    if (href.startsWith('#/')) {
      e.preventDefault();
      prepareShared(a);
      navigate(href.slice(1));
    }
    return;
  }
  if (href === '#hlidac' || (href.startsWith('#') && href.length > 1)) {
    e.preventDefault();
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
    return;
  }
  if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/')) return;
  e.preventDefault();
  prepareShared(a);
  navigate(href);
}

// Odkaz z řádku žebříčku na produkt: cenovka a název se „přenesou“ do detailu.
function prepareShared(a) {
  const row = a.closest('[data-pid]');
  if (!row || !/\/produkt\//.test(a.getAttribute('href'))) return;
  shareElement(row.querySelector('.tag'), 'pm-tag');
  shareElement(row.querySelector('.nm'), 'pm-title');
}

function onOutside(e) {
  if (!e.target.closest('.search')) {
    const r = document.getElementById('qres');
    if (r && !r.hidden) {
      r.hidden = true;
      document.getElementById('q')?.setAttribute('aria-expanded', 'false');
    }
  }
}

// ---------- Start ----------
(async function start() {
  applyTheme();
  document.documentElement.dataset.motion = store.get('motion', 'on');
  document.documentElement.lang = lang();
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!history.state?.k) history.replaceState({ k: Date.now().toString(36) }, '', location.href);
  $main.innerHTML = `<section class="hero"><div class="hero-in"><div class="hero-main"><p class="hero-lead">${t('Načítám data…')}</p></div></div></section>`;
  if (!S.hash && location.hash.startsWith('#/')) history.replaceState(history.state, '', location.hash.slice(1));
  installClickHandler({ onLink, onOutside });
  // Nenačtený náhled produktu se skryje (místo inline onerror, které by zakazovala Content-Security-Policy).
  document.addEventListener('error', (e) => e.target?.matches?.('img.thumb, img.p-thumb') && e.target.remove(), true);
  installTooltips();

  const [data, config] = await Promise.all([loadData(), S.standalone ? null : loadConfig()]);
  S.data = data;
  S.config = config;
  computeSeasons();

  window.addEventListener(S.hash ? 'hashchange' : 'popstate', () => {
    S.navOpts = { back: true, restore: true };
    route();
  });
  window.addEventListener('pm-route', () => route());
  window.addEventListener('pm-user', () => {
    const r = parseRoute();
    renderHeader(r);
    renderTray(r);
    refreshSettings();
    if (r.name === 'fav' || r.name === 'portfolio' || r.name === 'wish') route({ soft: true });
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
  });
  // Hlavička: průhledná nad fotkou, po odscrollování skleněná.
  const onScroll = () => document.documentElement.classList.toggle('scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => S.redraw && S.redraw(), 150);
  });
  window.addEventListener('pagehide', saveScroll);
  // Klávesa „/“ skočí do hledání.
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]')) {
      e.preventDefault();
      document.getElementById('q')?.focus();
    }
  });
  // Přednačtení detailu produktu při najetí myší (plná historie se stáhne dopředu).
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-prefetch]');
    if (el && S.data.mode === 'live') fullProduct(el.dataset.prefetch);
  });

  await route();
  checkLocalAlerts();
  checkWishes();
  initAuth();
  if (!S.hash && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (!S.hash && !/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
    const s = document.createElement('script');
    s.defer = true;
    s.src = '/_vercel/insights/script.js';
    document.head.appendChild(s);
  }
})();
