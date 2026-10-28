// Nákupní kalendář: kdy je co v roce nejlevněji. Kombinuje sezónnost z historie cen (odvětví i produkty)
// se známými nákupními akcemi v Česku. Vybraný měsíc je v adrese (?mesic=1–12), mezi měsíci se dá chodit šipkami.
import { S, CATEGORIES, categoryById, catName, catLink, productLink, link, esc, pct, monthName, hero, sheet, insight, scoreBadge, money, sum, ICON, setQuery } from '../core.js';
import { actions, reducedMotion } from '../ui.js';
import { t, lang } from '../i18n.js';

// Známé akce a sezóny (orientačně, každý rok se mohou posunout o pár dní).
export const EVENTS = [
  { m: 0, cats: ['elektro', 'mobily', 'kosmetika'], title: 'Povánoční výprodeje', en: 'After-Christmas sales', text: 'E-shopy doprodávají zboží po Vánocích, vrací se i ceny parfémů.', textEn: 'Shops clear stock after Christmas; perfume prices come back down.' },
  { m: 0, cats: ['dovolene'], title: 'First minute dovolené', en: 'Early booking holidays', text: 'Nejširší výběr zájezdů na léto se slevou za včasný nákup.', textEn: 'The widest choice of summer trips with early booking discounts.' },
  { m: 0, cats: ['nabytek'], title: 'Lednové slevy nábytku', en: 'January furniture sales', text: 'Obchody s nábytkem doprodávají loňské kolekce.', textEn: 'Furniture stores clear last year’s collections.' },
  { m: 1, cats: ['sport'], title: 'Konec zimní sezóny', en: 'End of winter season', text: 'Zimní oblečení a vybavení začíná zlevňovat.', textEn: 'Winter clothing and gear starts getting cheaper.' },
  { m: 2, cats: ['sport'], title: 'Výprodej lyží a zimní výbavy', en: 'Ski gear clearance', text: 'Lyže, boty a bundy bývají nejlevnější na konci sezóny.', textEn: 'Skis, boots and jackets are usually cheapest at the end of the season.' },
  { m: 2, cats: ['hry'], title: 'Jarní výprodej na Steamu', en: 'Steam Spring Sale', text: 'Týdenní výprodej s velkými slevami na starší hry.', textEn: 'A week-long sale with big discounts on older games.' },
  { m: 3, cats: ['sport'], title: 'Začátek cyklistické sezóny', en: 'Start of cycling season', text: 'Kola a koloběžky zdražují, nové modely přicházejí za plnou cenu.', textEn: 'Bikes and scooters get pricier; new models arrive at full price.', pricey: true },
  { m: 4, cats: ['kosmetika'], title: 'Den matek', en: 'Mother’s Day', text: 'Akce na parfémy a kosmetické sady v drogeriích.', textEn: 'Drugstore deals on perfumes and gift sets.' },
  { m: 5, cats: ['hry'], title: 'Letní výprodej na Steamu', en: 'Steam Summer Sale', text: 'Největší výprodej roku, obvykle od konce června do začátku července.', textEn: 'The biggest sale of the year, usually late June to early July.' },
  { m: 5, cats: ['pohonne'], title: 'Benzín před prázdninami', en: 'Fuel before the holidays', text: 'Ceny paliv v létě obvykle mírně rostou.', textEn: 'Fuel prices usually rise slightly in summer.', pricey: true },
  { m: 6, cats: ['elektro', 'mobily'], title: 'Letní slevové akce e-shopů', en: 'Summer e-shop sales', text: 'Prime Day a letní akce českých e-shopů, slevy na elektroniku.', textEn: 'Prime Day and summer sales at Czech e-shops.' },
  { m: 6, cats: ['dovolene'], title: 'Last minute', en: 'Last minute', text: 'Neprodané zájezdy zlevňují týden až dva před odjezdem.', textEn: 'Unsold trips get cheaper one or two weeks before departure.' },
  { m: 7, cats: ['dovolene'], title: 'Last minute na konec léta', en: 'End-of-summer last minute', text: 'Konec srpna a září bývá levnější než vrchol sezóny.', textEn: 'Late August and September are cheaper than peak season.' },
  { m: 7, cats: ['elektro'], title: 'Zpátky do školy', en: 'Back to school', text: 'Notebooky a tablety jsou v akcích, ale poptávka drží ceny.', textEn: 'Laptops and tablets on promotion, though demand keeps prices up.' },
  { m: 8, cats: ['mobily'], title: 'Nové iPhony', en: 'New iPhones', text: 'Po představení nových modelů zlevňují ty loňské.', textEn: 'After new models launch, last year’s models get cheaper.' },
  { m: 8, cats: ['sport'], title: 'Výprodej kol', en: 'Bike clearance', text: 'Na konci sezóny obchody doprodávají letošní modely kol.', textEn: 'At the end of the season shops clear this year’s bike models.' },
  { m: 9, cats: ['auta'], title: 'Přezouvání a podzimní akce', en: 'Tyre season and autumn deals', text: 'Dealeři začínají doprodávat skladové vozy letošního roku.', textEn: 'Dealers start clearing this year’s stock cars.' },
  { m: 10, cats: ['elektro', 'mobily', 'kosmetika', 'hry'], title: 'Black Friday', en: 'Black Friday', text: 'Největší slevová akce roku. Pozor na „slevy“ z uměle zvednutých cen.', textEn: 'The biggest sale of the year. Watch out for discounts from inflated prices.' },
  { m: 10, cats: ['elektro'], title: '11. 11. – Singles Day', en: '11/11 – Singles Day', text: 'Slevy u e-shopů s elektronikou a čínských prodejců.', textEn: 'Deals at electronics e-shops and Chinese sellers.' },
  { m: 11, cats: ['auta'], title: 'Konec roku u dealerů', en: 'Year-end at dealers', text: 'Prodejci plní roční plány a doprodávají skladové vozy.', textEn: 'Dealers chase yearly targets and clear stock cars.' },
  { m: 11, cats: ['hry'], title: 'Zimní výprodej na Steamu', en: 'Steam Winter Sale', text: 'Výprodej přes Vánoce a Nový rok.', textEn: 'A sale over Christmas and New Year.' },
  { m: 11, cats: ['kosmetika'], title: 'Parfémy před Vánoci', en: 'Perfumes before Christmas', text: 'Parfémy a dárkové sady bývají před Vánoci nejdražší.', textEn: 'Perfumes and gift sets are usually most expensive before Christmas.', pricey: true },
  { m: 11, cats: ['pojisteni'], title: 'Výročí povinného ručení', en: 'Car insurance renewal', text: 'Pojistku jde změnit k výročí smlouvy – srovnej nabídky 6 týdnů předem.', textEn: 'You can switch at the policy anniversary – compare offers 6 weeks before.' },
];

