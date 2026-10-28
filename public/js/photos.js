// Fotky v pozadí podle sekce: Wikimedia Commons (volné licence, bez API klíče, CORS přes origin=*).
// Pořadí zdrojů: vlastní fotky z administrace → fotka konkrétního produktu → ověřené fotky odvětví → hledání kvalitních fotek.
import { S, store, categoryById } from './core.js';

const API = 'https://commons.wikimedia.org/w/api.php';
const WIDTH = 1920;
const TTL = 7 * 86400000;

// Ověřené soubory na Wikimedia Commons (názvy bez „File:“) a doplňkové dotazy pro hledání.
export const PHOTO_SETS = {
  auta: {
    titles: ['Skoda Octavia IV Combi RS 1X7A0352.jpg', 'Skoda Kodiaq Facelift 1X7A6163.jpg', '2021 Skoda Octavia - silver grey.jpg', 'Skoda Enyaq Sportline 1X7A0316.jpg'],
    queries: ['Škoda Octavia', 'Škoda Kodiaq'],
  },
  ojete: {
    titles: ['2021 - Used Car Lot - Outten Chevrolet - 2 - Allentown PA.jpg', 'Used car dealership in Santiago, Chile.jpg', 'Skoda Octavia 2014 (14890454679).jpg'],
    queries: ['used car dealership', 'car park automobiles'],
  },
  hry: {
    titles: ['Esport Arena.jpg', 'All-Star eSports Arena, Taipei Game Show 20190126a.jpg', 'Computer keyboard rainbow.jpg', 'LLA match, Arena Esports Stadium at Artz Pedregal.jpg'],
    queries: ['esports arena', 'gaming computer'],
  },
  knihy: {
    titles: ['Bookshop interior by night (30168164382).jpg', "A Room Of One's Own bookstore interior.jpg", 'Books-bookshelf-bookstore-159778.jpg', 'Books on a Shelf.JPG'],
    queries: ['bookshop interior', 'library bookshelves'],
  },
  elektro: {
    titles: ['German electronics store in 2016.jpg', 'Device arrangement.jpg', 'Electronics for sale at Google Merchandise Store 5.jpg', 'Samsung Store.jpg'],
    queries: ['consumer electronics store', 'smartphones'],
  },
  mobily: { titles: [], queries: ['smartphone', 'mobile phone store'] },
  sport: { titles: [], queries: ['mountain biking', 'skiing slope', 'trail running'] },
  kosmetika: { titles: [], queries: ['perfume bottles', 'cosmetics shop'] },
  tarify: {
    titles: ['Smartphone in Hand (Unsplash).jpg', 'Black smartphone in hand (Unsplash).jpg', 'Cellphone (Unsplash).jpg', 'Smartphone display screen.jpg'],
    queries: ['smartphone in hand'],
  },
  vstupenky: {
    titles: [
      'Musicians performing live on stage during an outdoor concert at night with bright stage lights in a vibrant atmosphere.jpg',
      'Concert blue lights.jpg',
      'Cinema Seats I (51830912465).jpg',
      'Cinema seats in blue.jpg',
    ],
    queries: ['concert stage lights', 'cinema auditorium'],
  },
  dovolene: {
    titles: [
      'Panoramic view of the old city of Dubrovnik - September 2017.jpg',
      'Panoramic view of Oia, Santorini island (Thira), Greece.jpg',
      'Aerial view of the Old Town of Dubrovnik - Croatia.jpg',
      'Santorini - Panorama del tramonto da Oia - Grecia - agosto 2018.jpg',
      'Alanya, Antalya, Turkey - panoramio (20).jpg',
    ],
    queries: ['Adriatic coast beach', 'Mediterranean beach'],
  },
  potraviny: {
    titles: ['Fruits and Vegetables at Pike Place Market.jpg', 'Fruits and vegetables at market.jpg', 'Fruit stall at Bangalore City Market.jpg'],
    queries: ['farmers market vegetables', 'bakery bread'],
  },
  pohonne: {
    titles: [
      'Shell gas station at night (52121715434).jpg',
      'Gasolinera PEMEX de noche.jpg',
      'Electric car charging at a station during the day with the charging cable connected to the vehicle.jpg',
      'Electrify America electric vehicle charging station, Valdosta.jpg',
    ],
    queries: ['petrol station night', 'electric vehicle charging station'],
  },
  energie: {
    titles: ['Solar panels on house roof.jpg', 'Wind turbines, Jutland, Denmark 2017-04-14.jpg', 'Wind Turbines (Unsplash).jpg', 'Solar panels on house roof winter view.jpg'],
    queries: ['rooftop solar panels', 'wind farm'],
  },
  nemovitosti: {
    titles: ['Prague 07-2016 View from Old Town Hall Tower img3.jpg', 'Prague old town square panorama.jpg', 'Prague old town tower view.jpg', 'Prague 07-2016 View from Old Town Hall Tower img2.jpg'],
    queries: ['Prague panorama rooftops', 'Brno panorama'],
  },
  nabytek: { titles: [], queries: ['living room interior', 'furniture showroom'] },
  pojisteni: { titles: [], queries: ['family house suburb', 'car on road'] },
  komodity: {
    titles: ['Gold bullion bars.jpg', '400-oz-Gold-Bars-AB-01.jpg', 'Pumpjacks Inglewood Oil Field seen from Baldwin Hills Scenic Overlook.jpg', 'Pump Jack at the Lost Hills Oil Field In Central California.jpg', 'Pouring Liquid Gold.jpg'],
    queries: ['gold bars', 'oil pumpjack'],
  },
  krypto: {
    titles: ['Bitcoin BTC golden coin with the symbol.jpg', 'Holding Bitcoin cryptocurrency coin.jpg', 'Physical Bitcoin by Mike Cauldwell (Casascius).jpg', '25 BTC Gold Casascius coin 2011 by Gage Skidmore.jpg'],
    queries: ['bitcoin coin', 'cryptocurrency'],
  },
  akcie: {
    titles: ['NYSE Advanced Trading Floor.jpg', 'NASDAQ stock market display.jpg', 'Market data on display at Taiwan Stock Exchange 20210208.jpg', 'Trading Floor at the New York Stock Exchange during the Zendesk IPO.jpg', 'Canary wharf stock ticker.jpg'],
    queries: ['stock exchange trading floor', 'stock market display'],
  },
};

