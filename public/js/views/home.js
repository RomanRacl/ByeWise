import { S, CATEGORIES, GROUPS, categoryById, catName, groupName, byCat, allRanked, sum, money, pct, pctClass, esc, priceText, productLink, catLink, link, monthName, nf, hero, sheet, ICON, insight, scoreBadge, scoreWhen, navigate } from '../core.js';
import { wishButton } from '../user.js';
import { actions } from '../ui.js';
import { investSignal, competitorAnalysis } from '../../lib/analytics.js';
import { t } from '../i18n.js';

// Barva buňky teplotní mapy: zelená = zlevnilo, červená = zdražilo, šedá = beze změny.
function heatColor(v) {
  if (v == null) return 'var(--sunken)';
  const k = Math.min(Math.abs(v) / 10, 1);
  if (Math.abs(v) < 0.5) return 'var(--flat-bg)';
  return `color-mix(in oklab, ${v > 0 ? 'var(--up)' : 'var(--down)'} ${Math.round(15 + k * 45)}%, var(--surface))`;
}

export function renderHome(main) {
  document.title = t('BuyWise – Kupuj chytře. Víš, kdy cena klesne.');
  const all = allRanked();
  const sums = all.map((p) => ({ p, s: sum(p) }));
  const count = (dir) => sums.filter((x) => x.s.trend.dir === dir).length;

  const shelf = (c) => {
    const list = byCat(c.id);
    const up = list.filter((p) => sum(p).trend.dir === 'roste').length;
    const down = list.filter((p) => sum(p).trend.dir === 'klesa').length;
    return `<section class="shelf" style="--i:${CATEGORIES.indexOf(c)}">
      <a class="shelf-head" href="${catLink(c.id)}"><h3>${esc(catName(c))}</h3><span>${list.length ? t('top {n}', { n: list.length }) : t('bez dat')}${ICON.arrow}</span></a>
      <ol>${list
        .slice(0, 5)
        .map((p, i) => `<li data-pid="${esc(p.id)}"><a href="${productLink(p.id)}" data-prefetch="${esc(p.id)}"><span class="tag ${i ? 'dim' : ''}">${p.rank}</span><span class="nm">${esc(p.name)}</span><span class="pr">${priceText(p, sum(p))}</span></a></li>`)
        .join('')}</ol>
      <div class="shelf-foot"><span class="chg-up">${t('{n} zdražuje', { n: up })}</span><span class="chg-down">${t('{n} zlevňuje', { n: down })}</span><span>${t('{n} drží cenu', { n: list.length - up - down })}</span></div>
    </section>`;
  };
  const boards = GROUPS.map((g) => `<h3 class="group-title">${esc(groupName(g))}</h3><div class="board">${CATEGORIES.filter((c) => c.group === g.id).map(shelf).join('')}</div>`).join('');

  // Teplotní mapa
  const heat = `<div class="heat" role="table" aria-label="${esc(t('Změna ceny za 30 dní podle odvětví a pořadí'))}">
    <div class="heat-row heat-head" role="row"><span role="columnheader"></span>${Array.from({ length: 10 }, (_, i) => `<span role="columnheader">${i + 1}.</span>`).join('')}</div>
    ${CATEGORIES.map((c) => {
      const list = byCat(c.id).slice(0, 10);
      return `<div class="heat-row" role="row"><a class="heat-cat" role="rowheader" href="${catLink(c.id)}">${esc(catName(c))}</a>${Array.from({ length: 10 }, (_, i) => {
        const p = list[i];
        if (!p) return '<span class="heat-cell empty" role="cell"></span>';
        const v = sum(p).ch30;
        return `<a class="heat-cell" role="cell" href="${productLink(p.id)}" style="background:${heatColor(v)}" title="${esc(p.name)}: ${pct(v)}" aria-label="${esc(p.name)}, ${pct(v)}">${v == null ? '–' : nf(0).format(v)}</a>`;
      }).join('')}</div>`;
    }).join('')}
    <div class="heat-legend"><span><i style="background:${heatColor(-10)}"></i>${t('zlevnilo o 10 % a víc')}</span><span><i style="background:var(--flat-bg)"></i>${t('beze změny')}</span><span><i style="background:${heatColor(10)}"></i>${t('zdražilo o 10 % a víc')}</span><span class="muted">${t('Čísla jsou změna v % za 30 dní.')}</span></div>
  </div>`;

  const movers = sums.filter((x) => x.s.ch30 != null);
  const rising = movers.filter((x) => x.s.ch30 > 0.5).sort((a, b) => b.s.ch30 - a.s.ch30).slice(0, 6);
  const falling = movers.filter((x) => x.s.ch30 < -0.5).sort((a, b) => a.s.ch30 - b.s.ch30).slice(0, 6);
  const consumer = sums.filter((x) => categoryById(x.p.category)?.kind === 'spotrebni');
  const wait = consumer.filter((x) => x.s.forecast && x.s.forecast.changePct <= -3).sort((a, b) => a.s.forecast.changePct - b.s.forecast.changePct).slice(0, 6);
  const compDrops = consumer
    .map((x) => ({ ...x, c: competitorAnalysis(x.p).biggestDrop }))
    .filter((x) => x.c && x.c.forecastPct <= -2)
    .sort((a, b) => a.c.forecastPct - b.c.forecastPct)
    .slice(0, 6);
  const invest = ['komodity', 'krypto', 'akcie']
    .flatMap((id) => byCat(id))
    .map((p) => ({ p, s: sum(p), sig: investSignal(sum(p).history) }))
    .sort((a, b) => Math.abs(b.sig.score || 0) - Math.abs(a.sig.score || 0))
    .slice(0, 8);

  // Skóre Kup teď / Počkej
  const scored = consumer.map((x) => ({ ...x, sc: insight(x.p).score })).filter((x) => x.sc);
  const buyNow = scored.filter((x) => x.sc.tone === 'buy').sort((a, b) => b.sc.score - a.sc.score).slice(0, 8);
  const fakeN = consumer.filter((x) => insight(x.p).discount?.suspicious).length;
  const month = new Date().getMonth();

  const seasons = S.data.seasons || {};
  const seasonTips = CATEGORIES.filter((c) => c.kind === 'spotrebni' && seasons[c.id]?.strong)
    .map((c) => ({ c, s: seasons[c.id] }))
    .sort((a, b) => b.s.amplitude - a.s.amplitude);

  const infl = S.data.settings?.inflation;
  let inflBlock = '';
  if (infl && Number.isFinite(infl.yoy)) {
    const withYear = consumer.filter((x) => x.s.ch365 != null);
    const faster = withYear.filter((x) => x.s.ch365 > infl.yoy);
    inflBlock = `<section class="section"><div class="infl"><div><b>${pct(infl.yoy, false)}</b><span>${t('meziroční inflace')}${infl.label ? ` (${esc(infl.label)})` : ''}</span></div>
      <p>${withYear.length ? t('Rychleji než inflace zdražuje {a} z {b} sledovaných spotřebních produktů.', { a: faster.length, b: withYear.length }) : t('Na srovnání s inflací je potřeba roční historie cen.')}</p></div></section>`;
  }

  const item = (x, val, small) =>
    `<li><a class="item" href="${productLink(x.p.id)}"><span class="nm">${esc(x.p.name)}</span><span class="val">${val}${small ? `<small>${small}</small>` : ''}</span><span class="sub">${esc(catName(categoryById(x.p.category)))}, ${priceText(x.p, x.s)}</span></a></li>`;
  const listOr = (arr, fn, empty) => (arr.length ? `<ul class="list">${arr.map(fn).join('')}</ul>` : `<p class="empty">${empty}</p>`);

  const heroHtml = hero({
    size: 'hero-home',
    eyebrow: t('Kupuj chytře. Víš, kdy cena klesne.'),
    title: t('Co Česko právě kupuje a kam míří ceny'),
    lead: t('Deset nejžádanějších produktů v {n} odvětvích, skóre Kup teď / Počkej, odhad ceny na příští měsíc a srovnání prodejců.', { n: CATEGORIES.length }),
    below: `<form class="big-search" id="home-search" role="search"><span class="search-ico">${ICON.search}</span><input name="q" type="search" placeholder="${esc(t('Jakýkoli produkt – uvidíš ceny ve všech obchodech'))}" aria-label="${esc(t('Hledat produkt'))}" autocomplete="off" enterkeyhint="search"><button class="btn" type="submit">${t('Hledat')}</button></form><div class="hero-cats">${GROUPS.map((g) => `<a class="chip-link" href="${catLink(CATEGORIES.find((c) => c.group === g.id).id)}">${esc(groupName(g))}</a>`).join('')}</div>`,
    aside: `<dl class="pulse" aria-label="${esc(t('Souhrn trendů'))}">
        <div><dt>${t('produktů zdražuje')}</dt><dd class="up" data-count="${count('roste')}">${count('roste')}</dd></div>
        <div><dt>${t('zlevňuje')}</dt><dd class="down" data-count="${count('klesa')}">${count('klesa')}</dd></div>
        <div><dt>${t('drží cenu')}</dt><dd data-count="${count('drzi')}">${count('drzi')}</dd></div>
        ${count('neznamy') ? `<div><dt>${t('zatím bez trendu')}</dt><dd>${count('neznamy')}</dd></div>` : ''}
      </dl>`,
  });
  const tools = [
    ['/prani', 'heart', t('Seznam přání'), t('Ulož si, co chceš koupit, a nastav cílovou cenu.')],
    ['/kalendar?mesic=' + (month + 1), 'calendar', t('Nákupní kalendář'), t('Co je v měsíci {m} nejlevněji.', { m: monthName(month) })],
    ['/pozor', 'shield', t('Pozor na akce'), fakeN ? t('{n} podezřelých slev právě teď.', { n: fakeN }) : t('Falešné slevy a nejnižší cena za 30 dní.')],
    ['/rozpocet', 'wallet', t('Rozpočtový poradce'), t('Mám 30 000 Kč – co a kdy koupit?')],
  ];
  main.innerHTML = heroHtml + sheet(`
    <section class="section tools-grid" aria-label="${esc(t('Chytré nástroje'))}">${tools.map(([path, icon, title, text], i) => `<a class="tool-card" href="${link(path)}" style="--i:${i}"><span class="tool-ico">${ICON[icon]}</span><b>${title}</b><span>${text}</span></a>`).join('')}</section>
    <section class="section buy-now">
      <div class="section-head"><div><h2>${t('Vyplatí se koupit teď')}</h2><p>${t('Nejvyšší skóre Kup teď / Počkej: cena je nízko a zlevnění se nečeká.')}</p></div><a class="btn alt" href="${link('/rozpocet')}">${ICON.wallet}${t('Poradit podle rozpočtu')}</a></div>
      ${buyNow.length ? `<ul class="score-cards">${buyNow.map((x, i) => `<li data-pid="${esc(x.p.id)}" style="--i:${i}"><a class="score-card" href="${productLink(x.p.id)}" data-prefetch="${esc(x.p.id)}">${scoreBadge(x.sc, { size: 'lg' })}<span class="sc-txt"><span class="nm">${esc(x.p.name)}</span><span class="sub">${esc(catName(categoryById(x.p.category)))}</span><b>${priceText(x.p, x.s)}</b></span></a>${wishButton(x.p.id, 'icon-btn sm')}</li>`).join('')}</ul>` : `<p class="empty">${t('Teď nic nemá skóre nad 60. Zkus nákupní kalendář.')}</p>`}
    </section>
    ${inflBlock}
    <section class="section">
      <div class="section-head"><div><h2>${t('Žebříčky podle odvětví')}</h2><p>${t('Pořadí podle aktuální poptávky. Klikni na odvětví pro celou desítku.')}</p></div></div>
      ${boards}
    </section>
    <section class="section">
      <div class="section-head"><div><h2>${t('Teplotní mapa cen')}</h2><p>${t('Každý čtvereček je jeden produkt z desítky. Barva ukazuje, jestli za 30 dní zdražil, nebo zlevnil.')}</p></div></div>
      ${heat}
    </section>
    <section class="section cols">
      <div>
        <div class="section-head"><div><h2>${t('Nejvíc zdražilo')}</h2><p>${t('Změna ceny za posledních 30 dní')}</p></div></div>
        ${listOr(rising, (x) => item(x, `<span class="chg-up">${pct(x.s.ch30)}</span>`), t('Za posledních 30 dní nic výrazně nezdražilo.'))}
      </div>
      <div>
        <div class="section-head"><div><h2>${t('Nejvíc zlevnilo')}</h2><p>${t('Změna ceny za posledních 30 dní')}</p></div></div>
        ${listOr(falling, (x) => item(x, `<span class="chg-down">${pct(x.s.ch30)}</span>`), t('Za posledních 30 dní nic výrazně nezlevnilo.'))}
      </div>
    </section>
    <section class="section cols">
      <div>
        <div class="section-head"><div><h2>${t('Vyplatí se počkat')}</h2><p>${t('Trend ukazuje pokles ceny o 3 % a víc během 30 dní')}</p></div></div>
        ${listOr(wait, (x) => item(x, `<span class="chg-down">${pct(x.s.forecast.changePct)}</span>`, `${t('odhad')} ${money(x.s.forecast.endPrice, x.p.unit)}`), t('Teď nic nenaznačuje výrazné zlevnění.'))}
      </div>
      <div>
        <div class="section-head"><div><h2>${t('Zlevnění u konkurence')}</h2><p>${t('Prodejce s největším očekávaným poklesem u daného produktu')}</p></div></div>
        ${listOr(compDrops, (x) => item(x, `<span class="chg-down">${pct(x.c.forecastPct)}</span>`, esc(x.c.name)), t('U prodejců se teď výrazné zlevnění nečeká.'))}
      </div>
    </section>
    <section class="section">
      <div class="section-head"><div><h2>${t('Nejlepší čas na nákup')}</h2><p>${t('Ve kterém měsíci bývá odvětví historicky nejlevnější a kdy nejdražší')}</p></div></div>
      ${listOr(
        seasonTips,
        (x) => `<li><a class="item" href="${catLink(x.c.id)}"><span class="nm">${esc(catName(x.c))}</span><span class="val chg-down">${esc(monthName(x.s.bestMonth))}<small>${t('nejdražší: {m}', { m: monthName(x.s.worstMonth) })}</small></span><span class="sub">${t('rozdíl mezi nejlevnějším a nejdražším měsícem {v} %', { v: x.s.amplitude })}</span></a></li>`,
        t('Na sezónnost je potřeba aspoň rok historie cen.')
      )}
    </section>
    <section class="section">
      <div class="section-head"><div><h2>${t('Signály pro investory')}</h2><p>${t('Nejsilnější technické signály komodit, kryptoměn a akcií z klouzavých průměrů, RSI, MACD a Bollingerových pásem. Nejde o investiční doporučení.')}</p></div><a class="btn alt" href="${link('/portfolio')}">${t('Moje portfolio')}</a></div>
      ${listOr(
        invest,
        (x) =>
          `<li><a class="item" href="${productLink(x.p.id)}"><span class="nm">${esc(x.p.name)}</span><span class="val ${x.sig.tone === 'bull' ? 'chg-down' : x.sig.tone === 'bear' ? 'chg-up' : 'chg-flat'}">${esc(t(x.sig.label))}<small>${pct(x.s.ch30)} ${t('za 30 dní')}</small></span><span class="sub">${esc(catName(categoryById(x.p.category)))}, ${money(x.s.price, x.p.unit)}${x.sig.rsi != null ? `, RSI ${nf(0).format(x.sig.rsi)}` : ''}</span></a></li>`,
        t('Investiční odvětví zatím nemají data.')
      )}
    </section>`);
  countUp(main);
  main.querySelector('#home-search')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (q.length >= 2) navigate('/hledat?q=' + encodeURIComponent(q));
  });
  return true;
}

// Čísla v hero „naběhnou“ od nuly (jen jednou po načtení, ne při každém návratu).
let counted = false;
function countUp(root) {
  if (counted || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off') return;
  counted = true;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const end = +el.dataset.count;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 900);
      el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
