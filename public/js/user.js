// Uživatel: oblíbené, seznam přání, porovnání, hlídače, portfolio, přihlášení (Google i e-mail + heslo), push notifikace.
import { S, store, productById, sum, money, esc, toast, productLink, insight, ICON, link } from './core.js';
import { t } from './i18n.js';
import { action, openDrawer, closeDrawer } from './ui.js';

const emit = () => window.dispatchEvent(new Event('pm-user'));
const dynImport = (u) => import(u);
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

// ---------- Volání serveru ----------
export async function apiUser(action, body = {}, needAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (needAuth) {
    if (!S.user) throw new Error(t('Přihlas se'));
    headers.Authorization = `Bearer ${await S.user.token()}`;
  }
  const r = await fetch('/api/user', { method: 'POST', headers, body: JSON.stringify({ action, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${r.status}`);
  return j;
}

// ---------- Oblíbené ----------
export const favs = {
  list: () => (S.profile ? S.profile.favorites || [] : store.get('favorites', [])),
  has: (id) => favs.list().includes(id),
  async toggle(id) {
    const cur = favs.list();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    store.set('favorites', next);
    if (S.profile) {
      S.profile.favorites = next;
      apiUser('saveFavorites', { favorites: next }).catch((e) => toast(esc(e.message), 'err'));
    }
    emit();
    return next.includes(id);
  },
};

// ---------- Seznam přání ----------
// Položka: { id, target (cílová cena, volitelná), addedPrice, addedAt, note, notified }
const cleanWish = (w) => ({ id: w.id, target: w.target > 0 ? +w.target : null, addedPrice: +w.addedPrice || null, addedAt: w.addedAt || new Date().toISOString(), note: String(w.note || '').slice(0, 80), notified: w.notified || null });
export const wish = {
  list: () => (S.profile ? S.profile.wishlist || [] : store.get('wishlist', [])).filter((w) => w && w.id),
  get: (id) => wish.list().find((w) => w.id === id) || null,
  has: (id) => !!wish.get(id),
  async save(list) {
    const next = list.map(cleanWish).slice(0, 100);
    store.set('wishlist', next);
    if (S.profile) {
      S.profile.wishlist = next;
      apiUser('saveWishlist', { wishlist: next }).catch((e) => toast(esc(e.message), 'err'));
    }
    emit();
    return next;
  },
  async toggle(id) {
    const cur = wish.list();
    if (cur.some((w) => w.id === id)) {
      await wish.save(cur.filter((w) => w.id !== id));
      return false;
    }
    const p = productById(id);
    await wish.save([...cur, { id, addedPrice: p ? sum(p).price : null, addedAt: new Date().toISOString() }]);
    return true;
  },
  async update(id, patch) {
    return wish.save(wish.list().map((w) => (w.id === id ? { ...w, ...patch, notified: patch.target !== undefined ? null : w.notified } : w)));
  },
};
export const wishButton = (id, cls = 'icon-btn solid') => {
  const on = wish.has(id);
  const l = on ? t('Odebrat ze seznamu přání') : t('Přidat do seznamu přání');
  return `<button type="button" class="${cls} wish-btn ${on ? 'on' : ''}" data-action="wish" data-id="${esc(id)}" aria-pressed="${on}" aria-label="${esc(l)}" data-tip="${esc(l)}">${ICON.heart}</button>`;
};

// Upozornění v prohlížeči: cílová cena dosažena, nebo produkt ze seznamu přání má teď skóre „Kup teď“.
export function checkWishes() {
  const list = wish.list();
  let changed = false;
  for (const w of list) {
    const p = productById(w.id);
    if (!p) continue;
    const price = sum(p).price;
    const sc = insight(p).score;
    const hit = w.target && price != null && price <= w.target ? 'target' : sc?.tone === 'buy' ? 'score' : null;
    if (!hit || w.notified === hit + ':' + price) continue;
    w.notified = hit + ':' + price;
    changed = true;
    const msg = hit === 'target' ? t('{name} je teď za {price}, pod tvou cílovou cenou.', { name: p.name, price: money(price, p.unit) }) : t('{name}: teď je dobrá chvíle koupit (skóre {n}).', { name: p.name, n: sc.score });
    toast(`${esc(msg)} <a href="${productLink(p.id)}">${t('Zobrazit')}</a>`, 'ok', 9000);
  }
  if (changed) wish.save(list);
}

// ---------- Porovnání ----------
export const cmp = {
  list: () => store.get('compare', []).filter((id) => productById(id)),
  has: (id) => cmp.list().includes(id),
  toggle(id) {
    const cur = cmp.list();
    let next;
    if (cur.includes(id)) next = cur.filter((x) => x !== id);
    else if (cur.length >= 4) {
      toast(t('Porovnat jde nejvýš 4 produkty najednou.'), 'err');
      return false;
    } else next = [...cur, id];
    store.set('compare', next);
    emit();
    return next.includes(id);
  },
  set(ids) {
    store.set('compare', ids.slice(0, 4));
    emit();
  },
};

// ---------- Hlídače ----------
// Místní hlídače (v tomto prohlížeči) fungují vždy; serverové posílají e-mail / push i při zavřené stránce.
export const localAlerts = {
  list: () => store.get('alerts', []),
  add(a) {
    const list = localAlerts.list();
    list.push({ ...a, id: 'l' + Date.now().toString(36), createdAt: new Date().toISOString(), active: true });
    store.set('alerts', list);
    emit();
  },
  remove(id) {
    store.set('alerts', localAlerts.list().filter((a) => a.id !== id));
    emit();
  },
};
export const pushAlerts = {
  list: () => store.get('pushAlerts', []),
  add(a) {
    store.set('pushAlerts', [...pushAlerts.list(), a]);
    emit();
  },
  async remove(id) {
    const a = pushAlerts.list().find((x) => x.id === id);
    if (a) await apiUser('deleteAlertToken', { id: a.id, token: a.token }, false).catch(() => {});
    store.set('pushAlerts', pushAlerts.list().filter((x) => x.id !== id));
    emit();
  },
};
export const serverAlerts = () => S.profile?.alerts || [];

export const alertTarget = (a) => (a.type === 'drop' ? a.basePrice * (1 - a.value / 100) : a.value);

export function describeAlert(a) {
  const p = productById(a.productId);
  const unit = p?.unit || 'Kč';
  return a.type === 'drop' ? t('pokles o {v} %', { v: a.value }) + ` (${t('pod')} ${money(alertTarget(a), unit)})` : `${t('pod')} ${money(a.value, unit)}`;
}

export function checkLocalAlerts() {
  const list = localAlerts.list();
  let changed = false;
  for (const a of list) {
    if (!a.active) continue;
    const p = productById(a.productId);
    if (!p) continue;
    const s = sum(p);
    if (s.price != null && s.price <= alertTarget(a)) {
      a.active = false;
      a.triggeredAt = new Date().toISOString();
      a.triggeredPrice = s.price;
      changed = true;
      const msg = t('Hlídač ceny: {name} je teď za {price}.', { name: p.name, price: money(s.price, p.unit) });
      toast(`${esc(msg)} <a href="${productLink(p.id)}">${t('Zobrazit')}</a>`, 'ok', 9000);
      try {
        if ('Notification' in window && Notification.permission === 'granted') new Notification('BuyWise', { body: msg, icon: '/icons/icon-192.png' });
      } catch {}
    }
  }
  if (changed) store.set('alerts', list);
}

// ---------- Portfolio ----------
export const portfolio = {
  list: () => (S.profile ? S.profile.portfolio || [] : store.get('portfolio', [])),
  async save(list) {
    store.set('portfolio', list);
    if (S.profile) {
      try {
        const r = await apiUser('savePortfolio', { portfolio: list });
        S.profile.portfolio = r.portfolio;
      } catch (e) {
        toast(esc(e.message), 'err');
      }
    }
    emit();
  },
};

// ---------- Přihlášení ----------
let fbAuth = null;
let fbMod = null;

export async function initAuth() {
  if (S.standalone || !S.config?.firebase) return;
  try {
    const [{ initializeApp }, auth] = await Promise.all([dynImport(FB + 'firebase-app.js'), dynImport(FB + 'firebase-auth.js')]);
    fbMod = auth;
    const app = initializeApp(S.config.firebase);
    fbAuth = auth.getAuth(app);
    auth.getRedirectResult(fbAuth).catch(() => {});
    auth.onAuthStateChanged(fbAuth, async (u) => {
      if (!u) {
        S.user = null;
        S.profile = null;
        emit();
        return;
      }
      S.user = { uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL, verified: u.emailVerified, token: () => u.getIdToken() };
      try {
        const me = await apiUser('me');
        S.profile = { ...me.user, alerts: me.alerts, features: me.features };
        // Sloučí místní oblíbené a portfolio s účtem.
        const localFav = store.get('favorites', []);
        const merged = [...new Set([...(S.profile.favorites || []), ...localFav])];
        if (merged.length !== (S.profile.favorites || []).length) {
          S.profile.favorites = merged;
          apiUser('saveFavorites', { favorites: merged }).catch(() => {});
        }
        const localWish = store.get('wishlist', []);
        const have = new Set((S.profile.wishlist || []).map((w) => w.id));
        const extra = localWish.filter((w) => w && w.id && !have.has(w.id));
        if (extra.length) {
          S.profile.wishlist = [...(S.profile.wishlist || []), ...extra];
          apiUser('saveWishlist', { wishlist: S.profile.wishlist }).catch(() => {});
        }
        const localPf = store.get('portfolio', []);
        if (localPf.length && !(S.profile.portfolio || []).length) {
          const r = await apiUser('savePortfolio', { portfolio: localPf });
          S.profile.portfolio = r.portfolio;
        }
      } catch (e) {
        toast(esc(t('Účet se nepodařilo načíst: {e}', { e: e.message })), 'err');
      }
      emit();
    });
  } catch {
    // Firebase SDK se nenačetl (offline) – aplikace funguje dál bez účtu.
  }
}

export const authAvailable = () => !!fbAuth;

export async function login() {
  if (!fbAuth) return toast(t('Přihlášení není na tomto webu nastavené.'), 'err');
  const provider = new fbMod.GoogleAuthProvider();
  try {
    await fbMod.signInWithPopup(fbAuth, provider);
    closeDrawer();
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') await fbMod.signInWithRedirect(fbAuth, provider);
    else if (e.code !== 'auth/popup-closed-by-user') toast(esc(authError(e)), 'err');
  }
}

// ---------- Přihlášení e-mailem a heslem ----------
const AUTH_ERR = {
  'auth/invalid-email': 'Neplatná e-mailová adresa.',
  'auth/missing-password': 'Zadej heslo.',
  'auth/weak-password': 'Heslo musí mít aspoň 6 znaků.',
  'auth/email-already-in-use': 'Účet s tímto e-mailem už existuje. Přihlas se, nebo si obnov heslo.',
  'auth/invalid-credential': 'Špatný e-mail nebo heslo.',
  'auth/wrong-password': 'Špatný e-mail nebo heslo.',
  'auth/user-not-found': 'Účet s tímto e-mailem neexistuje.',
  'auth/too-many-requests': 'Příliš mnoho pokusů. Zkus to za chvíli.',
  'auth/operation-not-allowed': 'Přihlášení e-mailem není ve Firebase zapnuté (Authentication → Sign-in method → Email/Password).',
  'auth/network-request-failed': 'Nepodařilo se spojit se serverem. Zkontroluj připojení.',
};
export const authError = (e) => t(AUTH_ERR[e?.code] || e?.message || 'Přihlášení se nepovedlo.');

export async function loginEmail(email, password) {
  if (!fbAuth) throw new Error(t('Přihlášení není na tomto webu nastavené.'));
  await fbMod.signInWithEmailAndPassword(fbAuth, email.trim(), password);
}
export async function registerEmail(email, password, name) {
  if (!fbAuth) throw new Error(t('Přihlášení není na tomto webu nastavené.'));
  const cred = await fbMod.createUserWithEmailAndPassword(fbAuth, email.trim(), password);
  if (name) await fbMod.updateProfile(cred.user, { displayName: name.trim().slice(0, 60) }).catch(() => {});
  // Ověřený e-mail je potřeba pro e-mailová upozornění a týdenní souhrn.
  await fbMod.sendEmailVerification(cred.user).catch(() => {});
}
export async function resetPassword(email) {
  if (!fbAuth) throw new Error(t('Přihlášení není na tomto webu nastavené.'));
  await fbMod.sendPasswordResetEmail(fbAuth, email.trim());
}

const GOOGLE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 000 9.2z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 003.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z"/></svg>';

function loginHtml(mode) {
  const reg = mode === 'register';
  const forgot = mode === 'reset';
  return `<div class="login">
    <span class="seg wide-seg" role="tablist">
      <button type="button" role="tab" data-action="login-mode" data-v="login" aria-selected="${mode === 'login'}" aria-pressed="${mode === 'login'}">${t('Přihlásit se')}</button>
      <button type="button" role="tab" data-action="login-mode" data-v="register" aria-selected="${reg}" aria-pressed="${reg}">${t('Nový účet')}</button>
    </span>
    <form id="login-form" class="login-form" novalidate>
      ${reg ? `<label class="field">${t('Jméno (nepovinné)')}<input name="name" autocomplete="name"></label>` : ''}
      <label class="field">${t('E-mail')}<input name="email" type="email" autocomplete="email" required autofocus></label>
      ${forgot ? '' : `<label class="field">${t('Heslo')}<input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="6" required></label>`}
      <button class="btn wide" type="submit">${forgot ? t('Poslat odkaz pro nové heslo') : reg ? t('Vytvořit účet') : t('Přihlásit se')}</button>
      <p class="msg" id="login-msg" aria-live="polite"></p>
      ${mode === 'login' ? `<button type="button" class="btn link" data-action="login-mode" data-v="reset">${t('Zapomenuté heslo?')}</button>` : forgot ? `<button type="button" class="btn link" data-action="login-mode" data-v="login">${t('Zpět na přihlášení')}</button>` : `<p class="note">${t('Pošleme ti e-mail k ověření adresy. Ověřený e-mail je potřeba pro upozornění a týdenní souhrn.')}</p>`}
    </form>
    <div class="or"><span>${t('nebo')}</span></div>
    <button type="button" class="btn alt wide google" data-action="login-google">${GOOGLE_ICON}${t('Pokračovat přes Google')}</button>
    <p class="note">${t('Účet synchronizuje oblíbené, seznam přání, portfolio a hlídače mezi zařízeními.')}</p>
  </div>`;
}

export function openLogin(mode = 'login') {
  if (!fbAuth) return toast(t('Přihlášení není na tomto webu nastavené.'), 'err');
  const body = openDrawer({ id: 'login', side: 'right', title: t('Účet BuyWise'), html: loginHtml(mode), label: t('Zavřít') });
  const form = body.querySelector('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = body.querySelector('#login-msg');
    const f = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    msg.className = 'msg';
    msg.textContent = '';
    try {
      if (mode === 'reset') {
        await resetPassword(f.email);
        msg.className = 'msg ok';
        msg.textContent = t('Odkaz pro nastavení nového hesla jsme poslali na {e}.', { e: f.email });
      } else {
        if (mode === 'register') await registerEmail(f.email, f.password, f.name);
        else await loginEmail(f.email, f.password);
        closeDrawer();
        toast(mode === 'register' ? t('Účet vytvořen. Zkontroluj e-mail a potvrď adresu.') : t('Přihlášeno.'), 'ok');
      }
    } catch (err) {
      msg.className = 'msg err';
      msg.textContent = authError(err);
    } finally {
      btn.disabled = false;
    }
  });
}
action('open-login', () => openLogin());
action('login', () => openLogin());
action('login-google', () => login());
action('login-mode', (el) => openLogin(el.dataset.v));
action('verify-email', async () => {
  try {
    await fbMod.sendEmailVerification(fbAuth.currentUser);
    toast(t('Ověřovací e-mail odeslán.'), 'ok');
  } catch (e) {
    toast(esc(authError(e)), 'err');
  }
});

export async function logout() {
  if (fbAuth) await fbMod.signOut(fbAuth);
}

export async function reloadProfile() {
  if (!S.user) return;
  const me = await apiUser('me');
  S.profile = { ...me.user, alerts: me.alerts, features: me.features };
  emit();
}

// ---------- Push notifikace ----------
export const pushSupported = () => !S.standalone && 'serviceWorker' in navigator && 'PushManager' in window && !!S.config?.vapidPublicKey;

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function pushSubscription() {
  if (!pushSupported()) throw new Error(t('Tento prohlížeč push notifikace nepodporuje.'));
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(t('Notifikace nejsou povolené.'));
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(S.config.vapidPublicKey) });
  return sub.toJSON();
}

// ---------- Globální akce: hvězdička a porovnání kdekoli v aplikaci ----------
function syncButtons(name, id, on, labels) {
  document.querySelectorAll(`[data-action="${name}"][data-id="${CSS.escape(id)}"]`).forEach((b) => {
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    if (labels) {
      b.setAttribute('aria-label', on ? labels[0] : labels[1]);
      if (b.dataset.tip) b.dataset.tip = on ? labels[0] : labels[1];
    }
  });
}
action('fav', async (el) => {
  const on = await favs.toggle(el.dataset.id);
  syncButtons('fav', el.dataset.id, on, [t('Odebrat z oblíbených'), t('Přidat do oblíbených')]);
  if (!on && el.dataset.remove) el.closest(el.dataset.remove)?.remove();
});
action('wish', async (el) => {
  const on = await wish.toggle(el.dataset.id);
  syncButtons('wish', el.dataset.id, on, [t('Odebrat ze seznamu přání'), t('Přidat do seznamu přání')]);
  toast(on ? `${t('Přidáno do seznamu přání.')} <a href="${link('/prani')}">${t('Otevřít seznam')}</a>` : t('Odebráno ze seznamu přání.'), on ? 'ok' : 'info', 3500);
  if (!on && el.dataset.remove) el.closest(el.dataset.remove)?.remove();
});
action('cmp', (el) => {
  const on = cmp.toggle(el.dataset.id);
  syncButtons('cmp', el.dataset.id, on, [t('V porovnání'), t('Přidat do porovnání')]);
});
