// Administrace (česky): produkty, hromadné úpravy, importy, nastavení, schvalování, historie, data.
import { S, CATEGORIES, categoryById, esc, money, dateFmt, link, toast, downloadFile, store } from '../core.js';
import { clean } from '../../lib/analytics.js';
import { parseCsv, parseRankingText, parseSda, parseAffiliateRules } from '../../lib/dataops.js';
import { adminApi, adminAuth, adminLocal, adminLogin, adminLogout } from '../admin-api.js';
import { login, authAvailable } from '../user.js';
import { actions } from '../ui.js';
import { hero, sheet } from '../core.js';
import { PHOTO_SETS } from '../photos.js';

const adm = { tab: 'produkty', cat: 'auta', preview: null };

const loadScript = (src) =>
  new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('Knihovnu pro Excel se nepodařilo načíst (jsi online?)'));
    document.head.appendChild(s);
  });

async function xlsxToCsv(file) {
  if (!window.XLSX) await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return window.XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ';' });
}

function msg(el, text, ok) {
  if (!el) return;
  el.textContent = text;
  el.className = `msg ${ok ? 'ok' : 'err'}`;
}
async function busy(btn, fn) {
  btn.disabled = true;
  try {
    await fn();
  } finally {
    btn.disabled = false;
  }
}

