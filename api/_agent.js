// AI cenový agent: u odvětví bez oficiálního zdroje dohledá aktuální ceny na webu.
// Dvě varianty:
//   • ZDARMA (výchozí): vyhledávání Tavily (1 000 hledání/měsíc zdarma) + bezplatné AI (Gemini nebo Groq),
//     které z nalezených úryvků vytáhne ceny. Běží jednou měsíčně (1. den v měsíci).
//   • PLACENÁ: Claude API s nástrojem web_search (přesnější, čte celé stránky).
// Pojistky proti „vymyšleným“ cenám:
//   • přijme se jen cena s odkazem na zdroj, který se opravdu objevil ve výsledcích vyhledávání,
//   • u bezplatné varianty navíc musí číslo ceny doslova stát v textu nalezené stránky,
//   • jen známá ID produktů a kladné ceny,
//   • velká změna proti poslední ceně jde do fronty ke schválení místo rovnou na web,
//   • měsíční rozpočet (odhad nákladů) – po jeho vyčerpání agent do konce měsíce nic nespustí.
import { loadAll, saveProducts, getSettings, getDoc, setDoc } from './_db.js';
import { todayIso, applyFoundPrice } from '../public/lib/dataops.js';
import { clean, last } from '../public/lib/analytics.js';
import { CATEGORIES, categoryById } from '../public/lib/categories.js';

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
// Odvětví, kde žádný oficiální zdroj není (ostatní plní Steam, Yahoo, CoinGecko, ČNB, ČSÚ).
export const AGENT_CATEGORIES = CATEGORIES.filter((c) => c.source === 'manual').map((c) => c.id);
// Paliva Natural 95, nafta a LPG plní ČSÚ – agent je nepřepisuje.
export const OFFICIAL_IDS = new Set(['pohonne-natural-95', 'pohonne-nafta', 'pohonne-lpg']);

export const DEFAULT_AGENT = { enabled: true, schedule: 'monthly', perDay: 4, budgetUsd: 15, maxJump: 35, searchLimit: 900 };
export function agentSettings(settings = {}) {
  const a = settings.agent || {};
  const num = (v, min, max, d) => (Number.isFinite(+v) && v !== '' && v !== null ? Math.min(max, Math.max(min, +v)) : d);
  return {
    enabled: a.enabled !== false,
    // monthly = jednou měsíčně všechna odvětví (1. den), rotate = každý den několik odvětví dokola
    schedule: ['rotate', 'weekly'].includes(a.schedule) ? a.schedule : 'monthly',
    searchLimit: Math.round(num(a.searchLimit, 50, 100000, DEFAULT_AGENT.searchLimit)),
    perDay: Math.round(num(a.perDay, 0, AGENT_CATEGORIES.length, DEFAULT_AGENT.perDay)),
    budgetUsd: num(a.budgetUsd, 0, 1000, DEFAULT_AGENT.budgetUsd),
    maxJump: num(a.maxJump, 5, 90, DEFAULT_AGENT.maxJump),
  };
}

// Která varianta je nastavená: free = TAVILY_API_KEY + (GEMINI_API_KEY nebo GROQ_API_KEY), claude = ANTHROPIC_API_KEY.
const orKey = () => process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || '';
const freeReady = () => !!process.env.TAVILY_API_KEY && !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || orKey());
export function provider() {
  const want = String(process.env.AGENT_PROVIDER || '').toLowerCase();
  if (want === 'claude' && process.env.ANTHROPIC_API_KEY) return 'claude';
  if (freeReady()) return 'free';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return null;
}
export const agentConfigured = () => !!provider();
export const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
export const GROQ_MODEL = () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
// OpenRouter: bezplatné modely (přípona :free) se často mění – posílá se seznam a OpenRouter vezme první dostupný.
export const OPENROUTER_MODELS = () =>
  (process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-26b-a4b-it:free')
    .split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3);
