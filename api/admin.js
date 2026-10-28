// POST /api/admin – správa dat. Přístup: hlavička x-admin-password = ADMIN_PASSWORD,
// nebo přihlášení Googlem s e-mailem uvedeným v ADMIN_EMAILS (hlavička Authorization: Bearer <token>).
import { checkConfig, explainFirebaseError, healthCheck, getDb, loadAll, getProduct, saveProducts, deleteProduct, getMeta, getSettings, setDoc, getDoc, deleteDoc, audit, listAudit, getBucket } from './_db.js';
import { randomUUID } from 'node:crypto';
import { verifyAdmin, passwordOk, weakAdminPassword } from './_auth.js';
import { readJson, rateLimit, resetLimit, tooMany, clientIp, signSession, sessionCookie, validId, cleanUrl, clip, imageKind, safeFetch, publicError } from './_security.js';
import { runUpdate, evaluateAlerts } from './_update.js';
import { seedProducts } from '../public/lib/seed.js';
import { categoryById } from '../public/lib/categories.js';
import { merge, parseCsv, applyImport, parseFeed, matchFeedItem, addPoint } from '../public/lib/dataops.js';

const describe = (p) => `${p.name}${p.prices?.length ? `, cena ${p.prices[p.prices.length - 1].p}` : ''}${p.rank ? `, ${p.rank}. místo` : ''}`;

async function afterSave(ids) {
  try {
    const all = await loadAll({ includeInactive: true });
    await evaluateAlerts(all, ids);
  } catch {}
}

// Nastavení: povolí jen známé položky, odkazy jen http(s), rozumné délky.
export function sanitizeSettings(s = {}) {
  return {
    inflation: s.inflation && Number.isFinite(+s.inflation.yoy) ? { yoy: +s.inflation.yoy, label: clip(s.inflation.label, 40) } : null,
    // Šablona affiliate odkazu musí vést na http(s) (jinak by šlo podstrčit javascript: odkaz).
    affiliates: (Array.isArray(s.affiliates) ? s.affiliates : [])
      .filter((a) => a && /^[a-z0-9.-]{3,80}$/i.test(String(a.domain || '')) && /^(\{url\}|https?:\/\/)/.test(String(a.template || '')))
      .slice(0, 50)
      .map((a) => ({ domain: String(a.domain).toLowerCase(), template: clip(a.template, 500) })),
    sponsor: s.sponsor && s.sponsor.text ? { text: clip(s.sponsor.text, 120), url: cleanUrl(s.sponsor.url) } : null,
    requireApproval: !!s.requireApproval,
    backgrounds: Object.fromEntries(
      Object.entries(s.backgrounds && typeof s.backgrounds === 'object' ? s.backgrounds : {})
        .filter(([k, list]) => /^[a-z]{2,20}$/.test(k) && Array.isArray(list))
        .map(([k, list]) => [k, list.map((b) => ({ url: cleanUrl(b?.url, { max: 600 }), credit: clip(b?.credit, 160) })).filter((b) => b.url).slice(0, 12)])
        .filter(([, list]) => list.length)
    ),
    feeds: (Array.isArray(s.feeds) ? s.feeds : [])
      .map((f) => ({ url: cleanUrl(f?.url, { max: 2000 }), category: String(f?.category || ''), competitor: clip(f?.competitor, 60).trim(), mainPrice: f?.mainPrice !== false }))
      .filter((f) => f.url && categoryById(f.category) && f.competitor)
      .slice(0, 40),
  };
}

// Produkt z formuláře, importu nebo zálohy: platné ID a jen http(s) odkazy.
function sanitizeProductInput(p) {
  if (!p || typeof p !== 'object') return null;
  const out = { ...p };
  if (out.id !== undefined && !validId(out.id)) return null;
  for (const k of ['link', 'image', 'photo']) if (out[k] !== undefined) out[k] = cleanUrl(out[k]);
  for (const [k, n] of [['name', 160], ['subtitle', 200], ['demand', 160], ['unit', 20], ['photoCredit', 160]]) if (out[k] !== undefined) out[k] = clip(out[k], n);
  if (Array.isArray(out.competitors)) out.competitors = out.competitors.slice(0, 30).map((c) => ({ ...c, name: clip(c?.name, 60), url: cleanUrl(c?.url) }));
  return out;
}

