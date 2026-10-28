// POST /api/user – uživatelská data: oblíbené, seznam přání, portfolio, týdenní souhrn, hlídače cen.
// Přihlášení přes Google (Authorization: Bearer <Firebase ID token>). Push hlídače fungují i bez přihlášení.
import { randomBytes } from 'node:crypto';
import { getDb, getUser, setDoc, listCollection, addDoc, getProduct } from './_db.js';
import { verifyUser } from './_auth.js';
import { emailEnabled, pushEnabled } from './_notify.js';

const MAX_LIST = 200;
const MAX_ALERTS = 50;

function cleanAlert(b) {
  const type = b.type === 'drop' ? 'drop' : 'below';
  const value = +b.value;
  if (!b.productId || !Number.isFinite(value) || value <= 0) throw new Error('Neplatný hlídač');
  if (type === 'drop' && value >= 100) throw new Error('Pokles musí být menší než 100 %');
  return { productId: String(b.productId).slice(0, 120), type, value, basePrice: +b.basePrice || null };
}

function validSub(s) {
  return s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') && s.keys && s.keys.p256dh && s.keys.auth ? { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } } : null;
}

const publicAlert = (a) => ({ id: a.id, productId: a.productId, type: a.type, value: a.value, basePrice: a.basePrice, channels: a.channels, active: a.active, createdAt: a.createdAt, triggeredAt: a.triggeredAt || null, triggeredPrice: a.triggeredPrice || null, hasPush: !!a.pushSub });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Použij POST' });
  const db = await getDb();
  if (!db) return res.status(400).json({ error: 'Databáze není nastavená' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  try {
    // ---------- Bez přihlášení: push hlídač pro toto zařízení ----------
    if (body.action === 'pushAlert') {
      if (!pushEnabled()) return res.status(400).json({ error: 'Push notifikace nejsou na serveru nastavené' });
      const sub = validSub(body.subscription);
      if (!sub) return res.status(400).json({ error: 'Chybí odběr notifikací' });
      const a = cleanAlert(body);
      if (!(await getProduct(a.productId))) return res.status(404).json({ error: 'Produkt nenalezen' });
      const mine = await listCollection('alerts', ['pushSub.endpoint', '==', sub.endpoint]);
      if (mine.filter((x) => x.active).length >= 20) return res.status(400).json({ error: 'Na tomto zařízení je už 20 aktivních hlídačů' });
      const token = randomBytes(16).toString('hex');
      const id = await addDoc('alerts', { ...a, channels: ['push'], pushSub: sub, token, active: true, createdAt: new Date().toISOString() });
      return res.json({ ok: true, id, token });
    }
    if (body.action === 'deleteAlertToken') {
      const ref = db.collection('alerts').doc(String(body.id || ''));
      const doc = await ref.get();
      if (!doc.exists || doc.data().token !== body.token) return res.status(404).json({ error: 'Hlídač nenalezen' });
      await ref.delete();
      return res.json({ ok: true });
    }

    // ---------- S přihlášením ----------
    const u = await verifyUser(req);
    if (!u) return res.status(401).json({ error: 'Přihlas se' });
    const path = `users/${u.uid}`;

    switch (body.action) {
      case 'me': {
        let user = await getUser(u.uid);
        if (!user) {
          user = { email: u.email, name: u.name, favorites: [], portfolio: [], wishlist: [], weeklyDigest: false, createdAt: new Date().toISOString() };
          await setDoc(path, user);
        } else if (user.email !== u.email) await setDoc(path, { email: u.email });
        const alerts = await listCollection('alerts', ['uid', '==', u.uid]);
        return res.json({ ok: true, user: { ...user, email: u.email }, alerts: alerts.map(publicAlert), features: { email: emailEnabled(), push: pushEnabled() } });
      }
      case 'saveFavorites': {
        const favorites = [...new Set((body.favorites || []).map(String))].slice(0, MAX_LIST);
        await setDoc(path, { favorites });
        return res.json({ ok: true, favorites });
      }
      case 'savePortfolio': {
        const portfolio = (body.portfolio || [])
          .filter((h) => h && h.productId && +h.qty > 0 && +h.buyPrice > 0)
          .slice(0, MAX_LIST)
          .map((h) => ({ id: String(h.id || randomBytes(6).toString('hex')), productId: String(h.productId), qty: +h.qty, buyPrice: +h.buyPrice, date: String(h.date || '').slice(0, 10), note: String(h.note || '').slice(0, 80) }));
        await setDoc(path, { portfolio });
        return res.json({ ok: true, portfolio });
      }
      case 'saveWishlist': {
        const wishlist = (body.wishlist || [])
          .filter((w) => w && w.id)
          .slice(0, 100)
          .map((w) => ({ id: String(w.id).slice(0, 120), target: +w.target > 0 ? +w.target : null, addedPrice: +w.addedPrice || null, addedAt: String(w.addedAt || new Date().toISOString()).slice(0, 30), note: String(w.note || '').slice(0, 80), notified: w.notified ? String(w.notified).slice(0, 40) : null }));
        // wishAlerts: denní aktualizace pošle e-mail, když cena klesne pod cílovou (jen ověřený e-mail).
        await setDoc(path, { wishlist, wishAlerts: wishlist.some((w) => w.target) && !!u.emailVerified, email: u.email });
        return res.json({ ok: true, wishlist });
      }
      case 'setDigest': {
        if (body.on && !emailEnabled()) return res.status(400).json({ error: 'E-maily nejsou na serveru nastavené' });
        if (body.on && !u.emailVerified) return res.status(400).json({ error: 'E-mail účtu není ověřený' });
        await setDoc(path, { weeklyDigest: !!body.on, email: u.email });
        return res.json({ ok: true, weeklyDigest: !!body.on });
      }
      case 'addAlert': {
        const a = cleanAlert(body);
        if (!(await getProduct(a.productId))) return res.status(404).json({ error: 'Produkt nenalezen' });
        const channels = (body.channels || []).filter((c) => c === 'email' || c === 'push');
        const sub = validSub(body.subscription);
        if (channels.includes('email') && (!emailEnabled() || !u.emailVerified)) return res.status(400).json({ error: 'E-mailová upozornění nejsou dostupná' });
        if (channels.includes('push') && (!pushEnabled() || !sub)) return res.status(400).json({ error: 'Push upozornění nejsou dostupná' });
        if (!channels.length) return res.status(400).json({ error: 'Vyber, jak tě máme upozornit' });
        const mine = await listCollection('alerts', ['uid', '==', u.uid]);
        if (mine.filter((x) => x.active).length >= MAX_ALERTS) return res.status(400).json({ error: `Maximum je ${MAX_ALERTS} aktivních hlídačů` });
        const doc = { ...a, uid: u.uid, email: channels.includes('email') ? u.email : null, channels, pushSub: channels.includes('push') ? sub : null, active: true, createdAt: new Date().toISOString() };
        const id = await addDoc('alerts', doc);
        return res.json({ ok: true, alert: publicAlert({ id, ...doc }) });
      }
      case 'deleteAlert': {
        const ref = db.collection('alerts').doc(String(body.id || ''));
        const doc = await ref.get();
        if (!doc.exists || doc.data().uid !== u.uid) return res.status(404).json({ error: 'Hlídač nenalezen' });
        await ref.delete();
        return res.json({ ok: true });
      }
      default:
        return res.status(400).json({ error: 'Neznámá akce' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
