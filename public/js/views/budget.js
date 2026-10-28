// Rozpočtový poradce: „Mám 30 000 Kč na notebook“ → co se do rozpočtu vejde a kdy to koupit nejlevněji.
// Stav formuláře je v adrese (?odvetvi=&castka=&kdy=), takže se dá výsledek poslat odkazem.
import { CATEGORIES, categoryById, catName, byCat, sum, money, esc, productLink, link, hero, sheet, insight, scoreBadge, monthName, conv, unitOf, setQuery, ICON } from '../core.js';
import { actions, reducedMotion } from '../ui.js';
import { budgetPlan } from '../../lib/analytics.js';
import { wishButton } from '../user.js';
import { t, tk, nProducts } from '../i18n.js';

const HORIZONS = [['hned', 'Potřebuju hned'], ['mesic', 'Do měsíce'], ['ctvrtleti', 'Do 3 měsíců'], ['kdykoli', 'Nespěchám']];

export function renderBudget(main, query = new URLSearchParams()) {
  document.title = `${t('Rozpočtový poradce')} – BuyWise`;
  const cats = CATEGORIES.filter((c) => c.kind === 'spotrebni');
  const st = {
    cat: categoryById(query.get('odvetvi'))?.kind === 'spotrebni' ? query.get('odvetvi') : '',
    amount: query.get('castka') || '',
    when: HORIZONS.some(([k]) => k === query.get('kdy')) ? query.get('kdy') : 'kdykoli',
  };
  const cur = unitOf('Kč');

  main.innerHTML =
    hero({
      crumb: `<a href="${link('/')}">${t('Přehled')}</a>`,
      title: t('Rozpočtový poradce'),
      lead: t('Řekni, kolik chceš utratit a kdy to potřebuješ. Poradíme, co se do rozpočtu vejde a kdy to koupit nejlevněji.'),
    }) +
    sheet(`
    <form class="card budget-form" id="bform" novalidate>
      <p class="budget-sentence">
        <span>${t('Mám')}</span>
        <label class="inline-field"><span class="sr-only">${t('Částka')}</span><input id="b-amount" type="number" inputmode="decimal" min="1" step="any" required value="${esc(st.amount)}" placeholder="30000"><b>${esc(cur)}</b></label>
        <span>${t('na')}</span>
        <label class="inline-field"><span class="sr-only">${t('Odvětví')}</span><select id="b-cat"><option value="">${t('cokoli')}</option>${cats.map((c) => `<option value="${c.id}" ${st.cat === c.id ? 'selected' : ''}>${esc(catName(c).toLowerCase())}</option>`).join('')}</select></label>
      </p>
      <div class="ctl"><span class="ctl-label">${t('Kdy to potřebuješ')}</span><span class="seg" role="group" aria-label="${esc(t('Kdy to potřebuješ'))}">${HORIZONS.map(([k, l]) => `<button type="button" data-action="b-when" data-v="${k}" aria-pressed="${st.when === k}">${t(l)}</button>`).join('')}</span></div>
      <button class="btn" type="submit">${ICON.wallet}${t('Poradit')}</button>
    </form>
    <section class="section" id="b-out" aria-live="polite"></section>`);

  const out = main.querySelector('#b-out');
  const run = (animate) => {
    const raw = parseFloat(String(st.amount).replace(',', '.'));
    if (!Number.isFinite(raw) || raw <= 0) {
      out.innerHTML = `<div class="empty-state small">${ICON.wallet}<p>${t('Zadej částku a vyber odvětví. Třeba 30 000 Kč na elektro, nespěchám.')}</p></div>`;
      return;
    }
    const budget = raw / (conv(1, 'Kč').v || 1); // přepočet zpět na Kč
    const pool = (st.cat ? byCat(st.cat) : cats.flatMap((c) => byCat(c.id))).filter((p) => !p.free && String(p.unit || 'Kč').startsWith('Kč'));
    const items = pool.map((p) => {
      const s = sum(p);
      const i = insight(p);
      return { id: p.id, p, price: s.price, score: i.score, forecast: s.forecast, season: i.season };
    });
    const plan = budgetPlan(items, budget, st.when).slice(0, 12);
    const over = pool.length - budgetPlan(items, budget, 'kdykoli').length;
    const planText = (x) => {
      const u = x.p.unit || 'Kč';
      if (x.plan.type === 'now') return `<b>${t('Kup teď')}</b> ${t('za {p}', { p: money(x.plan.price, u) })}`;
      if (x.plan.type === 'days') return `<b>${t('Počkej do 30 dní')}</b> – ${t('odhad {p}', { p: money(x.plan.price, u) })}`;
      return `<b>${t('Kup v měsíci {m}', { m: monthName(x.plan.month) })}</b> – ${t('obvykle kolem {p}', { p: money(x.plan.price, u) })}`;
    };
    out.innerHTML = plan.length
      ? `<div class="section-head"><div><h2>${t('Do rozpočtu {b} se vejde {x}', { b: money(budget), x: nProducts(plan.length) })}</h2><p>${t('Seřazeno podle skóre nákupu. Zbytek rozpočtu je po nákupu v doporučený čas.')}${over > 0 ? ' ' + t('Dalších {n} je i se slevou nad rozpočtem.', { n: over }) : ''}</p></div></div>
        <ol class="plan-list">${plan
          .map(
            (x, i) => `<li class="plan" data-pid="${esc(x.p.id)}" style="--i:${i}">
            ${scoreBadge(x.score)}
            <div class="plan-main"><a class="nm" href="${productLink(x.p.id)}" data-prefetch="${esc(x.p.id)}">${esc(x.p.name)}</a><span class="sub">${esc(catName(categoryById(x.p.category)))}${x.p.subtitle ? `, ${esc(x.p.subtitle)}` : ''}</span>
              <p class="plan-do">${planText(x)}${x.saving > 1 ? ` <span class="saving">${t('ušetříš asi {s}', { s: money(x.saving, x.p.unit) })}</span>` : ''}</p>
              ${!x.fitsNow ? `<p class="note">${t('Teď stojí {p}, tedy nad rozpočtem – vejde se až v doporučený čas.', { p: money(x.price, x.p.unit) })}</p>` : x.score?.reasons?.[0] ? `<p class="note">${esc(tk(x.score.reasons[0]))}</p>` : ''}
            </div>
            <div class="plan-side"><b>${money(x.plan.price, x.p.unit)}</b><small>${x.left >= 0 ? t('zbyde {z}', { z: money(x.left) }) : ''}</small>${wishButton(x.p.id, 'icon-btn sm')}</div>
          </li>`
          )
          .join('')}</ol>`
      : `<div class="empty-state small">${ICON.wallet}<h2>${t('Do rozpočtu se teď nic nevejde')}</h2><p>${t('Nejlevnější produkt v odvětví stojí {p}. Zkus vyšší částku nebo delší čekání.', { p: money(Math.min(...items.map((x) => x.price).filter(Boolean)) || null) })}</p></div>`;
    if (animate && !reducedMotion()) out.querySelectorAll('.plan').forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 280, delay: i * 30, easing: 'ease-out', fill: 'backwards' }));
  };
  const save = () => setQuery({ odvetvi: st.cat || null, castka: st.amount || null, kdy: st.when === 'kdykoli' ? null : st.when });

  const form = main.querySelector('#bform');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    st.amount = form.querySelector('#b-amount').value;
    st.cat = form.querySelector('#b-cat').value;
    save();
    run(true);
  });
  form.querySelector('#b-cat').addEventListener('change', (e) => {
    st.cat = e.target.value;
    save();
    if (st.amount) run(true);
  });
  actions({
    'b-when': (el) => {
      st.when = el.dataset.v;
      form.querySelectorAll('[data-action="b-when"]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === st.when));
      save();
      if (st.amount) run(true);
    },
  });
  run(false);
  return true;
}