// Dotazy pro fotky konkrétních produktů (podle názvu). Kde dotaz chybí, hledá se název produktu
// – ale jen v odvětvích, kde má název smysl jako hledaný výraz (auta, elektro…).
export const PRODUCT_QUERIES = {
  Chorvatsko: 'Dubrovnik', Řecko: 'Santorini Oia', Turecko: 'Antalya coast', Egypt: 'Hurghada beach', Itálie: 'Amalfi coast',
  Bulharsko: 'Sunny Beach Bulgaria', Albánie: 'Ksamil', Španělsko: 'Mallorca beach', 'Spojené arabské emiráty': 'Dubai skyline', Zanzibar: 'Zanzibar beach',
  Praha: 'Prague panorama', Brno: 'Brno panorama', Plzeň: 'Plzeň panorama', Olomouc: 'Olomouc panorama', 'Hradec Králové': 'Hradec Králové',
  'České Budějovice': 'České Budějovice náměstí', Liberec: 'Liberec Ještěd', Pardubice: 'Pardubice', Ostrava: 'Ostrava Dolní Vítkovice', Zlín: 'Zlín',
  'Ropa Brent': 'offshore oil platform', 'Ropa WTI': 'oil pumpjack', Zlato: 'gold bars', Stříbro: 'silver bars', Platina: 'platinum bars', Měď: 'copper wire',
  'Zemní plyn': 'natural gas pipeline', Pšenice: 'wheat field', Kukuřice: 'maize field', 'Sójové boby': 'soybean field', 'Káva Arabica': 'coffee beans', Cukr: 'sugar cane',
  Bitcoin: 'Bitcoin coin', Ethereum: 'Ethereum', Dogecoin: 'Dogecoin',
  NVIDIA: 'Nvidia headquarters', Apple: 'Apple Park', Microsoft: 'Microsoft Redmond campus', Tesla: 'Tesla Model 3', Amazon: 'Amazon fulfillment center',
  Alphabet: 'Googleplex', ČEZ: 'Temelín Nuclear Power Station', 'Komerční banka': 'Komerční banka Praha', 'Erste Group': 'Erste Campus Vienna', 'MONETA Money Bank': 'Prague Stock Exchange',
  'Natural 95': 'petrol pump nozzle', Nafta: 'diesel fuel pump', LPG: 'autogas LPG', CNG: 'CNG filling station', 'Nabíjení DC': 'electric vehicle fast charging', 'Nabíjení AC': 'electric vehicle charging',
  Elektřina: 'power line pylons', 'Elektřina spot': 'power line pylons sunset', 'Teplo (CZT)': 'district heating plant', 'Dřevo palivové': 'firewood stack',
  Pelety: 'wood pellets', 'Hnědé uhlí': 'lignite', 'Fotovoltaika 5 kWp': 'rooftop solar panels', 'Tepelné čerpadlo': 'heat pump', 'Bateriové úložiště': 'home battery storage',
  Máslo: 'butter', Vejce: 'eggs', 'Mléko polotučné': 'milk bottles', Chléb: 'bread loaves', 'Káva zrnková': 'coffee beans', 'Kuřecí prsa': 'chicken breast', Brambory: 'potatoes',
  Jablka: 'apples', 'Eidam 30 %': 'Edam cheese', 'Cukr krystal': 'sugar',
  Kino: 'cinema auditorium', 'Hokejová extraliga': 'ice hockey match', 'Fotbalová Chance Liga': 'football stadium', 'Koncert v hale': 'arena concert', 'Letní festival': 'music festival crowd',
  'Atomic Redster': 'alpine skiing', 'Author Solution': 'mountain bike', 'Elektrokolo Crussis e-Atland': 'electric mountain bike', 'Nike Pegasus 41': 'running shoes',
  'Adidas Ultraboost 5': 'running shoes', 'Garmin Forerunner 265': 'marathon runners', 'Coleman Darwin 3': 'tent camping', 'Xiaomi Electric Scooter 4': 'electric kick scooter',
  'Insportline jednoruční činky': 'dumbbells gym', 'Apple Watch Series 11': 'smartwatch', 'Dior Sauvage': 'perfume bottle', 'Chanel Coco Mademoiselle': 'perfume bottle',
  'Dyson Airwrap': 'hair salon', 'Rohová sedačka': 'sofa living room', 'Taštičková matrace': 'bedroom interior', 'IKEA MALM': 'bedroom interior', 'IKEA KALLAX': 'bookshelf interior',
  'Kuchyňská linka': 'kitchen interior', 'Jídelní stůl': 'dining room interior', 'Kancelářská židle': 'home office desk', 'Výškově nastavitelný stůl': 'home office desk',
  'Povinné ručení': 'car traffic highway', 'Havarijní pojištění': 'car traffic highway', 'Pojištění domácnosti': 'apartment building', 'Pojištění nemovitosti': 'family house',
  'Cestovní pojištění': 'airport departure hall', 'Pojištění mazlíčka': 'dog portrait',
  Muzikál: 'theatre stage', Divadlo: 'theatre auditorium', Aquapark: 'water park slides', 'ZOO Praha': 'Prague Zoo',
};
const NAME_SEARCH = new Set(['auta', 'ojete', 'elektro', 'mobily']);

