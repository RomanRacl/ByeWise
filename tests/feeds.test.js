// Feedy e-shopů pro mobily, sport a kosmetiku: formáty, párování variant a příslušenství, hlavní cena.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, matchFeedItem } from '../public/lib/dataops.js';
import { seedProducts } from '../public/lib/seed.js';

const P = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const HEUREKA_MOBILY = `<?xml version="1.0" encoding="utf-8"?><SHOP>
<SHOPITEM><PRODUCTNAME><![CDATA[Apple iPhone 17 Pro 256GB Cosmic Orange]]></PRODUCTNAME><PRICE_VAT>32 990</PRICE_VAT><URL>https://shop.test/ip17pro</URL><EAN>0195950000001</EAN></SHOPITEM>
<SHOPITEM><PRODUCTNAME>Apple iPhone 17 Pro Max 256GB</PRODUCTNAME><PRICE_VAT>36 990</PRICE_VAT></SHOPITEM>
<SHOPITEM><PRODUCTNAME>Ochranné sklo pro Apple iPhone 17 Pro 256 GB</PRODUCTNAME><PRICE_VAT>399</PRICE_VAT></SHOPITEM>
<SHOPITEM><PRODUCTNAME>Samsung Galaxy S25 256GB Navy</PRODUCTNAME><PRICE_VAT>21 490</PRICE_VAT><URL>https://shop.test/s25</URL></SHOPITEM>
<SHOPITEM><PRODUCTNAME>Samsung Galaxy S25 Ultra 256GB</PRODUCTNAME><PRICE_VAT>31 990</PRICE_VAT></SHOPITEM>
<SHOPITEM><PRODUCTNAME>Samsung Galaxy S25 FE 256GB</PRODUCTNAME><PRICE_VAT>15 990</PRICE_VAT></SHOPITEM>
<SHOPITEM><PRODUCTNAME>Apple iPhone 16e 128GB Black</PRODUCTNAME><PRICE_VAT>16 290</PRICE_VAT></SHOPITEM>
<SHOPITEM><PRODUCTNAME>Apple iPhone 16 128GB</PRODUCTNAME><PRICE_VAT>19 990</PRICE_VAT></SHOPITEM>
<SHOPITEM><PRODUCTNAME>Xiaomi 15T 256GB &amp; dárek</PRODUCTNAME><PRICE_VAT>14 490</PRICE_VAT></SHOPITEM>
</SHOP>`;

const GOOGLE_KOSMETIKA = `<rss xmlns:g="http://base.google.com/ns/1.0"><channel>
<item><g:title>Dior Sauvage EDT 100ml</g:title><g:price>2890.00 CZK</g:price><g:sale_price>2790.00 CZK</g:sale_price><g:link>https://shop.test/dior</g:link><g:availability>in stock</g:availability></item>
<item><g:title>Dior Sauvage EDT 100 ml – tester</g:title><g:price>2190 CZK</g:price></item>
<item><g:title>Dior Sauvage EDT 60 ml</g:title><g:price>2190 CZK</g:price></item>
<item><g:title>CeraVe Hydratační krém 340 g</g:title><g:price>349 CZK</g:price><g:availability>out of stock</g:availability></item>
<item><g:title>Chanel Coco Mademoiselle EDP 50 ml</g:title><g:price>3150 CZK</g:price></item>
</channel></rss>`;

const CSV_SPORT = `název;cena;odkaz;ean
Garmin Forerunner 265 Black;9 490;https://shop.test/fr265;
Řemínek pro Garmin Forerunner 265;599;https://shop.test/strap;
Nike Pegasus 41 pánské běžecké boty;3 190;https://shop.test/peg;
Atomic Redster Q9 sjezdové lyže;12 990;https://shop.test/atomic;
Adidas Ultraboost 5;4 290;https://shop.test/ub;`;

const XML_SITE = `<products><product><name>Nike Pegasus 41</name><price_vat>2 990</price_vat><deeplink>https://net.test/click?p=1</deeplink></product><product><name>Coleman Darwin 3 stan</name><price>2 790</price><url>https://net.test/c</url></product></products>`;

test('parseFeed: formáty Heureka, Google, CSV s hlavičkou, XML affiliate sítě', () => {
  const h = parseFeed(HEUREKA_MOBILY);
  assert.equal(h.format, 'heureka');
  assert.equal(h.length, 9);
  assert.equal(h[0].name, 'Apple iPhone 17 Pro 256GB Cosmic Orange', 'CDATA');
  assert.equal(h[8].name, 'Xiaomi 15T 256GB & dárek', 'entity');
  const g = parseFeed(GOOGLE_KOSMETIKA);
  assert.equal(g.format, 'google');
  assert.equal(g.length, 4, 'zboží mimo sklad se přeskočí');
  assert.equal(g[0].price, 2790, 'akční cena má přednost');
  const c = parseFeed(CSV_SPORT);
  assert.equal(c.format, 'csv');
  assert.equal(c.length, 5);
  assert.equal(c[0].price, 9490);
  assert.equal(c[0].url, 'https://shop.test/fr265');
  const x = parseFeed(XML_SITE);
  assert.equal(x.format, 'xml');
  assert.equal(x[0].url, 'https://net.test/click?p=1', 'deeplink sítě');
});

