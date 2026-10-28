import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNum, merge, parseCsv, parseSda, parseRankingText, parseFeed, matchFeedItem, affiliate, parseAffiliateRules, applyImport, todayIso } from '../public/lib/dataops.js';

test('parseNum zvládne české formáty', () => {
  assert.equal(parseNum('24 990 Kč'), 24990);
  assert.equal(parseNum('25 290,50'), 25290.5);
  assert.equal(parseNum('1.234,5'), 1234.5);
  assert.equal(parseNum('1,234'), 1234);
  assert.equal(parseNum('499,-'), 499);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum(12), 12);
});

test('merge přidá cenu, pořadí do historie a atributy', () => {
  const prev = { id: 'x', rank: 3, rankHistory: [{ d: '2026-01-01', r: 3 }], prices: [{ d: '2026-01-01', p: 100 }], competitors: [{ name: 'Alza', prices: [] }], attrs: { metric: 'GB' } };
  const p = merge(prev, { name: 'X', category: 'elektro', rank: '1', price: '90', competitors: [{ name: 'alza', price: '95' }], attrs: { metricValue: '256', ean: '' } });
  assert.equal(p.rank, 1);
  assert.equal(p.prevRank, 3);
  assert.equal(p.rankHistory.at(-1).r, 1);
  assert.equal(p.prices.at(-1).p, 90);
  assert.equal(p.competitors[0].prices.at(-1).p, 95);
  assert.equal(p.attrs.metricValue, 256);
  assert.equal(p.attrs.metric, 'GB');
  assert.equal(p.sample, false);
  assert.equal(p.prices.at(-1).d, todayIso());
});

test('CSV import', () => {
  const rows = parseCsv('pořadí;název;podtitul;cena\n1;A;x;100;hit;Alza=99|Datart=101\n2;B;;50');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].competitors.length, 2);
  const out = applyImport([{ id: 'elektro-c', name: 'C', rank: 3, active: true }], 'elektro', rows);
  assert.equal(out.length, 3);
  assert.equal(out.find((p) => p.id === 'elektro-c').active, false);
});

test('tisková zpráva SDA', () => {
  const text = 'V období 1–4/2026 bylo v ČR registrováno... Nejprodávanějšími osobními vozy jsou Škoda OCTAVIA s 6 370 ks (7,68 %), dále Škoda KODIAQ – 5 129 ks (6,18 %), Škoda SCALA – 4 108 ks (4,95 %), Škoda KAMIQ – 4 063 ks (4,90 %), Toyota YARIS CROSS – 2 100 ks, Volkswagen T-ROC – 1 900 ks';
  const rows = parseSda(text);
  assert.equal(rows[0].name, 'Škoda Octavia');
  assert.equal(rows[0].demandValue, 6370);
  assert.match(rows[0].demand, /6\s370 registrací \(1–4\/2026\)/);
  assert.equal(rows[1].name, 'Škoda Kodiaq');
  assert.ok(rows.some((r) => r.name === 'Toyota Yaris Cross'));
  assert.ok(rows.some((r) => r.name === 'Volkswagen T-Roc'));
});

test('textový žebříček', () => {
  const rows = parseRankingText('1. Rebecca Yarros: Onyxová bouře – 549 Kč\n2) Čas vos – Alena Mornštajnová\n\n3. Lov');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, 'Onyxová bouře');
  assert.equal(rows[0].subtitle, 'Rebecca Yarros');
  assert.equal(rows[0].price, 549);
  assert.equal(rows[1].name, 'Čas vos');
  assert.equal(rows[1].subtitle, 'Alena Mornštajnová');
});

test('feedy a párování produktů', () => {
  const heureka = `<SHOP><SHOPITEM><PRODUCTNAME><![CDATA[Apple iPhone 17 256GB černý]]></PRODUCTNAME><PRICE_VAT>24 490</PRICE_VAT><URL>https://www.alza.cz/a</URL></SHOPITEM>
  <SHOPITEM><PRODUCTNAME>Apple iPhone 17 256 GB bílý</PRODUCTNAME><PRICE_VAT>24290</PRICE_VAT><URL>https://www.alza.cz/b</URL></SHOPITEM>
  <SHOPITEM><PRODUCTNAME>Apple iPhone 17 Pro 256 GB</PRODUCTNAME><PRICE_VAT>32990</PRICE_VAT></SHOPITEM>
  <SHOPITEM><PRODUCTNAME>Apple iPhone 16 256 GB</PRODUCTNAME><PRICE_VAT>19990</PRICE_VAT></SHOPITEM></SHOP>`;
  const items = parseFeed(heureka);
  assert.equal(items.length, 4);
  const hit = matchFeedItem({ name: 'Apple iPhone 17', subtitle: '256 GB' }, items);
  assert.equal(hit.price, 24290);
  const google = '<rss><channel><item><g:title>Roborock Q7 Max+</g:title><g:price>9 490 CZK</g:price><g:link>https://x.cz/r</g:link></item></channel></rss>';
  assert.equal(parseFeed(google)[0].price, 9490);
  assert.equal(parseFeed('Lov;449;https://k.cz/l')[0].price, 449);
  assert.equal(matchFeedItem({ name: 'Nintendo Switch 2' }, items), null);
});