// Barevné ladění záložního pozadí (když fotky nejdou načíst).
const TINT = { nakupy: ['#23324a', '#0f151b'], domacnost: ['#24402f', '#0f1714'], investice: ['#4a3b16', '#16130b'] };

// ---------- Načítání z Commons ----------
const mem = new Map();
const pending = new Map();
const cacheKey = (k) => 'photos:' + k;

function fromCache(k) {
  if (mem.has(k)) return mem.get(k);
  const c = store.get(cacheKey(k), null);
  if (c && Date.now() - c.t < TTL && Array.isArray(c.list)) {
    mem.set(k, c.list);
    return c.list;
  }
  return null;
}
function toCache(k, list) {
  mem.set(k, list);
  store.set(cacheKey(k), { t: Date.now(), list });
}

const stripHtml = (s) => {
  const txt = String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const el = document.createElement('textarea');
  el.innerHTML = txt;
  return el.value.slice(0, 80);
};

function parse(json) {
  const pages = Object.values(json?.query?.pages || {});
  return pages
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii) return null;
      const meta = ii.extmetadata || {};
      return {
        url: ii.thumburl || ii.url,
        w: ii.width,
        h: ii.height,
        page: ii.descriptionurl,
        title: (p.title || '').replace(/^File:/, ''),
        author: stripHtml(meta.Artist?.value) || 'neznámý autor',
        license: stripHtml(meta.LicenseShortName?.value) || '',
        index: p.index ?? 0,
      };
    })
    .filter((x) => x && x.url && x.w >= 1200 && x.w / x.h >= 1.2 && x.w / x.h <= 3.6)
    .sort((a, b) => a.index - b.index);
}

