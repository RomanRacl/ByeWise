// Bezpečnost serveru: omezení počtu pokusů, přihlašovací relace administrace (HttpOnly cookie),
// ochrana proti SSRF při stahování feedů, kontrola odkazů, ID a obrázků, bezpečné čtení těla požadavku.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { gunzipSync } from 'node:zlib';
import { getDoc, setDoc, hasFirebase } from './_db.js';

// ---------- Porovnání tajných hodnot ----------
export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  // Stejně dlouhé porovnání i při rozdílné délce (neprozradí délku časem).
  const len = Math.max(x.length, y.length, 1);
  const px = Buffer.alloc(len), py = Buffer.alloc(len);
  x.copy(px);
  y.copy(py);
  return timingSafeEqual(px, py) && x.length === y.length;
}

// ---------- IP adresa a omezení počtu pokusů ----------
export function clientIp(req) {
  const h = req.headers || {};
  const xf = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(h['x-real-ip'] || '') || req.socket?.remoteAddress || 'unknown';
}
// IP se ukládá jen jako otisk (bez osobních údajů v databázi).
const fingerprint = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 32);

const memory = new Map(); // rychlá vrstva v rámci jedné instance funkce
/**
 * Omezení počtu událostí: nejvýš `limit` za `windowSec` sekund pro daný klíč.
 * persist = false: jen v paměti instance (levné, pro časté požadavky přihlášených uživatelů).
 * hit = false jen zkontroluje stav (např. před ověřením hesla), hit = true událost započítá.
 */
export async function rateLimit(bucket, key, { limit, windowSec, persist = true }, hit = true) {
  const id = `${bucket}-${fingerprint(key)}`;
  const now = Date.now();
  let st = memory.get(id);
  if (!st && persist && hasFirebase()) st = (await getDoc(`ratelimit/${id}`).catch(() => null)) || null;
  if (!st || st.reset <= now) st = { count: 0, reset: now + windowSec * 1000 };
  if (hit) {
    st.count++;
    memory.set(id, st);
    if (persist && hasFirebase()) await setDoc(`ratelimit/${id}`, { ...st, bucket, expireAt: new Date(st.reset) }, false).catch(() => {});
  }
  // Kontrola bez započtení (hit = false) blokuje už při vyčerpaném limitu.
  return { ok: hit ? st.count <= limit : st.count < limit, remaining: Math.max(0, limit - st.count), retryAfter: Math.ceil((st.reset - now) / 1000) };
}
export async function resetLimit(bucket, key) {
  const id = `${bucket}-${fingerprint(key)}`;
  memory.delete(id);
  if (hasFirebase()) await setDoc(`ratelimit/${id}`, { count: 0, reset: 0, bucket }, false).catch(() => {});
}
export function tooMany(res, retryAfter) {
  res.setHeader('Retry-After', String(retryAfter));
  return res.status(429).json({ error: `Příliš mnoho pokusů. Zkus to znovu za ${Math.ceil(retryAfter / 60)} min.` });
}

// ---------- Relace administrace ----------
// Heslo se pošle jen jednou; server vrátí podepsaný token v HttpOnly cookie (JavaScript ho nepřečte,
// takže ho nejde ukrást ani případným XSS). Změnou hesla se všechny relace zneplatní.
export const SESSION_COOKIE = 'bw_admin';
const SESSION_HOURS = 8;
const sessionSecret = () => process.env.ADMIN_SESSION_SECRET || createHash('sha256').update(`bw|${process.env.ADMIN_PASSWORD || ''}|${process.env.CRON_SECRET || ''}`).digest('hex');
const b64 = (s) => Buffer.from(s).toString('base64url');

export function signSession(who, hours = SESSION_HOURS) {
  const body = b64(JSON.stringify({ who, exp: Date.now() + hours * 3600e3 }));
  return `${body}.${createHmac('sha256', sessionSecret()).update(body).digest('base64url')}`;
}
export function verifySession(token) {
  if (!process.env.ADMIN_PASSWORD) return null;
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  if (!safeEqual(sig, want)) return null;
  try {
    const d = JSON.parse(Buffer.from(body, 'base64url').toString());
    return d.exp > Date.now() ? d : null;
  } catch {
    return null;
  }
}
export function readCookie(req, name) {
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}
export function sessionCookie(token, req) {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers?.host || ''));
  const maxAge = token ? SESSION_HOURS * 3600 : 0;
  return `${SESSION_COOKIE}=${token || ''}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${local ? '' : '; Secure'}`;
}