const llmName = () => (process.env.GEMINI_API_KEY ? 'gemini' : orKey() ? 'openrouter' : 'groq');
export function providerLabel() {
  const p = provider();
  if (p === 'claude') return `Claude (${model()}) – placené`;
  if (p === 'free') return `Tavily + ${{ gemini: `Gemini (${GEMINI_MODEL()})`, openrouter: `OpenRouter (${OPENROUTER_MODELS()[0]})`, groq: `Groq (${GROQ_MODEL()})` }[llmName()]} – zdarma`;
  return 'nenastaveno';
}
export function missingKeys() {
  if (provider()) return [];
  const m = [];
  if (!process.env.TAVILY_API_KEY) m.push('TAVILY_API_KEY');
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !orKey()) m.push('OPENROUTER_API_KEY (nebo GEMINI_API_KEY)');
  return m;
}
const model = () => process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
// Odhad ceny: $ za milion tokenů (vstup / výstup) a $10 za 1000 hledání. Ceny lze přepsat proměnnými.
const PRICE_IN = () => +process.env.ANTHROPIC_PRICE_IN || 3;
const PRICE_OUT = () => +process.env.ANTHROPIC_PRICE_OUT || 15;
const PRICE_SEARCH = 0.01;
export function estimateCost(u = {}) {
  const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) * 0.1;
  return (inTok * PRICE_IN() + (u.output_tokens || 0) * PRICE_OUT()) / 1e6 + (u.server_tool_use?.web_search_requests || 0) * PRICE_SEARCH;
}

const SYSTEM = `You are a price researcher for BuyWise, a Czech price-tracking site. Use web search to find the CURRENT retail price in the Czech Republic (CZK) for each product you are given.
Rules:
- Search Czech sources first (e-shops such as Alza, CZC, Datart, Mall, Notino, Sportisimo, Decathlon, iKEA, Rohlík, Kosmas, operator and insurer price lists, car-maker price lists, srovnávače Heureka / Zboží.cz, official statistics).
- The price must match the product's unit (e.g. "Kč/měs." = monthly price, "Kč/m²" = price per square metre, "Kč/kWh", "Kč/rok"). For cars use the base list price of the given variant. For holidays, tickets and similar use a typical current price for the described item.
- Only report a price you actually saw in a search result. Every price needs the exact https URL of the page where you saw it. Never guess or estimate. If you can't find a reliable current price, leave the product out.
- "shops": up to 5 Czech sellers with their own price and https URL, if you found them.
- Be efficient: one search can often cover several products (e.g. a comparison site).
Reply with ONLY a JSON array, no other text:
[{"id":"<product id>","price":<number in CZK>,"source_url":"https://…","source_name":"<site>","as_of":"YYYY-MM-DD or empty","shops":[{"name":"<shop>","price":<number>,"url":"https://…"}]}]`;

export function buildPrompt(category, products) {
  const c = categoryById(category);
  const lines = products.map((p) => {
    const l = last(clean(p.prices));
    return `- id: ${p.id} | ${p.name}${p.subtitle ? ` (${p.subtitle})` : ''} | unit: ${p.unit || 'Kč'}${l && !p.sample ? ` | last known price: ${l.p} (${l.d})` : ''}`;
  });
  return `Category: ${c?.name || category}${c?.sourceNote ? ` – ${c.sourceNote}` : ''}\nToday: ${todayIso()}\nFind the current Czech retail price for each product:\n${lines.join('\n')}`;
}

// ---------- Volání Claude API ----------
export async function callClaude(prompt, { fetchImpl = fetch, maxSearches = 8, timeoutMs = 170000 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Chybí ANTHROPIC_API_KEY');
  const messages = [{ role: 'user', content: prompt }];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 0 } };
  const content = [];
  const deadline = Date.now() + timeoutMs;
  for (let turn = 0; turn < 4; turn++) {
    const left = deadline - Date.now();
    if (left < 5000) throw new Error('Časový limit vyhledávání');
    const r = await fetchImpl(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: model(),
        max_tokens: 6000,
        system: SYSTEM,
        messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches, user_location: { type: 'approximate', country: 'CZ', timezone: 'Europe/Prague' } }],
      }),
      signal: AbortSignal.timeout(left),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = j?.error?.message || `HTTP ${r.status}`;
      if (r.status === 401) throw new Error('Claude API: neplatný ANTHROPIC_API_KEY');
      if (r.status === 404) throw new Error(`Claude API: model ${model()} neexistuje nebo není dostupný (${m})`);
      if (r.status === 429) throw new Error('Claude API: překročen limit požadavků, zkus to později');
      throw new Error(`Claude API: ${m}`);
    }
    for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) usage[k] += j.usage?.[k] || 0;
    usage.server_tool_use.web_search_requests += j.usage?.server_tool_use?.web_search_requests || 0;
    content.push(...(j.content || []));
    // Dlouhé hledání server přeruší (pause_turn) – pokračuje se stejnou odpovědí.
    if (j.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: j.content });
  }
  return { content, usage };
}

