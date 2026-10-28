// Statistika nad cenovou historií. Historie = pole { d: 'YYYY-MM-DD', p: number }.
// Textové výstupy jsou klíče pro překlad: { key: 'Text s {param}', params: {...} } – překládá je UI funkcí t().
// Vše jsou statistické odhady z historie, ne investiční doporučení.

const DAY = 86400000;
export const toT = (d) => Date.parse(d + 'T00:00:00Z');
export const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};

export function clean(prices = []) {
  const byDay = new Map();
  for (const x of prices) if (x && x.d && Number.isFinite(+x.p) && +x.p > 0) byDay.set(x.d, +x.p);
  return [...byDay.entries()].map(([d, p]) => ({ d, p })).sort((a, b) => (a.d < b.d ? -1 : 1));
}

export const last = (h) => (h.length ? h[h.length - 1] : null);

// Cena k datu (poslední bod nejpozději k danému dni).
export function priceAt(h, t) {
  let v = null;
  for (const x of h) {
    if (toT(x.d) <= t) v = x;
    else break;
  }
  return v;
}

const upTo = (h, t) => h.filter((x) => toT(x.d) <= t);
const since = (h, t) => h.filter((x) => toT(x.d) >= t);

// Procentní změna za posledních N dní. null, když historie nesahá tak daleko.
export function changePct(h, days) {
  const l = last(h);
  if (!l) return null;
  let ref = priceAt(h, toT(l.d) - days * DAY);
  // Tolerance: historie kratší o pár procent (např. 364 místo 365 dní) se počítá.
  if (!ref && h.length && toT(h[0].d) <= toT(l.d) - days * 0.95 * DAY) ref = h[0];
  if (!ref || ref === l) return null;
  return ((l.p - ref.p) / ref.p) * 100;
}

// Lineární regrese přes body posledních `days` dní (nebo celé historie, days = Infinity).
export function regression(h, days) {
  const l = last(h);
  if (!l) return null;
  const pts = Number.isFinite(days) ? since(h, toT(l.d) - days * DAY) : h;
  if (pts.length < 3) return null;
  const t0 = toT(pts[0].d);
  const xs = pts.map((x) => (toT(x.d) - t0) / DAY);
  const ys = pts.map((x) => x.p);
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ys[i] - (intercept + slope * xs[i])) ** 2;
  return { slope, intercept, sd: Math.sqrt(ss / Math.max(1, n - 2)), n, t0, xEnd: xs[n - 1] };
}

// Trend: roste / klesá / drží. Kombinuje sklon regrese za 60 dní a skutečnou změnu za 30 dní.
export function trend(h) {
  const r = regression(h, 60);
  const l = last(h);
  const ch30 = changePct(h, 30);
  let pct = null;
  if (r && l) pct = ((r.slope * 30) / l.p) * 100;
  else if (ch30 != null) pct = ch30;
  if (pct == null) return { dir: 'neznamy', pct: null, label: 'Málo dat' };
  const score = ch30 != null ? (pct + ch30) / 2 : pct;
  if (score > 1.5) return { dir: 'roste', pct: score, label: 'Roste' };
  if (score < -1.5) return { dir: 'klesa', pct: score, label: 'Klesá' };
  return { dir: 'drzi', pct: score, label: 'Drží se' };
}