export function renderCalendar(main, query = new URLSearchParams()) {
  document.title = `${t('Nákupní kalendář')} – BuyWise`;
  const now = new Date().getMonth();
  const seasons = S.data.seasons || {};
  let sel = Math.max(0, Math.min(11, (parseInt(query.get('mesic'), 10) || now + 1) - 1));
  const consumer = CATEGORIES.filter((c) => c.kind === 'spotrebni');
  const withSeason = consumer.filter((c) => seasons[c.id]);
  // Produkty s výraznou vlastní sezónností
  const products = S.data.products
    .filter((p) => p.active !== false && p.rank && categoryById(p.category)?.kind === 'spotrebni')
    .map((p) => ({ p, se: insight(p).season }))
    .filter((x) => x.se && x.se.amplitude >= 4);

  const cell = (v) => {
    if (v == null) return 'var(--sunken)';
    const k = Math.min(Math.abs(v) / 6, 1);
    if (Math.abs(v) < 0.4) return 'var(--flat-bg)';
    return `color-mix(in oklab, ${v > 0 ? 'var(--up)' : 'var(--down)'} ${Math.round(14 + k * 50)}%, var(--surface))`;
  };
  const grid = `<div class="cal-grid" role="table" aria-label="${esc(t('Odchylka cen od průměru podle měsíce'))}">
    <div class="cal-row cal-head" role="row"><span role="columnheader"></span>${Array.from({ length: 12 }, (_, m) => `<span role="columnheader" class="${m === now ? 'now' : ''}">${esc(monthName(m, 'short'))}</span>`).join('')}</div>
    ${withSeason
      .map((c) => `<div class="cal-row" role="row"><a role="rowheader" class="cal-cat" href="${catLink(c.id)}">${esc(catName(c))}</a>${seasons[c.id].profile.map((v, m) => `<button type="button" role="cell" class="cal-cell ${m === sel ? 'sel' : ''}" data-action="cal-month" data-m="${m}" style="background:${cell(v)}" aria-label="${esc(`${catName(c)}, ${monthName(m)}: ${pct(v)}`)}" data-tip="${esc(`${catName(c)} · ${monthName(m)}: ${v == null ? '—' : pct(v)} ${t('proti průměru')}`)}">${m === seasons[c.id].bestMonth ? '★' : ''}</button>`).join('')}</div>`)
      .join('')}
    <div class="heat-legend"><span><i style="background:${cell(-6)}"></i>${t('levněji než průměr')}</span><span><i style="background:var(--flat-bg)"></i>${t('průměr')}</span><span><i style="background:${cell(6)}"></i>${t('dráž než průměr')}</span><span>★ ${t('nejlevnější měsíc odvětví')}</span></div>
  </div>`;

  const ev = (e) => (lang() === 'en' ? { title: e.en, text: e.textEn } : e);
  const detail = (m) => {
    const events = EVENTS.filter((e) => e.m === m);
    const cheap = withSeason.filter((c) => seasons[c.id].bestMonth === m);
    const pricey = withSeason.filter((c) => seasons[c.id].worstMonth === m);
    const prods = products.filter((x) => x.se.bestMonth === m).sort((a, b) => b.se.amplitude - a.se.amplitude).slice(0, 8);
    const avoid = products.filter((x) => x.se.worstMonth === m).sort((a, b) => b.se.amplitude - a.se.amplitude).slice(0, 5);
    const block = (title, html) => (html ? `<div class="cal-block"><h3>${title}</h3>${html}</div>` : '');
    return `<div class="cal-detail" id="cal-detail" aria-live="polite">
      <div class="cal-detail-head"><h2>${esc(monthName(m))}${m === now ? ` <span class="pill">${t('teď')}</span>` : ''}</h2>
        <span class="cal-nav"><button type="button" class="icon-btn solid sm" data-action="cal-step" data-d="-1" aria-label="${esc(t('Předchozí měsíc'))}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg></button><button type="button" class="icon-btn solid sm" data-action="cal-step" data-d="1" aria-label="${esc(t('Další měsíc'))}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button></span></div>
      <div class="cal-blocks">
        ${block(t('Akce a sezóny'), events.length ? `<ul class="ev-list">${events.map((e) => `<li class="${e.pricey ? 'pricey' : ''}"><b>${esc(ev(e).title)}</b><span>${esc(ev(e).text)}</span><span class="ev-cats">${e.cats.map((id) => `<a class="chip-sm" href="${catLink(id)}">${esc(catName(categoryById(id)))}</a>`).join('')}</span></li>`).join('')}</ul>` : `<p class="empty">${t('Žádná velká akce, ceny se řídí hlavně sezónností.')}</p>`)}
        ${block(t('Nejlevnější odvětví'), cheap.length ? `<ul class="list">${cheap.map((c) => `<li><a class="item" href="${catLink(c.id)}"><span class="nm">${esc(catName(c))}</span><span class="val chg-down">${pct(seasons[c.id].bestPct)}</span><span class="sub">${t('proti ročnímu průměru')}</span></a></li>`).join('')}</ul>` : '')}
        ${block(t('Produkty, které jsou teď nejlevnější'), prods.length ? `<ul class="list">${prods.map((x) => `<li data-pid="${esc(x.p.id)}"><a class="item" href="${productLink(x.p.id)}"><span class="nm">${esc(x.p.name)}</span><span class="val chg-down">${pct(x.se.bestPct)}${scoreBadge(insight(x.p).score, { tip: false })}</span><span class="sub">${esc(catName(categoryById(x.p.category)))}, ${t('teď')} ${money(sum(x.p).price, x.p.unit)}</span></a></li>`).join('')}</ul>` : '')}
        ${block(t('Raději nekupuj'), pricey.length || avoid.length ? `<ul class="list">${pricey.map((c) => `<li><a class="item" href="${catLink(c.id)}"><span class="nm">${esc(catName(c))}</span><span class="val chg-up">${pct(seasons[c.id].worstPct)}</span><span class="sub">${t('nejdražší měsíc odvětví')}</span></a></li>`).join('')}${avoid.map((x) => `<li><a class="item" href="${productLink(x.p.id)}"><span class="nm">${esc(x.p.name)}</span><span class="val chg-up">${pct(x.se.worstPct)}</span><span class="sub">${t('nejdražší měsíc produktu')}</span></a></li>`).join('')}</ul>` : '')}
      </div>
    </div>`;
  };

  const months = `<div class="month-strip" role="tablist" aria-label="${esc(t('Měsíce'))}">${Array.from({ length: 12 }, (_, m) => {
    const n = EVENTS.filter((e) => e.m === m).length + withSeason.filter((c) => seasons[c.id].bestMonth === m).length;
    return `<button type="button" role="tab" class="month ${m === now ? 'now' : ''}" data-action="cal-month" data-m="${m}" aria-selected="${m === sel}" tabindex="${m === sel ? 0 : -1}"><span>${esc(monthName(m, 'short'))}</span>${n ? `<i>${n}</i>` : ''}</button>`;
  }).join('')}</div>`;

  main.innerHTML =
    hero({
      crumb: `<a href="${link('/')}">${t('Přehled')}</a>`,
      title: t('Nákupní kalendář'),
      lead: t('Kdy je co v roce nejlevněji: sezónnost z historie cen a známé slevové akce v Česku.'),
      below: `<a class="chip-link" href="${link('/kalendar?mesic=' + (now + 1))}">${ICON.calendar}${t('Tento měsíc')}</a>`,
    }) +
    sheet(`
    <section class="section">${months}<div id="cal-slot">${detail(sel)}</div></section>
    <section class="section"><div class="section-head"><div><h2>${t('Celý rok podle odvětví')}</h2><p>${t('Zelená = v tomto měsíci bývá levněji než průměr, červená = dráž. Klikni na měsíc pro detail.')}</p></div></div>
      ${withSeason.length ? grid : `<p class="empty">${t('Na sezónnost je potřeba aspoň rok historie cen.')}</p>`}
    </section>`);

  const strip = main.querySelector('.month-strip');
  const show = (m, focus = false) => {
    const dir = m > sel ? 1 : -1;
    sel = (m + 12) % 12;
    setQuery({ mesic: sel + 1 });
    strip.querySelectorAll('[role=tab]').forEach((b) => {
      const on = +b.dataset.m === sel;
      b.setAttribute('aria-selected', on);
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
    main.querySelectorAll('.cal-cell').forEach((c) => c.classList.toggle('sel', +c.dataset.m === sel));
    const slot = main.querySelector('#cal-slot');
    slot.innerHTML = detail(sel);
    if (!reducedMotion()) slot.firstElementChild.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
  };
  strip.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    show(sel + (e.key === 'ArrowRight' ? 1 : -1), true);
  });
  actions({
    'cal-month': (el) => show(+el.dataset.m),
    'cal-step': (el) => show(sel + +el.dataset.d),
  });
  return {
    update(q) {
      const m = (parseInt(q.get('mesic'), 10) || now + 1) - 1;
      if (m !== sel) show(m);
    },
  };
}
