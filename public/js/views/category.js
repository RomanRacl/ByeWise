// Žebříček odvětví: master-detail. Vlevo seznam (master), vpravo rychlý náhled vybraného produktu (detail).
// Na úzké obrazovce se náhled otevře jako drawer zespodu. Řazení, filtry a výběr jsou v adrese (?razeni=…&filtr=…&vyber=…).
import {
  S, categoryById, catName, catNote, catPriceLabel, byCat, sum, money, pct, pctClass, esc, chip, rankMove, priceText, productLink, catLink, link, ICON,
  monthName, downloadFile, toCsv, conv, unitOf, setQuery, hero, sheet, productById, nf, insight, scoreBadge, scoreWhen,
} from '../core.js';
import { sparkline, seasonBars, lineChart, T } from '../chart.js';
import { favs, cmp, wishButton } from '../user.js';
import { actions, accordion, openDrawer, closeDrawer, drawerOpen, reducedMotion } from '../ui.js';
import { setBackdrop, productPhotos, categoryPhotos, groupOf } from '../photos.js';
import { buyAdvice, investSignal, competitorAnalysis } from '../../lib/analytics.js';
import { VERDICT_ICON } from './product.js';
import { t, tk, nProducts } from '../i18n.js';

const WIDE = '(min-width: 1100px)';
const isWide = () => window.matchMedia(WIDE).matches;

// Plynulé přeskupení řádků (FLIP) při změně řazení či filtru.
function flip(container, fn) {
  const before = new Map([...container.querySelectorAll('[data-pid]')].map((el) => [el.dataset.pid, el.getBoundingClientRect().top]));
  fn();
  if (reducedMotion()) return;
  container.querySelectorAll('[data-pid]').forEach((el, i) => {
    const old = before.get(el.dataset.pid);
    if (old == null) {
      el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: i * 18, easing: 'ease-out', fill: 'backwards' });
      return;
    }
    const dy = old - el.getBoundingClientRect().top;
    if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.7,.2,1)' });
  });
}

// ---------- Rychlý náhled (detail v master-detail) ----------
export function quickView(p) {
  const s = sum(p);
  const c = categoryById(p.category);
  const invest = c.kind === 'investicni';
  const v = invest ? investSignal(s.history) : buyAdvice(s.history, s.forecast);
  const comp = competitorAnalysis(p);
  const f = s.forecast;
  const fav = favs.has(p.id);
  const inCmp = cmp.has(p.id);
  const sc = invest ? null : insight(p).score;
  return `<article class="qv" data-pid="${esc(p.id)}" aria-label="${esc(p.name)}">
    <header class="qv-head">
      <div>
        <p class="qv-cat">${[p.rank ? t('{n}. místo', { n: p.rank }) : '', p.subtitle ? esc(p.subtitle) : ''].filter(Boolean).join(', ')}</p>
        <h2 class="nm">${esc(p.name)}</h2>
      </div>
      <span class="tag qv-tag">${p.free ? t('Zdarma') : esc(money(s.price, p.unit, true))}<small>${p.free ? '' : esc(unitOf(p.unit))}</small></span>
    </header>
    <div class="qv-trend">${chip(s.trend)}<span class="${pctClass(s.ch30)}">${pct(s.ch30)} ${t('za 30 dní')}</span>${f ? `<span data-tip="${esc(t('Odhad: exponenciální vyhlazování s tlumeným trendem, u zboží navíc sezónnost.'))}" tabindex="0">${t('odhad')} <b class="${pctClass(f.changePct)}">${pct(f.changePct)}</b></span>` : ''}</div>
    <div class="chart qv-chart" id="qvChart"></div>
    ${sc
      ? `<div class="qv-verdict qv-score ${sc.tone}">${scoreBadge(sc, { size: 'lg', tip: false })}<div><b>${esc(t(sc.label))}</b><p>${esc(scoreWhen(sc, p.unit))}${sc.reasons[0] ? `. ${esc(tk(sc.reasons[0]))}` : ''}</p></div></div>`
      : `<div class="qv-verdict ${v.tone}"><span class="ico">${VERDICT_ICON[v.tone] || VERDICT_ICON.neutral}</span><div><b>${esc(t(v.label))}</b><p>${invest ? esc(tk(v.reasons?.[0])) : esc(tk(v.text))}</p></div></div>`}
    ${comp.rows.length ? `<div class="qv-sellers"><h3>${t('Prodejci')}</h3><ol>${comp.rows.slice(0, 3).map((r, i) => `<li><span>${esc(r.name)}</span><b>${money(r.price, p.unit)}</b>${i === 0 ? `<em>${t('nejlevnější')}</em>` : ''}</li>`).join('')}</ol></div>` : ''}
    <div class="qv-actions">
      <a class="btn" href="${productLink(p.id)}" data-prefetch="${esc(p.id)}">${t('Celý detail')}${ICON.arrow}</a>
      <button type="button" class="icon-btn solid ${fav ? 'on' : ''}" data-action="fav" data-id="${esc(p.id)}" aria-pressed="${fav}" aria-label="${esc(fav ? t('Odebrat z oblíbených') : t('Přidat do oblíbených'))}" data-tip="${esc(fav ? t('Odebrat z oblíbených') : t('Přidat do oblíbených'))}">${ICON.star}</button>
      <button type="button" class="icon-btn solid" data-action="cmp" data-id="${esc(p.id)}" aria-pressed="${inCmp}" aria-label="${esc(t('Porovnat'))}" data-tip="${esc(inCmp ? t('V porovnání') : t('Přidat do porovnání'))}">${ICON.compare}</button>
      ${invest ? '' : wishButton(p.id)}
      <a class="icon-btn solid" href="${productLink(p.id)}#hlidac" aria-label="${esc(t('Hlídat cenu'))}" data-tip="${esc(t('Hlídat cenu'))}">${ICON.bell}</a>
    </div>
  </article>`;
}

