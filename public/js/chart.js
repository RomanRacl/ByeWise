// Grafy v SVG: čárový graf s křížem a tooltipem, sezónní sloupce, sparkline, export do PNG.
import { esc, compact, dateFmt, monthName, nf } from './core.js';
import { t, locale } from './i18n.js';

const DAY = 86400000;
export const T = (d) => Date.parse(d + 'T00:00:00Z');
const tip = () => document.getElementById('tooltip');

export function sparkline(h, dir, w = 120, ht = 36) {
  const pts = h.slice(-90);
  if (pts.length < 2) return `<svg viewBox="0 0 ${w} ${ht}" aria-hidden="true"><line x1="0" x2="${w}" y1="${ht / 2}" y2="${ht / 2}" stroke="var(--line)" stroke-dasharray="3 3"/></svg>`;
  const ys = pts.map((x) => x.p);
  const min = Math.min(...ys), max = Math.max(...ys);
  const span = max - min || 1;
  const d = pts.map((x, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * (w - 4) + 2).toFixed(1)},${(ht - 3 - ((x.p - min) / span) * (ht - 6)).toFixed(1)}`).join('');
  const color = dir === 'roste' ? 'var(--up)' : dir === 'klesa' ? 'var(--down)' : 'var(--flat)';
  const ly = ht - 3 - ((ys[ys.length - 1] - min) / span) * (ht - 6);
  return `<svg viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${w - 2}" cy="${ly.toFixed(1)}" r="2.5" fill="${color}"/></svg>`;
}

function niceTicks(min, max, n = 4, integer = false) {
  const span = max - min || Math.abs(max) || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  if (integer) step = Math.max(1, Math.round(step));
  const lo = Math.floor(min / step) * step;
  const out = [];
  for (let v = lo; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
  return out;
}

function timeTicks(startT, endT) {
  const span = (endT - startT) / (30 * DAY);
  const xt = [];
  if (span < 1.5) {
    for (let t = startT; t <= endT; t += 7 * DAY) xt.push(t);
    return { xt, fmt: (t) => new Date(t).toLocaleDateString(locale(), { day: 'numeric', month: 'numeric' }) };
  }
  const every = span > 14 ? 3 : span > 7 ? 2 : 1;
  const d0 = new Date(startT);
  let cur = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1);
  let k = 0;
  while (cur <= endT) {
    if (k++ % every === 0) xt.push(cur);
    const dd = new Date(cur);
    cur = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1);
  }
  return { xt, fmt: (t) => new Date(t).toLocaleDateString(locale(), { month: 'short', ...(span > 10 ? { year: '2-digit' } : {}) }) };
}

function valueAt(data, t) {
  let v = null;
  for (const x of data) {
    if (x.t <= t) v = x;
    else break;
  }
  return v;
}

