// Přístup k Firestore (a Storage pro zálohy) přes firebase-admin. Soubory s podtržítkem Vercel nenasazuje jako endpointy.
let appPromise = null;
// Knihovny Google uvnitř firebase-admin volají zastaralé url.parse() – varování je neškodné, ale v logu Vercelu
// svítí červeně jako chyba a zakrývá skutečné problémy.
process.noDeprecation = true;

import { createPrivateKey } from 'node:crypto';

// ---------- Přihlašovací údaje serveru k Firebase ----------
// Nejjednodušší a nejodolnější: proměnná FIREBASE_SERVICE_ACCOUNT = celý obsah staženého JSON souboru
// (Vercel umí víceřádkové hodnoty). Jinak tři samostatné proměnné FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL
// a FIREBASE_PRIVATE_KEY.
function serviceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (raw) {
    try {
      // Povolí i base64 (některé návody to tak radí).
      const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const j = JSON.parse(text);
      return { projectId: j.project_id || '', clientEmail: j.client_email || '', privateKey: j.private_key || '', source: 'FIREBASE_SERVICE_ACCOUNT' };
    } catch {
      return { projectId: '', clientEmail: '', privateKey: '', source: 'FIREBASE_SERVICE_ACCOUNT', invalidJson: true };
    }
  }
  return { projectId: process.env.FIREBASE_PROJECT_ID || '', clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '', privateKey: process.env.FIREBASE_PRIVATE_KEY || '', source: 'samostatné proměnné' };
}

// Opraví klíč poškozený kopírováním: uvozovky a čárka kolem, „\n“ jako text, mezery nebo zalomení místo
// konců řádků, Windows konce řádků. Z base64 obsahu mezi BEGIN a END sestaví čistý PEM (64 znaků na řádek).
export function normalizePem(raw) {
  let k = String(raw || '').trim().replace(/^["']|["'],?$/g, '').replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r/g, '');
  const m = /-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/.exec(k);
  if (!m) return k;
  const body = m[2].replace(/[^A-Za-z0-9+/=]/g, '');
  return `-----BEGIN ${m[1]}-----\n${body.match(/.{1,64}/g)?.join('\n') || ''}\n-----END ${m[1]}-----\n`;
}
const credentials = () => {
  const sa = serviceAccount();
  return { ...sa, privateKey: normalizePem(sa.privateKey), projectId: sa.projectId.trim(), clientEmail: sa.clientEmail.trim() };
};
export const projectId = () => credentials().projectId;

export function hasFirebase() {
  const c = serviceAccount();
  return !!(c.projectId && c.clientEmail && c.privateKey);
}

async function getApp() {
  if (!hasFirebase()) return null;
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      if (getApps().length) return getApps()[0];
      return initializeApp({
        credential: cert((({ projectId, clientEmail, privateKey }) => ({ projectId, clientEmail, privateKey }))(credentials())),
        storageBucket: (process.env.FIREBASE_STORAGE_BUCKET || '').replace(/^gs:\/\//, '').replace(/\/$/, '') || undefined,
      });
    })();
    // Chybné nastavení se nemá „zaseknout“ v paměti instance – další požadavek to zkusí znovu.
    appPromise.catch(() => (appPromise = null));
  }
  return appPromise;
}