async function api(params) {
  const q = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', prop: 'imageinfo', iiprop: 'url|size|extmetadata',
    iiurlwidth: String(WIDTH), iiextmetadatafilter: 'Artist|LicenseShortName', ...params,
  });
  const r = await fetch(`${API}?${q}`, { headers: { 'Api-User-Agent': 'BuyWise/2.1' } });
  if (!r.ok) throw new Error('Commons ' + r.status);
  return parse(await r.json());
}

const byTitles = (titles) => !titles.length ? Promise.resolve([]) : api({ titles: titles.map((t) => 'File:' + t).join('|') }).then((list) => {
  // zachovat pořadí ze seznamu
  const order = new Map(titles.map((t, i) => [t.replace(/_/g, ' '), i]));
  return list.sort((a, b) => (order.get(a.title) ?? 99) - (order.get(b.title) ?? 99));
});

async function bySearch(query, limit = 6) {
  // Nejdřív kvalitní fotky (Quality images), pak jakékoli dostatečně velké.
  const base = { generator: 'search', gsrnamespace: '6', gsrlimit: '16' };
  let list = await api({ ...base, gsrsearch: `${query} incategory:Quality_images filetype:bitmap filew:>1600` }).catch(() => []);
  if (list.length < 2) list = list.concat(await api({ ...base, gsrsearch: `${query} filetype:bitmap filew:>1600` }).catch(() => []));
  const seen = new Set();
  return list.filter((x) => !seen.has(x.url) && seen.add(x.url)).slice(0, limit);
}

function once(key, fn) {
  const c = fromCache(key);
  if (c) return Promise.resolve(c);
  if (pending.has(key)) return pending.get(key);
  const p = fn()
    .then((list) => {
      toCache(key, list);
      return list;
    })
    .catch(() => [])
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

function customFor(catId) {
  const list = S.data?.settings?.backgrounds?.[catId];
  return Array.isArray(list) ? list.filter((x) => x && x.url).map((x) => ({ url: x.url, author: x.credit || '', license: '', page: '', custom: true })) : [];
}

export async function categoryPhotos(catId) {
  const custom = customFor(catId);
  if (custom.length) return custom;
  const set = PHOTO_SETS[catId];
  if (!set) return [];
  return once('cat:' + catId, async () => {
    let list = await byTitles(set.titles).catch(() => []);
    if (list.length < 3) for (const q of set.queries) list = list.concat(await bySearch(q, 4));
    return list.slice(0, 6);
  });
}

export async function productPhotos(p) {
  if (!p) return [];
  if (p.photo) return [{ url: p.photo, author: p.photoCredit || '', license: '', page: '', custom: true }];
  const q = p.attrs?.photoQuery || PRODUCT_QUERIES[p.name] || (NAME_SEARCH.has(p.category) ? p.name : null);
  const own = q ? await once('q:' + q, () => bySearch(q, 3)) : [];
  if (own.length) return own;
  return categoryPhotos(p.category);
}

export async function homePhotos() {
  const custom = customFor('home');
  if (custom.length) return custom;
  const ids = ['auta', 'dovolene', 'elektro', 'komodity', 'nemovitosti', 'vstupenky', 'krypto', 'energie'];
  const sets = await Promise.all(ids.map((id) => categoryPhotos(id)));
  return sets.map((s) => s[0]).filter(Boolean);
}

// ---------- Scéna v pozadí ----------
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';
const stage = {
  el: null, layers: [], active: 0, list: [], idx: 0, key: '', timer: null, current: null, token: 0,
};

function ensureStage() {
  if (stage.el) return;
  stage.el = document.getElementById('stage');
  stage.layers = [...stage.el.querySelectorAll('.stage-img')];
  document.addEventListener('visibilitychange', () => (document.hidden ? stopCycle() : startCycle()));
}

function preload(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (img.decode ? img.decode().catch(() => {}).then(() => res(img)) : res(img));
    img.onerror = rej;
    img.src = url;
  });
}