// ---------- Sezónnost ----------
// Profil 12 měsíců: o kolik % je cena v daném měsíci nad/pod dlouhodobým trendem.
export function seasonality(h) {
  if (h.length < 24) return null;
  const span = (toT(last(h).d) - toT(h[0].d)) / DAY;
  if (span < 330) return null;
  const r = regression(h, Infinity);
  if (!r) return null;
  const buckets = Array.from({ length: 12 }, () => []);
  for (const x of h) {
    const xd = (toT(x.d) - r.t0) / DAY;
    const fit = r.intercept + r.slope * xd;
    if (fit <= 0) continue;
    buckets[new Date(toT(x.d)).getUTCMonth()].push(x.p / fit - 1);
  }
  const profile = buckets.map((b) => (b.length ? mean(b) * 100 : null));
  const known = profile.map((v, i) => [v, i]).filter(([v]) => v != null);
  if (known.length < 10) return null;
  // Vycentrovat na průměr 0.
  const avg = mean(known.map(([v]) => v));
  const prof = profile.map((v) => (v == null ? null : v - avg));
  const kn = prof.map((v, i) => [v, i]).filter(([v]) => v != null);
  const best = kn.reduce((a, b) => (b[0] < a[0] ? b : a));
  const worst = kn.reduce((a, b) => (b[0] > a[0] ? b : a));
  const amplitude = worst[0] - best[0];
  return { profile: prof, bestMonth: best[1], worstMonth: worst[1], bestPct: best[0], worstPct: worst[0], amplitude, strong: amplitude >= 3 };
}

// Průměrný profil odvětví z profilů jednotlivých produktů.
export function categorySeasonality(profiles) {
  const list = profiles.filter(Boolean);
  if (list.length < 2) return null;
  const prof = Array.from({ length: 12 }, (_, m) => {
    const vals = list.map((s) => s.profile[m]).filter((v) => v != null);
    return vals.length ? mean(vals) : null;
  });
  const kn = prof.map((v, i) => [v, i]).filter(([v]) => v != null);
  if (kn.length < 10) return null;
  const best = kn.reduce((a, b) => (b[0] < a[0] ? b : a));
  const worst = kn.reduce((a, b) => (b[0] > a[0] ? b : a));
  return { profile: prof, bestMonth: best[1], worstMonth: worst[1], bestPct: best[0], worstPct: worst[0], amplitude: worst[0] - best[0], strong: worst[0] - best[0] >= 3 };
}

// ---------- Odhad (Holt s tlumeným trendem + sezónní korekce) ----------
// Denní řada s doplněním chybějících dnů poslední známou cenou.
export function resampleDaily(h, days = 180) {
  const l = last(h);
  if (!l) return [];
  const endT = toT(l.d);
  const startT = Math.max(toT(h[0].d), endT - days * DAY);
  const out = [];
  let i = 0;
  let cur = priceAt(h, startT) || h[0];
  for (let t = startT; t <= endT; t += DAY) {
    while (i < h.length && toT(h[i].d) <= t) cur = h[i++];
    out.push(cur.p);
  }
  return out;
}

function holtFit(y, alpha, beta, phi) {
  let level = y[0];
  let tr = y.length > 1 ? y[1] - y[0] : 0;
  let sse = 0;
  const errs = [];
  for (let i = 1; i < y.length; i++) {
    const pred = level + phi * tr;
    const e = y[i] - pred;
    sse += e * e;
    errs.push(e);
    const newLevel = alpha * y[i] + (1 - alpha) * (level + phi * tr);
    tr = beta * (newLevel - level) + (1 - beta) * phi * tr;
    level = newLevel;
  }
  return { level, trend: tr, sse, errs };
}

