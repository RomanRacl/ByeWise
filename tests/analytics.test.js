// Testy výpočtů: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clean, changePct, trend, forecast, forecastAt, seasonality, backtest, discountCheck,
  macd, bollinger, rsi, investSignal, signalBacktest, correlation, tco, unitPrice,
  buyAdvice, competitorAnalysis, summarize, analyzeFull, categorySeasonality, buyScore, budgetPlan, seasonalPrice, scoreProduct,
} from '../public/lib/analytics.js';
import { demoProducts, seedProducts } from '../public/lib/seed.js';
import { CATEGORIES } from '../public/lib/categories.js';

const DAY = 86400000;
const start = Date.UTC(2024, 0, 1);
const series = (n, fn, step = 1) =>
  Array.from({ length: n }, (_, i) => ({ d: new Date(start + i * step * DAY).toISOString().slice(0, 10), p: fn(i) }));

test('clean odstraní duplicity, nuly a seřadí', () => {
  const h = clean([{ d: '2026-01-02', p: 5 }, { d: '2026-01-01', p: 4 }, { d: '2026-01-02', p: 6 }, { d: '2026-01-03', p: 0 }]);
  assert.deepEqual(h, [{ d: '2026-01-01', p: 4 }, { d: '2026-01-02', p: 6 }]);
});

test('changePct a trend', () => {
  const up = series(120, (i) => 100 + i);
  assert.ok(changePct(up, 30) > 10);
  assert.equal(trend(up).dir, 'roste');
  assert.equal(trend(series(120, (i) => 300 - i)).dir, 'klesa');
  assert.equal(trend(series(120, () => 100)).dir, 'drzi');
  assert.equal(trend([]).dir, 'neznamy');
});

test('odhad u lineárního růstu míří správným směrem a přesně', () => {
  const h = series(180, (i) => 1000 + i * 2);
  const f = forecast(h, 30, { seasonal: false });
  assert.ok(f, 'odhad existuje');
  const truth = 1000 + (179 + 30) * 2;
  assert.ok(Math.abs(f.endPrice - truth) / truth < 0.03, `odhad ${f.endPrice} vs ${truth}`);
  assert.ok(f.lo <= f.endPrice && f.hi >= f.endPrice);
  assert.equal(f.method, 'holt');
  const mid = forecastAt(f, 15);
  assert.ok(mid.p > h.at(-1).p && mid.p < f.endPrice + 1);
});

test('málo dat = žádný odhad', () => {
  assert.equal(forecast(series(4, (i) => 10 + i)), null);
  assert.equal(buyAdvice(series(3, () => 10)).label, 'Málo dat');
});

test('řídká ruční data (měsíční záznamy) fungují', () => {
  const h = series(8, (i) => 500 - i * 10, 30);
  const f = forecast(h, 30, { seasonal: false });
  assert.ok(f && f.changePct < 0);
});

test('sezónnost najde nejlevnější a nejdražší měsíc', () => {
  // Cena v červenci +15 %, v listopadu −10 %, jinak 100.
  const prof = [0, 0, 0, 0, 0, 5, 15, 10, 0, 0, -10, -5];
  const h = series(760, (i) => 100 * (1 + prof[new Date(start + i * DAY).getUTCMonth()] / 100));
  const s = seasonality(h);
  assert.ok(s && s.strong);
  assert.equal(s.bestMonth, 10);
  assert.equal(s.worstMonth, 6);
  assert.equal(seasonality(series(100, () => 1)), null);
  const cat = categorySeasonality([s, s]);
  assert.equal(cat.bestMonth, 10);
});

test('zpětné ověření přesnosti', () => {
  const h = series(300, (i) => 100 + i * 0.5);
  const b = backtest(h);
  assert.ok(b && b.n >= 3);
  assert.ok(b.mape < 5, `chyba ${b.mape}`);
  assert.equal(b.hits, b.n);
});