function placeTip(ev, html) {
  const el = tip();
  if (!el) return;
  el.hidden = false;
  el.innerHTML = html;
  const tw = el.offsetWidth;
  let left = ev.clientX + 14;
  if (left + tw > window.innerWidth - 8) left = ev.clientX - tw - 14;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, ev.clientY - 20 - el.offsetHeight)}px`;
}
export const hideTip = () => {
  const el = tip();
  if (el) el.hidden = true;
};

/**
 * Obecný čárový graf.
 * opts: { series: [{ name, color, data: [{t, v}], dash, width, stepped }], band: [{t, lo, hi}], todayT,
 *         yFmt(v), valFmt(v), height, invert, yMin, yMax, integer, label }
 */
export function lineChart(el, opts) {
  const W = Math.max(280, el.clientWidth || 600);
  const H = opts.height || 300;
  const m = { l: 56, r: 12, t: 14, b: 28 };
  const series = opts.series.filter((s) => s.data.length);
  const allT = series.flatMap((s) => s.data.map((x) => x.t)).concat((opts.band || []).map((x) => x.t));
  if (!allT.length || series.every((s) => s.data.length < 2)) {
    el.innerHTML = `<p class="empty">${t('Na graf jsou potřeba aspoň dva záznamy. Další přibudou s aktualizacemi.')}</p>`;
    return;
  }
  const startT = Math.min(...allT);
  const endT = Math.max(...allT);
  const vals = series.flatMap((s) => s.data.map((x) => x.v)).concat((opts.band || []).flatMap((x) => [x.lo, x.hi]));
  let ymin = opts.yMin ?? Math.min(...vals);
  let ymax = opts.yMax ?? Math.max(...vals);
  if (opts.yMin == null || opts.yMax == null) {
    const pad = (ymax - ymin) * 0.08 || Math.abs(ymax) * 0.05 || 1;
    if (opts.yMin == null) ymin -= pad;
    if (opts.yMax == null) ymax += pad;
  }
  const ticks = niceTicks(ymin, ymax, 4, opts.integer);
  if (opts.yMin == null) ymin = Math.min(ymin, ticks[0]);
  if (opts.yMax == null) ymax = Math.max(ymax, ticks[ticks.length - 1]);
  const X = (tt) => m.l + ((tt - startT) / (endT - startT || 1)) * (W - m.l - m.r);
  const Yraw = (v) => (v - ymin) / (ymax - ymin || 1);
  const Y = (v) => m.t + (opts.invert ? Yraw(v) : 1 - Yraw(v)) * (H - m.t - m.b);
  const path = (data, stepped) =>
    data
      .map((x, i) => {
        if (!i) return `M${X(x.t).toFixed(1)},${Y(x.v).toFixed(1)}`;
        if (stepped) return `H${X(x.t).toFixed(1)}V${Y(x.v).toFixed(1)}`;
        return `L${X(x.t).toFixed(1)},${Y(x.v).toFixed(1)}`;
      })
      .join('');
  const { xt, fmt } = timeTicks(startT, endT);
  const yFmt = opts.yFmt || compact;
  let svg = `<svg viewBox="0 0 ${W} ${H}" style="height:${H}px" role="img" aria-label="${esc(opts.label || t('Graf'))}" xmlns="http://www.w3.org/2000/svg">`;
  ticks.forEach((v) => {
    if (v < ymin - 1e-9 || v > ymax + 1e-9) return;
    svg += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${esc(yFmt(v))}</text>`;
  });
  xt.forEach((tt) => (svg += `<text x="${X(tt)}" y="${H - 8}" text-anchor="middle">${esc(fmt(tt))}</text>`));
  if (opts.band && opts.band.length) {
    const b = opts.band;
    const d = b.map((x, i) => `${i ? 'L' : 'M'}${X(x.t).toFixed(1)},${Y(x.hi).toFixed(1)}`).join('') + [...b].reverse().map((x) => `L${X(x.t).toFixed(1)},${Y(x.lo).toFixed(1)}`).join('') + 'Z';
    svg += `<path class="band" d="${d}" fill="var(--band)"/>`;
  }
  if (opts.todayT && opts.todayT < endT) {
    svg += `<line x1="${X(opts.todayT)}" x2="${X(opts.todayT)}" y1="${m.t}" y2="${H - m.b}" stroke="var(--line)" stroke-dasharray="2 4"/><text x="${X(opts.todayT) + 6}" y="${m.t + 10}">${t('dnes')}</text>`;
  }
  [...series].reverse().forEach((s) => {
    if (s.data.length < 2) return;
    svg += `<path class="${s.dash ? 'ln-dash' : 'ln'}" d="${path(s.data, s.stepped)}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`;
  });
  const main = series[0];
  const lp = main.data[main.data.length - 1];
  if (lp && !main.dash) svg += `<circle cx="${X(lp.t)}" cy="${Y(lp.v)}" r="4.5" fill="${main.color}" stroke="var(--surface)" stroke-width="2"/>`;
  svg += `<g class="hover" style="display:none"><line class="hx" y1="${m.t}" y2="${H - m.b}" stroke="var(--muted)" stroke-width="1"/><g class="hdots"></g></g>`;
  svg += `<rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></svg>`;
  el.innerHTML = svg;

  // Vykreslení čáry „perem“ (jen při prvním zobrazení nebo změně období).
  if (opts.animate) {
    el.querySelectorAll('path.ln').forEach((pth, i) => {
      const len = pth.getTotalLength();
      pth.style.strokeDasharray = `${len} ${len}`;
      pth.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 900, delay: i * 60, easing: 'cubic-bezier(.3,.6,.2,1)', fill: 'backwards' }).onfinish = () => (pth.style.strokeDasharray = '');
    });
    el.querySelectorAll('path.ln-dash, path.band, circle').forEach((x) => x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 750, fill: 'backwards' }));
  }

  const svgEl = el.querySelector('svg');
  const hover = el.querySelector('.hover');
  const hx = el.querySelector('.hx');
  const hdots = el.querySelector('.hdots');
  const valFmt = opts.valFmt || ((v) => nf(2, 0).format(v));
  const move = (ev) => {
    const box = svgEl.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    const tt = startT + ((px - m.l) / (W - m.l - m.r)) * (endT - startT);
    // Nejbližší čas ze všech řad
    let best = null;
    for (const s of series) for (const x of s.data) if (!best || Math.abs(x.t - tt) < Math.abs(best - tt)) best = x.t;
    const rows = [];
    for (const s of series) {
      const p = s.data.length && best >= s.data[0].t && best <= s.data[s.data.length - 1].t ? valueAt(s.data, best) : null;
      if (p) rows.push({ name: s.name, color: s.color, v: p.v, extra: p.extra });
    }
    hover.style.display = '';
    hx.setAttribute('x1', X(best));
    hx.setAttribute('x2', X(best));
    hdots.innerHTML = rows.map((r) => `<circle cx="${X(best)}" cy="${Y(r.v)}" r="4" fill="${r.color}" stroke="var(--surface)" stroke-width="2"/>`).join('');
    placeTip(ev, `<b>${dateFmt(new Date(best).toISOString().slice(0, 10))}</b>` + rows.map((r) => `<div class="tt-row"><i style="background:${r.color}"></i>${esc(r.name)}: <b>${valFmt(r.v)}</b></div>${r.extra ? `<div>${r.extra}</div>` : ''}`).join(''));
  };
  const hit = el.querySelector('.hit');
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => {
    hover.style.display = 'none';
    hideTip();
  });
}