function holt(y) {
  const PHI = 0.98;
  let best = null;
  for (const a of [0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) {
    for (const b of [0.01, 0.05, 0.1, 0.2]) {
      const f = holtFit(y, a, b, PHI);
      if (!best || f.sse < best.sse) best = { ...f, alpha: a, beta: b, phi: PHI };
    }
  }
  return best;
}

export function forecast(h, horizon = 30, opts = {}) {
  const l = last(h);
  if (!l || h.length < 6) return null;
  const spanDays = (toT(l.d) - toT(h[0].d)) / DAY;
  if (spanDays < 10) return null;
  const lastT = toT(l.d);
  const steps = Math.max(6, Math.round(horizon / 5));
  const season = opts.seasonal === false ? null : opts.season !== undefined ? opts.season : seasonality(h);
  const sFactor = (t) => {
    if (!season || !season.strong) return 1;
    const now = season.profile[new Date(lastT).getUTCMonth()];
    const then = season.profile[new Date(t).getUTCMonth()];
    if (now == null || then == null) return 1;
    return (1 + then / 100) / (1 + now / 100);
  };

  const y = resampleDaily(h, 180);
  let method = 'holt';
  let fit = y.length >= 14 ? holt(y) : null;
  let errSd = fit ? sd(fit.errs.slice(-90)) : 0;
  const r = regression(h, 60);
  if (!fit) {
    if (!r) return null;
    method = 'linear';
  }
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const dd = (horizon / steps) * i;
    const t = lastT + dd * DAY;
    let p;
    let spread;
    if (method === 'holt') {
      // Součet tlumeného trendu phi + phi² + … + phi^k
      const k = dd;
      const damp = fit.phi === 1 ? k : (fit.phi * (1 - fit.phi ** k)) / (1 - fit.phi);
      // Start z vyhlazené úrovně (odfiltruje šum posledního záznamu), dnešní bod zůstává skutečná cena.
      p = i === 0 ? l.p : fit.level + damp * fit.trend;
      spread = 1.64 * Math.max(errSd, l.p * 0.002) * Math.sqrt(Math.max(k, 0));
    } else {
      p = l.p + r.slope * dd;
      spread = 1.64 * r.sd * Math.sqrt(1 + dd / Math.max(r.n, 1));
    }
    p *= sFactor(t);
    if (i === 0) spread = 0;
    pts.push({ d: isoDay(t), p: Math.max(0, p), lo: Math.max(0, p - spread), hi: p + spread });
  }
  const end = pts[pts.length - 1];
  const rel = (end.hi - end.lo) / 2 / Math.max(end.p, 1e-9);
  return {
    points: pts,
    endPrice: end.p,
    changePct: ((end.p - l.p) / l.p) * 100,
    lo: end.lo,
    hi: end.hi,
    method,
    seasonal: !!(season && season.strong),
    confidence: h.length < 10 ? 'nízká' : rel < 0.04 ? 'vysoká' : rel < 0.12 ? 'střední' : 'nízká',
  };
}

// Cena podle odhadu za N dní (interpolace mezi body odhadu).
export function forecastAt(fc, days) {
  if (!fc) return null;
  const t0 = toT(fc.points[0].d);
  const t = t0 + days * DAY;
  const pts = fc.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ta = toT(a.d), tb = toT(b.d);
    if (t <= tb) {
      const w = (t - ta) / (tb - ta || 1);
      return { p: a.p + (b.p - a.p) * w, lo: a.lo + (b.lo - a.lo) * w, hi: a.hi + (b.hi - a.hi) * w };
    }
  }
  return { p: last(pts).p, lo: last(pts).lo, hi: last(pts).hi };
}

// ---------- Zpětné ověření přesnosti ----------
// Odhad z dat do data X porovnáme se skutečnou cenou o 30 dní později.
export function backtest(h, horizon = 30) {
  const l = last(h);
  if (!l) return null;
  const tests = [];
  for (const back of [30, 60, 90, 120, 150, 180]) {
    const cutoff = toT(l.d) - back * DAY;
    const target = cutoff + horizon * DAY;
    if (target > toT(l.d)) continue;
    const past = upTo(h, cutoff);
    if (past.length < 6) continue;
    const fc = forecast(past, horizon);
    const actual = priceAt(h, target);
    if (!fc || !actual || toT(actual.d) < cutoff + horizon * 0.8 * DAY) continue;
    const base = last(past).p;
    const err = ((fc.endPrice - actual.p) / actual.p) * 100;
    const dir = (v) => (Math.abs(v) < 1 ? 0 : Math.sign(v));
    tests.push({
      from: isoDay(cutoff),
      to: isoDay(target),
      predicted: fc.endPrice,
      actual: actual.p,
      err,
      dirHit: dir(((fc.endPrice - base) / base) * 100) === dir(((actual.p - base) / base) * 100),
    });
  }
  if (!tests.length) return null;
  return {
    tests,
    n: tests.length,
    mape: mean(tests.map((t) => Math.abs(t.err))),
    hits: tests.filter((t) => t.dirHit).length,
  };
}

