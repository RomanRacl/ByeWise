// Volání administrace na serveru (heslo nebo přihlášení Googlem s e-mailem v ADMIN_EMAILS).
import { S } from './core.js';

export const adminAuth = {
  get pw() {
    try {
      return sessionStorage.getItem('pm-admin-pw') || '';
    } catch {
      return '';
    }
  },
  set pw(v) {
    try {
      if (v) sessionStorage.setItem('pm-admin-pw', v);
      else sessionStorage.removeItem('pm-admin-pw');
    } catch {}
  },
  useGoogle: false,
};

export async function adminApi(action, payload = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (adminAuth.pw) headers['x-admin-password'] = adminAuth.pw;
  else if (adminAuth.useGoogle && S.user) headers.Authorization = `Bearer ${await S.user.token()}`;
  const r = await fetch('/api/admin', { method: 'POST', headers, body: JSON.stringify({ action, ...payload }) });
  let j;
  try {
    j = await r.json();
  } catch {
    throw new Error(`Server odpověděl ${r.status}. Administrace funguje po nasazení na Vercel (nebo přes npm run dev).`);
  }
  if (!r.ok) throw new Error(j.error || `Chyba ${r.status}`);
  return j;
}

export const adminLocal = false;
