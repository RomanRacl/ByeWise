// Živé zdroje dat: kurzy ČNB, Yahoo Finance (komodity, akcie), CoinGecko (krypto), Steam (hry), XML feedy e-shopů.
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; BuyWise/2.0)', Accept: 'application/json,text/plain,*/*' };

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers: { ...HEADERS, ...headers } });
  if (!r.ok) throw new Error(`${r.status} ${new URL(url).hostname}`);
  return r.json();
}

// ---------- ČNB ----------
const CNB_URL = 'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt';

export async function cnbRates() {
  const r = await fetch(CNB_URL, { headers: HEADERS });
  if (!r.ok) throw new Error(`ČNB ${r.status}`);
  const lines = (await r.text()).trim().split('\n');
  const rates = { date: lines[0].split(' ')[0], CZK: 1 };
  for (const line of lines.slice(2)) {
    const parts = line.split('|');
    if (parts.length !== 5) continue;
    const amount = parseFloat(parts[2]);
    const rate = parseFloat(parts[4].replace(',', '.'));
    if (amount && rate) rates[parts[3]] = rate / amount;
  }
  if (!rates.USD) throw new Error('ČNB: chybí kurz USD');
  return rates;
}

// ---------- Yahoo Finance ----------
// div: obilí, káva, cukr a sója se kotují v amerických centech.
export const COMMODITIES = [
  { sym: 'BZ=F', name: 'Ropa Brent', subtitle: 'Kč za barel', unit: 'Kč/barel', div: 1 },
  { sym: 'CL=F', name: 'Ropa WTI', subtitle: 'Kč za barel', unit: 'Kč/barel', div: 1 },
  { sym: 'NG=F', name: 'Zemní plyn', subtitle: 'Kč za MMBtu', unit: 'Kč/MMBtu', div: 1 },
  { sym: 'GC=F', name: 'Zlato', subtitle: 'Kč za trojskou unci', unit: 'Kč/oz', div: 1 },
  { sym: 'SI=F', name: 'Stříbro', subtitle: 'Kč za trojskou unci', unit: 'Kč/oz', div: 1 },
  { sym: 'PL=F', name: 'Platina', subtitle: 'Kč za trojskou unci', unit: 'Kč/oz', div: 1 },
  { sym: 'HG=F', name: 'Měď', subtitle: 'Kč za libru', unit: 'Kč/lb', div: 1 },
  { sym: 'ZW=F', name: 'Pšenice', subtitle: 'Kč za bušl', unit: 'Kč/bušl', div: 100 },
  { sym: 'ZC=F', name: 'Kukuřice', subtitle: 'Kč za bušl', unit: 'Kč/bušl', div: 100 },
  { sym: 'ZS=F', name: 'Sójové boby', subtitle: 'Kč za bušl', unit: 'Kč/bušl', div: 100 },
  { sym: 'KC=F', name: 'Káva Arabica', subtitle: 'Kč za libru', unit: 'Kč/lb', div: 100 },
  { sym: 'SB=F', name: 'Cukr', subtitle: 'Kč za libru', unit: 'Kč/lb', div: 100 },
];

// Akcie oblíbené u českých investorů.
export const STOCKS = [
  { sym: 'CEZ.PR', name: 'ČEZ', subtitle: 'CEZ, Burza Praha' },
  { sym: 'KOMB.PR', name: 'Komerční banka', subtitle: 'KOMB, Burza Praha' },
  { sym: 'MONET.PR', name: 'MONETA Money Bank', subtitle: 'MONET, Burza Praha' },
  { sym: 'ERBAG.PR', name: 'Erste Group', subtitle: 'ERBAG, Burza Praha' },
  { sym: 'AAPL', name: 'Apple', subtitle: 'AAPL, NASDAQ' },
  { sym: 'NVDA', name: 'NVIDIA', subtitle: 'NVDA, NASDAQ' },
  { sym: 'MSFT', name: 'Microsoft', subtitle: 'MSFT, NASDAQ' },
  { sym: 'TSLA', name: 'Tesla', subtitle: 'TSLA, NASDAQ' },
  { sym: 'AMZN', name: 'Amazon', subtitle: 'AMZN, NASDAQ' },
  { sym: 'GOOGL', name: 'Alphabet', subtitle: 'GOOGL, NASDAQ' },
  { sym: 'META', name: 'Meta Platforms', subtitle: 'META, NASDAQ' },
  { sym: 'AMD', name: 'AMD', subtitle: 'AMD, NASDAQ' },
  { sym: 'ASML.AS', name: 'ASML', subtitle: 'ASML, Amsterdam' },
  { sym: 'SAP.DE', name: 'SAP', subtitle: 'SAP, Xetra' },
  { sym: 'VOW3.DE', name: 'Volkswagen', subtitle: 'VOW3, Xetra' },
  { sym: 'BRK-B', name: 'Berkshire Hathaway', subtitle: 'BRK.B, NYSE' },
];

export async function yahooHistory(sym) {
  let lastErr;
  for (const host of ['query1', 'query2']) {
    try {
      const j = await getJson(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d`);
      const res = j?.chart?.result?.[0];
      if (!res?.timestamp) throw new Error('Yahoo: prázdná odpověď');
      const q = res.indicators.quote[0];
      const rows = res.timestamp
        .map((t, i) => ({ d: new Date(t * 1000).toISOString().slice(0, 10), close: q.close[i], volume: q.volume[i] }))
        .filter((x) => x.close != null);
      return { rows, currency: res.meta?.currency || 'USD' };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// Zájem obchodníků: průměrný objem za 20 dní / průměrný objem za poslední rok.
export function relativeVolume(rows) {
  const vols = rows.slice(-252).map((r) => r.volume).filter((v) => v > 0);
  if (vols.length < 30) return null;
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return avg(vols.slice(-20)) / avg(vols);
}

// ---------- CoinGecko ----------
const STABLE = new Set(['tether', 'usd-coin', 'dai', 'first-digital-usd', 'ethena-usde', 'usds', 'true-usd', 'paypal-usd', 'binance-usd', 'frax', 'usdd', 'euro-coin', 'stasis-eurs', 'tether-gold', 'paxos-standard']);
const cgHeaders = () => (process.env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY } : {});

export async function cryptoTop(n = 10) {
  const j = await getJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=czk&order=volume_desc&per_page=40&page=1', cgHeaders());
  return j
    .filter((c) => !STABLE.has(c.id) && !/usd|eur/i.test(c.symbol.slice(-3)) && Math.abs((c.price_change_percentage_24h ?? 1) || 1) > 0.05)
    .slice(0, n)
    .map((c) => ({ id: c.id, name: c.name, symbol: c.symbol.toUpperCase(), price: c.current_price, volume: c.total_volume, image: c.image }));
}

export async function cryptoHistory(id) {
  const j = await getJson(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=czk&days=365&interval=daily`, cgHeaders());
  const byDay = new Map();
  for (const [t, p] of j.prices || []) byDay.set(new Date(t).toISOString().slice(0, 10), p);
  return [...byDay.entries()].map(([d, p]) => ({ d, p }));
}

// ---------- Steam ----------
export async function steamTopSellers() {
  const j = await getJson('https://store.steampowered.com/api/featuredcategories/?cc=cz&l=czech');
  const seen = new Set();
  const out = [];
  for (const it of j?.top_sellers?.items || []) {
    if (it.type !== 0 || !it.id || seen.has(it.id) || /steam deck/i.test(it.name || '')) continue;
    seen.add(it.id);
    out.push({
      appid: it.id,
      name: it.name,
      price: it.final_price ? it.final_price / 100 : 0,
      originalPrice: it.original_price ? it.original_price / 100 : null,
      discount: it.discount_percent || 0,
      image: it.header_image || it.large_capsule_image || '',
    });
  }
  return out;
}

export async function steamMostPlayed() {
  const j = await getJson('https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/');
  return (j?.response?.ranks || []).map((r) => r.appid);
}

export async function steamAppDetails(appid) {
  const j = await getJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=cz&l=czech`);
  const d = j?.[appid]?.data;
  if (!d) return null;
  const po = d.price_overview;
  return {
    appid,
    name: d.name,
    price: d.is_free ? 0 : po ? po.final / 100 : null,
    originalPrice: po ? po.initial / 100 : null,
    discount: po ? po.discount_percent : 0,
    image: d.header_image || '',
    developer: (d.developers || [])[0] || '',
  };
}

export async function steamPlayers(appid) {
  try {
    const j = await getJson(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`);
    return j?.response?.player_count ?? null;
  } catch {
    return null;
  }
}

// ---------- Feedy e-shopů ----------
const FEED_MAX = 30 * 1024 * 1024;
export async function fetchFeed(url) {
  const r = await fetch(url, { headers: { ...HEADERS, Accept: 'application/xml,text/xml,text/csv,*/*' } });
  if (!r.ok) throw new Error(`feed ${r.status}`);
  const len = +r.headers.get('content-length') || 0;
  if (len > FEED_MAX) throw new Error(`feed je moc velký (${Math.round(len / 1e6)} MB, limit 30 MB)`);
  const text = await r.text();
  if (text.length > FEED_MAX) throw new Error('feed je moc velký (limit 30 MB)');
  return text;
}