// ================= Bezplatná varianta: Tavily + Gemini / Groq =================
export const TAVILY_URL = 'https://api.tavily.com/search';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normUrl = (u) => {
  try {
    const x = new URL(String(u).trim());
    x.hash = '';
    return x.href.replace(/\/$/, '');
  } catch {
    return '';
  }
};

export async function tavilySearch(query, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(TAVILY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query, search_depth: 'basic', topic: 'general', country: 'czech republic', max_results: 5, chunks_per_source: 2, include_answer: false }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) throw new Error('Tavily: neplatný TAVILY_API_KEY');
    if (r.status === 432 || r.status === 433 || /limit|credits/i.test(j?.detail?.error || '')) throw Object.assign(new Error('Tavily: vyčerpaný měsíční limit hledání'), { budget: true });
    throw new Error(`Tavily: ${j?.detail?.error || `HTTP ${r.status}`}`);
  }
  return (j.results || []).filter((x) => x?.url && /^https?:/.test(x.url)).map((x) => ({ url: x.url, title: String(x.title || '').slice(0, 160), content: String(x.content || '').slice(0, 700) }));
}

const FREE_SYSTEM = `You extract current retail prices in the Czech Republic (CZK) from web search snippets for BuyWise, a Czech price-tracking site.
Rules:
- Use ONLY the snippets given for each product. Never use your own knowledge, never guess, never compute or round.
- A price counts only if the number is written in the snippet text and clearly belongs to that exact product (same model, size, capacity, variant) and to the product's unit ("Kč/měs." = monthly, "Kč/rok" = yearly, "Kč/m²" = per square metre).
- Ignore used/second-hand/bazaar offers, accessories, instalments, old prices and prices in other currencies.
- source_url must be copied exactly from the snippet where you saw the price.
- "shops": other Czech shops whose price for the same product appears in the snippets (name, price, url copied exactly).
- If no snippet contains a reliable price, leave the product out.
Reply with JSON only: {"prices":[{"id":"<product id>","price":<number>,"source_url":"<url>","source_name":"<site>","shops":[{"name":"<shop>","price":<number>,"url":"<url>"}]}]}`;

export function buildFreePrompt(category, items) {
  const c = categoryById(category);
  return `Category: ${c?.name || category}\nToday: ${todayIso()}\n\n` + items
    .map(({ p, results }) => {
      const l = last(clean(p.prices));
      return `### id: ${p.id}\nProduct: ${p.name}${p.subtitle ? ` (${p.subtitle})` : ''} | unit: ${p.unit || 'Kč'}${l && !p.sample ? ` | last known price: ${l.p}` : ''}\n${results.length ? results.map((r, i) => `[${i + 1}] ${r.url}\n${r.title}\n${r.content.replace(/\s+/g, ' ')}`).join('\n') : '(no results)'}`;
    })
    .join('\n\n');
}

async function postJson(url, headers, body, { fetchImpl, deadline, label }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const left = deadline - Date.now();
    if (left < 4000) throw new Error(`${label}: časový limit`);
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(Math.min(left, 90000)) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    const msg = j?.error?.message || `HTTP ${r.status}`;
    // Bezplatné tarify mají limit za minutu – počká a zkusí znovu.
    if ((r.status === 429 || r.status === 503) && attempt < 3) {
      const wait = Math.min(65000, (+r.headers?.get?.('retry-after') || 20) * 1000);
      if (Date.now() + wait < deadline - 10000) {
        await sleep(wait);
        continue;
      }
    }
    if (r.status === 400 && /api key|API_KEY/i.test(msg)) throw new Error(`${label}: neplatný klíč`);
    if (r.status === 401 || r.status === 403) throw new Error(`${label}: neplatný klíč nebo chybí přístup (${msg})`);
    if (r.status === 404) throw new Error(`${label}: model neexistuje (${msg}) – nastav jiný v proměnné ${{ Gemini: 'GEMINI_MODEL', OpenRouter: 'OPENROUTER_MODEL', Groq: 'GROQ_MODEL' }[label]}`);
    if (r.status === 402) throw new Error(`${label}: účet má záporný zůstatek nebo model není zdarma (${msg})`);
    if (r.status === 429) throw new Error(`${label}: vyčerpaný bezplatný limit, zkus to později`);
    throw new Error(`${label}: ${msg}`);
  }
  throw new Error(`${label}: opakovaně přetížené`);
}

