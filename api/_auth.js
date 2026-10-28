// Ověření uživatele (Firebase přihlášení) a administrátora (relace po zadání hesla, nebo Google účet z ADMIN_EMAILS).
import { getAuth } from './_db.js';
import { safeEqual, verifySession, readCookie, SESSION_COOKIE } from './_security.js';

export async function verifyUser(req) {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) return null;
  try {
    const auth = await getAuth();
    if (!auth) return null;
    const tok = await auth.verifyIdToken(h.slice(7));
    return { uid: tok.uid, email: tok.email || '', emailVerified: !!tok.email_verified, name: tok.name || '' };
  } catch {
    return null;
  }
}

// Heslo se kontroluje jen při přihlášení (akce „login“, s omezením počtu pokusů).
export function passwordOk(password) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected || !password) return false;
  return safeEqual(password, expected);
}
export const weakAdminPassword = () => String(process.env.ADMIN_PASSWORD || '').length < 12;

export const adminEmails = () =>
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

// Vrací { who } pro povolený přístup, jinak null.
// Relace v HttpOnly cookie platí jen s hlavičkou x-bw-admin (ochrana proti CSRF: cizí web ji poslat nemůže).
export async function verifyAdmin(req) {
  if (req.headers['x-bw-admin'] === '1') {
    const sess = verifySession(readCookie(req, SESSION_COOKIE));
    if (sess) return { who: sess.who || 'heslo administrátora' };
  }
  const u = await verifyUser(req);
  if (u && u.emailVerified && adminEmails().includes(u.email.toLowerCase())) return { who: u.email };
  return null;
}
