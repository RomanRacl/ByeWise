// Sdílecí obrázek produktu pro sociální sítě (1200 × 630, formát náhledů Facebooku, X i LinkedInu):
// logo, název, cena, trend, graf 6 měsíců s odhadem, skóre Kup teď / Počkej. Kreslí se v prohlížeči na canvas.
import { S, money, pct, esc, catName, categoryById, slugFile, downloadFile, toast, dateFmt, productLink } from './core.js';
import { openDrawer, actions } from './ui.js';
import { t } from './i18n.js';

const W = 1200, H = 630;
const C = { bg: '#10171d', bg2: '#1b2a33', ink: '#ffffff', ink2: 'rgba(255,255,255,.72)', ink3: 'rgba(255,255,255,.45)', tag: '#ffc929', tagInk: '#1d1a0c', up: '#ff9a73', down: '#6fe0a4', flat: '#c9d3d9', grid: 'rgba(255,255,255,.08)', line: '#7fb6ff' };
const FONT = "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif";
const plain = (html) => String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

// Logo BuyWise: cenovka se sovíma očima („chytrá cenovka“).
export function drawLogo(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 32, s / 32);
  ctx.fillStyle = C.tag;
  ctx.beginPath();
  ctx.moveTo(3, 7); ctx.quadraticCurveTo(3, 5, 5, 5); ctx.lineTo(20, 5); ctx.lineTo(29, 16); ctx.lineTo(20, 27); ctx.lineTo(5, 27); ctx.quadraticCurveTo(3, 27, 3, 25);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#16222b';
  for (const cx of [10, 17]) {
    ctx.beginPath(); ctx.arc(cx, 15, 3.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = C.tag;
  for (const cx of [10.9, 17.9]) {
    ctx.beginPath(); ctx.arc(cx, 14.2, 1.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#16222b';
  ctx.beginPath(); ctx.moveTo(12.4, 19); ctx.lineTo(14.6, 19); ctx.lineTo(13.5, 21.2); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function wrap(ctx, text, maxW, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return lines;
}

export async function renderCard(p, { s, sc, unit = 'Kč' }) {
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  // Pozadí
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, C.bg2);
  g.addColorStop(1, C.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 160, 60, 10, W - 160, 60, 420);
  glow.addColorStop(0, 'rgba(255,201,41,.18)');
  glow.addColorStop(1, 'rgba(255,201,41,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Hlavička: logo + značka
  drawLogo(ctx, 56, 44, 44);
  ctx.fillStyle = C.ink;
  ctx.font = `800 30px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Buy', 110, 67);
  const bw = ctx.measureText('Buy').width;
  ctx.fillStyle = C.tag;
  ctx.fillText('Wise', 110 + bw, 67);
  ctx.fillStyle = C.ink3;
  ctx.font = `500 20px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(catName(categoryById(p.category)) + (p.rank ? ` · ${t('{n}. místo', { n: p.rank })}` : ''), W - 56, 67);
  ctx.textAlign = 'left';

  // Název
  ctx.fillStyle = C.ink;
  ctx.font = `800 54px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  const lines = wrap(ctx, p.name, 640, 2);
  lines.forEach((l, i) => ctx.fillText(l, 56, 160 + i * 60));
  let y = 160 + (lines.length - 1) * 60;
  if (p.subtitle) {
    ctx.fillStyle = C.ink2;
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(wrap(ctx, p.subtitle, 640, 1)[0], 56, y + 40);
    y += 40;
  }

  // Cenovka
  const priceTxt = p.free ? t('Zdarma') : plain(money(s.price, unit));
  ctx.font = `800 52px ${FONT}`;
  const pw = ctx.measureText(priceTxt).width + 64;
  const ty = y + 40;
  ctx.fillStyle = C.tag;
  ctx.beginPath();
  ctx.moveTo(56 + 22, ty); ctx.lineTo(56 + pw, ty); ctx.lineTo(56 + pw, ty + 76); ctx.lineTo(56 + 22, ty + 76); ctx.lineTo(56, ty + 38); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.tagInk;
  ctx.textBaseline = 'middle';
  ctx.fillText(priceTxt, 56 + 40, ty + 40);
  // Trend
  const dir = s.trend.dir;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = dir === 'roste' ? C.up : dir === 'klesa' ? C.down : C.flat;
  const trendTxt = `${dir === 'roste' ? '▲' : dir === 'klesa' ? '▼' : '■'} ${t(s.trend.label)}${s.ch30 != null ? `  ${plain(pct(s.ch30))} / 30 ${t('dní')}` : ''}`;
  ctx.fillText(trendTxt, 56 + pw + 24, ty + 40);

  // Graf (180 dní + odhad)
  const hist = s.history.slice(-180);
  const fc = s.forecast?.points || [];
  const box = { x: 56, y: ty + 104, w: sc ? 780 : W - 112, h: H - (ty + 104) - 104 };
  if (hist.length > 1 && box.h > 60) {
    const all = [...hist.map((x) => x.p), ...fc.map((x) => x.p)];
    let lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo || hi * 0.05) * 0.12;
    lo -= pad; hi += pad;
    const t0 = Date.parse(hist[0].d), t1 = Date.parse((fc.length ? fc[fc.length - 1] : hist[hist.length - 1]).d);
    const X = (d) => box.x + ((Date.parse(d) - t0) / (t1 - t0 || 1)) * box.w;
    const Y = (v) => box.y + box.h - ((v - lo) / (hi - lo || 1)) * box.h;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const gy = box.y + (box.h * i) / 3;
      ctx.beginPath(); ctx.moveTo(box.x, gy); ctx.lineTo(box.x + box.w, gy); ctx.stroke();
    }
    // plocha pod čarou
    const area = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    area.addColorStop(0, 'rgba(127,182,255,.35)');
    area.addColorStop(1, 'rgba(127,182,255,0)');
    ctx.beginPath();
    hist.forEach((x, i) => (i ? ctx.lineTo(X(x.d), Y(x.p)) : ctx.moveTo(X(x.d), Y(x.p))));
    ctx.lineTo(X(hist[hist.length - 1].d), box.y + box.h);
    ctx.lineTo(X(hist[0].d), box.y + box.h);
    ctx.closePath();
    ctx.fillStyle = area;
    ctx.fill();
    ctx.beginPath();
    hist.forEach((x, i) => (i ? ctx.lineTo(X(x.d), Y(x.p)) : ctx.moveTo(X(x.d), Y(x.p))));
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (fc.length) {
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(X(hist[hist.length - 1].d), Y(hist[hist.length - 1].p));
      fc.forEach((x) => ctx.lineTo(X(x.d), Y(x.p)));
      ctx.strokeStyle = C.tag;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const lx = X(hist[hist.length - 1].d), ly = Y(hist[hist.length - 1].p);
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ink3;
    ctx.font = `500 18px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t('6 měsíců'), box.x, box.y + box.h + 26);
    if (fc.length) {
      ctx.fillStyle = C.tag;
      ctx.textAlign = 'right';
      ctx.fillText(`- - ${t('odhad na 30 dní')}`, box.x + box.w, box.y + box.h + 26);
      ctx.textAlign = 'left';
    }
  }

  // Skóre
  if (sc) {
    const r = 78, cx = 1012, cy = Math.min(box.y + box.h / 2, H - 60 - 46 - r);
    const col = sc.tone === 'buy' ? C.down : sc.tone === 'wait' ? C.up : C.flat;
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(255,255,255,.1)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * sc.score) / 100); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = C.ink;
    ctx.font = `800 64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(sc.score), cx, cy - 6);
    ctx.font = `600 16px ${FONT}`;
    ctx.fillStyle = C.ink3;
    ctx.fillText('/ 100', cx, cy + 34);
    ctx.fillStyle = col;
    ctx.font = `800 ${t(sc.label).length > 12 ? 21 : 26}px ${FONT}`;
    ctx.fillText(t(sc.label), cx, cy + r + 34);
    ctx.textAlign = 'left';
  }

  // Patička
  ctx.fillStyle = C.ink3;
  ctx.font = `500 18px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(t('Kupuj chytře. Víš, kdy cena klesne.'), 56, H - 30);
  ctx.textAlign = 'right';
  const host = S.hash ? 'BuyWise' : location.host;
  ctx.fillText(`${host} · ${dateFmt(s.priceDate)}`, W - 56, H - 30);
  ctx.textAlign = 'left';
  return cv;
}

export async function shareCard(p, opts) {
  const cv = await renderCard(p, opts);
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  if (!blob) throw new Error('canvas');
  const name = `${slugFile(p.name)}-buywise.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const pageUrl = S.hash ? location.href : location.origin + productLink(p.id);
  const canShareFile = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const body = openDrawer({
    id: 'card',
    side: 'right',
    wide: true,
    title: t('Obrázek pro sociální sítě'),
    label: t('Zavřít'),
    html: `<figure class="card-preview"><img src="${url}" alt="${esc(t('Náhled obrázku: {n}', { n: p.name }))}" width="1200" height="630"><figcaption class="note">${t('1200 × 630 px – formát náhledů pro Facebook, X, LinkedIn i WhatsApp.')}</figcaption></figure>
      <div class="btns">
        ${canShareFile ? `<button type="button" class="btn" data-action="card-share">${t('Sdílet obrázek')}</button>` : ''}
        <button type="button" class="btn ${canShareFile ? 'alt' : ''}" data-action="card-dl">${t('Stáhnout PNG')}</button>
        <button type="button" class="btn alt" data-action="card-copy">${t('Kopírovat odkaz')}</button>
      </div>`,
    onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
  });
  actions({
      'card-dl': () => downloadFile(name, blob),
      'card-share': async () => {
        try {
          await navigator.share({ files: [file], title: p.name, text: `${p.name} – BuyWise`, url: pageUrl });
        } catch {}
      },
      'card-copy': async () => {
        try {
          await navigator.clipboard.writeText(pageUrl);
          toast(t('Odkaz zkopírován do schránky.'), 'ok');
        } catch {
          toast(esc(pageUrl), 'info', 8000);
        }
      },
  });
  return body;
}