// ---------- Podezřelé slevy a nejnižší cena za 30 dní ----------
export function discountCheck(h) {
  const l = last(h);
  if (!l || h.length < 5) return null;
  const lt = toT(l.d);
  const prev30 = h.filter((x) => toT(x.d) >= lt - 30 * DAY && toT(x.d) < lt);
  const lowest30 = prev30.length ? Math.min(...prev30.map((x) => x.p)) : null;
  const out = { lowest30, suspicious: false };
  const recent = h.filter((x) => toT(x.d) >= lt - 60 * DAY && toT(x.d) < lt);
  if (recent.length < 3) return out;
  const peak = recent.reduce((a, b) => (b.p > a.p ? b : a));
  const before = h.filter((x) => toT(x.d) >= toT(peak.d) - 75 * DAY && toT(x.d) <= toT(peak.d) - 10 * DAY);
  if (before.length < 3) return out;
  const prior = median(before.map((x) => x.p));
  if (peak.p >= prior * 1.08 && l.p <= peak.p * 0.95 && l.p >= prior * 0.97) {
    out.suspicious = true;
    out.prior = prior;
    out.peak = peak.p;
    out.peakDate = peak.d;
    out.discountFromPeak = ((l.p - peak.p) / peak.p) * 100;
  }
  return out;
}

// ---------- Kolísavost, rozpětí ----------
export function volatility(h) {
  const l = last(h);
  if (!l || h.length < 5) return null;
  const pts = since(h, toT(l.d) - 90 * DAY);
  const rets = [];
  for (let i = 1; i < pts.length; i++) rets.push((pts[i].p - pts[i - 1].p) / pts[i - 1].p);
  if (rets.length < 3) return null;
  return sd(rets) * 100;
}

export function minMax(h, days = 365) {
  const l = last(h);
  if (!l) return null;
  const pts = since(h, toT(l.d) - days * DAY);
  let min = pts[0], max = pts[0];
  for (const x of pts) {
    if (x.p < min.p) min = x;
    if (x.p > max.p) max = x;
  }
  return { min, max };
}

// ---------- Technické indikátory ----------
function smaLast(values, n) {
  if (values.length < n) return null;
  return mean(values.slice(-n));
}