test('affiliate odkazy', () => {
  const rules = parseAffiliateRules('alza.cz | {url}?idp=42\nwww.datart.cz | https://go.example/?u={url_enc}');
  assert.equal(affiliate('https://www.alza.cz/x', rules), 'https://www.alza.cz/x?idp=42');
  assert.equal(affiliate('https://datart.cz/y', rules), 'https://go.example/?u=https%3A%2F%2Fdatart.cz%2Fy');
  assert.equal(affiliate('https://kosmas.cz/z', rules), 'https://kosmas.cz/z');
});

test('měsíční souhrn cen: šablona → vyplnění → import', async () => {
  const { priceSheetCsv, parsePriceSheet, applyPriceSheet } = await import('../public/lib/dataops.js');
  const products = [
    { id: 'mobily-a', category: 'mobily', name: 'Telefon; "A"', subtitle: '128 GB', unit: 'Kč', rank: 2, sample: true, prices: [{ d: '2026-01-01', p: 100 }], competitors: [{ name: 'Fake', prices: [] }] },
    { id: 'mobily-b', category: 'mobily', name: 'B', unit: 'Kč', rank: 1, prices: [{ d: '2026-10-01', p: 1000 }], competitors: [{ name: 'Alza', url: 'https://alza.cz/b', prices: [{ d: '2026-10-01', p: 1000 }] }] },
    { id: 'old', category: 'mobily', name: 'Vypadlý', active: false, prices: [] },
  ];
  const csv = priceSheetCsv(products, () => 'Mobily');
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines.length, 3, 'jen aktivní produkty');
  assert.ok(lines[1].startsWith('mobily-b;'), 'řazení podle pořadí');
  assert.ok(lines[2].includes('"Telefon; ""A"""'), 'escapování');
  assert.ok(lines[2].includes('100 (ukázka)'));
  // Claude vyplní (vynechá sloupce navíc, jiný oddělovač čísel, datum česky)
  const filled = [
    'id;odvětví;produkt;podtitul;jednotka;poslední cena;cena;zdroj;odkaz;datum;prodejci',
    'mobily-b;Mobily;B;;Kč;1000;1 049,90 Kč;Alza.cz;https://www.alza.cz/b;2. 11. 2026;Alza=1049,9=https://www.alza.cz/b|Datart=1099',
    'mobily-a;Mobily;"Telefon; ""A""";128 GB;Kč;100;250;Datart;javascript:alert(1);;',
    'neexistuje;;;;;;10;x;;;',
    'mobily-x;;;;;;;;;;',
  ].join('\n');
  const rows = parsePriceSheet(filled);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { id: 'mobily-b', name: 'B', price: 1049.9, source: 'Alza.cz', url: 'https://www.alza.cz/b', date: '2026-11-02', shops: [{ name: 'Alza', price: 1049.9, url: 'https://www.alza.cz/b' }, { name: 'Datart', price: 1099, url: '' }] });
  assert.equal(rows[1].url, '', 'jen http(s) odkazy');
  const { updated, unknown } = applyPriceSheet(products, rows);
  assert.deepEqual(unknown, ['neexistuje']);
  const b = updated.find((p) => p.id === 'mobily-b');
  assert.equal(b.rank, 1, 'pořadí beze změny');
  assert.equal(b.prices.length, 2);
  assert.equal(b.source, 'Měsíční souhrn cen: Alza.cz, 2. 11. 2026');
  assert.deepEqual(b.competitors.map((c) => [c.name, c.prices.at(-1).p]), [['Alza', 1049.9], ['Datart', 1099]]);
  const a = updated.find((p) => p.id === 'mobily-a');
  assert.equal(a.sample, false);
  assert.deepEqual(a.prices.map((x) => x.p), [250], 'ukázková historie pryč');
  assert.equal(a.competitors.length, 0);
});