const LOGIN_LIMIT = { limit: 8, windowSec: 15 * 60 };

// Pojistka: ať se stane cokoli, odpověď je vždy JSON s vysvětlením (ne holá chyba 500 z Vercelu).
export default async function handler(req, res) {
  try {
    return await handle(req, res);
  } catch (e) {
    console.error('[admin] neočekávaná chyba', e);
    return res.status(500).json({ error: 'Neočekávaná chyba serveru. Podrobnosti najdeš na Vercelu: projekt → Logs (filtr /api/admin).', detail: explainFirebaseError(e) });
  }
}

async function handle(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Použij POST' });
  res.setHeader('Cache-Control', 'no-store');
  let body;
  try {
    body = readJson(req);
  } catch (e) {
    return publicError(res, e, 'admin');
  }

  // ---------- Přihlášení a odhlášení (bez relace) ----------
  if (body.action === 'login') {
    if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: 'Na Vercelu chybí proměnná ADMIN_PASSWORD (Settings → Environment Variables). Po doplnění dej Redeploy.' });
    const ip = clientIp(req);
    const pre = await rateLimit('admin-login', ip, LOGIN_LIMIT, false);
    if (!pre.ok) return tooMany(res, pre.retryAfter);
    if (!passwordOk(String(body.password || ''))) {
      const r = await rateLimit('admin-login', ip, LOGIN_LIMIT);
      await audit('?', 'neúspěšné přihlášení', '', `zbývá pokusů: ${r.remaining}`).catch(() => {});
      return r.ok ? res.status(401).json({ error: `Špatné heslo. Zbývá pokusů: ${r.remaining}.` }) : tooMany(res, r.retryAfter);
    }
    await resetLimit('admin-login', ip);
    res.setHeader('Set-Cookie', sessionCookie(signSession('heslo administrátora'), req));
    return res.json({ ok: true });
  }
  if (body.action === 'logout') {
    res.setHeader('Set-Cookie', sessionCookie('', req));
    return res.json({ ok: true });
  }

  const admin = await verifyAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Přihlášení vypršelo nebo účet nemá oprávnění. Přihlas se znovu.', login: true });
  const who = admin.who;

  if (body.action === 'health') return res.json({ ok: true, health: await healthCheck() });
  let db;
  try {
    db = await getDb();
  } catch (e) {
    console.error('[admin] Firebase', e);
    return res.status(503).json({ error: explainFirebaseError(e), firebase: true, config: checkConfig() });
  }
  if (!db) return res.status(503).json({ error: 'Firebase není nastavený – na Vercelu chybí FIREBASE_SERVICE_ACCOUNT (celý JSON klíče), případně FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL a FIREBASE_PRIVATE_KEY.', firebase: true, config: checkConfig() });

  try {
    switch (body.action) {
      case 'status': {
        const [all, meta, pending] = await Promise.all([loadAll({ includeInactive: true }), getMeta(), getDoc('meta/pending')]);
        return res.json({ ok: true, meta, count: all.length, pending: pending?.proposals?.length || 0, who, weakPassword: weakAdminPassword() });
      }
      case 'list': {
        const all = await loadAll({ includeInactive: true });
        const list = all.filter((p) => p.category === body.category).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
        return res.json({ ok: true, products: list });
      }
      case 'save': {
        // Fotky jen jako odkaz (nahrané soubory jsou ve Storage), ne vložená data – dokument by přerostl limit Firestore.
        const input = sanitizeProductInput(body.product);
        if (!input) return res.status(400).json({ error: 'Neplatné ID produktu' });
        if (!input.name || !categoryById(input.category)) return res.status(400).json({ error: 'Chybí název nebo odvětví' });
        const prev = input.id ? await getProduct(input.id) : null;
        const p = merge(prev, input);
        await saveProducts([p]);
        await audit(who, prev ? 'úprava' : 'nový produkt', p.id, describe(p));
        await afterSave([p.id]);
        return res.json({ ok: true, product: p });
      }
      case 'uploadPhoto': {
        // Vlastní fotka produktu nebo pozadí → Firebase Storage. Prohlížeč ji předem zmenší (max. 1920 px, JPEG).
        const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
        if (!m) return res.status(400).json({ error: 'Soubor není obrázek JPEG, PNG ani WebP' });
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > 3.5 * 1024 * 1024) return res.status(400).json({ error: 'Obrázek je větší než 3,5 MB' });
        // Typ podle skutečného obsahu souboru (podvržený HTML/SVG soubor s koncovkou obrázku neprojde).
        if (imageKind(buf) !== m[1]) return res.status(400).json({ error: 'Obsah souboru neodpovídá obrázku JPEG, PNG ani WebP' });
        const bucket = await getBucket();
        if (!bucket) return res.status(400).json({ error: 'Chybí FIREBASE_STORAGE_BUCKET – nastav ho na Vercelu.' });
        const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
        const base = String(body.name || 'foto').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'foto';
        const path = `fotky/${base}-${Date.now().toString(36)}.${ext}`;
        const token = randomUUID();
        await bucket.file(path).save(buf, { contentType: m[1], metadata: { cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } } });
        // Odkaz se stahovacím tokenem funguje bez veřejného přístupu k celému bucketu.
        const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
        await audit(who, 'nahrání fotky', path, `${Math.round(buf.length / 1024)} kB`);
        return res.json({ ok: true, url, path });
      }
      case 'bulkSave': {
        const items = (Array.isArray(body.items) ? body.items : []).slice(0, 300);
        const out = [];
        for (const raw of items) {
          const input = sanitizeProductInput(raw);
          if (!input?.id) continue;
          const prev = await getProduct(input.id);
          if (prev) out.push(merge(prev, { ...input, category: prev.category }));
        }
        if (out.length) await saveProducts(out);
        await audit(who, 'hromadná úprava', body.category || '', `${out.length} produktů`);
        await afterSave(out.map((p) => p.id));
        return res.json({ ok: true, saved: out.length });
      }
      case 'delete': {
        if (!validId(body.id)) return res.status(400).json({ error: 'Neplatné ID produktu' });
        const prev = await getProduct(body.id);
        await deleteProduct(body.id);
        await audit(who, 'smazání', body.id, prev ? describe(prev) : '');
        return res.json({ ok: true });
      }
      case 'import':
      case 'importRows': {
        const cat = categoryById(body.category);
        if (!cat) return res.status(400).json({ error: 'Neznámé odvětví' });
        const rows = (body.action === 'import' ? parseCsv(String(body.csv || '')) : Array.isArray(body.rows) ? body.rows : []).slice(0, 500).map(sanitizeProductInput).filter(Boolean);
        if (!rows.length) return res.status(400).json({ error: 'Nejsou tu žádné řádky s pořadím a názvem' });
        const all = await loadAll({ includeInactive: true });
        const out = applyImport(all.filter((p) => p.category === cat.id), cat.id, rows);
        await saveProducts(out);
        await audit(who, 'import', cat.id, `${rows.length} řádků (${body.source || 'CSV'})`);
        await afterSave(out.map((p) => p.id));
        return res.json({ ok: true, imported: rows.length });
      }
      case 'seed': {
        const all = await loadAll({ includeInactive: true });
        const have = new Set(all.map((p) => p.id));
        const fresh = seedProducts().filter((p) => !have.has(p.id) && categoryById(p.category).source === 'manual');
        if (fresh.length) await saveProducts(fresh);
        await audit(who, 'výchozí data', '', `${fresh.length} produktů`);
        return res.json({ ok: true, added: fresh.length });
      }
      case 'update': {
        const status = await runUpdate({ trigger: who, weekly: !!body.weekly });
        return res.json({ ok: true, status });
      }
      case 'getSettings':
        return res.json({ ok: true, settings: await getSettings() });
      case 'setSettings': {
        const clean = sanitizeSettings(body.settings || {});
        await setDoc('meta/settings', clean, false);
        await audit(who, 'nastavení', '', JSON.stringify({ ...clean, affiliates: clean.affiliates.length, feeds: clean.feeds.length }));
        return res.json({ ok: true, settings: clean });
      }
      case 'audit':
        return res.json({ ok: true, entries: await listAudit(80) });
      case 'pending':
        return res.json({ ok: true, pending: (await getDoc('meta/pending')) || null });
      case 'approve':
      case 'reject': {
        const pending = await getDoc('meta/pending');
        if (!pending?.proposals?.length) return res.json({ ok: true, applied: 0 });
        let applied = 0;
        if (body.action === 'approve') {
          const out = [];
          for (const pr of pending.proposals) {
            const p = await getProduct(pr.id);
            if (!p) continue;
            out.push({
              ...p,
              prevRank: p.rank ?? null,
              rank: pr.rank,
              active: pr.active,
              rankHistory: pr.rank ? addPoint(p.rankHistory || [], pr.rank, 'r') : p.rankHistory || [],
              updatedAt: new Date().toISOString(),
            });
          }
          if (out.length) await saveProducts(out);
          applied = out.length;
        }
        await deleteDoc('meta/pending');
        await audit(who, body.action === 'approve' ? 'schválení pořadí' : 'zamítnutí pořadí', '', `${pending.proposals.length} změn`);
        return res.json({ ok: true, applied });
      }
      case 'backup': {
        const [products, settings] = await Promise.all([loadAll({ includeInactive: true }), getSettings()]);
        await audit(who, 'záloha', '', `${products.length} produktů`);
        return res.json({ ok: true, backup: { version: 2, exported: new Date().toISOString(), settings, products } });
      }
      case 'restore': {
        const list = (Array.isArray(body.products) ? body.products : []).map(sanitizeProductInput);
        if (!list.length || list.length > 5000 || !list.every((p) => p && validId(p.id) && categoryById(p.category) && p.name)) return res.status(400).json({ error: 'Soubor není záloha aplikace BuyWise' });
        await saveProducts(list);
        if (body.settings) await setDoc('meta/settings', sanitizeSettings(body.settings), false);
        await audit(who, 'obnova ze zálohy', '', `${list.length} produktů`);
        return res.json({ ok: true, restored: list.length });
      }
      case 'testFeed': {
        const cat = categoryById(body.category);
        if (!cat || !body.url) return res.status(400).json({ error: 'Chybí odkaz nebo odvětví' });
        const items = parseFeed(await safeFetch(String(body.url), { headers: { 'User-Agent': 'BuyWise/3 (+feed)' } }));
        const all = await loadAll();
        const matched = all
          .filter((p) => p.category === cat.id)
          .map((p) => ({ p, hit: matchFeedItem(p, items) }))
          .filter((x) => x.hit)
          .map((x) => ({ product: x.p.name, item: x.hit.name, price: x.hit.price, ean: !!x.hit.byEan }));
        const unmatched = all.filter((p) => p.category === cat.id && p.rank && !matched.some((m) => m.product === p.name)).map((p) => p.name);
        return res.json({ ok: true, items: items.length, matched, unmatched, format: items.format || '' });
      }
      default:
        return res.status(400).json({ error: 'Neznámá akce' });
    }
  } catch (e) {
    // Administrátor chybu vidí (pomáhá při ladění feedů a importů), ale bez výpisu zásobníku.
    console.error('[admin]', e);
    const fb = /firestore|firebase|PEM|private key|NOT_FOUND|PERMISSION|UNAUTHENTICATED|invalid_grant/i.test(String(e?.message));
    return res.status(e.status || (fb ? 503 : 500)).json({ error: fb ? explainFirebaseError(e) : e.message, firebase: fb || undefined });
  }
}

