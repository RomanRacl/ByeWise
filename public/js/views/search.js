// Vyhledávání jakéhokoli produktu: sledované produkty (s grafem a skóre) + ceny ve všech obchodech z feedů.
// Adresa /hledat?q=… se dá sdílet. V samostatné HTML verzi (bez serveru) hledá jen ve sledovaných produktech.
import { S, CATEGORIES, categoryById, catName, sum, money, esc, productLink, link, hero, sheet, insight, scoreBadge, priceText, ICON, affiliateUrl, setQuery, pct, toast } from '../core.js';
import { actions, reducedMotion } from '../ui.js';
import { buildSearchIndex, searchOffers } from '../../lib/dataops.js';
import { clean, last } from '../../lib/analytics.js';
import { t, nProducts } from '../i18n.js';

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function trackedMatches(query, limit = 8) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return S.data.products
    .map((p) => {
      const hay = norm(`${p.name} ${p.subtitle || ''} ${catName(categoryById(p.category))}`);
      if (!words.every((w) => hay.includes(w))) return null;
      return { p, score: (norm(p.name).startsWith(words[0]) ? 0 : 1) + (p.rank ? 0 : 2) + (p.active === false ? 3 : 0) };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || (a.p.rank ?? 99) - (b.p.rank ?? 99))
    .slice(0, limit)
    .map((x) => x.p);
}

// Bez serveru (samostatná verze nebo výpadek): nabídky z cen prodejců u sledovaných produktů.
function localOffers(query) {
  const byShop = new Map();
  for (const p of S.data.products) {
    for (const c of p.competitors || []) {
      const l = last(clean(c.prices));
      if (!l) continue;
      if (!byShop.has(c.name)) byShop.set(c.name, []);
      byShop.get(c.name).push([`${p.name}${p.subtitle ? ' ' + p.subtitle : ''}`, l.p, c.url || '', '']);
    }
  }
  const idx = buildSearchIndex([...byShop.entries()].map(([shop, items]) => ({ shop, items })));
  return { ...searchOffers(idx, query), shops: byShop.size, local: true };
}

const cacheQ = new Map();
export async function fetchOffers(query, limit = 20) {
  const key = query.toLowerCase() + '|' + limit;
  if (cacheQ.has(key)) return cacheQ.get(key);
  let r;
  if (S.standalone) r = localOffers(query);
  else {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      if (!res.ok) throw new Error(res.status);
      r = await res.json();
    } catch {
      r = localOffers(query);
    }
  }
  cacheQ.set(key, r);
  return r;
}

export const externalLinks = (q) => [
  ['Heureka', `https://www.heureka.cz/?h%5Bfraze%5D=${encodeURIComponent(q)}`],
  ['Zboží.cz', `https://www.zbozi.cz/hledani/?q=${encodeURIComponent(q)}`],
  ['Google Nákupy', `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`],
];