export async function callFreeLLM(prompt, { fetchImpl = fetch, deadline = Date.now() + 120000 } = {}) {
  if (process.env.GEMINI_API_KEY) {
    const j = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL())}:generateContent`,
      { 'x-goog-api-key': process.env.GEMINI_API_KEY },
      { systemInstruction: { parts: [{ text: FREE_SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 4000, responseMimeType: 'application/json' } },
      { fetchImpl, deadline, label: 'Gemini' }
    );
    return (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
  }
  if (orKey()) {
    const j = await postJson(
      'https://openrouter.ai/api/v1/chat/completions',
      { authorization: `Bearer ${orKey()}`, 'HTTP-Referer': process.env.SITE_URL || 'https://buywise.vercel.app', 'X-Title': 'BuyWise' },
      { models: OPENROUTER_MODELS(), temperature: 0, max_tokens: 4000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: FREE_SYSTEM }, { role: 'user', content: prompt }] },
      { fetchImpl, deadline, label: 'OpenRouter' }
    );
    if (j.error) throw new Error(`OpenRouter: ${j.error.message || 'chyba modelu'}`);
    return j.choices?.[0]?.message?.content || '';
  }
  const j = await postJson(
    'https://api.groq.com/openai/v1/chat/completions',
    { authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    { model: GROQ_MODEL(), temperature: 0, max_completion_tokens: 4000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: FREE_SYSTEM }, { role: 'user', content: prompt }] },
    { fetchImpl, deadline, label: 'Groq' }
  );
  return j.choices?.[0]?.message?.content || '';
}

// Je číslo ceny opravdu v textu? (32 490 / 32.490 / 32490,- / 1 049,90 …)
export function numbersIn(text) {
  const out = [];
  for (const m of String(text || '').replace(/ | /g, ' ').matchAll(/\d{1,3}(?:[ .]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g)) {
    let s = m[0];
    if (/^\d{1,3}(?:[ .]\d{3})+/.test(s)) s = s.replace(/[ .](?=\d{3}(?:\D|$))/g, '');
    const n = parseFloat(s.replace(',', '.'));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}
export const priceInText = (price, text) => numbersIn(text).some((n) => Math.abs(n - price) <= Math.max(0.01, price * 0.002));

export function parseFreeAnswer(text) {
  const t = String(text || '');
  for (const c of [t, t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)]) {
    try {
      const v = JSON.parse(c);
      if (Array.isArray(v)) return v;
      if (Array.isArray(v?.prices)) return v.prices;
    } catch {}
  }
  return extractJson([{ type: 'text', text: t }]);
}

async function freeCategory(category, list, opts = {}) {
  const deadline = Date.now() + (opts.timeoutMs || 200000);
  let searches = 0;
  const items = [];
  // Hledání po 4 najednou (1 hledání = 1 kredit Tavily).
  for (let i = 0; i < list.length; i += 4) {
    const chunk = list.slice(i, i + 4);
    const res = await Promise.allSettled(chunk.map((p) => tavilySearch(`${p.name}${p.subtitle ? ' ' + p.subtitle : ''} cena`, opts)));
    res.forEach((r, k) => {
      searches++;
      if (r.status === 'rejected' && r.reason?.budget) throw Object.assign(r.reason, { searches });
      items.push({ p: chunk[k], results: r.status === 'fulfilled' ? r.value : [] });
    });
    if (res.every((r) => r.status === 'rejected')) throw Object.assign(res[0].reason, { searches });
  }
  const texts = new Map();
  for (const it of items) for (const r of it.results) texts.set(normUrl(r.url), `${texts.get(normUrl(r.url)) || ''} ${r.title} ${r.content}`);
  const answer = await callFreeLLM(buildFreePrompt(category, items), { fetchImpl: opts.fetchImpl, deadline });
  const raw = parseFreeAnswer(answer);
  if (!raw) throw Object.assign(new Error('Odpověď AI neobsahuje platná data'), { searches });
  return { raw, searches, texts };
}

// Adresy, které se opravdu objevily ve výsledcích hledání nebo v citacích.
export function seenUrls(content = []) {
  const urls = new Set();
  for (const b of content) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.forEach((x) => x?.url && urls.add(x.url));
    if (b.type === 'text') (b.citations || []).forEach((c) => c?.url && urls.add(c.url));
  }
  return urls;
}
const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

// Poslední JSON pole v textu odpovědi (model občas přidá úvodní větu nebo ```json).
export function extractJson(content = []) {
  const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const fence = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = [...fence.reverse(), text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)];
  for (const c of candidates) {
    try {
      const v = JSON.parse(c.trim());
      if (Array.isArray(v)) return v;
    } catch {}
  }
  return null;
}

