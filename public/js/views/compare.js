import { S, categoryById, catName, productById, sum, money, pct, pctClass, esc, chip, priceText, productLink, link, ICON, nf, navigate, toast, hero, sheet } from '../core.js';
import { actions } from '../ui.js';
import { lineChart, T } from '../chart.js';
import { cmp } from '../user.js';
import { unitPrice } from '../../lib/analytics.js';
import { t } from '../i18n.js';

const CMP_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

export function renderCompare(main, query) {
  document.title = `${t('Porovnání')} – BuyWise`;
  const fromUrl = (query.get('ids') || '').split(',').filter((id) => productById(id));
  if (fromUrl.length) cmp.set(fromUrl);
  const ids = cmp.list();
  const items = ids.map((id) => productById(id)).map((p) => ({ p, s: sum(p) }));
  const options = S.data.products
    .filter((p) => p.rank && !ids.includes(p.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(catName(categoryById(p.category)))})</option>`)
    .join('');

  const rowsDef = [
    [t('Odvětví'), ({ p }) => esc(catName(categoryById(p.category)))],
    [t('Pořadí'), ({ p }) => (p.rank ? `<span class="tag">${p.rank}</span>` : '—')],
    [t('Cena'), ({ p, s }) => `<strong>${priceText(p, s)}</strong>`],
    [t('Trend'), ({ s }) => chip(s.trend)],
    [t('Změna za 7 dní'), ({ s }) => `<span class="${pctClass(s.ch7)}">${pct(s.ch7)}</span>`],
    [t('Změna za 30 dní'), ({ s }) => `<span class="${pctClass(s.ch30)}">${pct(s.ch30)}</span>`],
    [t('Změna za 90 dní'), ({ s }) => `<span class="${pctClass(s.ch90)}">${pct(s.ch90)}</span>`],
    [t('Odhad za 30 dní'), ({ p, s }) => (s.forecast ? `${money(s.forecast.endPrice, p.unit)}<br><span class="small ${pctClass(s.forecast.changePct)}">${pct(s.forecast.changePct)}</span>` : '—')],
    [t('Kolísavost'), ({ s }) => (s.volatility != null ? pct(s.volatility, false) : '—')],
    [t('Cena za jednotku'), ({ p, s }) => {
      const up = unitPrice(s.price, p.attrs);
      return up ? `${money(up.value, p.unit)} / ${esc(up.metric)}` : '—';
    }],
    [t('Poptávka'), ({ p }) => esc(p.demand || '—')],
  ];

  main.innerHTML =
    hero({
      crumb: `<a href="${link('/')}">${t('Přehled')}</a>`,
      title: t('Porovnání produktů'),
      lead: t('Až 4 produkty vedle sebe. Graf ukazuje vývoj ceny přepočtený na stejný začátek (100 = cena před 6 měsíci), takže jdou porovnat i produkty v různých jednotkách.'),
    }) +
    sheet(`
    <form class="toolbar" id="addForm" onsubmit="return false">
      <label class="field grow">${t('Přidat produkt')}<select id="addSel" ${ids.length >= 4 ? 'disabled' : ''}><option value="">${t('Vyber…')}</option>${options}</select></label>
      ${ids.length ? `<button type="button" class="btn alt" data-action="cmp-clear">${t('Vyprázdnit')}</button><button type="button" class="btn alt" data-action="cmp-share">${ICON.share}${t('Odkaz na porovnání')}</button>` : ''}
    </form>
    ${
      items.length
        ? `<div class="chart-card reveal"><div class="legend">${items.map((x, i) => `<span><i style="background:${CMP_COLORS[i]}"></i>${esc(x.p.name)}</span>`).join('')}</div><div class="chart" id="idx"></div></div>
      <div class="table-wrap reveal" style="margin-top:20px"><table class="cmp compare">
        <thead><tr><th></th>${items.map((x, i) => `<th data-pid="${esc(x.p.id)}"><span class="dot" style="background:${CMP_COLORS[i]}"></span><a class="nm" href="${productLink(x.p.id)}">${esc(x.p.name)}</a><button type="button" class="icon-btn sm" data-action="cmp-rm" data-id="${esc(x.p.id)}" aria-label="${esc(t('Odebrat'))}" data-tip="${esc(t('Odebrat z porovnání'))}">${ICON.close}</button></th>`).join('')}</tr></thead>
        <tbody>${rowsDef.map(([label, fn]) => `<tr><th>${label}</th>${items.map((x) => `<td>${fn(x)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`
        : `<p class="empty">${t('Zatím tu nic není. Přidej produkt výběrem nahoře nebo tlačítkem Porovnat u produktu.')}</p>`
    }`);

  main.querySelector('#addSel').addEventListener('change', (e) => {
    if (!e.target.value) return;
    cmp.toggle(e.target.value);
    navigate('/porovnat', true);
  });
  actions({
    'cmp-clear': () => {
      cmp.set([]);
      navigate('/porovnat', true);
    },
    'cmp-share': async () => {
      const url = `${S.hash ? location.href.split('#')[0] + '#' : location.origin}/porovnat?ids=${ids.map(encodeURIComponent).join(',')}`;
      try {
        await navigator.clipboard.writeText(url);
        toast(t('Odkaz zkopírován do schránky.'), 'ok');
      } catch {}
    },
    'cmp-rm': (el) => {
      cmp.toggle(el.dataset.id);
      navigate('/porovnat', true);
    },
  });

  if (items.length) {
    const draw = () => {
      const now = Math.max(...items.map((x) => (x.s.history.length ? T(x.s.history[x.s.history.length - 1].d) : 0)));
      const start = now - 180 * 86400000;
      const series = items.map((x, i) => {
        const pts = x.s.history.filter((q) => T(q.d) >= start);
        const base = pts[0]?.p;
        return { name: x.p.name, color: CMP_COLORS[i], data: base ? pts.map((q) => ({ t: T(q.d), v: (q.p / base) * 100 })) : [] };
      });
      lineChart(main.querySelector('#idx'), { series, animate: true, valFmt: (v) => nf(1).format(v), yFmt: (v) => nf(0).format(v), label: t('Porovnání vývoje cen') });
    };
    draw();
    S.redraw = draw;
  }
  return true;
}