export function renderSearch(main, query = new URLSearchParams()) {
  let q = String(query.get('q') || '').trim().slice(0, 80);
  document.title = q ? `${q} – ${t('ceny v obchodech')} – BuyWise` : `${t('Hledat produkt')} – BuyWise`;

  main.innerHTML =
    hero({
      crumb: `<a href="${link('/')}">${t('Přehled')}</a>`,
      title: q ? esc(q) : t('Hledat produkt'),
      lead: t('Napiš jakýkoli produkt a uvidíš jeho cenu v obchodech, od nejlevnější. Sledované produkty mají navíc vývoj ceny, odhad a skóre Kup teď / Počkej.'),
      below: `<form class="big-search" id="sform2" role="search"><span class="search-ico">${ICON.search}</span><input id="q2" type="search" value="${esc(q)}" placeholder="${esc(t('např. iPhone 17, Dyson Airwrap, Garmin…'))}" aria-label="${esc(t('Hledat produkt'))}" autocomplete="off" enterkeyhint="search"><button class="btn" type="submit">${t('Hledat')}</button></form>`,
    }) + sheet(`<div id="sres" aria-live="polite"></div>`);

  const out = main.querySelector('#sres');
  const run = async (animate) => {
    if (q.length < 2) {
      out.innerHTML = `<div class="empty-state small">${ICON.search}<p>${t('Zadej aspoň 2 znaky.')}</p></div>`;
      return;
    }
    out.innerHTML = `<div class="skel" aria-hidden="true">${'<div class="skel-line"></div>'.repeat(5)}</div>`;
    const tracked = trackedMatches(q, 6);
    const r = await fetchOffers(q, 30);
    const offerCard = (g, i) => {
      const cheapest = g.offers[0];
      return `<li class="offer-group" style="--i:${i}">
        <div class="og-head"><h3>${esc(g.name)}</h3><span class="og-price"><small>${t('od')}</small> ${money(g.minPrice)}</span></div>
        <p class="sub">${g.shops > 1 ? t('{n} obchodů, rozdíl {d}', { n: g.shops, d: money(g.maxPrice - g.minPrice) }) : t('1 obchod')}${g.ean ? ` · EAN ${esc(g.ean)}` : ''}</p>
        <ol class="offers">${g.offers
          .slice(0, 8)
          .map((o, k) => {
            const href = affiliateUrl(o.url);
            const diff = k ? ((o.price - cheapest.price) / cheapest.price) * 100 : 0;
            return `<li class="${k ? '' : 'best'}"><span class="shop">${esc(o.shop)}${k ? '' : ` <em>${t('nejlevněji')}</em>`}</span><b>${money(o.price)}</b><span class="diff">${k ? `+${pct(diff, false)}` : ''}</span>${href ? `<a class="btn alt sm" href="${esc(href)}" target="_blank" rel="noopener noreferrer sponsored">${t('Do obchodu')}</a>` : '<span></span>'}</li>`;
          })
          .join('')}</ol>
        ${g.offers.length > 8 ? `<p class="note">${t('+ další {n} obchodů', { n: g.offers.length - 8 })}</p>` : ''}
      </li>`;
    };
    out.innerHTML = `
      ${tracked.length ? `<section class="section first"><div class="section-head"><div><h2>${t('Sledujeme')}</h2><p>${t('Vývoj ceny, odhad na 30 dní a skóre nákupu')}</p></div></div>
        <ul class="score-cards">${tracked.map((p, i) => `<li data-pid="${esc(p.id)}" style="--i:${i}"><a class="score-card" href="${productLink(p.id)}" data-prefetch="${esc(p.id)}">${scoreBadge(insight(p).score, { size: 'lg', tip: false })}<span class="sc-txt"><span class="nm">${esc(p.name)}</span><span class="sub">${esc(catName(categoryById(p.category)))}${p.subtitle ? ', ' + esc(p.subtitle) : ''}</span><b>${priceText(p, sum(p))}</b></span></a></li>`).join('')}</ul></section>` : ''}
      <section class="section ${tracked.length ? '' : 'first'}"><div class="section-head"><div><h2>${t('Ceny v obchodech')}</h2><p>${r.total ? t('{x} · ceny z {s} obchodů, aktualizace každý den', { x: nProducts(r.total), s: r.shops }) : ''}</p></div></div>
        ${r.groups?.length ? `<ul class="offer-list">${r.groups.map(offerCard).join('')}</ul>` : `<p class="empty">${t('V obchodech, které BuyWise sleduje, jsme „{q}“ nenašli.', { q: esc(q) })}</p>`}
      </section>
      <section class="section ext-search"><h3>${t('Nenašel jsi, co hledáš? Zkus srovnávače:')}</h3><div class="btns">${externalLinks(q).map(([n, u]) => `<a class="btn alt" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)} ↗</a>`).join('')}</div>
        <p class="note">${r.local ? t('Samostatná verze hledá jen v cenách sledovaných produktů. Verze na Vercelu hledá ve všech produktech z feedů obchodů.') : t('BuyWise hledá v produktových feedech obchodů, které má administrátor nastavené. Čím víc feedů, tím víc produktů najdeš.')}</p></section>`;
    if (animate && !reducedMotion()) out.querySelectorAll('.offer-group, .score-cards li').forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: Math.min(i, 10) * 30, easing: 'ease-out', fill: 'backwards' }));
  };

  main.querySelector('#sform2').addEventListener('submit', (e) => {
    e.preventDefault();
    q = main.querySelector('#q2').value.trim().slice(0, 80);
    setQuery({ q: q || null });
    main.querySelector('.hero-title').textContent = q || t('Hledat produkt');
    document.title = `${q} – ${t('ceny v obchodech')} – BuyWise`;
    run(true);
  });
  run(true);
  return {
    update(qs) {
      q = String(qs.get('q') || '').trim();
      main.querySelector('#q2').value = q;
      main.querySelector('.hero-title').textContent = q || t('Hledat produkt');
      run(false);
    },
  };
}
