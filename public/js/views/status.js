import { S, CATEGORIES, catName, byCat, sum, esc, link, dateFmt, nf, hero, sheet } from '../core.js';
import { accordion, skeleton } from '../ui.js';
import { backtest } from '../../lib/analytics.js';
import { t, locale } from '../i18n.js';

const SOURCE_NAMES = { cnb: 'Kurzy ČNB', komodity: 'Komodity (Yahoo Finance)', akcie: 'Akcie (Yahoo Finance)', krypto: 'Kryptoměny (CoinGecko)', hry: 'PC hry (Steam)', feedy: 'Feedy e-shopů' };

export async function renderStatus(main) {
  document.title = `${t('Stav dat')} – BuyWise`;
  main.innerHTML = sheet(skeleton(5));
  let st = null;
  if (!S.standalone && S.data.mode !== 'demo') {
    try {
      st = await (await fetch('/api/data?view=status')).json();
    } catch {}
  }
  // Přesnost odhadů po odvětvích (zpětné testy na dostupné historii).
  const acc = CATEGORIES.map((c) => {
    const tests = byCat(c.id).map((p) => backtest(sum(p).history)).filter(Boolean);
    const n = tests.reduce((a, x) => a + x.n, 0);
    const mape = n ? tests.reduce((a, x) => a + x.mape * x.n, 0) / n : null;
    const hits = tests.reduce((a, x) => a + x.hits, 0);
    const fresh = byCat(c.id).map((p) => sum(p).priceDate).filter(Boolean).sort().at(-1);
    return { c, n, mape, hits, fresh };
  });
  const meta = st?.meta;
  const sources = meta?.sources || {};
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

  const faq = [
    [t('Jak poznáte, že cena roste nebo klesá?'), t('Porovnáme sklon ceny za posledních 60 dní se skutečnou změnou za 30 dní. Když je průměr obou nad +1,5 %, cena roste, pod −1,5 % klesá, jinak se drží.')],
    [t('Jak vzniká odhad na 30 dní?'), t('Exponenciálním vyhlazováním s tlumeným trendem (Holtova metoda). U spotřebního zboží se navíc započítá sezónnost z minulých let. Pásmo ukazuje rozsah, kam cena s 90% pravděpodobností dojde.')],
    [t('Jak přesné odhady jsou?'), t('U každého produktu zkusíme odhadnout cenu z dat, která jsme měli před 30 až 180 dny, a porovnáme ji se skutečností. Průměrná chyba a počet trefených směrů jsou v tabulce výše a na detailu produktu.')],
    [t('Co znamená podezřelá sleva?'), t('Cena byla v posledních dvou měsících zvednuta o 8 % a víc nad obvyklou úroveň a potom „zlevněna“ zpátky. Sleva proti původní ceně je tedy jen zdánlivá.')],
    [t('Odkud jsou fotky na pozadí?'), t('Z Wikimedia Commons pod volnými licencemi. Autor a licence jsou u každé fotky vpravo dole. V administraci můžeš nastavit vlastní fotky pro každé odvětví i produkt.')],
  ];
  main.innerHTML =
    hero({
      crumb: `<a href="${link('/')}">${t('Přehled')}</a>`,
      title: t('Stav dat'),
      lead: S.data.mode === 'demo' || S.standalone ? t('Aplikace běží s ukázkovými daty, automatické zdroje nejsou připojené.') : t('Kdy se data naposledy aktualizovala, jestli zdroje fungují a jak přesné jsou odhady.'),
    }) +
    sheet(`
    ${
      meta
        ? `<div class="stats">
        <div><b>${fmtTime(meta.finishedAt)}</b><span>${t('poslední aktualizace')}</span></div>
        <div><b>${st.total}</b><span>${t('produktů v databázi')}</span></div>
        <div><b class="${meta.errors?.length ? 'chg-up' : 'chg-down'}">${meta.errors?.length || 0}</b><span>${t('chyb při poslední aktualizaci')}</span></div>
        <div><b>${st.stale}</b><span>${t('produktů bez aktualizace přes 45 dní')}</span></div>
        ${st.pending ? `<div><b>${st.pending}</b><span>${t('změn čeká na schválení')}</span></div>` : ''}
      </div>
      <section class="section"><h2>${t('Zdroje')}</h2><ul class="list">${Object.entries(sources)
        .map(([k, v]) => `<li><div class="item"><span class="nm"><span class="dot-status ${v.ok ? 'ok' : 'bad'}" aria-hidden="true"></span>${esc(t(SOURCE_NAMES[k] || k))}</span><span class="val ${v.ok ? 'chg-down' : 'chg-up'}">${v.ok ? t('v pořádku') : t('chyba')}<small>${fmtTime(v.at)}</small></span><span class="sub">${esc(v.msg || '')}</span></div></li>`)
        .join('')}</ul>
      ${meta.errors?.length ? `<details class="card"><summary>${t('Podrobnosti chyb')}</summary><pre class="log">${esc(meta.errors.join('\n'))}</pre></details>` : ''}
      ${meta.lastDigest || meta.lastBackup ? `<p class="note">${meta.lastDigest ? t('Týdenní souhrn odeslán {d}.', { d: dateFmt(meta.lastDigest) }) + ' ' : ''}${meta.lastBackup ? t('Poslední záloha {d}.', { d: dateFmt(meta.lastBackup) }) : ''}</p>` : ''}
      </section>`
        : ''
    }
    <section class="section"><div class="section-head"><div><h2>${t('Přesnost odhadů podle odvětví')}</h2><p>${t('Odhad z minulosti porovnaný se skutečnou cenou o 30 dní později. Čím nižší chyba, tím lépe.')}</p></div></div>
      <div class="table-wrap"><table class="cmp"><thead><tr><th>${t('Odvětví')}</th><th class="num">${t('Průměrná chyba')}</th><th class="num">${t('Směr trefen')}</th><th class="num">${t('Testů')}</th><th class="num">${t('Nejnovější cena')}</th></tr></thead>
      <tbody>${acc
        .map((x) => `<tr><td><a href="${link('/kategorie/' + x.c.id)}">${esc(catName(x.c))}</a></td><td class="num">${x.mape != null ? `±${nf(1).format(x.mape)} %` : '—'}</td><td class="num">${x.n ? `${Math.round((x.hits / x.n) * 100)} %` : '—'}</td><td class="num">${x.n || '—'}</td><td class="num">${dateFmt(x.fresh)}</td></tr>`)
        .join('')}</tbody></table></div>
      <p class="note">${t('Testy běží na historii, kterou má aplikace načtenou (přehled obsahuje posledních 130 dní). Na detailu produktu se testuje celá historie.')}</p>
    </section>
    <section class="section"><div class="section-head"><div><h2>${t('Jak to počítáme')}</h2><p>${t('Nejčastější otázky k odhadům a datům')}</p></div></div>
      <div class="acc-list">${faq.map(([q, a], i) => accordion({ title: q, body: `<p>${a}</p>`, group: 'faq', open: i === 0 })).join('')}</div>
    </section>
    <section class="section"><h2>${t('Pro vývojáře')}</h2><p>${t('Data jsou dostupná i přes veřejné API ve formátu JSON:')} <code>/api/v1</code>, <code>/api/v1?category=elektro</code>, <code>/api/v1?id=…</code></p></section>`);
  return true;
}