test('odhalí nafouknutou slevu a spočítá nejnižší cenu za 30 dní', () => {
  // 100 dlouho, pak zvednuto na 125, pak „sleva“ na 100.
  const h = series(150, (i) => (i < 110 ? 100 : i < 140 ? 125 : 100));
  const c = discountCheck(h);
  assert.equal(c.suspicious, true);
  assert.equal(c.peak, 125);
  assert.ok(Math.abs(c.prior - 100) < 0.01);
  const fair = discountCheck(series(150, (i) => (i < 140 ? 100 : 90)));
  assert.equal(fair.suspicious, false);
  assert.equal(fair.lowest30, 90);
});

test('technické indikátory', () => {
  const h = series(200, (i) => 100 + Math.sin(i / 8) * 10 + i * 0.2);
  const m = macd(h);
  assert.ok(m && Number.isFinite(m.hist));
  const b = bollinger(h);
  assert.ok(b.upper > b.mid && b.mid > b.lower);
  const r = rsi(h);
  assert.ok(r >= 0 && r <= 100);
  const s = investSignal(h);
  assert.ok(['bull', 'bear', 'neutral'].includes(s.tone));
  assert.ok(s.reasons.length >= 3);
  const bt = signalBacktest(h);
  assert.ok(bt && 'bull' in bt && 'bear' in bt);
  assert.equal(investSignal(series(10, () => 1)).tone, 'neutral');
});

test('korelace', () => {
  const a = series(100, (i) => 100 + Math.sin(i) * 5 + i);
  assert.ok(correlation(a, a).r > 0.999);
  const inv = series(100, (i) => 300 - (Math.sin(i) * 5 + i));
  assert.ok(correlation(a, inv).r < -0.5);
  assert.equal(correlation(a, series(5, () => 1)), null);
});

test('kalkulačky', () => {
  const t = tco({ price: 600000, years: 3, kmPerYear: 10000, consumption: 5, energyPrice: 40, insurance: 10000, service: 5000, depreciationPct: 40 });
  assert.equal(t.energy, 60000);
  assert.equal(t.depreciation, 240000);
  assert.equal(t.total, 60000 + 30000 + 15000 + 240000);
  assert.equal(unitPrice(25600, { metric: 'GB', metricValue: 256 }).value, 100);
  assert.equal(unitPrice(100, {}), null);
});

test('analýza konkurence', () => {
  const c = competitorAnalysis({
    competitors: [
      { name: 'A', prices: series(60, () => 100) },
      { name: 'B', prices: series(60, (i) => 110 - i * 0.3) },
    ],
  });
  assert.equal(c.cheapestNow.name, 'B');
  assert.equal(c.biggestDrop.name, 'B');
});

test('ukázková data: všechna odvětví mají 10 produktů a výpočty proběhnou', () => {
  const demo = demoProducts();
  for (const c of CATEGORIES) assert.equal(demo.filter((p) => p.category === c.id).length, 10, c.id);
  assert.equal(seedProducts().length, demo.length);
  const ids = new Set(demo.map((p) => p.id));
  assert.equal(ids.size, demo.length, 'unikátní id');
  const t0 = Date.now();
  for (const p of demo) summarize(p);
  const tSum = Date.now() - t0;
  const full = analyzeFull(demo.find((p) => p.category === 'dovolene'));
  assert.ok(full.season && full.season.strong, 'dovolené mají sezónnost');
  assert.ok([5, 6, 7].includes(full.season.worstMonth), `nejdražší měsíc ${full.season.worstMonth}`);
  assert.ok(full.backtest && full.backtest.n > 0);
  assert.ok(tSum < 4000, `souhrn všech produktů trval ${tSum} ms`);
});

