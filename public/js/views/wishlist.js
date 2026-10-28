// Chytrý seznam přání: co chci koupit, cílová cena a doporučení, kdy koupit (skóre Kup teď / Počkej).
import { S, categoryById, catName, productById, sum, money, pct, pctClass, esc, priceText, productLink, link, catLink, ICON, toast, hero, sheet, insight, scoreBadge, scoreWhen, conv, unitOf, CATEGORIES } from '../core.js';
import { actions, reducedMotion } from '../ui.js';
import { sparkline } from '../chart.js';
import { wish, apiUser, authAvailable } from '../user.js';
import { t, tk } from '../i18n.js';

export function renderWishlist(main) {
  document.title = `${t('Seznam přání')} – BuyWise`;
  const items = wish
    .list()
    .map((w) => ({ w, p: productById(w.id) }))
    .filter((x) => x.p)
    .map((x) => ({ ...x, s: sum(x.p), sc: insight(x.p).score }))
    .sort((a, b) => (b.sc?.score ?? -1) - (a.sc?.score ?? -1));
  const buyNow = items.filter((x) => x.sc?.tone === 'buy' || (x.w.target && x.s.price <= x.w.target));
  const total = items.reduce((a, x) => a + (x.p.unit?.startsWith('Kč') && !x.p.unit.includes('/') ? x.s.price || 0 : 0), 0);
  const saved = items.reduce((a, x) => a + (x.w.addedPrice && x.p.unit?.startsWith('Kč') ? x.w.addedPrice - (x.s.price || 0) : 0), 0);
  const canDigest = !!(S.profile && S.profile.features?.email);

  const row = (x) => {
    const { w, p, s, sc } = x;
    const u = p.unit || 'Kč';
    const since = w.addedPrice ? ((s.price - w.addedPrice) / w.addedPrice) * 100 : null;
    const hit = w.target && s.price <= w.target;
    const progress = w.target && w.addedPrice && w.addedPrice > w.target ? Math.max(0, Math.min(100, ((w.addedPrice - s.price) / (w.addedPrice - w.target)) * 100)) : hit ? 100 : null;
    return `<li class="wish ${hit ? 'hit' : ''}" data-pid="${esc(p.id)}">
      <div class="wish-score">${scoreBadge(sc, { size: 'lg' })}</div>
      <div class="wish-main">
        <a class="nm" href="${productLink(p.id)}" data-prefetch="${esc(p.id)}">${esc(p.name)}</a>
        <span class="sub">${esc(catName(categoryById(p.category)))}${p.subtitle ? `, ${esc(p.subtitle)}` : ''}</span>
        <p class="wish-when ${sc?.tone || ''}"><b>${esc(t(sc?.label || 'Málo dat'))}:</b> ${esc(scoreWhen(sc, u))}</p>
        ${sc?.reasons?.length ? `<p class="note">${sc.reasons.slice(0, 2).map((r) => esc(tk(r))).join(' ')}</p>` : ''}
      </div>
      <div class="wish-price">
        <span class="spark">${sparkline(s.history, s.trend.dir, 110, 32)}</span>
        <b>${priceText(p, s)}</b>
        ${since != null ? `<small class="${pctClass(since)}">${pct(since)} ${t('od přidání')}</small>` : ''}
      </div>
      <div class="wish-target">
        <label class="field compact"><span>${t('Cílová cena')} (${esc(unitOf(u))})</span><input type="number" inputmode="decimal" min="0" data-target="${esc(p.id)}" value="${w.target ? +conv(w.target, u).v.toFixed(2) : ''}" placeholder="${esc(t('např. {p}', { p: money(s.price * 0.9, u, true) }))}"></label>
        ${progress != null ? `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}" aria-label="${esc(t('Cesta k cílové ceně'))}"><span style="width:${progress}%"></span></div><small>${hit ? `<b class="chg-down">${t('Cíl splněn!')}</b>` : t('Zbývá {x}', { x: money(s.price - w.target, u) })}</small>` : ''}
      </div>
      <button type="button" class="icon-btn sm" data-action="w-rm" data-id="${esc(p.id)}" aria-label="${esc(t('Odebrat ze seznamu přání'))}" data-tip="${esc(t('Odebrat ze seznamu přání'))}">${ICON.close}</button>
    </li>`;
  };

  // Tipy na doplnění: produkty se skóre Kup teď, které v seznamu nejsou.
  const tips = S.data.products
    .filter((p) => p.active !== false && p.rank && !wish.has(p.id))
    .map((p) => ({ p, sc: insight(p).score }))
    .filter((x) => x.sc?.tone === 'buy')
    .sort((a, b) => b.sc.score - a.sc.score)
    .slice(0, 6);

  const account = S.standalone
    ? `<p class="note">${t('Samostatná HTML verze ukládá seznam přání jen v tomto prohlížeči.')}</p>`
    : S.user
    ? `<p class="note">${t('Seznam přání se synchronizuje mezi tvými zařízeními. Když cena klesne pod cílovou, pošleme e-mail.')}</p>
       ${canDigest ? `<label class="toggle"><input type="checkbox" id="w-digest" ${S.profile.weeklyDigest ? 'checked' : ''}> ${t('Posílat každé pondělí e-mail „BuyWise týden“ s mým seznamem přání')}</label>` : ''}`
    : authAvailable()
    ? `<p class="note">${t('Přihlas se a seznam budeš mít na všech zařízeních, s e-mailem při dosažení cílové ceny.')}</p><button type="button" class="btn alt" data-action="open-login">${t('Přihlásit se')}</button>`
    : `<p class="note">${t('Seznam přání se ukládá v tomto prohlížeči. Při návštěvě tě upozorníme, když je dobrá chvíle koupit.')}</p>`;

  main.innerHTML =
    hero({
      crumb: `<a href="${link('/')}">${t('Přehled')}</a>`,
      title: t('Seznam přání'),
      lead: t('Přidej si, co chceš koupit. BuyWise ohlídá nejlepší okamžik: odhad ceny, sezónu i falešné slevy.'),
      aside: items.length
        ? `<dl class="pulse"><div><dt>${t('v seznamu')}</dt><dd>${items.length}</dd></div><div><dt>${t('koupit teď')}</dt><dd class="down">${buyNow.length}</dd></div>${total ? `<div><dt>${t('celkem teď')}</dt><dd class="sm">${money(total)}</dd></div>` : ''}${saved > 0 ? `<div><dt>${t('zlevnilo od přidání')}</dt><dd class="sm down">${money(saved)}</dd></div>` : ''}</dl>`
        : '',
    }) +
    sheet(`
    <section class="card account-card">${account}</section>
    <section class="section">
      ${
        items.length
          ? `<ul class="wish-list" id="wishes">${items.map(row).join('')}</ul>`
          : `<div class="empty-state">${ICON.heart}<h2>${t('Seznam je zatím prázdný')}</h2><p>${t('Srdíčkem u produktu ho přidáš. Pak tu uvidíš, jestli koupit hned, nebo počkat.')}</p><a class="btn" href="${catLink(CATEGORIES.find((c) => c.kind === 'spotrebni').id)}">${t('Projít žebříčky')}${ICON.arrow}</a></div>`
      }
    </section>
    ${
      tips.length
        ? `<section class="section"><div class="section-head"><div><h2>${t('Teď se vyplatí koupit')}</h2><p>${t('Produkty se skóre 60 a víc, které ještě v seznamu nemáš')}</p></div></div>
      <ul class="list">${tips.map((x) => `<li data-pid="${esc(x.p.id)}" class="tip-row"><a class="item" href="${productLink(x.p.id)}"><span class="nm">${esc(x.p.name)}</span><span class="val">${scoreBadge(x.sc, { tip: false })}</span><span class="sub">${esc(catName(categoryById(x.p.category)))}, ${priceText(x.p, sum(x.p))}</span></a><button type="button" class="icon-btn sm wish-btn" data-action="wish" data-id="${esc(x.p.id)}" aria-pressed="false" aria-label="${esc(t('Přidat do seznamu přání'))}" data-tip="${esc(t('Přidat do seznamu přání'))}">${ICON.heart}</button></li>`).join('')}</ul></section>`
        : ''
    }`);

  actions({
    'w-rm': async (el) => {
      // Nejdřív animace odjezdu, pak smazání (uložení vyvolá překreslení stránky).
      const li = el.closest('li');
      if (li && !reducedMotion()) await li.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(24px)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished;
      await wish.toggle(el.dataset.id);
    },
  });
  // Cílová cena: uloží se po opuštění pole / Enteru (v Kč, i když je zobrazena jiná měna)
  main.querySelectorAll('[data-target]').forEach((inp) =>
    inp.addEventListener('change', async () => {
      const p = productById(inp.dataset.target);
      const v = parseFloat(inp.value.replace(',', '.'));
      const k = conv(1, p.unit || 'Kč').v || 1;
      await wish.update(p.id, { target: Number.isFinite(v) && v > 0 ? v / k : null });
      toast(Number.isFinite(v) && v > 0 ? t('Cílová cena uložena.') : t('Cílová cena smazána.'), 'ok', 2500);
    })
  );
  main.querySelector('#w-digest')?.addEventListener('change', async (e) => {
    try {
      await apiUser('setDigest', { on: e.target.checked });
      S.profile.weeklyDigest = e.target.checked;
      toast(e.target.checked ? t('Týdenní souhrn zapnutý.') : t('Týdenní souhrn vypnutý.'), 'ok');
    } catch (err) {
      e.target.checked = !e.target.checked;
      toast(esc(err.message), 'err');
    }
  });
  return true;
}
