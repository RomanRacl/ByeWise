// Pozor na tyto akce: podezřelé (nafouknuté) slevy a slevy, které nejsou nejnižší cenou za 30 dní.
import { S, categoryById, catName, productLink, link, esc, pct, money, sum, dateFmt, hero, sheet, insight, scoreBadge, ICON, CATEGORIES, conv, unitOf, nf, setQuery } from '../core.js';
import { actions, accordion } from '../ui.js';
import { lineChart, T } from '../chart.js';
import { t } from '../i18n.js';

export function renderDeals(main, query = new URLSearchParams()) {
  document.title = `${t('Pozor na tyto akce')} – BuyWise`;
  const cat = query.get('odvetvi') || '';
  const all = S.data.products
    .filter((p) => p.active !== false && categoryById(p.category)?.kind === 'spotrebni' && (!cat || p.category === cat))
    .map((p) => ({ p, s: sum(p), i: insight(p) }));
  // 1) Nafouknutá sleva: cena byla zvednuta a pak „zlevněna“ zpátky.
  const fake = all.filter((x) => x.i.discount?.suspicious).sort((a, b) => (b.i.discount.peak / b.i.discount.prior) - (a.i.discount.peak / a.i.discount.prior));
  // 2) Inzerovaná sleva, ale před 30 dny bylo levněji (směrnice Omnibus: sleva se má počítat z nejnižší ceny za 30 dní).
  const notLowest = all.filter((x) => !x.i.discount?.suspicious && x.i.discount?.lowest30 != null && x.s.price > x.i.discount.lowest30 * 1.03 && ((x.p.discount > 0) || (x.s.ch7 != null && x.s.ch7 < -2)));
  // 3) Rychlé zdražení za týden (často před akcí)
  const jumps = all.filter((x) => x.s.ch7 != null && x.s.ch7 >= 6).sort((a, b) => b.s.ch7 - a.s.ch7).slice(0, 8);
  // 4) Opravdu dobré ceny: nejnižší za 30 dní a skóre Kup teď
  const real = all.filter((x) => x.i.score?.tone === 'buy' && x.i.discount?.lowest30 != null && x.s.price <= x.i.discount.lowest30 * 1.005).sort((a, b) => b.i.score.score - a.i.score.score).slice(0, 8);

  const card = (x, i) => {
    const d = x.i.discount;
    const u = x.p.unit || 'Kč';
    return `<li class="deal" data-pid="${esc(x.p.id)}">
      <div class="deal-head"><a class="nm" href="${productLink(x.p.id)}" data-prefetch="${esc(x.p.id)}">${esc(x.p.name)}</a><span class="sub">${esc(catName(categoryById(x.p.category)))}</span></div>
      <div class="deal-chart chart" id="dc${i}" aria-hidden="true"></div>
      <dl class="deal-facts">
        <div><dt>${t('před zdražením')}</dt><dd>${money(d.prior, u)}</dd></div>
        <div><dt>${t('zdraženo na')}</dt><dd class="chg-up">${money(d.peak, u)}</dd><small>${dateFmt(d.peakDate)}</small></div>
        <div><dt>${t('„sleva“ na')}</dt><dd>${money(x.s.price, u)}</dd><small class="chg-down">${pct(d.discountFromPeak)} ${t('od špičky')}</small></div>
        <div><dt>${t('skutečně')}</dt><dd class="${x.s.price > d.prior ? 'chg-up' : ''}">${pct(((x.s.price - d.prior) / d.prior) * 100)}</dd><small>${t('proti ceně před zdražením')}</small></div>
      </dl>
    </li>`;
  };
  const item = (x, val, small) => `<li data-pid="${esc(x.p.id)}"><a class="item" href="${productLink(x.p.id)}"><span class="nm">${esc(x.p.name)}</span><span class="val">${val}${small ? `<small>${small}</small>` : ''}</span><span class="sub">${esc(catName(categoryById(x.p.category)))}, ${t('teď')} ${money(x.s.price, x.p.unit)}</span></a></li>`;
  const cats = CATEGORIES.filter((c) => c.kind === 'spotrebni');

  main.innerHTML =
    hero({
      crumb: `<a href="${link('/')}">${t('Přehled')}</a>`,
      title: t('Pozor na tyto akce'),
      lead: t('Slevy, které nejsou tak výhodné, jak vypadají. Hlídáme zdražení těsně před akcí a nejnižší cenu za posledních 30 dní.'),
      aside: `<dl class="pulse"><div><dt>${t('nafouknuté slevy')}</dt><dd class="up">${fake.length}</dd></div><div><dt>${t('není nejnižší cena')}</dt><dd>${notLowest.length}</dd></div><div><dt>${t('opravdu dobrá cena')}</dt><dd class="down">${real.length}</dd></div></dl>`,
    }) +
    sheet(`
    <div class="toolbar"><div class="controls"><div class="ctl"><span class="ctl-label">${t('Odvětví')}</span><span class="seg" role="group">${[['', t('Vše')], ...cats.map((c) => [c.id, catName(c)])].map(([k, l]) => `<button type="button" data-action="d-cat" data-v="${k}" aria-pressed="${cat === k}">${esc(l)}</button>`).join('')}</span></div></div></div>
    <section class="section"><div class="section-head"><div><h2>${ICON.shield}${t('Nafouknuté slevy')}</h2><p>${t('Cena byla v posledních dvou měsících zvednuta o 8 % a víc a pak „zlevněna“ zpátky.')}</p></div></div>
      ${fake.length ? `<ul class="deals">${fake.map(card).join('')}</ul>` : `<p class="empty">${t('Teď nevidíme žádnou nafouknutou slevu. Dobrá zpráva.')}</p>`}
    </section>
    <section class="section cols">
      <div><div class="section-head"><div><h2>${t('Sleva, ale ne nejnižší cena')}</h2><p>${t('Před 30 dny bylo levněji, než je teď „akční“ cena.')}</p></div></div>
        ${notLowest.length ? `<ul class="list">${notLowest.map((x) => item(x, `<span class="chg-up">+${nf(1).format(((x.s.price - x.i.discount.lowest30) / x.i.discount.lowest30) * 100)} %</span>`, `${t('minimum 30 dní')} ${money(x.i.discount.lowest30, x.p.unit)}`)).join('')}</ul>` : `<p class="empty">${t('Nic takového teď nevidíme.')}</p>`}</div>
      <div><div class="section-head"><div><h2>${t('Zdražilo za týden')}</h2><p>${t('Prudké zdražení bývá předzvěstí „slevové“ akce')}</p></div></div>
        ${jumps.length ? `<ul class="list">${jumps.map((x) => item(x, `<span class="chg-up">${pct(x.s.ch7)}</span>`, t('za 7 dní'))).join('')}</ul>` : `<p class="empty">${t('Za poslední týden nic prudce nezdražilo.')}</p>`}</div>
    </section>
    <section class="section"><div class="section-head"><div><h2>${t('Tohle jsou opravdu dobré ceny')}</h2><p>${t('Nejnižší cena za 30 dní a skóre Kup teď')}</p></div></div>
      ${real.length ? `<ul class="list">${real.map((x) => item(x, scoreBadge(x.i.score, { tip: false }), t('nejnižší za 30 dní'))).join('')}</ul>` : `<p class="empty">${t('Teď nic nesplňuje obě podmínky.')}</p>`}
    </section>
    <div class="acc-list section">
      ${accordion({ id: 'acc-omnibus', title: t('Jak poznat falešnou slevu'), body: `<ul class="tips">
        <li>${t('Od roku 2023 musí obchod u slevy uvádět nejnižší cenu za posledních 30 dní. Sleva se má počítat z ní, ne z „doporučené“ ceny.')}</li>
        <li>${t('Když cena týden před akcí vyskočí nahoru, sleva je jen návrat k původní ceně.')}</li>
        <li>${t('Porovnej víc prodejců – na detailu produktu vidíš jejich ceny i odhad.')}</li>
        <li>${t('Nastav si hlídač nebo cílovou cenu v seznamu přání a nech BuyWise čekat za tebe.')}</li></ul>` })}
    </div>`);

  // Malé grafy: posledních 90 dní, zvýrazněná špička zdražení.
  const draw = () =>
    fake.forEach((x, i) => {
      const el = main.querySelector('#dc' + i);
      if (!el) return;
      const u = x.p.unit || 'Kč';
      lineChart(el, {
        series: [{ name: x.p.name, color: 'var(--up)', data: x.s.history.slice(-90).map((h) => ({ t: T(h.d), v: conv(h.p, u).v })), width: 2 }],
        height: 120,
        valFmt: (v) => `${nf(Math.abs(v) >= 100 ? 0 : 2, 0).format(v)} ${unitOf(u)}`,
        label: t('Graf vývoje ceny'),
      });
    });
  draw();
  S.redraw = draw;
  actions({
    'd-cat': (el) => {
      setQuery({ odvetvi: el.dataset.v || null });
      renderDeals(main, new URLSearchParams(el.dataset.v ? { odvetvi: el.dataset.v } : {}));
    },
  });
  return true;
}
