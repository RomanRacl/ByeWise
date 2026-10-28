import { S, CATEGORIES, categoryById, catName, productById, sum, money, pct, pctClass, esc, productLink, link, conv, unitOf, toast, downloadFile, toCsv, hero, sheet } from '../core.js';
import { actions } from '../ui.js';
import { portfolio } from '../user.js';
import { t } from '../i18n.js';

const PF_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];

export function renderPortfolio(main, query) {
  document.title = `${t('Portfolio')} – BuyWise`;
  const holdings = portfolio.list().filter((h) => productById(h.productId));
  const preselect = query.get('add') || '';
  const investIds = CATEGORIES.filter((c) => c.kind === 'investicni').map((c) => c.id);
  const opts = S.data.products
    .filter((p) => investIds.includes(p.category))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map((p) => `<option value="${esc(p.id)}" ${p.id === preselect ? 'selected' : ''}>${esc(p.name)} (${esc(catName(categoryById(p.category)))})</option>`)
    .join('');

  const rows = holdings.map((h) => {
    const p = productById(h.productId);
    const s = sum(p);
    const value = (s.price || 0) * h.qty;
    const cost = h.buyPrice * h.qty;
    return { h, p, s, value, cost, pl: value - cost, plPct: cost ? ((value - cost) / cost) * 100 : null };
  });
  const total = rows.reduce((a, r) => a + r.value, 0);
  const totalCost = rows.reduce((a, r) => a + r.cost, 0);
  const totalPl = total - totalCost;
  const preP = productById(preselect);

  main.innerHTML =
    hero({
      crumb: `<a href="${link('/')}">${t('Přehled')}</a>`,
      title: t('Moje portfolio'),
      lead: `${t('Zadej, co vlastníš, a uvidíš aktuální hodnotu a zisk nebo ztrátu podle denních cen.')} ${S.user ? t('Ukládá se k tvému účtu.') : t('Ukládá se v tomto prohlížeči.')}`,
      aside: rows.length ? `<dl class="pulse"><div><dt>${t('hodnota teď')}</dt><dd>${money(total, 'Kč')}</dd></div><div><dt>${t('výnos')}</dt><dd class="${totalPl >= 0 ? 'down' : 'up'}">${pct(totalCost ? (totalPl / totalCost) * 100 : null)}</dd></div></dl>` : '',
    }) +
    sheet(`
    ${
      rows.length
        ? `<div class="stats">
        <div><b>${money(total, 'Kč')}</b><span>${t('hodnota teď')}</span></div>
        <div><b>${money(totalCost, 'Kč')}</b><span>${t('nakoupeno za')}</span></div>
        <div><b class="${totalPl >= 0 ? 'chg-down' : 'chg-up'}">${totalPl >= 0 ? '+' : '−'}${money(Math.abs(totalPl), 'Kč')}</b><span>${t('zisk / ztráta')}</span></div>
        <div><b class="${totalPl >= 0 ? 'chg-down' : 'chg-up'}">${pct(totalCost ? (totalPl / totalCost) * 100 : null)}</b><span>${t('výnos')}</span></div>
      </div>
      <div class="alloc" role="img" aria-label="${esc(t('Rozložení portfolia'))}">${rows
        .map((r, i) => `<i style="width:${total ? (r.value / total) * 100 : 0}%;background:${PF_COLORS[i % PF_COLORS.length]}" title="${esc(r.p.name)}: ${pct(total ? (r.value / total) * 100 : 0, false)}"></i>`)
        .join('')}</div>
      <div class="legend">${rows.map((r, i) => `<span><i style="background:${PF_COLORS[i % PF_COLORS.length]};height:10px"></i>${esc(r.p.name)} ${pct(total ? (r.value / total) * 100 : 0, false)}</span>`).join('')}</div>
      <div class="table-wrap"><table class="cmp">
        <thead><tr><th>${t('Položka')}</th><th class="num">${t('Množství')}</th><th class="num">${t('Nákupní cena')}</th><th class="num">${t('Cena teď')}</th><th class="num">${t('Hodnota')}</th><th class="num">${t('Zisk / ztráta')}</th><th></th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr><td><a href="${productLink(r.p.id)}">${esc(r.p.name)}</a>${r.h.date ? `<br><span class="small muted">${esc(r.h.date)}</span>` : ''}${r.h.note ? `<br><span class="small muted">${esc(r.h.note)}</span>` : ''}</td>
            <td class="num">${r.h.qty}</td><td class="num">${money(r.h.buyPrice, r.p.unit)}</td><td class="num">${money(r.s.price, r.p.unit)}</td><td class="num"><strong>${money(r.value, 'Kč')}</strong></td>
            <td class="num ${r.pl >= 0 ? 'chg-down' : 'chg-up'}">${r.pl >= 0 ? '+' : '−'}${money(Math.abs(r.pl), 'Kč')}<br><span class="small">${pct(r.plPct)}</span></td>
            <td><button type="button" class="btn danger" data-action="pf-rm" data-id="${esc(r.h.id)}">${t('Smazat')}</button></td></tr>`
          )
          .join('')}</tbody></table></div>
      <div class="btns"><button type="button" class="btn alt" data-action="pf-csv">${t('Stáhnout CSV')}</button></div>`
        : `<p class="empty">${t('Portfolio je prázdné. Přidej první položku.')}</p>`
    }
    <section class="section"><h2>${t('Přidat položku')}</h2>
      <form class="card grid2" id="pfForm">
        <label class="field">${t('Komodita, kryptoměna nebo akcie')}<select name="productId" required><option value="">${t('Vyber…')}</option>${opts}</select></label>
        <label class="field">${t('Množství')}<input name="qty" type="number" step="any" min="0" required></label>
        <label class="field"><span id="bpLabel">${t('Nákupní cena za kus')} (${esc(unitOf(preP?.unit || 'Kč'))})</span><input name="buyPrice" type="number" step="any" min="0" required value="${preP ? +conv(sum(preP).price, preP.unit).v.toFixed(2) : ''}"></label>
        <label class="field">${t('Datum nákupu')}<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="field">${t('Poznámka')}<input name="note" maxlength="80"></label>
        <div class="btns"><button class="btn" type="submit">${t('Přidat')}</button></div>
      </form>
      <p class="note">${t('Hodnoty jsou orientační podle denních cen v aplikaci. Nejde o investiční poradenství.')}</p>
    </section>`);

  const form = main.querySelector('#pfForm');
  form.productId.addEventListener('change', () => {
    const p = productById(form.productId.value);
    if (!p) return;
    main.querySelector('#bpLabel').textContent = `${t('Nákupní cena za kus')} (${unitOf(p.unit)})`;
    form.buyPrice.value = +conv(sum(p).price, p.unit).v.toFixed(2);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    const p = productById(fd.productId);
    const qty = parseFloat(String(fd.qty).replace(',', '.'));
    const bp = parseFloat(String(fd.buyPrice).replace(',', '.'));
    if (!p || !(qty > 0) || !(bp > 0)) return toast(t('Vyplň produkt, množství a cenu.'), 'err');
    const buyPrice = bp / (conv(1, p.unit).v || 1);
    await portfolio.save([...portfolio.list(), { id: Date.now().toString(36), productId: p.id, qty, buyPrice, date: fd.date, note: fd.note }]);
    toast(t('Přidáno do portfolia.'), 'ok');
    renderPortfolio(main, new URLSearchParams());
  });
  actions({
    'pf-rm': async (el) => {
      await portfolio.save(portfolio.list().filter((h) => h.id !== el.dataset.id));
      renderPortfolio(main, new URLSearchParams());
    },
    'pf-csv': () => {
      const out = [[t('Položka'), t('Množství'), t('Nákupní cena'), t('Cena teď'), t('Hodnota'), t('Zisk / ztráta'), t('Datum nákupu')]];
      for (const r of rows) out.push([r.p.name, r.h.qty, r.h.buyPrice, r.s.price, +r.value.toFixed(2), +r.pl.toFixed(2), r.h.date || '']);
      downloadFile('buywise-portfolio.csv', toCsv(out), 'text/csv;charset=utf-8');
    },
  });
  return true;
}