test('matchFeedItem: varianty, příslušenství, kapacita, objem, EAN, cena', () => {
  const seed = seedProducts();
  const by = (id) => seed.find((p) => p.id === id);
  const h = parseFeed(HEUREKA_MOBILY);
  assert.equal(matchFeedItem(by('mobily-apple-iphone-17-pro'), h, 33990).name, 'Apple iPhone 17 Pro 256GB Cosmic Orange');
  assert.equal(matchFeedItem(by('mobily-samsung-galaxy-s25'), h, 22990).name, 'Samsung Galaxy S25 256GB Navy', 'ne Ultra ani FE');
  assert.equal(matchFeedItem(by('mobily-apple-iphone-16e'), h, 16990).name, 'Apple iPhone 16e 128GB Black', '16e ≠ 16');
  assert.equal(matchFeedItem(by('mobily-xiaomi-15t'), h, 14990).price, 14490);
  assert.equal(matchFeedItem(by('mobily-apple-iphone-15'), h, 15990), null, 'iPhone 15 ve feedu není');
  // EAN má přednost
  const withEan = { ...by('mobily-apple-iphone-17-pro'), name: 'Úplně jiný název', attrs: { ean: '0195950000001' } };
  assert.ok(matchFeedItem(withEan, h, 33990).byEan);
  // Nesmyslná cena (např. chybně spárované příslušenství) se nevezme
  assert.equal(matchFeedItem(by('mobily-apple-iphone-17-pro'), [{ name: 'Apple iPhone 17 Pro 256GB', price: 990 }], 33990), null);

  const g = parseFeed(GOOGLE_KOSMETIKA);
  assert.equal(matchFeedItem(by('kosmetika-dior-sauvage'), g, 2990).price, 2790, '100 ml, ne tester ani 60 ml');
  assert.equal(matchFeedItem(by('kosmetika-chanel-coco-mademoiselle'), g, 3290).price, 3150);
  assert.equal(matchFeedItem(by('kosmetika-cerave-hydratacni-krem'), g, 389), null, 'mimo sklad');

  const c = parseFeed(CSV_SPORT);
  assert.equal(matchFeedItem(by('sport-garmin-forerunner-265'), c, 9990).price, 9490, 'hodinky, ne řemínek');
  assert.equal(matchFeedItem(by('sport-nike-pegasus-41'), c, 3490).price, 3190);
  assert.equal(matchFeedItem(by('sport-adidas-ultraboost-5'), c, 4590).price, 4290);
});

test('denní aktualizace z feedů: ceny prodejců a hlavní cena = nejnižší', async () => {
  process.env.FIREBASE_PROJECT_ID ||= 'test';
  const { feeds } = await import(`${P}/api/_update.js`);
  const seed = seedProducts();
  const state = new Map(seed.map((p) => [p.id, p]));
  const settings = {
    feeds: [
      { category: 'mobily', competitor: 'Shop A', url: 'https://a.test/heureka.xml' },
      { category: 'mobily', competitor: 'Síť B', url: 'https://b.test/feed.csv' },
      { category: 'kosmetika', competitor: 'Shop C', url: 'https://c.test/google.xml', mainPrice: false },
      { category: 'sport', competitor: 'Shop D', url: 'https://d.test/broken.xml' },
    ],
  };
  const files = {
    'https://a.test/heureka.xml': HEUREKA_MOBILY,
    'https://b.test/feed.csv': 'name;price;url\nSamsung Galaxy S25 256GB modrý;20 990;https://b.test/s25\n',
    'https://c.test/google.xml': GOOGLE_KOSMETIKA,
  };
  const r = await feeds(settings, state, async (url) => {
    if (!files[url]) throw new Error('server odpověděl 404');
    return files[url];
  });
  const out = new Map(r.products.map((p) => [p.id, p]));
  const s25 = out.get('mobily-samsung-galaxy-s25');
  assert.deepEqual(s25.competitors.filter((c) => ['Shop A', 'Síť B'].includes(c.name)).map((c) => c.prices.at(-1).p).sort(), [20990, 21490]);
  assert.equal(s25.prices.at(-1).p, 20990, 'hlavní cena = nejnižší dnešní cena z feedů');
  assert.equal(s25.competitors.find((c) => c.name === 'Síť B').url, 'https://b.test/s25');
  const dior = out.get('kosmetika-dior-sauvage');
  assert.equal(dior.competitors.find((c) => c.name === 'Shop C').prices.at(-1).p, 2790);
  assert.equal(dior.prices.at(-1).p, 2990, 'mainPrice: false → hlavní cena beze změny');
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /Shop D \(sport\): server odpověděl 404/);
  assert.ok(r.perFeed.some((x) => x.startsWith('Shop A (mobily): ')));
});