const httpsUrl = (u) => {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && x.href.length <= 600 ? x.href : '';
  } catch {
    return '';
  }
};
const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')));

// Kontrola výsledků: co jde rovnou do dat, co ke schválení a co se zahodí (s důvodem).
export function validateResults(raw, products, { seen, maxJump = 35, texts = null } = {}) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const hosts = seen ? new Set([...seen].map(host)) : null;
  const okHost = (u) => !hosts || hosts.has(host(u));
  const accepted = [];
  const review = [];
  const rejected = [];
  const done = new Set();
  for (const r of Array.isArray(raw) ? raw : []) {
    const p = byId.get(r?.id);
    if (!p || done.has(p.id)) {
      rejected.push({ id: String(r?.id || '?').slice(0, 120), why: 'neznámé ID' });
      continue;
    }
    const price = num(r.price);
    const url = httpsUrl(r.source_url);
    if (!(price > 0) || price > 1e9) {
      rejected.push({ id: p.id, why: 'neplatná cena' });
      continue;
    }
    if (!url) {
      rejected.push({ id: p.id, why: 'chybí odkaz na zdroj' });
      continue;
    }
    if (!okHost(url) || (texts && !texts.has(normUrl(url)))) {
      rejected.push({ id: p.id, why: `zdroj ${host(url)} nebyl ve výsledcích hledání` });
      continue;
    }
    // Bezplatná varianta: číslo musí doslova stát v úryvku nalezené stránky.
    if (texts && !priceInText(price, texts.get(normUrl(url)))) {
      rejected.push({ id: p.id, why: `cena ${price} není v textu zdroje` });
      continue;
    }
    done.add(p.id);
    const shops = (Array.isArray(r.shops) ? r.shops : [])
      .map((s) => ({ name: String(s?.name || '').trim().slice(0, 60), price: num(s?.price), url: httpsUrl(s?.url) }))
      .filter((s) => s.name && s.price > 0 && s.price >= price * 0.5 && s.price <= price * 2 && (!s.url || okHost(s.url)))
      .filter((s) => !texts || (s.url && priceInText(s.price, texts.get(normUrl(s.url)))))
      .slice(0, 6);
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(r.as_of || '') ? r.as_of : '';
    const item = { id: p.id, name: p.name, category: p.category, price: Math.round(price * 100) / 100, url, sourceName: String(r.source_name || host(url)).slice(0, 80), asOf, shops };
    const prev = last(clean(p.prices))?.p;
    const jump = prev ? Math.abs(price - prev) / prev * 100 : 0;
    // Ukázkové ceny jsou jen orientační – u nich se toleruje větší rozdíl.
    const limit = p.sample ? Math.max(maxJump, 60) : maxJump;
    if (prev && jump > limit) review.push({ ...item, old: prev, jump: Math.round(jump) });
    else accepted.push(item);
  }
  return { accepted, review, rejected };
}

// Zapíše dohledanou cenu do produktu: bod historie, ceny prodejců, zdroj s odkazem.
export const applyResult = (p, item) => applyFoundPrice(p, { price: item.price, shops: item.shops || [], label: 'Dohledáno na webu (AI)', sourceName: item.sourceName, url: item.url, date: item.asOf });

