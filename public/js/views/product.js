import {
  S, categoryById, catName, catNote, catDemandLabel, byCat, sum, analysis, fullProduct, productById, money, pct, pctClass, esc, chip, priceText,
  productLink, catLink, link, ICON, monthName, dateFmt, nf, decimals, conv, unitOf, toast, downloadFile, toCsv, slugFile, affiliateUrl, hero, sheet,
  insight, scoreBadge, scoreWhen,
} from '../core.js';
import { shareCard } from '../share.js';
import { lineChart, seasonBars, svgToPng, T } from '../chart.js';
import { favs, cmp, wish, localAlerts, pushAlerts, serverAlerts, describeAlert, apiUser, pushSupported, pushSubscription, reloadProfile, login, authAvailable } from '../user.js';
import { investSignal, signalBacktest, buyAdvice, competitorAnalysis, forecastAt, correlation, unitPrice, tco } from '../../lib/analytics.js';
import { actions, accordion, toggleAccordion, skeleton, reducedMotion } from '../ui.js';
import { t, tk } from '../i18n.js';

const pState = { range: 180, comp: true, days: 30 };
const COLORS = ['var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
export const VERDICT_ICON = {
  wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  buy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16l6-6 4 4 6-7"/><path d="M15 7h5v5"/></svg>',
  neutral: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/></svg>',
  bear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8l6 6 4-4 6 7"/><path d="M15 17h5v-5"/></svg>',
};
VERDICT_ICON.bull = VERDICT_ICON.buy;

// Vysvětlivky k ukazatelům (tooltipy).
export const TIPS = {
  trend: 'Trend: sklon ceny za 60 dní a skutečná změna za 30 dní. Hranice ±1,5 %.',
  forecast: 'Odhad: exponenciální vyhlazování s tlumeným trendem, u zboží navíc sezónnost.',
  accuracy: 'Odhad z minulosti porovnaný se skutečnou cenou o 30 dní později.',
  volatility: 'Průměrný denní výkyv ceny za posledních 90 dní.',
  rsi: 'RSI (14): nad 70 překoupeno, pod 30 přeprodáno.',
  macd: 'MACD: rozdíl 12- a 26denního průměru proti 9denní signální linii.',
  boll: 'Bollingerova pásma: průměr 20 dní ± 2 směrodatné odchylky.',
};

function energyPrice(kind) {
  const find = (name) => S.data.products.find((p) => p.category === 'pohonne' && p.name === name);
  const pick = kind === 'nafta' ? find('Nafta') : kind === 'elektro' ? find('Nabíjení AC') || find('Elektřina doma') : find('Natural 95');
  const s = pick ? sum(pick) : null;
  return s?.price ?? (kind === 'nafta' ? 36.5 : kind === 'elektro' ? 7 : 37.9);
}

function topCorrelations(p, h) {
  return ['komodity', 'krypto', 'akcie']
    .flatMap((id) => byCat(id))
    .filter((x) => x.id !== p.id)
    .map((o) => ({ o, c: correlation(h, sum(o).history) }))
    .filter((x) => x.c && Math.abs(x.c.r) >= 0.3)
    .sort((a, b) => Math.abs(b.c.r) - Math.abs(a.c.r))
    .slice(0, 3);
}

export async function renderProduct(main, id) {
  const light = productById(id);
  if (!light) return false;
  if (light.full === false && !S.full.has(id)) main.innerHTML = sheet(skeleton(8));
  const p = await fullProduct(id);
  const c = categoryById(p.category);
  const a = analysis(p);
  const s = a;
  const h = a.history;
  document.title = `${p.name} – BuyWise`;
  const invest = c?.kind === 'investicni';
  const sig = invest ? investSignal(h) : null;
  const sbt = invest ? signalBacktest(h) : null;
  const adv = invest ? null : buyAdvice(h, a.forecast);
  const comp = competitorAnalysis(p);
  const f = a.forecast;
  const u = p.unit || 'Kč';
  const cu = unitOf(u);
  const v = invest ? sig : adv;
  const fav = favs.has(p.id);
  const inCmp = cmp.has(p.id);
  const disc = a.discount;
  const infl = S.data.settings?.inflation;
  const up = unitPrice(s.price, p.attrs);
  const ins = insight(light);
  const sc = ins.score;
  const inWish = wish.has(p.id);

  // ---------- Hero (na fotce produktu) ----------
  const heroHtml = hero({
    size: 'hero-product',
    crumb: `<a href="${link('/')}">${t('Přehled')}</a><span aria-hidden="true">/</span><a href="${catLink(c.id)}">${esc(catName(c))}</a>`,
    title: `${esc(p.name)}${p.sample ? `<span class="sample">${t('ukázka')}</span>` : ''}`,
    titleAttrs: 'style="view-transition-name: pm-title"',
    lead: [p.subtitle ? esc(p.subtitle) : '', p.demand ? `${esc(catDemandLabel(c))}: ${esc(p.demand)}` : ''].filter(Boolean).join('<br>'),
    below: `<div class="hero-meta">${p.rank ? `<span class="rank-pill">${t('{n}. místo v odvětví {c}', { n: p.rank, c: esc(catName(c)) })}</span>` : `<span class="rank-pill">${t('Mimo aktuální žebříček')}</span>`}${p.image ? `<img class="p-thumb" src="${esc(p.image)}" alt="">` : ''}</div>
      <div class="actions">
        <button type="button" class="btn glass ${fav ? 'on' : ''}" data-action="p-fav" aria-pressed="${fav}">${ICON.star}<span>${fav ? t('V oblíbených') : t('Do oblíbených')}</span></button>
        <button type="button" class="btn glass" data-action="p-cmp" aria-pressed="${inCmp}">${ICON.compare}<span>${inCmp ? t('V porovnání') : t('Porovnat')}</span></button>
        ${invest ? '' : `<button type="button" class="btn glass wish-glass ${inWish ? 'on' : ''}" data-action="p-wish" aria-pressed="${inWish}">${ICON.heart}<span>${inWish ? t('V seznamu přání') : t('Chci koupit')}</span></button>`}
        <button type="button" class="btn glass" data-action="p-watch">${ICON.bell}<span>${t('Hlídat cenu')}</span></button>
        <button type="button" class="btn glass" data-action="p-share">${ICON.share}<span>${t('Sdílet')}</span></button>
        <button type="button" class="btn glass" data-action="p-card" data-tip="${esc(t('Obrázek s grafem a cenou pro sociální sítě'))}">${ICON.image}<span>${t('Obrázek')}</span></button>
        ${invest ? `<a class="btn glass" href="${link('/portfolio?add=' + encodeURIComponent(p.id))}">${ICON.briefcase}<span>${t('Do portfolia')}</span></a>` : ''}
      </div>`,
    aside: `<span class="tag big hero-tag" style="view-transition-name: pm-tag">${p.free ? t('Zdarma') : esc(money(s.price, u, true))}${p.free ? '' : `<small>${esc(cu)}</small>`}</span>
      <div class="hero-price-meta">${chip(s.trend)}<span data-tip="${esc(t(TIPS.trend))}" tabindex="0" class="info-dot" aria-label="${esc(t('Jak počítáme trend'))}">${ICON.info}</span></div>
      <div class="asof">${t('Cena k {d}', { d: dateFmt(s.priceDate) })}${up ? `<br>${money(up.value, u)} / ${esc(up.metric)}` : ''}</div>`,
  });

  // ---------- Skóre Kup teď / Počkej ----------
  const scorePanel = sc
    ? `<section class="score-panel ${sc.tone} reveal" aria-labelledby="sc-h">
      ${scoreBadge(sc, { size: 'xl', tip: false })}
      <div class="score-body">
        <p class="eyebrow">${t('Skóre nákupu BuyWise')}</p>
        <h2 id="sc-h">${esc(t(sc.label))}</h2>
        <p class="score-when">${esc(scoreWhen(sc, u))}</p>
        <ul class="score-why">${sc.reasons.slice(0, 4).map((r) => `<li>${esc(tk(r))}</li>`).join('')}</ul>
        <p class="note">${t('Skóre 0–100 skládá odhad ceny, polohu v ročním rozpětí, sezónnost a kontrolu slev. Nad 60 = dobrá chvíle, pod 40 = spíš počkej.')}</p>
      </div>
      ${ins.min != null && ins.max != null && ins.max > ins.min ? `<div class="range-meter" aria-label="${esc(t('Cena v ročním rozpětí'))}"><span class="rm-label">${t('Roční rozpětí')}</span><div class="rm-track"><i style="left:${Math.max(0, Math.min(100, ((s.price - ins.min) / (ins.max - ins.min)) * 100))}%"></i></div><div class="rm-ends"><span>${money(ins.min, u)}</span><span>${money(ins.max, u)}</span></div></div>` : ''}
    </section>`
    : '';

  // ---------- Verdikt ----------
  const verdict = `<div class="verdict ${v.tone} reveal">
      <span class="ico">${VERDICT_ICON[v.tone] || VERDICT_ICON.neutral}</span>
      <div>
        <h2>${esc(t(v.label))}</h2>
        ${
          invest
            ? `<ul>${sig.reasons.map((r) => `<li>${esc(tk(r))}</li>`).join('')}</ul><p class="note">${t('Technický signál z historie cen, ne investiční doporučení. Rozhodnutí o investici je na tobě.')}</p>`
            : `<p>${esc(tk(adv.text))}</p>${comp.cheapestNow ? `<p>${t('Nejlevněji teď:')} <strong>${esc(comp.cheapestNow.name)}</strong> ${t('za')} ${money(comp.cheapestNow.price, u)}.</p>` : ''}${a.season?.strong ? `<p>${t('Historicky bývá nejlevnější v měsíci {m} ({v} % pod průměrem).', { m: monthName(a.season.bestMonth), v: Math.abs(a.season.bestPct) })}${f?.seasonal ? ' ' + t('Odhad na 30 dní s touto sezónností počítá.') : ''}</p>` : ''}`
        }
      </div>
    </div>`;

  let discountBlock = '';
  if (disc && (disc.suspicious || (disc.lowest30 != null && !invest))) {
    discountBlock = `<div class="notice ${disc.suspicious ? 'warn' : ''} reveal">
      ${disc.suspicious ? `<p><strong>${t('Pozor, sleva může být nafouknutá.')}</strong> ${t('Cena byla {d} zvednuta z asi {a} na {b} a teprve pak „zlevněna“. Proti ceně před zdražením je teď rozdíl jen {x}.', { d: dateFmt(disc.peakDate), a: money(disc.prior, u), b: money(disc.peak, u), x: pct(((s.price - disc.prior) / disc.prior) * 100) })}</p>` : ''}
      ${disc.lowest30 != null && !invest ? `<p>${t('Nejnižší cena za posledních 30 dní: {p}.', { p: money(disc.lowest30, u) })} ${s.price > disc.lowest30 * 1.01 ? t('Teď je o {x} dražší.', { x: pct(((s.price - disc.lowest30) / disc.lowest30) * 100, false) }) : t('Teď je na tomto minimu nebo pod ním.')}</p>` : ''}
    </div>`;
  }

  // ---------- Graf ----------
  const compRows = comp.rows.slice(0, 4);
  const ranges = [[30, t('1 měs.')], [90, t('3 měs.')], [180, t('6 měs.')], [365, t('1 rok')], [99999, t('Vše')]];
  const chartCard = `<div class="chart-card reveal">
      <div class="chart-top">
        <h2 class="h-sm">${t('Vývoj ceny a odhad na 30 dní')}</h2>
        <span class="seg" role="group" aria-label="${esc(t('Období'))}">${ranges.map(([d, l]) => `<button type="button" data-action="p-range" data-v="${d}" aria-pressed="${pState.range === d}">${l}</button>`).join('')}</span>
      </div>
      <div class="legend" id="legend"></div>
      <div class="chart-tools">
        ${compRows.length ? `<label class="toggle"><input type="checkbox" id="showComp" ${pState.comp ? 'checked' : ''}> ${t('Zobrazit ceny prodejců')}</label>` : '<span></span>'}
        <span class="tools"><button type="button" class="btn link" data-action="p-png" data-tip="${esc(t('Stáhnout graf jako obrázek'))}">${ICON.download}PNG</button><button type="button" class="btn link" data-action="p-csv" data-tip="${esc(t('Stáhnout historii cen pro Excel'))}">${ICON.download}CSV</button></span>
      </div>
      <div class="chart" id="chart"></div>
      ${f ? `<p class="note">${f.method === 'holt' ? t('Odhad: exponenciální vyhlazování s tlumeným trendem') : t('Odhad: lineární trend')}${f.seasonal ? t(', upraveno o sezónnost') : ''}. ${t('Pásmo ukazuje rozsah, kam cena s 90% pravděpodobností dojde.')}</p>` : ''}
    </div>`;

  const savings = !invest && a.forecast60 && !p.free
    ? `<section class="section reveal"><div class="section-head"><div><h2>${t('Kalkulačka úspory')}</h2><p>${t('Kolik můžeš ušetřit, když s nákupem počkáš')}</p></div></div>
        <div class="card calc"><label class="field">${t('Počkám')} <strong id="dLabel"></strong><input type="range" id="days" min="7" max="60" step="1" value="${pState.days}"></label><div id="savingsOut" class="calc-out" aria-live="polite"></div></div></section>`
    : '';

  const fig = (label, val, small = '', tip = '') => `<div${tip ? ` data-tip="${esc(t(tip))}" tabindex="0"` : ''}><span>${label}${tip ? ` <i class="tip-mark" aria-hidden="true">?</i>` : ''}</span><b>${val}</b>${small ? `<small>${small}</small>` : ''}</div>`;
  const chg = (x) => `<span class="${pctClass(x)}">${pct(x)}</span>`;
  const bt = a.backtest;
  const figures = `<div class="figures reveal">
      ${fig(t('Změna za 7 dní'), chg(s.ch7))}
      ${fig(t('Změna za 30 dní'), chg(s.ch30))}
      ${fig(t('Změna za 90 dní'), chg(s.ch90))}
      ${fig(t('Změna za rok'), chg(s.ch365), infl && s.ch365 != null ? (s.ch365 > infl.yoy ? t('rychleji než inflace ({v} %)', { v: infl.yoy }) : t('pomaleji než inflace ({v} %)', { v: infl.yoy })) : '')}
      ${fig(t('Odhad za 30 dní'), f ? money(f.endPrice, u) : '—', f ? `${pct(f.changePct)}, ${t('pásmo')} ${money(f.lo, u, true)}–${money(f.hi, u)}` : t('málo dat'), TIPS.forecast)}
      ${fig(t('Přesnost odhadů'), bt ? `±${nf(1).format(bt.mape)} %` : '—', bt ? t('průměrná chyba v {n} zpětných testech, směr trefen {k}×', { n: bt.n, k: bt.hits }) : t('zatím málo historie'), TIPS.accuracy)}
      ${fig(t('Kolísavost'), s.volatility != null ? pct(s.volatility, false) : '—', t('průměrný denní výkyv'), TIPS.volatility)}
      ${fig(t('Rozpětí za rok'), s.range ? `${money(s.range.min.p, u, true)}–${money(s.range.max.p, u)}` : '—', s.range ? t('minimum {d}', { d: dateFmt(s.range.min.d) }) : '')}
    </div>`;

  // ---------- Sekce v akordeonu ----------
  const sections = [];
  if (comp.rows.length) {
    sections.push(
      accordion({
        id: 'acc-comp',
        open: true,
        title: t('Srovnání prodejců'),
        sub: comp.cheapestNow ? `${t('nejlevněji')} ${esc(comp.cheapestNow.name)}, ${money(comp.cheapestNow.price, u)}` : '',
        body: `<ul class="facts">
          <li><span>${t('Nejlevněji teď:')} <strong>${esc(comp.cheapestNow.name)}</strong>, ${money(comp.cheapestNow.price, u)}</span></li>
          ${comp.cheapestLater ? `<li><span>${t('Za 30 dní nejspíš nejlevněji:')} <strong>${esc(comp.cheapestLater.name)}</strong>, ${t('kolem')} ${money(comp.cheapestLater.forecastPrice, u)}</span></li>` : ''}
          ${comp.biggestDrop && comp.biggestDrop.forecastPct < -0.5 ? `<li><span>${t('Největší očekávaný pokles:')} <strong>${esc(comp.biggestDrop.name)}</strong> (${pct(comp.biggestDrop.forecastPct)})</span></li>` : ''}
        </ul>
        <div class="table-wrap"><table class="cmp">
          <thead><tr><th>${t('Prodejce')}</th><th class="num">${t('Cena teď')}</th><th class="num">${t('Rozdíl')}</th><th>${t('Trend')}</th><th class="num">${t('Odhad za 30 dní')}</th></tr></thead>
          <tbody>${comp.rows
            .map((r) => {
              const ci = compRows.indexOf(r);
              const diff = ((r.price - comp.cheapestNow.price) / comp.cheapestNow.price) * 100;
              return `<tr class="${r === comp.cheapestNow ? 'best' : ''}">
                <td>${ci >= 0 ? `<span class="dot" style="background:${COLORS[ci]}"></span>` : ''}${affiliateUrl(r.url) ? `<a href="${esc(affiliateUrl(r.url))}" target="_blank" rel="noopener noreferrer sponsored">${esc(r.name)}</a>` : esc(r.name)}</td>
                <td class="num"><strong>${money(r.price, u)}</strong></td>
                <td class="num ${diff > 0.05 ? 'chg-up' : ''}">${diff > 0.05 ? '+' + pct(diff, false) : t('nejlevnější')}</td>
                <td>${chip(r.trend)}</td>
                <td class="num">${r.forecastPrice != null ? `${money(r.forecastPrice, u)} <span class="small ${pctClass(r.forecastPct)}">${pct(r.forecastPct)}</span>` : `<span class="muted">${t('málo dat')}</span>`}</td>
              </tr>`;
            })
            .join('')}</tbody>
        </table></div>`,
      })
    );
  }

  const isCar = p.category === 'auta' || p.category === 'ojete';
  const energy = p.attrs?.energy || 'benzin';
  if (isCar && s.price) {
    sections.push(
      accordion({
        id: 'acc-tco',
        open: true,
        title: t('Celkové náklady vlastnictví'),
        sub: t('Kolik tě auto opravdu bude stát včetně paliva, pojištění, servisu a ztráty hodnoty'),
        body: `<form class="tco" id="tco">
          <label class="field">${t('Roky')}<input name="years" type="number" min="1" max="15" value="3"></label>
          <label class="field">${t('Km za rok')}<input name="kmPerYear" type="number" min="1000" step="1000" value="15000"></label>
          <label class="field">${energy === 'elektro' ? t('Spotřeba kWh/100 km') : t('Spotřeba l/100 km')}<input name="consumption" type="number" step="0.1" value="${p.attrs?.consumption ?? (energy === 'elektro' ? 17 : 6)}"></label>
          <label class="field">${energy === 'elektro' ? t('Cena za kWh') : t('Cena paliva za litr')} (Kč)<input name="energyPrice" type="number" step="0.1" value="${energyPrice(energy).toFixed(1)}"></label>
          <label class="field">${t('Pojištění za rok')} (Kč)<input name="insurance" type="number" step="500" value="12000"></label>
          <label class="field">${t('Servis za rok')} (Kč)<input name="service" type="number" step="500" value="${p.category === 'ojete' ? 12000 : 8000}"></label>
          <label class="field">${t('Ztráta hodnoty za celé období')} (%)<input name="depreciationPct" type="number" min="0" max="100" value="${p.category === 'ojete' ? 25 : 40}"></label>
        </form><div id="tcoOut" class="calc-out" aria-live="polite"></div>`,
      })
    );
  }

  if (a.season) {
    sections.push(
      accordion({
        id: 'acc-season',
        title: t('Sezónnost ceny'),
        sub: a.season.strong ? t('Nejlevněji bývá v měsíci {a}, nejdráž v měsíci {b}.', { a: monthName(a.season.bestMonth), b: monthName(a.season.worstMonth) }) : t('Cena během roku výrazně nekolísá.'),
        body: '<div class="chart" id="season"></div>',
      })
    );
  }
  const rh = (p.rankHistory || []).filter((x) => x.r);
  if (rh.length >= 2) sections.push(accordion({ id: 'acc-rank', title: t('Pořadí v čase'), sub: t('Jak se produkt posouval v žebříčku poptávky'), body: '<div class="chart" id="rankChart"></div>' }));

  if (invest) {
    const ind = (l, val, tip) => `<div${tip ? ` data-tip="${esc(t(tip))}" tabindex="0"` : ''}><span>${l}${tip ? ' <i class="tip-mark" aria-hidden="true">?</i>' : ''}</span><b>${val}</b></div>`;
    const btLine = (k, label) => (sbt && sbt[k].n ? `<li>${t('Po signálu „{s}“ se cena za {d} obchodních dní změnila v průměru o {a} (stejným směrem v {h} % z {n} případů).', { s: t(label), d: sbt.ahead, a: pct(sbt[k].avg), h: Math.round(sbt[k].hit * 100), n: sbt[k].n })}</li>` : '');
    sections.push(
      accordion({
        id: 'acc-ind',
        open: true,
        title: t('Technické ukazatele'),
        sub: t('Hodnoty, ze kterých vychází signál'),
        body: `<div class="figures flat">
          ${ind(t('Průměr 20 dní'), sig.sma20 != null ? money(sig.sma20, u) : '—')}
          ${ind(t('Průměr 50 dní'), sig.sma50 != null ? money(sig.sma50, u) : '—')}
          ${ind('RSI (14)', sig.rsi != null ? nf(0).format(sig.rsi) : '—', TIPS.rsi)}
          ${ind('MACD', sig.macd ? `<span class="${sig.macd.hist > 0 ? 'chg-down' : 'chg-up'}">${sig.macd.hist > 0 ? t('nad signálem') : t('pod signálem')}</span>` : '—', TIPS.macd)}
          ${ind(t('Bollingerova pásma'), sig.boll ? `${money(sig.boll.lower, u, true)}–${money(sig.boll.upper, u)}` : '—', TIPS.boll)}
        </div>
        ${sbt && (sbt.bull.n || sbt.bear.n) ? `<h3 class="sub-h">${t('Jak by signál fungoval v minulosti')}</h3><ul class="facts">${btLine('bull', 'Býčí signál')}${btLine('bear', 'Medvědí signál')}</ul><p class="note">${t('Minulé výsledky nezaručují budoucí vývoj.')}</p>` : ''}`,
      })
    );
  }
  const corr = topCorrelations(p, h);
  if (corr.length) {
    sections.push(
      accordion({
        id: 'acc-corr',
        title: t('Souvislosti'),
        sub: t('Které komodity, kryptoměny a akcie se hýbou podobně (korelace denních změn)'),
        body: `<ul class="list">${corr
          .map((x) => `<li data-pid="${esc(x.o.id)}"><a class="item" href="${productLink(x.o.id)}" data-prefetch="${esc(x.o.id)}"><span class="nm">${esc(x.o.name)}</span><span class="val ${x.c.r > 0 ? '' : 'chg-up'}">r = ${nf(2).format(x.c.r)}<small>${x.c.r > 0 ? t('hýbe se stejným směrem') : t('hýbe se opačně')}</small></span><span class="sub">${esc(catName(categoryById(x.o.category)))}, ${t('{n} společných dní', { n: x.c.n })}</span></a></li>`)
          .join('')}</ul>`,
      })
    );
  }

  // Hlídač
  const alertsHere = [
    ...localAlerts.list().filter((x) => x.productId === p.id).map((x) => ({ ...x, kind: 'local' })),
    ...pushAlerts.list().filter((x) => x.productId === p.id).map((x) => ({ ...x, kind: 'push' })),
    ...serverAlerts().filter((x) => x.productId === p.id).map((x) => ({ ...x, kind: 'server' })),
  ];
  const canPush = pushSupported();
  const canEmail = !!(S.profile && S.profile.features?.email);
  sections.push(
    accordion({
      id: 'hlidac',
      open: alertsHere.length > 0,
      title: t('Hlídač ceny'),
      sub: alertsHere.length ? t('{n} aktivní', { n: alertsHere.filter((x) => x.active).length }) : t('Upozorníme tě, až cena klesne pod tvou hranici'),
      body: `<form class="alert-form" id="alertForm">
        <span class="seg" role="group" aria-label="${esc(t('Typ hlídače'))}"><button type="button" data-action="a-type" data-v="below" aria-pressed="true">${t('Pod cenu')}</button><button type="button" data-action="a-type" data-v="drop" aria-pressed="false">${t('Pokles o %')}</button></span>
        <label class="field"><span id="aLabel">${t('Cena')} (${esc(cu)})</span><input name="value" type="number" step="any" required value="${s.price ? +conv(s.price * 0.95, u).v.toFixed(decimals(s.price)) : ''}"></label>
        <fieldset class="channels"><legend>${t('Jak upozornit')}</legend>
          <label><input type="checkbox" name="ch" value="local" checked> ${t('V tomto prohlížeči (při otevření aplikace)')}</label>
          ${canPush ? `<label><input type="checkbox" name="ch" value="push"> ${t('Push notifikace na toto zařízení')}</label>` : ''}
          ${canEmail ? `<label><input type="checkbox" name="ch" value="email"> ${t('E-mailem na {e}', { e: S.user.email })}</label>` : !S.standalone && authAvailable() && !S.user ? `<p class="note"><button type="button" class="btn link" data-action="login">${t('Přihlas se')}</button> ${t('a budeme ti posílat e-maily.')}</p>` : ''}
        </fieldset>
        <button class="btn" type="submit">${t('Hlídat cenu')}</button>
        <p class="msg" id="aMsg" aria-live="polite"></p>
        ${alertsHere.length ? `<ul class="adm-list">${alertsHere.map((x) => `<li><span class="nm">${esc(describeAlert(x))}<small>${x.kind === 'local' ? t('v prohlížeči') : x.kind === 'push' ? t('push') : (x.channels || []).join(', ')}${x.active ? '' : ', ' + t('splněno {d}', { d: dateFmt((x.triggeredAt || '').slice(0, 10)) })}</small></span><button type="button" class="btn danger" data-action="a-del" data-v="${esc(x.kind + ':' + x.id)}">${t('Smazat')}</button></li>`).join('')}</ul>` : ''}
      </form>`,
    })
  );

  main.innerHTML =
    heroHtml +
    sheet(`${scorePanel}${verdict}${discountBlock}${chartCard}${savings}${figures}
      <div class="acc-list section">${sections.join('')}</div>
      <p class="note src">${t('Zdroj:')} ${esc((p.source || catNote(c)).replace(/\.$/, ''))}${affiliateUrl(p.link) ? `. <a href="${esc(affiliateUrl(p.link))}" target="_blank" rel="noopener noreferrer sponsored">${t('Otevřít u prodejce')}</a>` : ''}. ${t('Naposledy upraveno {d}.', { d: p.updatedAt ? dateFmt(p.updatedAt.slice(0, 10)) : '—' })}</p>`);

  // ---------- Kreslení ----------
  const toPts = (arr) => arr.map((x) => ({ t: T(x.d), v: conv(x.p, u).v }));
  const valFmt = (x) => `${nf(decimals(x), 0).format(x)} ${cu}`;
  const drawMain = (animate = false) => {
    const lastT = h.length ? T(h[h.length - 1].d) : Date.now();
    const start = lastT - pState.range * 86400000;
    const cut = (arr) => arr.filter((x) => x.t >= start);
    const series = [{ name: p.name, color: 'var(--s1)', data: cut(toPts(h)), width: 2.25 }];
    if (pState.comp) compRows.forEach((r, i) => series.push({ name: r.name, color: COLORS[i], data: cut(toPts(r.history)), width: 1.75 }));
    if (f) series.push({ name: t('Odhad'), color: 'var(--s1)', dash: '5 4', data: f.points.map((x) => ({ t: T(x.d), v: conv(x.p, u).v, extra: `${t('pásmo')} ${valFmt(conv(x.lo, u).v)}–${valFmt(conv(x.hi, u).v)}` })) });
    main.querySelector('#legend').innerHTML =
      series.filter((x) => !x.dash).map((x) => `<span><i style="background:${x.color}"></i>${esc(x.name)}</span>`).join('') +
      (f ? `<span><i class="dash"></i>${t('Odhad')}</span><span><i class="band"></i>${t('Pásmo nejistoty')}</span>` : '');
    lineChart(main.querySelector('#chart'), {
      series,
      band: f ? f.points.map((x) => ({ t: T(x.d), lo: conv(x.lo, u).v, hi: conv(x.hi, u).v })) : null,
      todayT: f ? lastT : null,
      valFmt,
      animate: animate && !reducedMotion(),
      label: t('Graf vývoje ceny'),
    });
  };
  const drawSeason = () => {
    const el = main.querySelector('#season');
    if (el && el.offsetParent) seasonBars(el, a.season.profile, (x) => (x == null ? '—' : `${pct(x)} ${t('proti průměru')}`));
  };
  const drawRank = () => {
    const el = main.querySelector('#rankChart');
    if (!el || !el.offsetParent) return;
    const maxR = Math.max(10, ...rh.map((x) => x.r));
    lineChart(el, {
      series: [{ name: t('Pořadí'), color: 'var(--s1)', data: rh.map((x) => ({ t: T(x.d), v: x.r })), stepped: true }],
      invert: true, yMin: 1, yMax: maxR, integer: true, height: 200,
      yFmt: (x) => `${x}.`, valFmt: (x) => t('{n}. místo', { n: x }), label: t('Pořadí v čase'),
    });
  };
  drawMain(true);
  S.redraw = () => {
    drawMain();
    drawSeason();
    drawRank();
  };
  // Grafy ve sbalených sekcích se nakreslí až při otevření.
  main.addEventListener('acc-open', (e) => {
    if (e.target.id === 'acc-season') requestAnimationFrame(drawSeason);
    if (e.target.id === 'acc-rank') requestAnimationFrame(drawRank);
  });

  // ---------- Akce (jediný click handler) ----------
  actions({
    'p-range': (el) => {
      pState.range = +el.dataset.v;
      main.querySelectorAll('[data-action="p-range"]').forEach((x) => x.setAttribute('aria-pressed', x === el));
      drawMain(true);
    },
    'p-png': () => svgToPng(main.querySelector('#chart svg'), `${slugFile(p.name)}-cena.png`).catch(() => toast(t('Export se nepovedl.'), 'err')),
    'p-csv': () => {
      const rows = [[t('Datum'), p.name, ...comp.rows.map((r) => r.name)]];
      const dates = [...new Set([...h.map((x) => x.d), ...comp.rows.flatMap((r) => r.history.map((x) => x.d))])].sort();
      const maps = comp.rows.map((r) => new Map(r.history.map((x) => [x.d, x.p])));
      const mainMap = new Map(h.map((x) => [x.d, x.p]));
      for (const d of dates) rows.push([d, mainMap.get(d) ?? '', ...maps.map((mm) => mm.get(d) ?? '')]);
      downloadFile(`${slugFile(p.name)}-historie.csv`, toCsv(rows), 'text/csv;charset=utf-8');
    },
    'p-fav': async (el) => {
      const on = await favs.toggle(p.id);
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on);
      el.querySelector('span').textContent = on ? t('V oblíbených') : t('Do oblíbených');
      toast(on ? t('Přidáno do oblíbených.') : t('Odebráno z oblíbených.'), 'ok', 2200);
    },
    'p-wish': async (el) => {
      const on = await wish.toggle(p.id);
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on);
      el.querySelector('span').textContent = on ? t('V seznamu přání') : t('Chci koupit');
      toast(on ? `${t('Přidáno do seznamu přání.')} <a href="${link('/prani')}">${t('Nastavit cílovou cenu')}</a>` : t('Odebráno ze seznamu přání.'), 'ok', 4000);
    },
    'p-card': () => shareCard(p, { s, sc, unit: u }).catch(() => toast(t('Obrázek se nepodařilo vytvořit.'), 'err')),
    'p-cmp': (el) => {
      const on = cmp.toggle(p.id);
      el.setAttribute('aria-pressed', on);
      el.querySelector('span').textContent = on ? t('V porovnání') : t('Porovnat');
    },
    'p-watch': () => {
      const d = main.querySelector('#hlidac');
      if (!d.open) toggleAccordion(d, true);
      d.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => d.querySelector('input[name=value]')?.focus({ preventScroll: true }), 350);
    },
    'p-share': async () => {
      const url = S.hash ? location.href : location.origin + `/produkt/${encodeURIComponent(p.id)}`;
      const text = `${p.name}: ${priceText(p, s).replace(/&nbsp;| /g, ' ')} (${t(s.trend.label).toLowerCase()})`;
      try {
        if (navigator.share) await navigator.share({ title: p.name, text, url });
        else {
          await navigator.clipboard.writeText(`${text} ${url}`);
          toast(t('Odkaz zkopírován do schránky.'), 'ok');
        }
      } catch {}
    },
    'a-type': (el) => {
      aType = el.dataset.v;
      aForm.querySelectorAll('[data-action="a-type"]').forEach((x) => x.setAttribute('aria-pressed', x === el));
      main.querySelector('#aLabel').textContent = aType === 'drop' ? t('Pokles v %') : `${t('Cena')} (${cu})`;
      valInput.value = aType === 'drop' ? 5 : s.price ? +conv(s.price * 0.95, u).v.toFixed(decimals(s.price)) : '';
    },
    'a-del': async (el) => {
      const [kind, aid] = el.dataset.v.split(/:(.*)/s);
      try {
        if (kind === 'local') localAlerts.remove(aid);
        else if (kind === 'push') await pushAlerts.remove(aid);
        else {
          await apiUser('deleteAlert', { id: aid });
          await reloadProfile();
        }
        refreshAlerts();
      } catch (err) {
        toast(esc(err.message), 'err');
      }
    },
  });

  main.querySelector('#showComp')?.addEventListener('change', (e) => {
    pState.comp = e.target.checked;
    drawMain();
  });

  // Kalkulačka úspory
  if (savings) {
    const out = main.querySelector('#savingsOut');
    const lab = main.querySelector('#dLabel');
    const calc = () => {
      const d = +main.querySelector('#days').value;
      pState.days = d;
      lab.textContent = t('{n} dní', { n: d });
      const est = forecastAt(a.forecast60, d);
      const diff = s.price - est.p;
      const later = comp.rows.map((r) => ({ r, est: r.history.length >= 6 ? forecastAt(analysis({ id: p.id + r.name, prices: r.history }).forecast60, d) : null })).filter((x) => x.est);
      const bestLater = later.length ? later.reduce((x, y) => (y.est.p < x.est.p ? y : x)) : null;
      out.innerHTML = `<div><span>${t('Očekávaná cena')}</span><b>${money(est.p, u)}</b><small>${t('pásmo')} ${money(est.lo, u, true)}–${money(est.hi, u)}</small></div>
        <div><span>${diff >= 0 ? t('Ušetříš asi') : t('Zaplatíš asi navíc')}</span><b class="${diff >= 0 ? 'chg-down' : 'chg-up'}">${money(Math.abs(diff), u)}</b><small>${pct(((est.p - s.price) / s.price) * 100)}</small></div>
        ${comp.cheapestNow ? `<div><span>${t('Nejlevnější prodejce teď')}</span><b>${money(comp.cheapestNow.price, u)}</b><small>${esc(comp.cheapestNow.name)}</small></div>` : ''}
        ${bestLater ? `<div><span>${t('Nejlevnější prodejce za {n} dní', { n: d })}</span><b>${money(bestLater.est.p, u)}</b><small>${esc(bestLater.r.name)}</small></div>` : ''}`;
    };
    main.querySelector('#days').addEventListener('input', calc);
    calc();
  }

  // TCO
  const tcoForm = main.querySelector('#tco');
  if (tcoForm) {
    const out = main.querySelector('#tcoOut');
    const calc = () => {
      const vals = Object.fromEntries([...new FormData(tcoForm).entries()].map(([k, x]) => [k, parseFloat(String(x).replace(',', '.')) || 0]));
      const r = tco({ price: s.price, ...vals });
      const parts = [[t('Ztráta hodnoty'), r.depreciation], [energy === 'elektro' ? t('Elektřina') : t('Palivo'), r.energy], [t('Pojištění'), r.insurance], [t('Servis'), r.service]];
      out.innerHTML = `<div><span>${t('Celkem za {n} roky', { n: vals.years })}</span><b>${money(r.total, 'Kč')}</b></div>
        <div><span>${t('Měsíčně')}</span><b>${money(r.perMonth, 'Kč')}</b></div>
        <div><span>${t('Na kilometr')}</span><b>${money(r.perKm, 'Kč')}</b></div>
        <div class="tco-bars">${parts.map(([l, x]) => `<div class="tco-bar"><span>${l}</span><i style="width:${Math.max(2, (x / r.total) * 100)}%"></i><b>${money(x, 'Kč')}</b></div>`).join('')}</div>`;
    };
    tcoForm.addEventListener('input', calc);
    calc();
  }

  // Hlídač (odeslání formuláře není kliknutí – zůstává submit)
  const aForm = main.querySelector('#alertForm');
  const valInput = aForm.querySelector('input[name=value]');
  let aType = 'below';
  const refreshAlerts = () => renderProduct(main, id).then(() => toggleAccordion(main.querySelector('#hlidac'), true));
  aForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = main.querySelector('#aMsg');
    const raw = parseFloat(String(valInput.value).replace(',', '.'));
    if (!(raw > 0)) return;
    const value = aType === 'drop' ? raw : raw / (conv(1, u).v || 1);
    const chans = [...aForm.querySelectorAll('[name=ch]:checked')].map((x) => x.value);
    if (!chans.length) {
      msg.textContent = t('Vyber, jak tě máme upozornit.');
      msg.className = 'msg err';
      return;
    }
    const base = { productId: p.id, type: aType, value, basePrice: s.price };
    try {
      if (chans.includes('local')) {
        localAlerts.add(base);
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      }
      const remote = chans.filter((x) => x !== 'local');
      if (remote.length) {
        const sub = remote.includes('push') ? await pushSubscription() : null;
        if (S.user) {
          await apiUser('addAlert', { ...base, channels: remote, subscription: sub });
          await reloadProfile();
        } else if (sub) {
          const r = await apiUser('pushAlert', { ...base, subscription: sub }, false);
          pushAlerts.add({ ...base, id: r.id, token: r.token, active: true });
        }
      }
      toast(t('Hlídač je nastavený.'), 'ok');
      refreshAlerts();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'msg err';
    }
  });
  if (location.hash === '#hlidac') setTimeout(() => main.querySelector('[data-action="p-watch"]')?.click(), 50);
  return true;
}
