// Přístup k Firestore (a Storage pro zálohy) přes firebase-admin. Soubory s podtržítkem Vercel nenasazuje jako endpointy.
let appPromise = null;

export function hasFirebase() {
  return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

async function getApp() {
  if (!hasFirebase()) return null;
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      if (getApps().length) return getApps()[0];
      return initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Vercel ukládá klíč na jeden řádek se znaky \n – převedeme zpět.
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
      });
    })();
  }
  return appPromise;
}

export async function getDb() {
  const app = await getApp();
  if (!app) return null;
  const { getFirestore } = await import('firebase-admin/firestore');
  return getFirestore(app);
}

export async function getAuth() {
  const app = await getApp();
  if (!app) return null;
  const { getAuth } = await import('firebase-admin/auth');
  return getAuth(app);
}

export async function getBucket() {
  const app = await getApp();
  if (!app || !process.env.FIREBASE_STORAGE_BUCKET) return null;
  const { getStorage } = await import('firebase-admin/storage');
  return getStorage(app).bucket();
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
const MAX_POINTS = 1100;

export function trimHistory(list = [], key = 'p', max = MAX_POINTS) {
  const byDay = new Map();
  for (const x of list) if (x && x.d && Number.isFinite(+x[key])) byDay.set(x.d, +x[key]);
  return [...byDay.entries()]
    .map(([d, v]) => ({ d, [key]: v }))
    .sort((a, b) => (a.d < b.d ? -1 : 1))
    .slice(-max);
}

// ---------- Produkty ----------
export async function loadAll({ includeInactive = false } = {}) {
  const db = await getDb();
  if (!db) return [];
  const snap = await db.collection('products').get();
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return includeInactive ? list : list.filter((p) => p.active !== false);
}

export async function getProduct(id) {
  const db = await getDb();
  const doc = await db.collection('products').doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

export function normalizeProduct(p) {
  const { id, ...data } = p;
  data.prices = trimHistory(data.prices);
  data.rankHistory = trimHistory(data.rankHistory || [], 'r', 400);
  data.competitors = (data.competitors || []).map((c) => ({ ...c, prices: trimHistory(c.prices) }));
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return { id, data };
}

export async function saveProducts(list) {
  const db = await getDb();
  for (let i = 0; i < list.length; i += 400) {
    const batch = db.batch();
    for (const p of list.slice(i, i + 400)) {
      const { id, data } = normalizeProduct(p);
      batch.set(db.collection('products').doc(id), data);
    }
    await batch.commit();
  }
}

export async function deleteProduct(id) {
  const db = await getDb();
  await db.collection('products').doc(id).delete();
}

// ---------- Meta: stav, nastavení, návrhy ke schválení ----------
export async function getDoc(path) {
  const db = await getDb();
  if (!db) return null;
  const doc = await db.doc(path).get();
  return doc.exists ? doc.data() : null;
}

export async function setDoc(path, data, merge = true) {
  const db = await getDb();
  await db.doc(path).set(data, { merge });
}

export async function deleteDoc(path) {
  const db = await getDb();
  await db.doc(path).delete();
}

export const getMeta = () => getDoc('meta/status');
export const setMeta = (d) => setDoc('meta/status', d);

export const DEFAULT_SETTINGS = {
  inflation: null, // { yoy: 2.4, label: 'září 2026' }
  affiliates: [], // [{ domain, template }]
  sponsor: null, // { text, url }
  requireApproval: false,
  feeds: [], // [{ category, competitor, url }]
  backgrounds: {}, // { auta: [{ url, credit }], home: [...] }
};

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await getDoc('meta/settings')) || {}) };
}

// ---------- Historie úprav ----------
export async function audit(who, action, target, summary = '') {
  try {
    const db = await getDb();
    await db.collection('audit').add({ at: new Date().toISOString(), who: who || 'neznámý', action, target: target || '', summary: String(summary).slice(0, 500) });
  } catch {}
}

export async function listAudit(limit = 60) {
  const db = await getDb();
  const snap = await db.collection('audit').orderBy('at', 'desc').limit(limit).get();
  return snap.docs.map((d) => d.data());
}

// ---------- Uživatelé, hlídače, push ----------
export async function getUser(uid) {
  return (await getDoc(`users/${uid}`)) || null;
}

export async function listCollection(name, where) {
  const db = await getDb();
  let q = db.collection(name);
  if (where) q = q.where(...where);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addDoc(collection, data) {
  const db = await getDb();
  const ref = await db.collection(collection).add(data);
  return ref.id;
}