function renderCredit(photo) {
  const el = document.getElementById('photo-credit');
  if (!el) return;
  if (!photo || (!photo.author && !photo.page)) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const who = [photo.author, photo.license].filter(Boolean).join(', ');
  const page = /^https:\/\/commons\.wikimedia\.org\//.test(photo.page || '') ? photo.page : '';
  el.innerHTML = page
    ? `<a href="${escapeHtml(page)}" target="_blank" rel="noopener noreferrer">Foto: ${escapeHtml(who)}, Wikimedia Commons</a>`
    : `Foto: ${escapeHtml(who)}`;
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function show(photo, token) {
  try {
    await preload(photo.url);
  } catch {
    return false;
  }
  if (token !== stage.token) return false;
  const next = stage.layers[1 - stage.active];
  const cur = stage.layers[stage.active];
  if (!/^(https:\/\/|data:image\/(png|jpeg|webp);)/.test(photo.url)) return;
  next.style.backgroundImage = `url("${photo.url.replace(/["\\\n\r]/g, encodeURIComponent)}")`;
  next.classList.remove('kb');
  void next.offsetWidth; // restart animace
  if (!reduce()) next.classList.add('kb');
  next.classList.add('on');
  cur.classList.remove('on');
  stage.active = 1 - stage.active;
  stage.el.classList.add('has-photo');
  stage.current = photo;
  renderCredit(photo);
  return true;
}

function stopCycle() {
  clearInterval(stage.timer);
  stage.timer = null;
}
function startCycle() {
  stopCycle();
  if (stage.list.length < 2 || reduce() || document.hidden) return;
  const token = stage.token;
  stage.timer = setInterval(async () => {
    if (token !== stage.token) return stopCycle();
    for (let tries = 0; tries < stage.list.length; tries++) {
      stage.idx = (stage.idx + 1) % stage.list.length;
      if (await show(stage.list[stage.idx], token)) break;
    }
  }, 9000);
}

/**
 * Nastaví pozadí. key = identifikátor sekce (aby se stejná sekce znovu nenačítala),
 * group = skupina odvětví pro barevné ladění, loader = async () => [fotky].
 */
export async function setBackdrop(key, group, loader) {
  ensureStage();
  if (key === stage.key) return;
  stage.key = key;
  const token = ++stage.token;
  stopCycle();
  const [a, b] = TINT[group] || ['#26313b', '#10161b'];
  stage.el.style.setProperty('--tint-a', a);
  stage.el.style.setProperty('--tint-b', b);
  let list = [];
  try {
    list = await loader();
  } catch {}
  if (token !== stage.token) return;
  stage.list = list;
  stage.idx = 0;
  if (!list.length) {
    stage.layers.forEach((l) => l.classList.remove('on'));
    stage.el.classList.remove('has-photo');
    stage.current = null;
    renderCredit(null);
    return;
  }
  for (let i = 0; i < list.length; i++) {
    stage.idx = i;
    if (await show(list[i], token)) break;
  }
  startCycle();
}

// Po překreslení stránky (nový prvek pro kredit) doplní popisek aktuální fotky.
export const refreshCredit = () => renderCredit(stage.current);

export const groupOf = (catId) => categoryById(catId)?.group || 'nakupy';