// ---------- Jedno odvětví ----------
export async function agentCategory(category, products, opts = {}) {
  const list = products.filter((p) => p.category === category && p.active !== false && !OFFICIAL_IDS.has(p.id)).slice(0, 12);
  if (!list.length) return { category, products: [], review: [], rejected: [], missing: [], usage: {}, cost: 0, searches: 0, count: 0 };
  let v, usage = {}, searches = 0;
  if (provider() === 'free') {
    const f = await freeCategory(category, list, opts);
    searches = f.searches;
    v = validateResults(f.raw, list, { seen: new Set(f.texts.keys()), texts: f.texts, maxJump: opts.maxJump });
  } else {
    const c = await callClaude(buildPrompt(category, list), opts);
    usage = c.usage;
    searches = usage.server_tool_use?.web_search_requests || 0;
    const raw = extractJson(c.content);
    if (!raw) throw Object.assign(new Error('Odpověď AI neobsahuje platná data'), { usage, cost: estimateCost(usage), searches });
    v = validateResults(raw, list, { seen: seenUrls(c.content), maxJump: opts.maxJump });
  }
  const byId = new Map(list.map((p) => [p.id, p]));
  return {
    category,
    products: v.accepted.map((x) => applyResult(byId.get(x.id), x)),
    review: v.review,
    rejected: v.rejected,
    missing: list.filter((p) => !v.accepted.some((x) => x.id === p.id) && !v.review.some((x) => x.id === p.id) && !v.rejected.some((x) => x.id === p.id)).map((p) => p.id),
    usage,
    searches,
    cost: provider() === 'free' ? 0 : estimateCost(usage),
    count: v.accepted.length,
  };
}

// ---------- Stav agenta (meta/agent) ----------
const month = () => todayIso().slice(0, 7);
export async function agentState() {
  const s = (await getDoc('meta/agent')) || {};
  if (s.month !== month()) Object.assign(s, { month: month(), costUsd: 0, searches: 0, runs: 0, monthDone: [], monthTries: {}, periodKey: null });
  return { cursor: 0, log: [], lastByCategory: {}, monthDone: [], monthTries: {}, ...s };
}
export async function getReview() {
  return (await getDoc('meta/agentReview'))?.items || [];
}

// Zpracuje jedno odvětví a vše uloží (produkty, frontu ke schválení, náklady a záznam).
export async function runAgentCategory(category, { who = 'cron', settings, state, products, fetchImpl } = {}) {
  if (!AGENT_CATEGORIES.includes(category)) throw new Error('Toto odvětví se plní z oficiálního zdroje');
  settings = settings || (await getSettings());
  const cfg = agentSettings(settings);
  state = state || (await agentState());
  if (cfg.schedule !== 'rotate') enterPeriod(state, period(cfg.schedule).key);
  if (provider() === 'free' && state.searches >= cfg.searchLimit) throw Object.assign(new Error(`Měsíční limit hledání (${cfg.searchLimit}) je vyčerpaný – další běh příští měsíc`), { budget: true });
  if (provider() === 'claude' && cfg.budgetUsd && state.costUsd >= cfg.budgetUsd) throw Object.assign(new Error(`Měsíční rozpočet AI agenta ($${cfg.budgetUsd}) je vyčerpaný`), { budget: true });
  products = products || (await loadAll({ includeInactive: true }));
  let r;
  try {
    r = await agentCategory(category, products, { maxJump: cfg.maxJump, fetchImpl });
  } catch (e) {
    state.costUsd += e.cost || 0;
    state.searches += e.searches || 0;
    state.monthTries = { ...state.monthTries, [category]: (state.monthTries?.[category] || 0) + 1 };
    state.log = [{ at: new Date().toISOString(), category, who, error: e.message }, ...state.log].slice(0, 40);
    await setDoc('meta/agent', state, false);
    throw e;
  }
  if (r.products.length) await saveProducts(r.products);
  if (r.review.length) {
    const queue = (await getReview()).filter((x) => !r.review.some((y) => y.id === x.id));
    await setDoc('meta/agentReview', { items: [...r.review.map((x) => ({ ...x, at: new Date().toISOString() })), ...queue].slice(0, 200) }, false);
  }
  state.costUsd = Math.round((state.costUsd + r.cost) * 10000) / 10000;
  state.searches += r.searches || 0;
  state.runs += 1;
  state.monthDone = [...new Set([...(state.monthDone || []), category])];
  state.lastByCategory = { ...state.lastByCategory, [category]: new Date().toISOString() };
  const entry = { at: new Date().toISOString(), category, who, updated: r.count, review: r.review.length, rejected: r.rejected.length, missing: r.missing?.length || 0, searches: r.searches || 0, cost: Math.round(r.cost * 1000) / 1000 };
  state.log = [entry, ...state.log].slice(0, 40);
  await setDoc('meta/agent', state, false);
  return { ...entry, rejectedList: r.rejected, products: r.products.map((p) => ({ id: p.id, name: p.name, price: last(p.prices)?.p, source: p.source, url: p.sourceUrl })), reviewList: r.review };
}