// Sezónní profil: 12 sloupců odchylky od průměru (diverging: levnější zeleně, dražší červeně).
export function seasonBars(el, profile, valFmt) {
  const W = Math.max(280, el.clientWidth || 600);
  const H = 180;
  const m = { l: 44, r: 8, t: 12, b: 26 };
  const vals = profile.filter((v) => v != null);
  const ext = Math.max(2, ...vals.map(Math.abs)) * 1.15;
  const bw = (W - m.l - m.r) / 12;
  const Y = (v) => m.t + (1 - (v + ext) / (2 * ext)) * (H - m.t - m.b);
  let svg = `<svg viewBox="0 0 ${W} ${H}" style="height:${H}px" role="img" aria-label="${esc(t('Sezónní vývoj ceny po měsících'))}" xmlns="http://www.w3.org/2000/svg">`;
  for (const v of niceTicks(-ext, ext, 4)) {
    if (Math.abs(v) > ext) continue;
    svg += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v > 0 ? '+' : ''}${nf(0).format(v)} %</text>`;
  }
  svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--muted)" stroke-width="1"/>`;
  profile.forEach((v, i) => {
    const x = m.l + i * bw + 2;
    const full = monthName(i, 'short').replace('.', '');
    const label = bw < 34 ? full.slice(0, bw < 24 ? 1 : 2) : full;
    svg += `<text x="${x + (bw - 4) / 2}" y="${H - 8}" text-anchor="middle">${esc(label)}</text>`;
    if (v == null) return;
    const y0 = Y(0), y1 = Y(v);
    const top = Math.min(y0, y1), h = Math.max(1.5, Math.abs(y1 - y0));
    svg += `<rect class="bar" data-i="${i}" x="${x}" y="${top}" width="${Math.max(2, bw - 4)}" height="${h}" rx="3" fill="${v > 0 ? 'var(--up)' : 'var(--down)'}"/>`;
  });
  svg += '</svg>';
  el.innerHTML = svg;
  el.querySelectorAll('.bar').forEach((b) => {
    const i = +b.dataset.i;
    b.addEventListener('pointermove', (ev) => placeTip(ev, `<b>${esc(monthName(i))}</b><div>${valFmt(profile[i])}</div>`));
    b.addEventListener('pointerleave', hideTip);
  });
}

// Export grafu do PNG: proměnné CSS se nahradí skutečnými barvami.
export async function svgToPng(svgEl, filename) {
  const cs = getComputedStyle(document.documentElement);
  const clone = svgEl.cloneNode(true);
  const W = svgEl.viewBox.baseVal.width, H = svgEl.viewBox.baseVal.height;
  const resolve = (s) => s.replace(/var\((--[\w-]+)\)/g, (_, v) => cs.getPropertyValue(v).trim() || '#888');
  clone.querySelectorAll('*').forEach((n) => {
    for (const a of ['fill', 'stroke']) if (n.getAttribute(a)) n.setAttribute(a, resolve(n.getAttribute(a)));
    if (n.tagName === 'text') {
      n.setAttribute('fill', cs.getPropertyValue('--muted').trim());
      n.setAttribute('font-family', 'Archivo, Arial, sans-serif');
      n.setAttribute('font-size', '12');
    }
    if (n.classList?.contains('gridline')) n.setAttribute('stroke', cs.getPropertyValue('--grid').trim());
    if (n.classList?.contains('hover') || n.classList?.contains('hit')) n.remove();
  });
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', W);
  bg.setAttribute('height', H);
  bg.setAttribute('fill', cs.getPropertyValue('--surface').trim());
  clone.insertBefore(bg, clone.firstChild);
  clone.setAttribute('width', W);
  clone.setAttribute('height', H);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = url;
  });
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