// Nahrání fotky: prohlížeč ji zmenší (Vercel bere max. 4,5 MB na požadavek) a pošle do Firebase Storage.
// V samostatné HTML verzi se uloží přímo do prohlížeče jako menší obrázek.
async function resizeImage(file, maxW, quality) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Soubor se nepodařilo načíst jako obrázek.'));
      i.src = url;
    });
    const k = Math.min(1, maxW / img.naturalWidth);
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k);
    cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return { dataUrl: cv.toDataURL('image/jpeg', quality), w: cv.width, h: cv.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function uploadPhoto(file, name) {
  if (!/^image\//.test(file.type)) throw new Error('Vyber obrázek (JPEG, PNG nebo WebP).');
  const r = await resizeImage(file, adminLocal ? 1280 : 1920, adminLocal ? 0.72 : 0.84);
  if (r.w < 800) toast('Fotka je menší než 800 px na šířku, na pozadí bude rozmazaná.', 'info', 6000);
  if (adminLocal) return r.dataUrl;
  const out = await adminApi('uploadPhoto', { dataUrl: r.dataUrl, name });
  return out.url;
}
const uploadField = (target, label = 'Nahrát fotku') => `<label class="btn alt upload"><input type="file" accept="image/*" data-upload="${target}" hidden>${label}</label>`;

// Typičtí prodejci pro nová odvětví (feed od nich získáš přes affiliate síť nebo přímo od e-shopu).
const FEED_HINTS = {
  mobily: { shops: ['Alza', 'Datart', 'CZC', 'Mobil Pohotovost', 'iStyle'] },
  sport: { shops: ['Sportisimo', 'Top4Running', 'Hervis', 'Insportline', 'Alza'] },
  kosmetika: { shops: ['Notino', 'Douglas', 'Dr.Max', 'Benu', 'Alza'] },
  elektro: { shops: ['Alza', 'Datart', 'CZC', 'Planeo', 'Mall'] },
};

// Diagnostika nastavení Vercel ↔ Firebase (hodnoty se nezobrazují, jen jestli jsou v pořádku).
function diagnostics(h) {
  const rows = Object.entries(h.config)
    .map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td class="${v === 'ok' || v.startsWith('ok') ? 'chg-down' : v.startsWith('nevyplněno') ? 'muted' : 'chg-up'}">${esc(v)}</td></tr>`)
    .join('');
  return `<div class="notice warn diag"><p><strong>Server se nemůže připojit k databázi.</strong> ${esc(h.firestore)}</p>
    <table class="cmp"><tbody>${rows}</tbody></table>
    <p class="small">Proměnné opravíš na Vercelu: projekt → <b>Settings → Environment Variables</b>. Pak <b>Deployments → ⋯ → Redeploy</b> (změny se projeví až po novém nasazení). Do té doby web ukazuje ukázková data.</p></div>`;
}

const catOptions = (sel) => CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}${c.source === 'auto' ? ' (automaticky)' : ''}</option>`).join('');

export async function renderAdmin(main) {
  document.title = 'Administrace – BuyWise';
  if (!adminLocal && !adminAuth.session && !(adminAuth.useGoogle && S.user)) {
    main.innerHTML = hero({ title: 'Administrace', lead: 'Správa produktů, cen, importů a nastavení.' }) + sheet(`<div class="admin">
      <form class="card" id="login"><label class="field">Heslo administrátora<input type="password" id="pw" autocomplete="current-password"></label>
      <div class="btns"><button class="btn" type="submit">Přihlásit</button>${authAvailable() ? `<button class="btn alt" type="button" data-action="adm-glogin">Přihlásit přes Google (správci)</button>` : ''}</div><p class="msg" id="lmsg"></p></form></div>`);
    main.querySelector('#login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await adminLogin(main.querySelector('#pw').value);
        renderAdmin(main);
      } catch (err) {
        msg(main.querySelector('#lmsg'), err.message);
      } finally {
        btn.disabled = false;
      }
    });
    actions({ 'adm-glogin': async () => {
      if (!S.user) await login();
      if (!S.user) return;
      adminAuth.useGoogle = true;
      try {
        await adminApi('status');
        renderAdmin(main);
      } catch (err) {
        adminAuth.useGoogle = false;
        msg(main.querySelector('#lmsg'), err.message);
      }
    } });
    return true;
  }

  const tabs = [['produkty', 'Produkty'], ['import', 'Import'], ['nastaveni', 'Nastavení'], ...(adminLocal ? [] : [['schvalovani', 'Schvalování']]), ['historie', 'Historie úprav'], ['data', 'Data a zálohy']];
  main.innerHTML =
    hero({
      title: adminLocal ? 'Úpravy dat' : 'Administrace',
      lead: adminLocal ? 'Samostatná HTML verze: změny se ukládají jen v tomto prohlížeči. Zálohu stáhneš v záložce Data a zálohy.' : 'Správa produktů, cen, importů a nastavení.',
      aside: adminLocal ? '' : '<button type="button" class="btn glass" data-action="adm-logout">Odhlásit</button>',
    }) +
    sheet(`<div class="admin">
    <nav class="seg admin-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-action="adm-tab" data-tab="${k}" aria-pressed="${adm.tab === k}">${l}</button>`).join('')}</nav>
    <div id="pane"></div></div>`);
  actions({
    'adm-logout': async () => {
      await adminLogout();
      renderAdmin(main);
    },
    'adm-tab': (b) => {
      adm.tab = b.dataset.tab;
      main.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      showTab(main.querySelector('#pane'));
    },
  });
  showTab(main.querySelector('#pane'));
  if (!adminLocal) {
    // Relace vypršela (8 h) nebo se změnilo heslo → zpět na přihlášení.
    if (!renderAdmin.bound) {
      renderAdmin.bound = true;
      window.addEventListener('pm-admin-expired', () => {
        if (location.pathname.startsWith('/admin') || location.hash.startsWith('#/admin')) renderAdmin(document.getElementById('main'));
      });
    }
    // Kontrola nastavení serveru: když něco chybí, ukáže přesně co a kde to opravit.
    adminApi('health')
      .then(({ health: h }) => {
        const box = main.querySelector('.admin');
        if (!box) return;
        if (h.config.ADMIN_PASSWORD !== 'ok' && h.config.ADMIN_PASSWORD.startsWith('nastaveno')) box.insertAdjacentHTML('afterbegin', '<p class="notice warn"><strong>Slabé heslo administrace.</strong> ADMIN_PASSWORD má méně než 12 znaků. Na Vercelu ho změň na dlouhé náhodné heslo (např. 4–5 slov), přihlášení se tím zneplatní.</p>');
        if (!h.ok) box.insertAdjacentHTML('afterbegin', diagnostics(h));
      })
      .catch((err) => main.querySelector('.admin')?.insertAdjacentHTML('afterbegin', `<p class="notice warn">${esc(err.message)}</p>`));
  }
  return true;
}

function showTab(pane) {
  ({ produkty: tabProducts, import: tabImport, nastaveni: tabSettings, schvalovani: tabPending, historie: tabAudit, data: tabData }[adm.tab] || tabProducts)(pane);
}

// ---------- Produkty ----------
async function tabProducts(pane) {
  const c = categoryById(adm.cat);
  pane.innerHTML = `<div class="card">
    <label class="field">Odvětví<select id="cat">${catOptions(adm.cat)}</select></label>
    <p class="small muted">${c.source === 'auto' ? 'Toto odvětví plní denní aktualizace. Ručně tu můžeš doplnit prodejce, ceny konkurence, obrázky a atributy.' : 'Toto odvětví spravuješ ručně, importem nebo feedy e-shopů.'}</p>
    <div class="btns"><button class="btn" data-action="adm-add">Přidat produkt</button><button class="btn alt" data-action="adm-bulk">Hromadná úprava cen</button></div>
    <ul class="adm-list" id="plist"><li class="muted">Načítám…</li></ul>
    <div id="editor"></div></div>`;
  pane.querySelector('#cat').addEventListener('change', (e) => {
    adm.cat = e.target.value;
    tabProducts(pane);
  });
  let products = [];
  try {
    products = (await adminApi('list', { category: adm.cat })).products;
  } catch (e) {
    pane.querySelector('#plist').innerHTML = `<li class="msg err">${esc(e.message)}</li>`;
    return;
  }
  const ul = pane.querySelector('#plist');
  ul.innerHTML = products.length
    ? products
        .map((p) => {
          const h = clean(p.prices);
          const l = h[h.length - 1];
          return `<li><span class="tag ${p.active === false ? 'dim' : ''}">${p.rank ?? '–'}</span><span class="nm">${esc(p.name)}${p.sample ? '<span class="sample">ukázka</span>' : ''}<small>${l ? money(l.p, p.unit) + ' k ' + dateFmt(l.d) : 'bez ceny'}, ${h.length} záznamů${p.active === false ? ', mimo žebříček' : ''}</small></span><button class="btn alt" data-action="adm-edit" data-id="${esc(p.id)}">Upravit</button><button class="btn danger" data-action="adm-del" data-id="${esc(p.id)}">Smazat</button></li>`;
        })
        .join('')
    : '<li class="muted">Zatím žádné produkty.</li>';
  actions({
    'adm-edit': (b) => openEditor(pane, products.find((p) => p.id === b.dataset.id)),
    'adm-del': async (b) => {
      const p = products.find((x) => x.id === b.dataset.id);
      if (!confirm(`Smazat „${p.name}“ i s celou historií cen?`)) return;
      await busy(b, async () => {
        await adminApi('delete', { id: p.id });
        tabProducts(pane);
      });
    },
    'adm-add': () => openEditor(pane, null),
    'adm-bulk': () => openBulk(pane, products),
  });
}

function bindUploads(root, done, nameOf) {
  root.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-upload]');
    if (!inp || !inp.files[0]) return;
    const lab = inp.closest('label');
    lab.classList.add('busy');
    try {
      const url = await uploadPhoto(inp.files[0], nameOf ? nameOf(inp) : inp.dataset.upload);
      done(inp, url);
      toast('Fotka nahrána.', 'ok');
    } catch (err) {
      toast(esc(err.message), 'err', 6000);
    } finally {
      lab.classList.remove('busy');
      inp.value = '';
    }
  });
}

function openEditor(pane, p) {
  const h = p ? clean(p.prices) : [];
  const last = h[h.length - 1];
  const at = p?.attrs || {};
  const comps = (p?.competitors || []).map((c) => {
    const ch = clean(c.prices);
    return { name: c.name, url: c.url || '', price: ch.length ? ch[ch.length - 1].p : '' };
  });
  const ed = pane.querySelector('#editor');
  const compRow = (c = {}) => `<div class="comp-row"><input placeholder="Prodejce" value="${esc(c.name || '')}" data-c="name"><input placeholder="Cena" inputmode="decimal" value="${esc(c.price ?? '')}" data-c="price"><input class="u" placeholder="Odkaz (nepovinné)" value="${esc(c.url || '')}" data-c="url"><button type="button" class="btn danger" data-action="adm-rm-row" aria-label="Odebrat prodejce">✕</button></div>`;
  ed.innerHTML = `<form class="card inner" id="pform">
    <h3>${p ? 'Upravit produkt' : 'Nový produkt'}</h3>
    <div class="grid3">
      <label class="field">Pořadí<input name="rank" inputmode="numeric" value="${esc(p?.rank ?? '')}"></label>
      <label class="field">Název<input name="name" required value="${esc(p?.name || '')}"></label>
      <label class="field">Podtitul<input name="subtitle" value="${esc(p?.subtitle || '')}"></label>
    </div>
    <div class="grid2">
      <label class="field">Dnešní cena<input name="price" inputmode="decimal" placeholder="${last ? 'naposledy ' + last.p : ''}"></label>
      <label class="field">Jednotka<input name="unit" value="${esc(p?.unit || 'Kč')}"></label>
      <label class="field">Poptávka (text)<input name="demand" value="${esc(p?.demand || '')}" placeholder="např. 6 370 registrací"></label>
      <label class="field">Poptávka (číslo pro řazení)<input name="demandValue" inputmode="decimal" value="${esc(p?.demandValue ?? '')}"></label>
      <label class="field">Odkaz na produkt<input name="link" value="${esc(p?.link || '')}"></label>
      <label class="field">Obrázek – náhled v žebříčku (URL)<input name="image" value="${esc(p?.image || '')}"></label>
      <div class="field"><label for="f-photo">Fotka na pozadí (URL, nejlépe na šířku 1920 px)</label><span class="with-btn"><input id="f-photo" name="photo" value="${esc(p?.photo || '')}">${uploadField('photo')}</span>${p?.photo ? `<img class="photo-prev" src="${esc(p.photo)}" alt="">` : ''}</div>
      <label class="field">Popisek fotky (autor, licence)<input name="photoCredit" value="${esc(p?.photoCredit || '')}"></label>
    </div>
    <details class="more"><summary>Atributy pro kalkulačky a feedy</summary><div class="grid2">
      <label class="field">Měrná jednotka pro cenu/jednotku (např. GB, palec, kWp)<input name="metric" value="${esc(at.metric || '')}"></label>
      <label class="field">Počet jednotek (např. 256)<input name="metricValue" inputmode="decimal" value="${esc(at.metricValue ?? '')}"></label>
      <label class="field">Spotřeba auta (l nebo kWh na 100 km)<input name="consumption" inputmode="decimal" value="${esc(at.consumption ?? '')}"></label>
      <label class="field">Pohon<select name="energy"><option value="">—</option>${['benzin', 'nafta', 'elektro'].map((x) => `<option ${at.energy === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field">EAN (pro přesné párování s feedem)<input name="ean" value="${esc(at.ean || '')}"></label>
      <label class="field">Hledat fotku na Wikimedia Commons podle (např. „Škoda Octavia“)<input name="photoQuery" value="${esc(at.photoQuery || '')}"></label>
    </div></details>
    <label class="field inline"><input type="checkbox" name="active" ${p?.active === false ? '' : 'checked'}> Je v žebříčku</label>
    <p class="small muted">Vyplněná cena se uloží jako dnešní záznam historie. Prázdné pole historii nezmění.</p>
    <h3>Ceny u konkurence</h3>
    <div id="comps">${comps.map(compRow).join('')}</div>
    <div class="btns"><button type="button" class="btn alt" data-action="adm-addc">Přidat prodejce</button></div>
    <div class="btns"><button class="btn" type="submit">Uložit produkt</button><button class="btn alt" type="button" data-action="adm-close-ed">Zavřít</button></div>
    <p class="msg" id="emsg"></p></form>`;
  const compsEl = ed.querySelector('#comps');
  bindUploads(ed, (inp, url) => {
    ed.querySelector('[name=photo]').value = url;
    if (!ed.querySelector('[name=photoCredit]').value) ed.querySelector('[name=photoCredit]').value = 'Vlastní fotka';
    let prev = ed.querySelector('.photo-prev');
    if (!prev) ed.querySelector('#f-photo').closest('.field').insertAdjacentHTML('beforeend', '<img class="photo-prev" alt="">');
    ed.querySelector('.photo-prev').src = url;
  }, () => ed.querySelector('[name=name]').value);
  actions({
    'adm-rm-row': (b) => b.parentElement.remove(),
    'adm-addc': () => compsEl.insertAdjacentHTML('beforeend', compRow()),
    'adm-close-ed': () => (ed.innerHTML = ''),
  });
  ed.querySelector('#pform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const v = Object.fromEntries(fd.entries());
    const product = {
      id: p?.id,
      category: adm.cat,
      name: v.name,
      subtitle: v.subtitle,
      price: v.price,
      unit: v.unit,
      demand: v.demand,
      demandValue: v.demandValue,
      link: v.link,
      image: v.image,
      photo: v.photo,
      photoCredit: v.photoCredit,
      active: fd.get('active') === 'on',
      attrs: { metric: v.metric, metricValue: v.metricValue, consumption: v.consumption, energy: v.energy, ean: v.ean, photoQuery: v.photoQuery },
      competitors: [...compsEl.querySelectorAll('.comp-row')].map((r) => Object.fromEntries([...r.querySelectorAll('[data-c]')].map((i) => [i.dataset.c, i.value.trim()]))).filter((c) => c.name),
    };
    if (v.rank) product.rank = v.rank;
    try {
      await adminApi('save', { product });
      toast('Produkt uložen.', 'ok');
      tabProducts(pane);
    } catch (err) {
      msg(ed.querySelector('#emsg'), err.message);
    }
  });
  ed.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openBulk(pane, products) {
  const ed = pane.querySelector('#editor');
  ed.innerHTML = `<div class="card inner"><h3>Hromadná úprava</h3><p class="small muted">Vyplň jen to, co chceš změnit. Nová cena se přidá do historie jako dnešní záznam.</p>
    <div class="table-wrap"><table class="cmp bulk"><thead><tr><th>Pořadí</th><th>Název</th><th class="num">Poslední cena</th><th>Nová cena</th><th>Poptávka</th></tr></thead><tbody>${products
      .map((p) => {
        const h = clean(p.prices);
        return `<tr data-id="${esc(p.id)}"><td><input data-k="rank" value="${esc(p.rank ?? '')}" inputmode="numeric" size="3"></td><td>${esc(p.name)}</td><td class="num">${h.length ? money(h[h.length - 1].p, p.unit) : '—'}</td><td><input data-k="price" inputmode="decimal" size="9"></td><td><input data-k="demand" value="${esc(p.demand || '')}"></td></tr>`;
      })
      .join('')}</tbody></table></div>
    <div class="btns"><button class="btn" data-action="adm-bulk-save">Uložit vše</button><button class="btn alt" data-action="adm-close-ed">Zavřít</button></div><p class="msg" id="bmsg"></p></div>`;
  actions({
    'adm-close-ed': () => (ed.innerHTML = ''),
    'adm-bulk-save': (b) =>
    busy(b, async () => {
      const items = [...ed.querySelectorAll('tr[data-id]')].map((tr) => {
        const o = { id: tr.dataset.id };
        tr.querySelectorAll('[data-k]').forEach((i) => {
          if (i.value.trim() !== '') o[i.dataset.k] = i.value.trim();
        });
        return o;
      });
      try {
        const r = await adminApi('bulkSave', { category: adm.cat, items });
        toast(`Uloženo ${r.saved} produktů.`, 'ok');
        tabProducts(pane);
      } catch (err) {
        msg(ed.querySelector('#bmsg'), err.message);
      }
    }),
  });
  ed.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Import ----------
function tabImport(pane) {
  pane.innerHTML = `<div class="card">
    <label class="field">Do odvětví<select id="icat">${catOptions(adm.cat)}</select></label>
    <span class="seg" role="group" aria-label="Typ importu" style="margin-top:12px">
      <button type="button" data-action="adm-src" data-src="csv" aria-pressed="true">CSV / Excel</button>
      <button type="button" data-action="adm-src" data-src="text" aria-pressed="false">Textový žebříček</button>
      <button type="button" data-action="adm-src" data-src="sda" aria-pressed="false">Tisková zpráva SDA</button>
    </span>
    <p class="small muted" id="ihelp"></p>
    <label class="field" id="fileWrap">Soubor (.csv, .xlsx)<input type="file" id="ifile" accept=".csv,.txt,.xlsx,.xls"></label>
    <label class="field">Text<textarea id="itext"></textarea></label>
    <div class="btns"><button class="btn alt" data-action="adm-iprev">Načíst náhled</button></div>
    <div id="ipreview"></div><p class="msg" id="imsg"></p></div>`;
  let src = 'csv';
  const help = {
    csv: 'Sloupce oddělené středníkem nebo tabulátorem: pořadí; název; podtitul; cena; poptávka; konkurence (Alza=24990|Datart=25490). Soubor z Excelu (.xlsx) se převede sám.',
    text: 'Řádky typu „1. Autor: Název – 499 Kč“ nebo „2) Název – podtitul“. Hodí se pro žebříčky knih a top seznamy z webu.',
    sda: 'Vlož text tiskové zprávy Svazu dovozců automobilů (portal.sda-cia.cz). Načte se pořadí modelů a počty registrací. Ceny pak doplníš hromadnou úpravou.',
  };
  const setSrc = (s) => {
    src = s;
    pane.querySelectorAll('[data-src]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.src === s));
    pane.querySelector('#ihelp').textContent = help[s];
    pane.querySelector('#fileWrap').hidden = s !== 'csv';
    if (s === 'sda') pane.querySelector('#icat').value = 'auta';
  };
  setSrc('csv');
  let rows = [];
  actions({ 'adm-src': (b) => setSrc(b.dataset.src) });
  pane.querySelector('#ifile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      pane.querySelector('#itext').value = /\.xlsx?$/i.test(f.name) ? await xlsxToCsv(f) : await f.text();
    } catch (err) {
      msg(pane.querySelector('#imsg'), err.message);
    }
  });
  actions({ 'adm-iprev': () => {
    const text = pane.querySelector('#itext').value;
    rows = src === 'csv' ? parseCsv(text) : src === 'text' ? parseRankingText(text) : parseSda(text);
    const box = pane.querySelector('#ipreview');
    if (!rows.length) {
      box.innerHTML = '';
      return msg(pane.querySelector('#imsg'), 'Nenašel jsem žádné řádky. Zkontroluj formát.');
    }
    msg(pane.querySelector('#imsg'), '', true);
    const cat = pane.querySelector('#icat').value;
    box.innerHTML = `<div class="table-wrap"><table class="cmp"><thead><tr><th>Pořadí</th><th>Název</th><th>Podtitul</th><th class="num">Cena</th><th>Poptávka</th><th>Konkurence</th></tr></thead><tbody>${rows
      .map((r) => `<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${esc(r.subtitle || '')}</td><td class="num">${esc(r.price ?? '')}</td><td>${esc(r.demand || '')}</td><td>${(r.competitors || []).map((c) => esc(`${c.name} ${c.price}`)).join(', ')}</td></tr>`)
      .join('')}</tbody></table></div>
      <p class="small muted">Produkty z odvětví ${esc(categoryById(cat).name)}, které v importu chybí, se označí jako vypadlé z žebříčku.</p>
      <div class="btns"><button class="btn" data-action="adm-igo">Importovat ${rows.length} řádků</button></div>`;
  } });
  actions({ 'adm-igo': (b) =>
      busy(b, async () => {
        const box = pane.querySelector('#ipreview');
        const cat = pane.querySelector('#icat').value;
        try {
          const r = await adminApi('importRows', { category: cat, rows, source: { csv: 'CSV/Excel', text: 'textový žebříček', sda: 'SDA' }[src] });
          msg(pane.querySelector('#imsg'), `Importováno ${r.imported} řádků.`, true);
          box.innerHTML = '';
        } catch (err) {
          msg(pane.querySelector('#imsg'), err.message);
        }
      }),
  });
}

// ---------- Nastavení ----------
async function tabSettings(pane) {
  pane.innerHTML = '<p class="muted">Načítám…</p>';
  let s;
  try {
    s = (await adminApi('getSettings')).settings;
  } catch (e) {
    pane.innerHTML = `<p class="msg err">${esc(e.message)}</p>`;
    return;
  }
  const feedRow = (f = {}) => `<div class="feed-row"><select data-f="category" aria-label="Odvětví">${catOptions(f.category || 'elektro')}</select><input data-f="competitor" aria-label="Prodejce" placeholder="Prodejce (např. ${esc(FEED_HINTS[f.category]?.shops[0] || 'Alza')})" value="${esc(f.competitor || '')}"><input data-f="url" aria-label="Adresa feedu" placeholder="https://… (Heureka XML, Google feed, XML sítě nebo CSV)" value="${esc(f.url || '')}"><label class="toggle small" title="Hlavní cena produktu = nejnižší dnešní cena z feedů"><input type="checkbox" data-f="mainPrice" ${f.mainPrice === false ? '' : 'checked'}> hlavní cena</label><button type="button" class="btn alt" data-action="adm-test-feed">Otestovat</button><button type="button" class="btn danger" data-action="adm-rm-row" aria-label="Odebrat feed">✕</button></div>`;
  pane.innerHTML = `<form class="card" id="sform">
    <h3>Inflace</h3><p class="small muted">Produkty se porovnají s meziroční inflací (ČSÚ).</p>
    <div class="grid2"><label class="field">Meziroční inflace (%)<input name="yoy" inputmode="decimal" value="${esc(s.inflation?.yoy ?? '')}"></label><label class="field">Za období<input name="ilabel" placeholder="září 2026" value="${esc(s.inflation?.label || '')}"></label></div>
    <h3>Affiliate odkazy</h3><p class="small muted">Jeden řádek na e-shop: doména | šablona. Použij {url} pro původní odkaz nebo {url_enc} pro zakódovaný.</p>
    <label class="field"><textarea name="aff" placeholder="alza.cz | {url}?idp=12345&#10;datart.cz | https://partner.example/?u={url_enc}">${esc((s.affiliates || []).map((a) => `${a.domain} | ${a.template}`).join('\n'))}</textarea></label>
    ${adminLocal ? '' : `<h3>Sponzor týdenního e-mailu</h3><div class="grid2"><label class="field">Text<input name="sptext" value="${esc(s.sponsor?.text || '')}"></label><label class="field">Odkaz<input name="spurl" value="${esc(s.sponsor?.url || '')}"></label></div>
    <h3>Schvalování</h3><label class="field inline"><input type="checkbox" name="approval" ${s.requireApproval ? 'checked' : ''}> Změny pořadí z automatické aktualizace čekají na moje schválení (ceny se ukládají hned)</label>
    <h3>Feedy e-shopů</h3><p class="small muted">Každý den se z feedu načtou ceny a přiřadí se produktům v odvětví – podle EAN, jinak podle názvu: musí sedět všechna slova z názvu i čísla z podtitulu (256 GB, 100 ml), příslušenství (kryty, testery, řemínky…) a jiné varianty (Pro, Max, Ultra…) se vynechají. U elektra, mobilů, sportu a kosmetiky je „hlavní cena“ produktu nejnižší dnešní cena z feedů. Formáty: Heureka/Zboží XML, Google Merchant, XML affiliate sítí (eHUB, Dognet…), CSV. Limit 30 MB, i .gz. Adresy uvnitř tvé sítě (localhost, 10.x, 192.168.x…) server z bezpečnostních důvodů nestáhne.</p>
    <div class="feed-presets">${Object.entries(FEED_HINTS).map(([cat, h]) => `<div class="feed-preset"><b>${esc(categoryById(cat).name)}</b><span class="small muted">${esc(h.shops.join(', '))}</span><button type="button" class="btn alt" data-action="adm-preset-feed" data-cat="${cat}">+ feed</button></div>`).join('')}</div>
    <details class="more"><summary>Kde feed získat</summary><ul class="small">
      <li><b>Affiliate sítě</b> (eHUB, Dognet, CJ, Awin): po registraci a schválení do kampaně e-shopu dostaneš odkaz na produktový XML feed, často už s tvým partnerským odkazem.</li>
      <li><b>Vlastní affiliate program e-shopu</b>: velké e-shopy mívají partnerský program s exportem produktů.</li>
      <li><b>Přímo od e-shopu</b>: napiš jim o odkaz na jejich Heureka/Zboží/Google feed – bývá veřejný na adrese typu <code>/export/heureka.xml</code>.</li>
      <li>Odkaz s osobním klíčem drž v tajnosti: ukládá se jen na serveru, návštěvníci ho nevidí.</li></ul></details>
    <div id="feeds">${(s.feeds || []).map(feedRow).join('')}</div><div class="btns"><button type="button" class="btn alt" data-action="adm-add-feed">Přidat feed</button></div><div id="ftest"></div>`}
    <h3>Fotky na pozadí</h3><p class="small muted">Bez vyplnění se berou fotky z Wikimedia Commons. Pro vlastní fotky zadej u odvětví jeden odkaz na řádek, volitelně s popiskem: <code>https://…/foto.jpg | Autor, licence</code>. Pole „Přehled“ platí pro úvodní stránku.</p>
    <div class="acc-list">${[['home', 'Přehled'], ...Object.keys(PHOTO_SETS).map((id) => [id, categoryById(id)?.name || id])]
      .map(([id, name]) => `<details class="acc"><summary data-action="acc"><span class="acc-title">${esc(name)}${(s.backgrounds?.[id] || []).length ? `<small>${(s.backgrounds[id] || []).length} vlastní</small>` : ''}</span></summary><div class="acc-body"><div class="acc-inner"><label class="field"><span class="sr-only">Fotky pro ${esc(name)}</span><textarea data-bg="${id}" rows="3" placeholder="https://… | Autor, licence">${esc((s.backgrounds?.[id] || []).map((b) => (b.credit ? `${b.url} | ${b.credit}` : b.url)).join('\n'))}</textarea></label>${uploadField(id, 'Nahrát fotku do tohoto odvětví')}</div></div></details>`)
      .join('')}</div>
    <div class="btns"><button class="btn" type="submit">Uložit nastavení</button></div><p class="msg" id="smsg"></p></form>`;
  const feeds = pane.querySelector('#feeds');
  bindUploads(pane.querySelector('#sform'), (inp, url) => {
    const ta = pane.querySelector(`[data-bg="${inp.dataset.upload}"]`);
    ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + `${url} | Vlastní fotka`;
  }, (inp) => 'pozadi-' + inp.dataset.upload);
  actions({
    'adm-rm-row': (b) => b.parentElement.remove(),
    'adm-add-feed': () => feeds.insertAdjacentHTML('beforeend', feedRow()),
    'adm-preset-feed': (b) => {
      feeds.insertAdjacentHTML('beforeend', feedRow({ category: b.dataset.cat }));
      feeds.lastElementChild.querySelector('[data-f=competitor]').focus();
    },
    'adm-test-feed': (b) =>
          busy(b, async () => {
            const row = b.parentElement;
            const out = pane.querySelector('#ftest');
            try {
              const r = await adminApi('testFeed', { url: row.querySelector('[data-f=url]').value, category: row.querySelector('[data-f=category]').value });
              out.innerHTML = `<p class="msg ok">Feed (${esc(r.format || '?')}) obsahuje ${esc(r.items)} položek, spárováno ${r.matched.length} produktů.</p>${r.matched.length ? `<ul class="small">${r.matched.map((m) => `<li>${esc(m.product)} → ${esc(m.item)}: ${esc(m.price)} Kč${m.ean ? ' (EAN)' : ''}</li>`).join('')}</ul>` : ''}${r.unmatched?.length ? `<p class="small muted">Nenalezeno: ${r.unmatched.map(esc).join(', ')}. Doplň u produktu EAN nebo uprav název/podtitul podle feedu.</p>` : ''}`;
            } catch (err) {
              out.innerHTML = `<p class="msg err">${esc(err.message)}</p>`;
            }
          }),
  });
  pane.querySelector('#sform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const yoy = parseFloat(String(f.yoy.value).replace(',', '.'));
    const settings = {
      inflation: Number.isFinite(yoy) ? { yoy, label: f.ilabel.value } : null,
      affiliates: parseAffiliateRules(f.aff.value),
      sponsor: f.sptext?.value ? { text: f.sptext.value, url: f.spurl.value } : null,
      requireApproval: !!f.approval?.checked,
      backgrounds: Object.fromEntries(
        [...pane.querySelectorAll('[data-bg]')]
          .map((ta) => [ta.dataset.bg, ta.value.split(/\r?\n/).map((l) => l.split('|').map((x) => x.trim())).filter(([u]) => /^https?:\/\//.test(u || '') || (adminLocal && /^data:image\//.test(u || ''))).map(([url, credit]) => ({ url, credit: credit || '' }))])
          .filter(([, list]) => list.length)
      ),
      feeds: feeds ? [...feeds.querySelectorAll('.feed-row')].map((r) => Object.fromEntries([...r.querySelectorAll('[data-f]')].map((i) => [i.dataset.f, i.type === 'checkbox' ? i.checked : i.value.trim()]))).filter((x) => x.url && x.competitor) : [],
    };
    try {
      await adminApi('setSettings', { settings });
      msg(pane.querySelector('#smsg'), 'Nastavení uloženo.', true);
      S.data.settings = { ...(S.data.settings || {}), backgrounds: settings.backgrounds, affiliates: settings.affiliates, inflation: settings.inflation };
    } catch (err) {
      msg(pane.querySelector('#smsg'), err.message);
    }
  });
}

// ---------- Schvalování ----------
async function tabPending(pane) {
  pane.innerHTML = '<p class="muted">Načítám…</p>';
  try {
    const { pending } = await adminApi('pending');
    if (!pending?.proposals?.length) {
      pane.innerHTML = '<div class="card"><p>Nic nečeká na schválení. Režim schvalování zapneš v Nastavení.</p></div>';
      return;
    }
    pane.innerHTML = `<div class="card"><h3>Navržené změny pořadí (${dateFmt(pending.createdAt.slice(0, 10))})</h3>
      <div class="table-wrap"><table class="cmp"><thead><tr><th>Produkt</th><th>Odvětví</th><th class="num">Teď</th><th class="num">Návrh</th></tr></thead><tbody>${pending.proposals
        .map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(categoryById(x.category)?.name || x.category)}</td><td class="num">${x.oldActive && x.oldRank ? x.oldRank + '.' : 'mimo'}</td><td class="num"><strong>${x.active && x.rank ? x.rank + '.' : 'mimo'}</strong></td></tr>`)
        .join('')}</tbody></table></div>
      <div class="btns"><button class="btn" data-action="adm-pend" data-v="approve">Schválit vše</button><button class="btn alt" data-action="adm-pend" data-v="reject">Zamítnout</button></div><p class="msg" id="pmsg"></p></div>`;
    actions({
      'adm-pend': (b) =>
        busy(b, async () => {
          const act = b.dataset.v;
          const r = await adminApi(act);
          toast(act === 'approve' ? `Schváleno ${r.applied} změn.` : 'Návrh zamítnut.', 'ok');
          tabPending(pane);
        }),
    });
  } catch (e) {
    pane.innerHTML = `<p class="msg err">${esc(e.message)}</p>`;
  }
}

// ---------- Historie ----------
async function tabAudit(pane) {
  pane.innerHTML = '<p class="muted">Načítám…</p>';
  try {
    const { entries } = await adminApi('audit');
    pane.innerHTML = entries.length
      ? `<div class="card"><ul class="adm-list">${entries
          .map((x) => `<li><span class="nm">${esc(x.action)}${x.target ? `: ${esc(x.target)}` : ''}<small>${new Date(x.at).toLocaleString('cs-CZ')}, ${esc(x.who)}${x.summary ? ` – ${esc(x.summary)}` : ''}</small></span></li>`)
          .join('')}</ul></div>`
      : '<div class="card"><p>Zatím žádné úpravy.</p></div>';
  } catch (e) {
    pane.innerHTML = `<p class="msg err">${esc(e.message)}</p>`;
  }
}

// ---------- Data a zálohy ----------
async function tabData(pane) {
  pane.innerHTML = `<div class="card"><h3>Stav</h3><div id="status" class="small muted">Načítám…</div>
    <div class="btns">
      <button class="btn alt" data-action="adm-seed">${adminLocal ? 'Obnovit ukázková data' : 'Naplnit výchozími daty'}</button>
      ${adminLocal ? '' : '<button class="btn alt" data-action="adm-upd" data-weekly="0">Aktualizovat živá data teď</button><button class="btn alt" data-action="adm-upd" data-weekly="1">Spustit i týdenní úlohy (souhrn, záloha)</button>'}
    </div><p class="msg" id="dmsg"></p></div>
    <div class="card"><h3>Záloha</h3><p class="small muted">Celá databáze (produkty s historií a nastavení) jako soubor JSON. ${adminLocal ? '' : 'Automatická záloha se ukládá každou neděli do Firebase Storage, pokud je nastavený FIREBASE_STORAGE_BUCKET.'}</p>
      <div class="btns"><button class="btn alt" data-action="adm-bk">Stáhnout zálohu</button><label class="btn alt" for="rs">Obnovit ze zálohy</label><input type="file" id="rs" accept="application/json,.json" hidden></div><p class="msg" id="bmsg"></p></div>
    <p class="note">Stav zdrojů a přesnost odhadů najdeš na stránce <a href="${link('/stav')}">Stav dat</a>.</p>`;
  const dmsg = pane.querySelector('#dmsg');
  const loadStatus = async () => {
    try {
      const j = await adminApi('status');
      const m = j.meta;
      pane.querySelector('#status').innerHTML = `Produktů v databázi: <strong>${j.count}</strong>. Přihlášen: ${esc(j.who || '')}. ${m?.finishedAt ? `Poslední aktualizace: ${new Date(m.finishedAt).toLocaleString('cs-CZ')}.` : adminLocal ? '' : 'Automatická aktualizace zatím neproběhla.'}${j.pending ? ` <strong>${j.pending} změn čeká na schválení.</strong>` : ''}${m?.log?.length ? `<pre class="log">${esc(m.log.join('\n'))}${m.errors?.length ? '\n\nChyby:\n' + esc(m.errors.join('\n')) : ''}</pre>` : ''}`;
    } catch (e) {
      pane.querySelector('#status').textContent = e.message;
    }
  };
  loadStatus();
  actions({ 'adm-seed': (b) =>
    busy(b, async () => {
      if (adminLocal && !confirm('Smazat všechny tvoje úpravy a vrátit ukázková data?')) return;
      try {
        const j = await adminApi('seed');
        msg(dmsg, adminLocal ? 'Ukázková data obnovena.' : `Přidáno ${j.added} výchozích produktů. Ceny jsou orientační, zkontroluj je.`, true);
        loadStatus();
      } catch (err) {
        msg(dmsg, err.message);
      }
    }),
    'adm-upd': (b) =>
      busy(b, async () => {
        const weekly = b.dataset.weekly === '1';
        msg(dmsg, 'Stahuji data ze Steamu, Yahoo Finance, CoinGecko, ČNB a feedů…', true);
        try {
          const r = await adminApi('update', { weekly });
          msg(dmsg, r.status.errors?.length ? `Hotovo s ${r.status.errors.length} chybami.` : 'Živá data aktualizována.', !r.status.errors?.length);
          loadStatus();
        } catch (err) {
          msg(dmsg, err.message);
        }
      }),
    'adm-bk': (b) =>
    busy(b, async () => {
      try {
        const { backup } = await adminApi('backup');
        downloadFile(`buywise-zaloha-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup), 'application/json');
        msg(pane.querySelector('#bmsg'), 'Záloha stažena.', true);
      } catch (err) {
        msg(pane.querySelector('#bmsg'), err.message);
      }
    }),
  });
  pane.querySelector('#rs').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const products = Array.isArray(j) ? j : j.products;
      if (!confirm(`Obnovit ${products?.length || 0} produktů ze zálohy? Stávající produkty se stejným ID se přepíšou.`)) return;
      const r = await adminApi('restore', { products, settings: j.settings });
      msg(pane.querySelector('#bmsg'), `Obnoveno ${r.restored} produktů.`, true);
      loadStatus();
    } catch (err) {
      msg(pane.querySelector('#bmsg'), err.message);
    }
    e.target.value = '';
  });
}