// ---------- Diagnostika nastavení (bez prozrazení tajných hodnot) ----------
export function checkConfig() {
  const env = process.env;
  const sa = serviceAccount();
  const c = credentials();
  const key = sa.privateKey ? c.privateKey : '';
  const keyProblems = [];
  if (key) {
    if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key)) keyProblems.push('chybí začátek „-----BEGIN PRIVATE KEY-----“');
    if (!/-----END [A-Z ]*PRIVATE KEY-----/.test(key)) keyProblems.push('chybí konec „-----END PRIVATE KEY-----“');
    if (key.length < 1500) keyProblems.push(`je moc krátký (${key.length} znaků, skutečný klíč má kolem 1700) – nejspíš se nezkopíroval celý`);
    if (!keyProblems.length) {
      try {
        createPrivateKey(key);
      } catch {
        keyProblems.push('obsah klíče je poškozený (část chybí nebo je přepsaná) – zkopíruj ho znovu, nejlépe jako celý JSON do FIREBASE_SERVICE_ACCOUNT');
      }
    }
  }
  const email = c.clientEmail;
  const viaJson = sa.source === 'FIREBASE_SERVICE_ACCOUNT';
  const firebase = viaJson
    ? {
        FIREBASE_SERVICE_ACCOUNT: sa.invalidJson
          ? 'není platný JSON – vlož celý obsah staženého souboru včetně složených závorek { }'
          : !sa.projectId || !sa.clientEmail || !sa.privateKey
          ? 'v JSON chybí project_id, client_email nebo private_key – je to klíč z Service accounts?'
          : keyProblems.length
          ? 'private_key: ' + keyProblems.join('; ')
          : 'ok',
      }
    : {
        FIREBASE_SERVICE_ACCOUNT: 'nevyplněno (místo něj se používají 3 proměnné níže)',
        FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID ? 'ok' : 'chybí',
        FIREBASE_CLIENT_EMAIL: !email ? 'chybí' : /@.+\.iam\.gserviceaccount\.com$/.test(email) ? 'ok' : 'nevypadá jako e-mail servisního účtu (…@….iam.gserviceaccount.com)',
        FIREBASE_PRIVATE_KEY: !key ? 'chybí' : keyProblems.length ? keyProblems.join('; ') : 'ok',
      };
  return {
    ...firebase,
    FIREBASE_STORAGE_BUCKET: env.FIREBASE_STORAGE_BUCKET ? (/^gs:\/\//.test(env.FIREBASE_STORAGE_BUCKET) ? 'ok (gs:// se ignoruje)' : 'ok') : 'nevyplněno (zálohy a nahrávání fotek vypnuté)',
    ADMIN_PASSWORD: !env.ADMIN_PASSWORD ? 'chybí' : env.ADMIN_PASSWORD.length < 12 ? 'nastaveno, ale slabé (méně než 12 znaků)' : 'ok',
    CRON_SECRET: !env.CRON_SECRET ? 'chybí' : env.CRON_SECRET.length < 16 ? 'moc krátký (min. 16 znaků) – denní aktualizace nepoběží' : 'ok',
    FIREBASE_WEB_API_KEY: env.FIREBASE_WEB_API_KEY ? 'ok' : 'nevyplněno (přihlašování uživatelů vypnuté)',
    SITE_URL: env.SITE_URL ? (/^https:\/\/[^/]+$/.test(env.SITE_URL.replace(/\/$/, '')) ? 'ok' : 'má být jen https://domena bez cesty') : 'nevyplněno (doporučeno)',
  };
}

// Srozumitelné vysvětlení chyby Firebase pro administrátora.
export function explainFirebaseError(e) {
  const m = String(e?.message || e);
  if (/parse private key|PEM|DECODER routines|asn1|private_key/i.test(m)) return 'Soukromý klíč Firebase je poškozený (nejčastěji neúplné zkopírování). Nejjistější oprava: na Vercelu vytvoř proměnnou FIREBASE_SERVICE_ACCOUNT a vlož do ní celý obsah staženého JSON souboru (Ctrl+A, Ctrl+C), pak Redeploy.';
  if (/Cannot find (module|package) ['"]?firebase-admin/i.test(m)) return 'Na Vercelu chybí knihovna firebase-admin. Zkontroluj, že je v repozitáři package.json, a nasaď znovu.';
  if (/database \(default\) does not exist|NOT_FOUND.*database|5 NOT_FOUND/i.test(m)) return 'Ve Firebase ještě není vytvořená databáze Firestore (Firestore Database → Create database).';
  if (/Cloud Firestore API has not been used|SERVICE_DISABLED|firestore\.googleapis\.com.*disabled/i.test(m)) return 'Firestore API není v projektu zapnuté – vytvoř databázi Firestore v konzoli Firebase a za pár minut to zkus znovu.';
  if (/invalid_grant|Invalid JWT|account not found|unauthorized_client|UNAUTHENTICATED/i.test(m)) return 'Firebase nepřijal přihlašovací údaje serveru: FIREBASE_CLIENT_EMAIL a FIREBASE_PRIVATE_KEY musí být ze stejného (nesmazaného) klíče a FIREBASE_PROJECT_ID musí sedět s „project_id“.';
  if (/PERMISSION_DENIED|7 PERMISSION/i.test(m)) return 'Servisní účet nemá oprávnění k Firestore. Použij klíč z Project settings → Service accounts (firebase-adminsdk) a zkontroluj FIREBASE_PROJECT_ID.';
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|deadline|timeout/i.test(m)) return 'Spojení s Firebase vypršelo. Zkus to za chvíli znovu.';
  return 'Nepodařilo se připojit k Firebase: ' + m.slice(0, 160);
}

export async function healthCheck() {
  const config = checkConfig();
  if (!hasFirebase()) return { ok: false, config, firestore: 'není nastaveno (chybí proměnné)' };
  try {
    const db = await getDb();
    await Promise.race([db.doc('meta/status').get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
    return { ok: true, config, firestore: 'připojeno' };
  } catch (e) {
    return { ok: false, config, firestore: explainFirebaseError(e) };
  }
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
