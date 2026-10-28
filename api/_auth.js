// Ověření uživatele (Firebase přihlášení Googlem) a administrátora (heslo nebo e-mail v ADMIN_EMAILS).
import { timingSafeEqual } from 'node:crypto';
import { getAuth } from './_db.js';

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

function passwordOk(req) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const got = String(req.headers['x-admin-password'] || '');
  if (!expected || !got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export const adminEmails = () =>
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

// Vrací { who } pro povolený přístup, jinak null.
export async function verifyAdmin(req) {
  if (passwordOk(req)) return { who: 'heslo administrátora' };
  const u = await verifyUser(req);
  if (u && u.emailVerified && adminEmails().includes(u.email.toLowerCase())) return { who: u.email };
  return null;
}