test('skóre Kup teď / Počkej', () => {
  const fcUp = { changePct: 6, endPrice: 106 };
  const fcDown = { changePct: -6, endPrice: 94 };
  const buy = buyScore({ price: 100, forecast: fcUp, trend: { dir: 'roste' }, min: 98, max: 140, discount: { lowest30: 100 } });
  const wait = buyScore({ price: 138, forecast: fcDown, trend: { dir: 'klesa' }, min: 98, max: 140, discount: { suspicious: true, lowest30: 120 } });
  assert.equal(buy.tone, 'buy');
  assert.ok(buy.score >= 80, 'vysoké skóre ' + buy.score);
  assert.equal(wait.tone, 'wait');
  assert.ok(wait.score <= 20, 'nízké skóre ' + wait.score);
  assert.deepEqual(wait.when, { type: 'days', days: 30, price: 94 });
  assert.ok(wait.reasons.some((r) => r.key.includes('podezřele')));
  assert.equal(buyScore({ price: 100 }), null, 'bez odhadu a rozpětí není skóre');
  assert.equal(buyScore({ price: null, forecast: fcUp }), null);
  // Sezónnost: teď (leden) drahý měsíc, nejlevnější červen → počkej, kdy = červen
  const profile = [5, 4, 2, 0, -2, -6, -4, -1, 0, 1, 2, 3];
  const se = { profile, bestMonth: 5, worstMonth: 0, amplitude: 11 };
  const s = buyScore({ price: 100, forecast: { changePct: 0, endPrice: 100 }, min: 90, max: 110, season: se, month: 0 });
  assert.equal(s.monthsToBest, 5);
  assert.equal(s.when.type, 'month');
  assert.equal(s.when.month, 5);
  assert.ok(s.score < 50);
  const s2 = buyScore({ price: 100, forecast: { changePct: 0, endPrice: 100 }, min: 90, max: 110, season: se, month: 5 });
  assert.ok(s2.score > s.score, 'v nejlevnějším měsíci je skóre vyšší');
  for (const x of [buy, wait, s, s2]) assert.ok(x.score >= 0 && x.score <= 100);
});

test('sezónní cena a rozpočtový poradce', () => {
  const se = { profile: [0, 0, 0, 0, 0, -10, 0, 0, 0, 0, 0, 0] };
  assert.ok(Math.abs(seasonalPrice(1000, se, 5, 0) - 900) < 0.01);
  assert.equal(seasonalPrice(1000, null, 5, 0), null);
  const items = [
    { id: 'a', price: 1000, score: { score: 70, tone: 'buy' } },
    { id: 'b', price: 1050, season: se, score: { score: 40, tone: 'wait' } },
    { id: 'c', price: 1500, forecast: { endPrice: 1400 } },
    { id: 'd', price: 5000 },
  ];
  const now = budgetPlan(items, 1000, 'hned', 0);
  assert.deepEqual(now.map((x) => x.id), ['a'], 'hned: jen co se vejde teď');
  const later = budgetPlan(items, 1000, 'kdykoli', 0);
  assert.deepEqual(later.map((x) => x.id).sort(), ['a', 'b'], 'později se vejde i b (sezónní sleva)');
  const b = later.find((x) => x.id === 'b');
  assert.equal(b.plan.type, 'month');
  assert.equal(b.plan.month, 5);
  assert.equal(b.fitsNow, false);
  assert.ok(b.saving > 100);
  const c = budgetPlan(items, 1500, 'mesic', 0).find((x) => x.id === 'c');
  assert.ok(c.fitsNow && c.plan.type === 'days' && c.saving === 100, 'c se vejde hned, ale vyplatí se počkat na odhad');
  assert.equal(budgetPlan(items, 1500, 'hned', 0).find((x) => x.id === 'c').plan.type, 'now', 'když to potřebuju hned, koupit teď');
});

test('skóre produktu z ukázkových dat a nová odvětví', () => {
  const demo = demoProducts();
  for (const id of ['mobily', 'sport', 'kosmetika', 'nabytek', 'pojisteni']) {
    assert.ok(CATEGORIES.some((c) => c.id === id), 'odvětví ' + id);
    assert.equal(demo.filter((p) => p.category === id).length, 10, '10 produktů v ' + id);
  }
  const dyson = demo.find((p) => p.id === 'kosmetika-dyson-airwrap');
  const r = scoreProduct(dyson);
  assert.ok(r.discount.suspicious, 'ukázková nafouknutá sleva');
  assert.ok(r.score && r.score.reasons.some((x) => x.key.includes('podezřele')));
  const consumer = demo.filter((p) => CATEGORIES.find((c) => c.id === p.category).kind === 'spotrebni');
  const scores = consumer.map((p) => scoreProduct(p).score).filter(Boolean);
  assert.equal(scores.length, consumer.length, 'skóre u všech spotřebních produktů');
  assert.ok(scores.some((s) => s.tone === 'buy') && scores.some((s) => s.tone === 'wait'), 'skóre rozlišuje');
});