export function drawQuickChart(root, p) {
  const el = root.querySelector('#qvChart');
  if (!el) return;
  const s = sum(p);
  const h = s.history.slice(-90);
  const u = p.unit || 'Kč';
  const f = s.forecast;
  lineChart(el, {
    series: [
      { name: p.name, color: 'var(--s1)', data: h.map((x) => ({ t: T(x.d), v: conv(x.p, u).v })), width: 2.25 },
      ...(f ? [{ name: t('Odhad'), color: 'var(--s1)', dash: '5 4', data: f.points.map((x) => ({ t: T(x.d), v: conv(x.p, u).v })) }] : []),
    ],
    band: f ? f.points.map((x) => ({ t: T(x.d), lo: conv(x.lo, u).v, hi: conv(x.hi, u).v })) : null,
    todayT: f && h.length ? T(h[h.length - 1].d) : null,
    height: 190,
    animate: !reducedMotion(),
    valFmt: (x) => `${nf(Math.abs(x) >= 100 ? 0 : 2, 0).format(x)} ${unitOf(u)}`,
    label: t('Graf vývoje ceny'),
  });
}

export function renderCategory(main, id, query = new URLSearchParams()) {
  const c = categoryById(id);
  if (!c) return false;
  document.title = `${catName(c)} – BuyWise`;
  const st = {
    sort: query.get('razeni') || 'rank',
    only: query.get('filtr') || '',
    min: query.get('od') || '',
    max: query.get('do') || '',
    sel: query.get('vyber') || '',
  };
  const consumer = c.kind === 'spotrebni';
  const list = byCat(id).map((p) => ({ p, s: sum(p), sc: insight(p).score }));
  const buyN = list.filter((x) => x.sc?.tone === 'buy').length;
  const inactive = S.data.products.filter((p) => p.category === id && (p.active === false || !p.rank));
  const n = (dir) => list.filter((x) => x.s.trend.dir === dir).length;
  const withCh = list.filter((x) => x.s.ch30 != null);
  const avg = withCh.length ? withCh.reduce((a, x) => a + x.s.ch30, 0) / withCh.length : null;
  const waitN = list.filter((x) => x.s.forecast && x.s.forecast.changePct <= -3).length;
  const season = (S.data.seasons || {})[id];
  const hasSale = list.some((x) => x.p.discount > 0 || (x.s.ch7 != null && x.s.ch7 < -2));

  const filtered = () => {
    const min = parseFloat(String(st.min).replace(',', '.'));
    const max = parseFloat(String(st.max).replace(',', '.'));
    return list.filter(({ p, s }) => {
      const v = conv(s.price, p.unit).v;
      if (Number.isFinite(min) && !(v >= min)) return false;
      if (Number.isFinite(max) && !(v <= max)) return false;
      if (st.only === 'down' && s.trend.dir !== 'klesa') return false;
      if (st.only === 'up' && s.trend.dir !== 'roste') return false;
      if (st.only === 'sale' && !(p.discount > 0 || (s.ch7 != null && s.ch7 < -2))) return false;
      if (st.only === 'fav' && !favs.has(p.id)) return false;
      if (st.only === 'wait' && !(s.forecast && s.forecast.changePct <= -3)) return false;
      if (st.only === 'buy' && insight(p).score?.tone !== 'buy') return false;
      return true;
    });
  };
  const sorted = () =>
    [...filtered()].sort((a, b) => {
      if (st.sort === 'ch30') return (b.s.ch30 ?? -1e9) - (a.s.ch30 ?? -1e9);
      if (st.sort === 'fc') return (a.s.forecast?.changePct ?? 1e9) - (b.s.forecast?.changePct ?? 1e9);
      if (st.sort === 'price') return (a.s.price ?? 1e18) - (b.s.price ?? 1e18);
      if (st.sort === 'score') return (b.sc?.score ?? -1) - (a.sc?.score ?? -1);
      return a.p.rank - b.p.rank;
    });

  const sorts = [['rank', t('Pořadí')], ...(consumer ? [['score', t('Skóre nákupu')]] : []), ['ch30', t('Změny ceny')], ['fc', t('Očekávaného poklesu')], ['price', t('Ceny')]];
  const onlys = [['', t('Vše')], ...(consumer ? [['buy', t('Kup teď')]] : []), ['down', t('Zlevňuje')], ['up', t('Zdražuje')], ['wait', t('Vyplatí se počkat')], ...(hasSale ? [['sale', t('Ve slevě')]] : []), ['fav', t('Oblíbené')]];
  const cur = unitOf(list[0]?.p.unit || 'Kč');
  const controlsHtml = () => `
    <div class="ctl"><span class="ctl-label">${t('Řadit podle')}</span>
      <span class="seg" role="group" aria-label="${esc(t('Řazení'))}">${sorts.map(([k, l]) => `<button type="button" data-action="c-sort" data-v="${k}" aria-pressed="${st.sort === k}">${l}</button>`).join('')}</span></div>
    <div class="ctl"><span class="ctl-label">${t('Filtr')}</span>
      <span class="seg" role="group" aria-label="${esc(t('Filtr'))}">${onlys.map(([k, l]) => `<button type="button" data-action="c-only" data-v="${k}" aria-pressed="${st.only === k}">${l}</button>`).join('')}</span></div>
    <div class="ctl"><span class="ctl-label">${t('Cena')}</span>
      <label class="range"><span class="sr-only">${t('Cena od')}</span><input type="number" inputmode="decimal" data-range="min" value="${esc(st.min)}" placeholder="${esc(t('od'))} ${esc(cur)}"></label>
      <label class="range"><span class="sr-only">${t('do')}</span><input type="number" inputmode="decimal" data-range="max" value="${esc(st.max)}" placeholder="${esc(t('do'))} ${esc(cur)}"></label></div>`;
  const activeFilters = () => (st.only ? 1 : 0) + (st.min ? 1 : 0) + (st.max ? 1 : 0) + (st.sort !== 'rank' ? 1 : 0);

  const row = ({ p, s, sc }, i) => {
    const f = s.forecast;
    const fav = favs.has(p.id);
    const selected = p.id === st.sel;
    return `<li data-pid="${esc(p.id)}" role="option" aria-selected="${selected}" tabindex="${selected || (!st.sel && i === 0) ? 0 : -1}" data-action="c-select" style="--i:${i}">
      <span class="tagcell"><span class="tag">${p.rank}</span>${rankMove(p)}</span>
      <span class="who">${p.image ? `<img class="thumb" src="${esc(p.image)}" alt="" loading="lazy">` : ''}<span><a class="nm" href="${productLink(p.id)}" data-prefetch="${esc(p.id)}" tabindex="-1">${esc(p.name)}</a>${p.sample ? `<span class="sample">${t('ukázka')}</span>` : ''}${p.discount ? `<span class="sale">−${p.discount} %</span>` : ''}<span class="sub">${esc(p.subtitle || '')}</span><span class="dem">${esc(p.demand || '')}</span></span></span>
      <span class="spark">${sparkline(s.history, s.trend.dir)}</span>
      <span class="price">${priceText(p, s)}<small>${esc(catPriceLabel(c))}</small></span>
      <span class="ch">${chip(s.trend)}<span class="small ${pctClass(s.ch30)}">${s.ch30 == null ? '' : pct(s.ch30) + ' / 30 d'}</span></span>
      <span class="fc">${consumer ? scoreBadge(sc) : ''}<span class="fc-txt">${f ? `<span class="${pctClass(f.changePct)}">${pct(f.changePct)}</span><small>${t('odhad za 30 dní')}</small>` : `<span class="muted">${t('málo dat')}</span>`}</span></span>
      <button type="button" class="star ${fav ? 'on' : ''}" data-action="fav" data-id="${esc(p.id)}" aria-pressed="${fav}" aria-label="${esc(fav ? t('Odebrat z oblíbených') : t('Přidat do oblíbených'))}" data-tip="${esc(fav ? t('Odebrat z oblíbených') : t('Přidat do oblíbených'))}" tabindex="-1">${ICON.star}</button>
    </li>`;
  };

  const heroHtml = hero({
    size: 'hero-cat',
    crumb: `<a href="${link('/')}">${t('Přehled')}</a>`,
    title: esc(catName(c)),
    lead: esc(catNote(c)),
    below: `<dl class="hero-stats">
      <div><dt>${t('v žebříčku')}</dt><dd>${list.length}</dd></div>
      <div><dt>${t('zdražuje')}</dt><dd class="up">${n('roste')}</dd></div>
      <div><dt>${t('zlevňuje')}</dt><dd class="down">${n('klesa')}</dd></div>
      <div><dt>${t('průměrná změna za 30 dní')}</dt><dd>${pct(avg)}</dd></div>
      ${consumer ? `<div><dt>${t('dobrá chvíle koupit')}</dt><dd class="down">${buyN}</dd></div><div><dt>${t('vyplatí se počkat')}</dt><dd>${waitN}</dd></div>` : ''}
      ${season?.strong ? `<div><dt>${t('obvykle nejlevnější měsíc')}</dt><dd>${esc(monthName(season.bestMonth))}</dd></div>` : ''}
    </dl>`,
  });

  main.innerHTML =
    heroHtml +
    sheet(`
    <div class="toolbar">
      <div class="controls" id="controls">${controlsHtml()}</div>
      <button type="button" class="btn alt only-narrow" data-action="c-filters">${ICON.sliders}${t('Řazení a filtry')}<span class="count" id="fcount">${activeFilters() || ''}</span></button>
      <button type="button" class="btn alt" data-action="c-csv" data-tip="${esc(t('Stáhnout žebříček pro Excel'))}">${ICON.download}<span class="hide-narrow">${t('Stáhnout CSV')}</span></button>
    </div>
    <div class="md">
      <div class="md-master">
        <div class="rank-head ${consumer ? 'has-score' : ''}" aria-hidden="true"><span>${t('Pořadí')}</span><span>${t('Produkt a poptávka')}</span><span>${t('90 dní')}</span><span>${esc(catPriceLabel(c))}</span><span>${t('Trend')}</span><span data-short="${esc(t('Skóre'))}">${consumer ? t('Skóre a výhled') : t('Výhled')}</span><span></span></div>
        <ol class="rank ${consumer ? 'has-score' : ''}" id="rank" role="listbox" aria-label="${esc(t('Žebříček'))}"></ol>
        <p class="empty" id="noresult" hidden>${t('Filtru neodpovídá žádný produkt.')}</p>
        <p class="note hint">${t('Klikni na řádek pro rychlý náhled, na název pro celý detail. Šipkami nahoru a dolů procházíš žebříček.')}</p>
      </div>
      <aside class="md-detail" id="detail" aria-live="polite"></aside>
    </div>
    <div class="acc-list section">
      ${season?.strong ? accordion({ id: 'acc-cseason', title: t('Kdy je odvětví nejlevnější'), sub: t('Průměrná odchylka cen od dlouhodobého trendu podle měsíce. Zelená = levněji.'), body: '<div class="chart" id="season"></div>' }) : ''}
      ${inactive.length ? accordion({ id: 'acc-out', title: t('Vypadlo z žebříčku'), sub: nProducts(inactive.length), body: `<ul class="list">${inactive.map((p) => `<li data-pid="${esc(p.id)}"><a class="item" href="${productLink(p.id)}"><span class="nm">${esc(p.name)}</span><span class="val">${priceText(p, sum(p))}</span><span class="sub">${p.prevRank ? t('dříve {n}. místo', { n: p.prevRank }) : t('dříve v žebříčku')}</span></a></li>`).join('')}</ul>` }) : ''}
    </div>`);

  const rankEl = main.querySelector('#rank');
  const detail = main.querySelector('#detail');

  const draw = (animate) => {
    const rows = sorted();
    const fn = () => {
      rankEl.innerHTML = rows.map(row).join('');
      main.querySelector('#noresult').hidden = !!rows.length || !list.length;
      if (!list.length) rankEl.innerHTML = `<li class="empty">${t('Žebříček je prázdný. Přidej produkty v administraci.')}</li>`;
    };
    animate ? flip(rankEl, fn) : fn();
    if (!animate) rankEl.classList.add('enter');
    const fc = main.querySelector('#fcount');
    if (fc) fc.textContent = activeFilters() || '';
  };

  // Detail: na širokém displeji panel vpravo, jinak drawer zespodu.
  const showDetail = (pid, { open = false, background = true } = {}) => {
    const p = productById(pid);
    if (!p) return;
    rankEl.querySelectorAll('[role=option]').forEach((li) => {
      const on = li.dataset.pid === pid;
      li.setAttribute('aria-selected', on);
      li.tabIndex = on ? 0 : -1;
    });
    if (isWide()) {
      const swap = () => {
        detail.innerHTML = quickView(p);
        drawQuickChart(detail, p);
      };
      if (detail.firstElementChild && !reducedMotion()) {
        const old = detail.firstElementChild;
        old.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 120, easing: 'ease-in' }).onfinish = () => {
          swap();
          detail.firstElementChild?.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
        };
      } else swap();
    } else if (open) {
      const body = openDrawer({ id: 'quick', side: 'bottom', title: esc(catName(c)), html: quickView(p), label: t('Zavřít'), onClose: () => setQuery({ vyber: null }) });
      requestAnimationFrame(() => drawQuickChart(body, p));
    }
    if (background) setBackdrop('p:' + p.id, groupOf(p.category), () => productPhotos(p));
  };

  const select = (pid, opts = {}) => {
    st.sel = pid;
    setQuery({ vyber: pid });
    showDetail(pid, { open: true, ...opts });
  };

  draw(false);
  // Výchozí obsah panelu: vybraný produkt z adresy, jinak první v žebříčku (pozadí zůstane na odvětví).
  const initial = st.sel && productById(st.sel) ? st.sel : list[0]?.p.id;
  if (initial) {
    if (isWide()) showDetail(initial, { background: !!st.sel });
    else if (st.sel) showDetail(initial, { open: true });
  }

  const apply = (animate = true) => {
    setQuery({ razeni: st.sort === 'rank' ? null : st.sort, filtr: st.only || null, od: st.min || null, do: st.max || null });
    draw(animate);
    if (st.sel) rankEl.querySelector(`[data-pid="${CSS.escape(st.sel)}"]`)?.setAttribute('aria-selected', 'true');
  };

  // Klávesnice v seznamu: šipky mění výběr, Enter otevře celý detail, mezerník náhled.
  rankEl.addEventListener('keydown', (e) => {
    const items = [...rankEl.querySelectorAll('[role=option]')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      next.focus();
      if (isWide()) select(next.dataset.pid);
    } else if (e.key === ' ') {
      e.preventDefault();
      select(items[i].dataset.pid);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[i].querySelector('a.nm')?.click();
    }
  });

  // Rozsah cen: změna hodnoty (není to kliknutí)
  const onRange = (e) => {
    const inp = e.target.closest('[data-range]');
    if (!inp) return;
    st[inp.dataset.range] = inp.value;
    apply(false);
  };
  main.querySelector('#controls').addEventListener('input', onRange);

  // Akce (jediný click handler v ui.js)
  const setSeg = (name, v) => document.querySelectorAll(`[data-action="${name}"]`).forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === v));
  actions({
    'c-select': (el, e) => {
      if (e.target.closest('.star')) return;
      select(el.dataset.pid);
    },
    'c-sort': (el) => {
      st.sort = el.dataset.v;
      setSeg('c-sort', st.sort);
      apply();
    },
    'c-filters': () => {
      const body = openDrawer({ id: 'filters', side: 'bottom', title: t('Řazení a filtry'), html: `<div class="controls stacked">${controlsHtml()}</div><button type="button" class="btn wide" data-action="drawer-close">${t('Zobrazit {x}', { x: nProducts(filtered().length) })}</button>`, label: t('Zavřít') });
      body.addEventListener('input', (e) => {
        onRange(e);
        body.querySelector('.btn.wide').textContent = t('Zobrazit {x}', { x: nProducts(filtered().length) });
      });
    },
    'c-csv': () => {
      const rows = [[t('Pořadí'), t('Název'), t('Podtitul'), t('Cena'), t('Jednotka'), t('Změna 30 dní %'), t('Trend'), t('Odhad za 30 dní'), t('Skóre nákupu'), t('Poptávka')]];
      for (const { p, s } of sorted()) rows.push([p.rank, p.name, p.subtitle || '', s.price, p.unit || 'Kč', s.ch30 != null ? +s.ch30.toFixed(2) : '', t(s.trend.label), s.forecast ? +s.forecast.endPrice.toFixed(2) : '', insight(p).score?.score ?? '', p.demand || '']);
      downloadFile(`buywise-${id}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
    },
  });
  // Filtry uvnitř draweru mění i tlačítko s počtem výsledků
  actions({
    'c-only': (el) => {
      st.only = el.dataset.v;
      setSeg('c-only', st.only);
      apply();
      const b = document.querySelector('#filters .btn.wide');
      if (b) b.textContent = t('Zobrazit {x}', { x: nProducts(filtered().length) });
    },
  });

  if (season?.strong) {
    const drawS = () => {
      const el = main.querySelector('#season');
      if (el && el.offsetParent) seasonBars(el, season.profile, (v) => (v == null ? '—' : `${pct(v)} ${t('proti průměru')}`));
    };
    main.addEventListener('acc-open', (e) => e.target.id === 'acc-cseason' && requestAnimationFrame(drawS));
    S.redraw = () => {
      drawS();
      if (isWide() && detail.firstElementChild) drawQuickChart(detail, productById(detail.firstElementChild.dataset.pid));
    };
  } else {
    S.redraw = () => {
      if (isWide() && detail.firstElementChild) drawQuickChart(detail, productById(detail.firstElementChild.dataset.pid));
      else if (isWide() && !detail.firstElementChild && initial) showDetail(st.sel || initial, { background: false });
    };
  }

  return {
    // Přechod zpět/vpřed na stejné stránce s jinými parametry
    update(q) {
      st.sel = q.get('vyber') || '';
      if (st.sel) showDetail(st.sel, { open: !drawerOpen() });
      else if (!isWide()) closeDrawer();
      else setBackdrop('cat:' + id, groupOf(id), () => categoryPhotos(id));
    },
  };
}