function emaSeries(values, n) {
  if (values.length < n) return [];
  const k = 2 / (n + 1);
  const out = [];
  let e = mean(values.slice(0, n));
  for (let i = 0; i < values.length; i++) {
    if (i < n - 1) {
      out.push(null);
      continue;
    }
    if (i === n - 1) {
      out.push(e);
      continue;
    }
    e = values[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

export function rsi(h, n = 14) {
  if (h.length < n + 1) return null;
  const v = h.slice(-(n + 1)).map((x) => x.p);
  let gain = 0, loss = 0;
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export function macd(h) {
  const v = h.map((x) => x.p);
  if (v.length < 35) return null;
  const e12 = emaSeries(v, 12);
  const e26 = emaSeries(v, 26);
  const line = v.map((_, i) => (e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null)).filter((x) => x != null);
  const sig = emaSeries(line, 9);
  const m = line[line.length - 1];
  const s = sig[sig.length - 1];
  const prevHist = line[line.length - 2] - sig[sig.length - 2];
  return { macd: m, signal: s, hist: m - s, crossUp: prevHist <= 0 && m - s > 0, crossDown: prevHist >= 0 && m - s < 0 };
}

export function bollinger(h, n = 20, k = 2) {
  const v = h.map((x) => x.p);
  if (v.length < n) return null;
  const w = v.slice(-n);
  const mid = mean(w);
  const s = sd(w);
  const upper = mid + k * s, lower = mid - k * s;
  return { mid, upper, lower, pctB: upper === lower ? 0.5 : (v[v.length - 1] - lower) / (upper - lower) };
}

function signalCore(h) {
  const v = h.map((x) => x.p);
  const s20 = smaLast(v, 20);
  const s50 = smaLast(v, 50);
  const r = rsi(h);
  if (s20 == null || s50 == null || r == null) return null;
  const m = macd(h);
  const b = bollinger(h);
  const t = trend(h);
  let score = 0;
  const reasons = [];
  if (s20 > s50 * 1.005) {
    score++;
    reasons.push({ key: 'Krátkodobý průměr (20 dní) je nad dlouhodobým (50 dní) – cena má momentum nahoru.' });
  } else if (s20 < s50 * 0.995) {
    score--;
    reasons.push({ key: 'Krátkodobý průměr (20 dní) je pod dlouhodobým (50 dní) – momentum míří dolů.' });
  } else reasons.push({ key: 'Klouzavé průměry 20 a 50 dní jsou u sebe – trh nemá jasný směr.' });
  if (r > 70) {
    score--;
    reasons.push({ key: 'RSI {v}: trh je překoupený, hrozí korekce.', params: { v: Math.round(r) } });
  } else if (r < 30) {
    score++;
    reasons.push({ key: 'RSI {v}: trh je přeprodaný, možný odraz.', params: { v: Math.round(r) } });
  } else reasons.push({ key: 'RSI {v}: v normálním pásmu.', params: { v: Math.round(r) } });
  if (m) {
    if (m.crossUp) {
      score += 1;
      reasons.push({ key: 'MACD právě protnul signální linii zespodu – nákupní impuls.' });
    } else if (m.crossDown) {
      score -= 1;
      reasons.push({ key: 'MACD právě protnul signální linii shora – prodejní impuls.' });
    } else if (m.hist > 0) {
      score += 0.5;
      reasons.push({ key: 'MACD je nad signální linií – momentum je kladné.' });
    } else {
      score -= 0.5;
      reasons.push({ key: 'MACD je pod signální linií – momentum je záporné.' });
    }
  }
  if (b) {
    if (b.pctB > 1) {
      score -= 0.5;
      reasons.push({ key: 'Cena je nad horním Bollingerovým pásmem – krátkodobě přehřátá.' });
    } else if (b.pctB < 0) {
      score += 0.5;
      reasons.push({ key: 'Cena je pod dolním Bollingerovým pásmem – krátkodobě podhodnocená.' });
    } else reasons.push({ key: 'Cena je uvnitř Bollingerových pásem ({v} % šířky).', params: { v: Math.round(b.pctB * 100) } });
  }
  if (t.dir === 'roste') score += 0.5;
  if (t.dir === 'klesa') score -= 0.5;
  const tone = score >= 1.5 ? 'bull' : score <= -1.5 ? 'bear' : 'neutral';
  return { tone, score, reasons, sma20: s20, sma50: s50, rsi: r, macd: m, boll: b };
}

const SIGNAL_LABEL = { bull: 'Býčí signál', bear: 'Medvědí signál', neutral: 'Neutrální' };

export function investSignal(h) {
  const c = signalCore(h);
  if (!c) return { tone: 'neutral', label: SIGNAL_LABEL.neutral, reasons: [{ key: 'Na technický signál je zatím málo dat.' }], rsi: rsi(h) };
  return { ...c, label: SIGNAL_LABEL[c.tone] };
}

// Jak by signál fungoval v minulosti: průměrný výnos 21 obchodních dní po býčím / medvědím signálu.
export function signalBacktest(h, ahead = 21, step = 3) {
  if (h.length < 60 + ahead) return null;
  const res = { bull: [], bear: [] };
  for (let i = 59; i < h.length - ahead; i += step) {
    const c = signalCore(h.slice(0, i + 1));
    if (!c || c.tone === 'neutral') continue;
    res[c.tone].push(((h[i + ahead].p - h[i].p) / h[i].p) * 100);
  }
  const agg = (a, good) => (a.length ? { n: a.length, avg: mean(a), hit: a.filter(good).length / a.length } : { n: 0, avg: null, hit: null });
  return { bull: agg(res.bull, (x) => x > 0), bear: agg(res.bear, (x) => x < 0), ahead };
}

// ---------- Korelace ----------
export function correlation(hA, hB) {
  const mapB = new Map(hB.map((x) => [x.d, x.p]));
  const pairs = hA.filter((x) => mapB.has(x.d)).map((x) => [x.p, mapB.get(x.d)]);
  if (pairs.length < 21) return null;
  const ra = [], rb = [];
  for (let i = 1; i < pairs.length; i++) {
    ra.push(pairs[i][0] / pairs[i - 1][0] - 1);
    rb.push(pairs[i][1] / pairs[i - 1][1] - 1);
  }
  const ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  if (!da || !db) return null;
  return { r: num / Math.sqrt(da * db), n: ra.length };
}

// ---------- Kalkulačky ----------
export function unitPrice(price, attrs) {
  if (!price || !attrs || !attrs.metricValue || !attrs.metric) return null;
  return { value: price / attrs.metricValue, metric: attrs.metric };
}

// Celkové náklady vlastnictví auta.
export function tco({ price, years = 3, kmPerYear = 15000, consumption = 6, energyPrice = 38, insurance = 12000, service = 8000, depreciationPct = 40 }) {
  const km = years * kmPerYear;
  const energy = (km / 100) * consumption * energyPrice;
  const ins = insurance * years;
  const serv = service * years;
  const dep = (price * depreciationPct) / 100;
  const total = energy + ins + serv + dep;
  return { energy, insurance: ins, service: serv, depreciation: dep, total, perKm: total / km, perMonth: total / (years * 12) };
}

// ---------- Doporučení ----------
export function buyAdvice(h, fc = forecast(h, 30)) {
  const t = trend(h);
  if (!fc) return { tone: 'neutral', label: 'Málo dat', text: { key: 'Na odhad je potřeba aspoň 6 cenových záznamů za aspoň 10 dní.' } };
  if (fc.changePct <= -3)
    return { tone: 'wait', label: 'Vyplatí se počkat', text: { key: 'Podle trendu může cena do 30 dní klesnout zhruba o {pct} %.', params: { pct: Math.abs(fc.changePct) } } };
  if (fc.changePct >= 3)
    return { tone: 'buy', label: 'Koupit spíš teď', text: { key: 'Cena má rostoucí trend – do 30 dní může být dražší asi o {pct} %.', params: { pct: fc.changePct } } };
  return {
    tone: 'neutral',
    label: 'Cena je stabilní',
    text: { key: t.dir === 'drzi' ? 'Cena se dlouhodobě drží, čekáním nic zásadního nezískáš.' : 'Očekávaná změna do 30 dní je menší než 3 %.' },
  };
}

// ---------- Skóre „Kup teď / Počkej“ (0–100) ----------
// 100 = ideální chvíle koupit, 0 = rozhodně počkat. Skládá se z několika signálů (každý −1…+1, kladné = koupit):
//   odhad ceny na 30 dní (35 %), poloha ceny v ročním rozpětí (25 %), sezónnost odvětví/produktu (20 %),
//   trend (10 %), slevy (10 %: podezřelá sleva táhne dolů, cena na 30denním minimu nahoru).
// Vstup: { price, forecast, trend, min, max, discount, season, month }.
const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
export const SCORE_LABEL = { buy: 'Kup teď', wait: 'Počkej', neutral: 'Na čase nezáleží' };

export function buyScore({ price, forecast: fc, trend: tr, min, max, discount, season, month = new Date().getUTCMonth() } = {}) {
  if (!price) return null;
  const parts = [];
  const add = (w, v, reason) => parts.push({ w, v: clamp(v), reason });
  if (fc) {
    const v = fc.changePct / 8;
    add(0.35, v,
      fc.changePct <= -1
        ? { key: 'Odhad do 30 dní: {pct} %, čekáním můžeš ušetřit.', params: { pct: Math.round(fc.changePct * 10) / 10 } }
        : fc.changePct >= 1
        ? { key: 'Odhad do 30 dní: +{pct} %, později bude spíš dráž.', params: { pct: Math.round(fc.changePct * 10) / 10 } }
        : { key: 'Odhad na 30 dní je skoro beze změny.' });
  }
  if (min != null && max != null && max > min * 1.02) {
    const pos = clamp((price - min) / (max - min), 0, 1);
    add(0.25, 1 - 2 * pos,
      pos <= 0.25 ? { key: 'Cena je blízko nejnižší za poslední rok.' } : pos >= 0.75 ? { key: 'Cena je blízko nejvyšší za poslední rok.' } : { key: 'Cena je uprostřed ročního rozpětí.' });
  }
  let bestMonth = null;
  let monthsToBest = null;
  if (season && season.profile) {
    const known = season.profile.filter((v) => v != null);
    const lo = Math.min(...known), hi = Math.max(...known);
    const cur = season.profile[month];
    if (cur != null && hi > lo) {
      bestMonth = season.bestMonth;
      monthsToBest = (season.bestMonth - month + 12) % 12;
      const v = 1 - (2 * (cur - lo)) / (hi - lo);
      const strong = season.amplitude >= 3;
      add(strong ? 0.2 : 0.06, v,
        monthsToBest === 0
          ? { key: 'Teď je obvykle nejlevnější měsíc v roce.' }
          : v < -0.3
          ? { key: 'Tento měsíc bývá dražší, nejlevněji bývá za {n} měs.', params: { n: monthsToBest } }
          : { key: 'Sezónně je teď cena průměrná.' });
    }
  }
  if (tr && tr.dir !== 'neznamy') add(0.1, tr.dir === 'roste' ? 0.6 : tr.dir === 'klesa' ? -0.6 : 0, null);
  if (discount) {
    if (discount.suspicious) add(0.15, -1, { key: 'Sleva vypadá podezřele: cena byla nedávno uměle zvednutá.' });
    else if (discount.lowest30 != null && price <= discount.lowest30) add(0.1, 0.7, { key: 'Cena je teď nejnižší za posledních 30 dní.' });
  }
  if (!parts.length || (!fc && min == null)) return null;
  const wsum = parts.reduce((a, x) => a + x.w, 0);
  const raw = parts.reduce((a, x) => a + x.w * x.v, 0) / wsum;
  const score = Math.round(clamp(50 + 50 * raw, 0, 100));
  const tone = score >= 60 ? 'buy' : score <= 40 ? 'wait' : 'neutral';
  // Kdy koupit: dřív odhad (pokles do 30 dní), pak nejlevnější měsíc.
  let when = null;
  if (tone !== 'buy') {
    if (fc && fc.changePct <= -2) when = { type: 'days', days: 30, price: fc.endPrice };
    else if (monthsToBest) when = { type: 'month', month: bestMonth, months: monthsToBest };
  }
  return { score, tone, label: SCORE_LABEL[tone], reasons: parts.filter((x) => x.reason).sort((a, b) => b.w * Math.abs(b.v) - a.w * Math.abs(a.v)).map((x) => x.reason), bestMonth, monthsToBest, when };
}

// Skóre produktu z celé historie (server, týdenní e-mail). catSeason = profil odvětví (categorySeasonality).
export function scoreProduct(product, catSeason = null) {
  const s = summarize(product);
  const r = minMax(s.history, 365);
  const own = seasonality(s.history);
  const season = own && own.amplitude >= (catSeason?.amplitude ?? 0) * 0.5 ? own : catSeason || own;
  return { s, score: buyScore({ price: s.price, forecast: s.forecast, trend: s.trend, min: r?.min.p, max: r?.max.p, discount: discountCheck(s.history), season }), discount: discountCheck(s.history) };
}

// Odhad ceny v daném měsíci podle sezónního profilu (v % proti dnešku).
export function seasonalPrice(price, season, month, now = new Date().getUTCMonth()) {
  if (!season?.profile || season.profile[month] == null || season.profile[now] == null) return null;
  return price * (1 + season.profile[month] / 100) / (1 + season.profile[now] / 100);
}

// Rozpočtový poradce: co z odvětví se vejde do rozpočtu teď nebo později.
// items: [{ id, price, score, forecast, season }]; vrací seřazené návrhy s doporučením.
export function budgetPlan(items, budget, horizon = 'kdykoli', now = new Date().getUTCMonth()) {
  const months = { hned: 0, mesic: 1, ctvrtleti: 3, kdykoli: 12 }[horizon] ?? 12;
  const out = [];
  for (const it of items) {
    if (!it.price) continue;
    const options = [{ type: 'now', price: it.price }];
    if (months >= 1 && it.forecast) options.push({ type: 'days', days: 30, price: it.forecast.endPrice });
    if (months >= 1 && it.season) {
      for (let k = 1; k <= Math.min(months, 11); k++) {
        const m = (now + k) % 12;
        const p = seasonalPrice(it.price, it.season, m, now);
        if (p) options.push({ type: 'month', month: m, months: k, price: p });
      }
    }
    const best = options.reduce((a, b) => (b.price < a.price - it.price * 0.01 ? b : a));
    const fitsNow = it.price <= budget;
    const fitsBest = best.price <= budget;
    if (!fitsNow && !fitsBest) continue;
    const plan = fitsNow && (best.type === 'now' || it.score?.tone === 'buy') ? options[0] : best;
    out.push({ ...it, fitsNow, plan, saving: it.price - plan.price, left: budget - plan.price });
  }
  // Nejdřív věci, které se vejdou a mají dobré skóre; pak nejvíc využitý rozpočet.
  return out.sort((a, b) => (b.score?.score ?? 50) - (a.score?.score ?? 50) || a.left - b.left);
}

// Analýza konkurence: aktuální ceny + odhad za 30 dní u každého prodejce.
export function competitorAnalysis(product) {
  const rows = (product.competitors || [])
    .map((c) => {
      const h = clean(c.prices);
      const l = last(h);
      if (!l) return null;
      const f = forecast(h, 30);
      return { name: c.name, url: c.url, price: l.p, date: l.d, trend: trend(h), forecastPrice: f ? f.endPrice : null, forecastPct: f ? f.changePct : null, history: h };
    })
    .filter(Boolean);
  if (!rows.length) return { rows, cheapestNow: null, cheapestLater: null, biggestDrop: null };
  const cheapestNow = rows.reduce((a, b) => (b.price < a.price ? b : a));
  const withF = rows.filter((r) => r.forecastPrice != null);
  const cheapestLater = withF.length ? withF.reduce((a, b) => (b.forecastPrice < a.forecastPrice ? b : a)) : null;
  const biggestDrop = withF.length ? withF.reduce((a, b) => (b.forecastPct < a.forecastPct ? b : a)) : null;
  return { rows: rows.sort((a, b) => a.price - b.price), cheapestNow, cheapestLater, biggestDrop };
}

// Souhrn pro seznamy (levný výpočet).
export function summarize(product) {
  const h = clean(product.prices);
  const l = last(h);
  return {
    history: h,
    price: l ? l.p : null,
    priceDate: l ? l.d : null,
    ch7: changePct(h, 7),
    ch30: changePct(h, 30),
    ch90: changePct(h, 90),
    ch365: changePct(h, 365),
    trend: trend(h),
    forecast: forecast(h, 30),
    volatility: volatility(h),
    range: minMax(h, 365),
  };
}

// Plný rozbor pro detail produktu (dražší výpočty).
export function analyzeFull(product, { seasonal = true } = {}) {
  const s = summarize(product);
  const h = s.history;
  // U investic je „sezónnost“ většinou jen šum – nepočítá se.
  const season = seasonal ? seasonality(h) : null;
  const fc60 = forecast(h, 60, { season });
  return {
    ...s,
    season,
    forecast: forecast(h, 30, { season }),
    forecast60: fc60,
    backtest: backtest(h),
    discount: discountCheck(h),
  };
}
