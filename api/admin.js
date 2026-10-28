// POST /api/admin – správa dat. Přístup: hlavička x-admin-password = ADMIN_PASSWORD,
// nebo přihlášení Googlem s e-mailem uvedeným v ADMIN_EMAILS (hlavička Authorization: Bearer <token>).
import { getDb, loadAll, getProduct, saveProducts, deleteProduct, getMeta, getSettings, setDoc, getDoc, deleteDoc, audit, listAudit, getBucket } from './_db.js';
import { randomUUID } from 'node:crypto';
import { verifyAdmin } from './_auth.js';
import { runUpdate, evaluateAlerts } from './_update.js';
import { fetchFeed } from './_sources.js';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Použij POST' });
  const admin = await verifyAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Špatné heslo nebo účet bez oprávnění' });
  const db = await getDb();
  if (!db) return res.status(400).json({ error: 'Firebase není nastavený – doplň proměnné prostředí na Vercelu.' });
  const who = admin.who;

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  try {
    switch (body.action) {
      case 'status': {
        const [all, meta, pending] = await Promise.all([loadAll({ includeInactive: true }), getMeta(), getDoc('meta/pending')]);
        return res.json({ ok: true, meta, count: all.length, pending: pending?.proposals?.length || 0, who });
      }
      case 'list': {
        const all = await loadAll({ includeInactive: true });
        const list = all.filter((p) => p.category === body.category).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
        return res.json({ ok: true, products: list });
      }
      case 'save': {
        const input = body.product || {};
        if (!input.name || !categoryById(input.category)) return res.status(400).json({ error: 'Chybí název nebo odvětví' });
        // Fotky jen jako odkaz (nahrané soubory jsou ve Storage), ne vložená data – dokument by přerostl limit Firestore.
        for (const k of ['photo', 'image']) if (input[k] && !/^https?:\/\//.test(input[k])) input[k] = '';
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
        const items = Array.isArray(body.items) ? body.items : [];
        const out = [];
        for (const input of items) {
          if (!input.id) continue;
          const prev = await getProduct(input.id);
          if (prev) out.push(merge(prev, { ...input, category: prev.category }));
        }
        if (out.length) await saveProducts(out);
        await audit(who, 'hromadná úprava', body.category || '', `${out.length} produktů`);
        await afterSave(out.map((p) => p.id));
        return res.json({ ok: true, saved: out.length });
      }
      case 'delete': {
        const prev = await getProduct(body.id);
        await deleteProduct(body.id);
        await audit(who, 'smazání', body.id, prev ? describe(prev) : '');
        return res.json({ ok: true });
      }
      case 'import':
      case 'importRows': {
        const cat = categoryById(body.category);
        if (!cat) return res.status(400).json({ error: 'Neznámé odvětví' });
        const rows = body.action === 'import' ? parseCsv(body.csv || '') : Array.isArray(body.rows) ? body.rows : [];
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
        const s = body.settings || {};
        const clean = {
          inflation: s.inflation && Number.isFinite(+s.inflation.yoy) ? { yoy: +s.inflation.yoy, label: String(s.inflation.label || '') } : null,
          affiliates: (s.affiliates || []).filter((a) => a && a.domain && a.template).map((a) => ({ domain: String(a.domain), template: String(a.template) })),
          sponsor: s.sponsor && s.sponsor.text ? { text: String(s.sponsor.text), url: String(s.sponsor.url || '') } : null,
          requireApproval: !!s.requireApproval,
          backgrounds: Object.fromEntries(
            Object.entries(s.backgrounds || {})
              .filter(([k, list]) => /^[a-z]{2,20}$/.test(k) && Array.isArray(list))
              .map(([k, list]) => [k, list.filter((b) => b && /^https?:\/\//.test(b.url)).slice(0, 12).map((b) => ({ url: String(b.url).slice(0, 600), credit: String(b.credit || '').slice(0, 160) }))])
              .filter(([, list]) => list.length)
          ),
          feeds: (s.feeds || []).filter((f) => f && f.url && f.category && f.competitor).map((f) => ({ url: String(f.url), category: String(f.category), competitor: String(f.competitor) })),
        };
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
        const list = Array.isArray(body.products) ? body.products : [];
        if (!list.length || !list.every((p) => p && p.id && p.category && p.name)) return res.status(400).json({ error: 'Soubor není záloha aplikace BuyWise' });
        await saveProducts(list);
        if (body.settings) await setDoc('meta/settings', body.settings, false);
        await audit(who, 'obnova ze zálohy', '', `${list.length} produktů`);
        return res.json({ ok: true, restored: list.length });
      }
      case 'testFeed': {
        const cat = categoryById(body.category);
        if (!cat || !body.url) return res.status(400).json({ error: 'Chybí odkaz nebo odvětví' });
        const items = parseFeed(await fetchFeed(body.url));
        const all = await loadAll();
        const matched = all
          .filter((p) => p.category === cat.id)
          .map((p) => ({ p, hit: matchFeedItem(p, items) }))
          .filter((x) => x.hit)
          .map((x) => ({ product: x.p.name, item: x.hit.name, price: x.hit.price }));
        return res.json({ ok: true, items: items.length, matched });
      }
      default:
        return res.status(400).json({ error: 'Neznámá akce' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