// ---------- Odkazy, ID, texty ----------
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;
export const validId = (id) => typeof id === 'string' && ID_RE.test(id);
export function cleanUrl(u, { allowData = false, max = 1000 } = {}) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (allowData && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(s)) return s;
  try {
    const url = new URL(s);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (url.username || url.password) return '';
    return url.href.slice(0, max);
  } catch {
    return '';
  }
}
export const clip = (s, n) => String(s ?? '').slice(0, n);

// ---------- Obrázky: kontrola obsahu, ne jen deklarovaného typu ----------
export function imageKind(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

// ---------- Ochrana proti SSRF ----------
// Feedy zadává administrátor, ale server je stahuje – nesmí se tím dát dostat do vnitřní sítě
// (localhost, metadata cloudu 169.254.169.254, privátní rozsahy).
function privateV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 198 && (b === 18 || b === 19));
}
function privateIp(ip) {
  if (isIP(ip) === 4) return privateV4(ip);
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateV4(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff');
}
let resolveHost = async (host) => (await lookup(host, { all: true, verbatim: true })).map((x) => x.address);
export const _setResolver = (fn) => (resolveHost = fn); // jen pro testy
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw bad('Neplatná adresa');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw bad('Povolené jsou jen adresy http(s)');
  if (url.username || url.password) throw bad('Adresa nesmí obsahovat jméno a heslo');
  if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) throw bad('Nepovolený port');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw bad('Interní adresa není povolená');
  let ips;
  try {
    ips = isIP(host) ? [host] : await resolveHost(host);
  } catch {
    throw bad(`Server ${host} neexistuje`);
  }
  if (!ips.length || ips.some(privateIp)) throw bad('Adresa vede do vnitřní sítě, to není povolené');
  return url;
}

/** Bezpečné stažení: kontrola cíle i každého přesměrování, časový limit, limit velikosti, rozbalení .gz. */
export async function safeFetch(raw, { maxBytes = 30 * 1024 * 1024, timeoutMs = 25000, headers = {} } = {}) {
  let url = await assertPublicUrl(raw);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop < 4; hop++) {
    const r = await fetch(url, { headers, redirect: 'manual', signal });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      url = await assertPublicUrl(new URL(r.headers.get('location'), url).href);
      continue;
    }
    if (!r.ok) throw new Error(`server odpověděl ${r.status}`);
    const len = +r.headers.get('content-length') || 0;
    if (len > maxBytes) throw new Error(`soubor je moc velký (${Math.round(len / 1e6)} MB, limit ${Math.round(maxBytes / 1e6)} MB)`);
    const chunks = [];
    let size = 0;
    if (r.body?.getReader) {
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(`soubor je moc velký (limit ${Math.round(maxBytes / 1e6)} MB)`);
        }
        chunks.push(value);
      }
    } else chunks.push(Buffer.from(await r.arrayBuffer()));
    let buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      buf = gunzipSync(buf, { maxOutputLength: maxBytes * 4 });
    }
    return buf.toString('utf8');
  }
  throw new Error('příliš mnoho přesměrování');
}

// ---------- Tělo požadavku ----------
// Vyžaduje JSON (Content-Type: application/json) – formulář z cizího webu tak nemůže poslat požadavek bez CORS kontroly.
export function readJson(req) {
  // Vercel umí rozparsovat i formulář (urlencoded) do objektu – proto se typ kontroluje vždy.
  const ct = String(req.headers?.['content-type'] || '');
  if (!/^application\/json\b/i.test(ct)) throw Object.assign(new Error('Požadavek musí být JSON'), { status: 415 });
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try {
    return JSON.parse(typeof req.body === 'string' ? req.body || '{}' : '{}');
  } catch {
    throw Object.assign(new Error('Neplatný JSON'), { status: 400 });
  }
}

// Chyba pro veřejnost: bez vnitřních podrobností (ty jdou do logu).
export function publicError(res, e, where) {
  console.error(`[${where}]`, e);
  const status = e.status && e.status >= 400 && e.status < 500 ? e.status : 500;
  return res.status(status).json({ error: status === 500 ? 'Na serveru se něco pokazilo. Zkus to prosím znovu.' : e.message });
}