const pragueDay = (t = Date.now()) => +new Date(t).toLocaleString('en-US', { timeZone: 'Europe/Prague', day: 'numeric' });
const pragueMonth = (t = Date.now()) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Prague' }).slice(0, 7);
// Období, ve kterém se mají ceny projít jednou: měsíc, nebo týden (1.–7., 8.–14., 15.–21., 22.–konec měsíce).
export function period(schedule, t = Date.now()) {
  const day = pragueDay(t);
  if (schedule === 'weekly') {
    const idx = Math.min(3, Math.floor((day - 1) / 7));
    return { key: `${pragueMonth(t)}/${idx + 1}`, open: day - (idx * 7 + 1) < 5, start: idx * 7 + 1 };
  }
  return { key: pragueMonth(t), open: day <= 7, start: 1 };
}
function enterPeriod(state, key) {
  if (state.periodKey === key) return;
  Object.assign(state, { periodKey: key, monthDone: [], monthTries: {} });
}

// Plánovaný běh (cron každé ráno):
//   • monthly: 1. den v měsíci projde všechna odvětví; co nestihne nebo selže, dodělá další ráno (nejpozději do 7. dne,
//     každé odvětví max. 3 pokusy). Pak až do dalšího 1. dne nic nehledá.
//   • rotate: každý den několik odvětví dokola (pro placenou variantu).
export async function runAgentDaily({ timeBudgetMs = 250000, fetchImpl, now = Date.now } = {}) {
  if (!agentConfigured()) return { skipped: `AI agent není nastavený (chybí ${missingKeys().join(', ')})` };
  const settings = await getSettings();
  const cfg = agentSettings(settings);
  if (!cfg.enabled) return { skipped: 'AI agent je v nastavení vypnutý' };
  const state = await agentState();
  let queue;
  if (cfg.schedule !== 'rotate') {
    const per = period(cfg.schedule, now());
    enterPeriod(state, per.key);
    if (!per.open) return { skipped: cfg.schedule === 'weekly' ? 'Ceny se hledají 1., 8., 15. a 22. den v měsíci' : 'Ceny se hledají 1. den v měsíci' };
    queue = AGENT_CATEGORIES.filter((c) => !(state.monthDone || []).includes(c) && (state.monthTries?.[c] || 0) < 3);
    if (!queue.length) return { skipped: cfg.schedule === 'weekly' ? 'Tento týden jsou ceny už dohledané' : 'Tento měsíc jsou ceny už dohledané' };
  } else {
    if (!cfg.perDay) return { skipped: 'Počet odvětví za den je 0' };
    queue = Array.from({ length: cfg.perDay }, (_, k) => AGENT_CATEGORIES[(state.cursor + k) % AGENT_CATEGORIES.length]);
  }
  const products = await loadAll({ includeInactive: true });
  const start = now();
  const done = [];
  const errors = [];
  // Odhad: bezplatná varianta ~20–40 s na odvětví, Claude 30–90 s.
  const reserve = provider() === 'free' ? 60000 : 100000;
  for (const [k, category] of queue.entries()) {
    if (k && now() - start > timeBudgetMs - reserve) break;
    if (cfg.schedule === 'rotate') state.cursor = (AGENT_CATEGORIES.indexOf(category) + 1) % AGENT_CATEGORIES.length;
    try {
      done.push(await runAgentCategory(category, { who: 'cron', settings, state, products, fetchImpl }));
    } catch (e) {
      errors.push(`${category}: ${e.message}`);
      await setDoc('meta/agent', state, false);
      if (e.budget) break;
    }
  }
  const left = cfg.schedule !== 'rotate' ? AGENT_CATEGORIES.filter((c) => !(state.monthDone || []).includes(c)).length : null;
  return { done, errors, left, searches: state.searches, costUsd: state.costUsd, budgetUsd: cfg.budgetUsd };
}
