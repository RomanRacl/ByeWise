// Volání administrace na serveru. Přihlášení: heslo se pošle jen jednou (akce „login“), server pak drží
// relaci v HttpOnly cookie, kterou JavaScript nevidí. Každý požadavek nese hlavičku x-bw-admin (ochrana proti CSRF).
// Alternativa: přihlášení Googlem s e-mailem v ADMIN_EMAILS.
import { S } from './core.js';

const FLAG = 'pm-admin-session'; // jen příznak „jsem přihlášený“, žádné tajemství
export const adminAuth = {
  get session() {
    try {
      return sessionStorage.getItem(FLAG) === '1';
    } catch {
      return false;
    }
  },
  set session(v) {
    try {
      if (v) sessionStorage.setItem(FLAG, '1');
      else sessionStorage.removeItem(FLAG);
    } catch {}
  },
  useGoogle: false,
};
// Starší verze ukládala heslo do sessionStorage – smazat.
try {
  sessionStorage.removeItem('pm-admin-pw');
} catch {}

export async function adminApi(action, payload = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-bw-admin': '1' };
  if (adminAuth.useGoogle && S.user && action !== 'login') headers.Authorization = `Bearer ${await S.user.token()}`;
  const r = await fetch('/api/admin', { method: 'POST', headers, credentials: 'same-origin', body: JSON.stringify({ action, ...payload }) });
  let j;
  try {
    j = await r.json();
  } catch {
    throw new Error(
      r.status === 404
        ? 'Server administrace nenalezen. Administrace funguje po nasazení na Vercel (nebo přes npm run dev).'
        : `Server spadl (chyba ${r.status}). Nejčastěji je špatně nastavená proměnná na Vercelu (FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL). Podrobnosti: Vercel → projekt → Logs.`
    );
  }
  if (r.status === 401 && j.login) {
    adminAuth.session = false;
    window.dispatchEvent(new Event('pm-admin-expired'));
  }
  if (!r.ok) throw Object.assign(new Error(j.error || `Chyba ${r.status}`), { config: j.config, firebase: j.firebase });
  return j;
}

export async function adminLogin(password) {
  await adminApi('login', { password });
  adminAuth.session = true;
}
export async function adminLogout() {
  adminAuth.session = false;
  adminAuth.useGoogle = false;
  await adminApi('logout').catch(() => {});
}

export const adminLocal = false;
