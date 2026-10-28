// UI základ: jeden click handler (registr akcí), tooltipy, drawer, akordeon, oznámení pro čtečky, přechody.

// ---------- Akce: jediný posluchač kliknutí pro celou aplikaci ----------
// Prvky mají data-action="název"; obsluha dostane (element, událost).
// Globální akce platí vždy, akce pohledu se při změně stránky vymažou.
const globalActions = new Map();
let viewActions = new Map();

export function action(name, fn) {
  globalActions.set(name, fn);
}
export function actions(map) {
  for (const [k, fn] of Object.entries(map)) viewActions.set(k, fn);
}
export function resetActions() {
  viewActions = new Map();
}

/**
 * Nainstaluje jediný posluchač kliknutí. onLink(href, anchor, event) obslouží interní odkazy (router).
 * onOutside(event) se zavolá vždy – pro zavírání rozbalených prvků.
 */
export function installClickHandler({ onLink, onOutside }) {
  document.addEventListener('click', (e) => {
    onOutside?.(e);
    const modified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
    let el = e.target.closest('[data-action]');
    const anchor = e.target.closest('a[href]');
    // Odkaz vnořený v prvku s akcí (např. název produktu v řádku) má přednost.
    if (el && anchor && anchor !== el && el.contains(anchor)) el = null;
    if (el && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
      const fn = viewActions.get(el.dataset.action) || globalActions.get(el.dataset.action);
      if (fn) {
        // U odkazů s akcí nechá Ctrl/Cmd+klik otevřít novou kartu.
        if (el.tagName === 'A' && modified) return;
        if (el.tagName === 'A' || el.tagName === 'SUMMARY' || el.type === 'submit') e.preventDefault();
        fn(el, e);
        return;
      }
    }
    if (e.defaultPrevented || modified) return;
    if (anchor && !anchor.target && !anchor.hasAttribute('download')) onLink?.(anchor.getAttribute('href'), anchor, e);
  });
}

// ---------- Oznámení pro čtečky obrazovky ----------
export function announce(text) {
  let el = document.getElementById('announcer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'announcer';
    el.className = 'sr-only';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = '';
  setTimeout(() => (el.textContent = text), 30);
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';

// ---------- Přechody mezi stránkami (View Transitions API) ----------
export async function transition(update, { kind = 'page' } = {}) {
  if (!document.startViewTransition || reducedMotion()) {
    await update();
    return;
  }
  document.documentElement.dataset.vt = kind;
  try {
    const vt = document.startViewTransition(() => update());
    // Přerušený přechod (změna velikosti okna, další navigace) odmítne i „ready“ – nesmí z toho být neošetřená chyba.
    vt.ready.catch(() => {});
    await vt.finished;
  } catch {
    // přechod byl přerušen dalším – obsah je už vykreslený
  } finally {
    delete document.documentElement.dataset.vt;
  }
}

// Sdílený prvek: označí prvek názvem pro „morfování“ do další stránky.
export function shareElement(el, name) {
  if (!el || !document.startViewTransition) return;
  el.style.viewTransitionName = name;
}

// ---------- Tooltip ----------
// Prvky s data-tip="text" ukážou bublinu po najetí nebo fokusu (na dotyk po podržení).
let tipEl = null;
let tipFor = null;
let tipTimer = null;

function tipNode() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'tip';
    tipEl.className = 'tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function placeTip(target) {
  const tip = tipNode();
  const r = target.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const gap = 10;
  let top = r.top - th - gap;
  let below = false;
  if (top < 8) {
    top = r.bottom + gap;
    below = true;
  }
  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  const arrow = Math.max(12, Math.min(tw - 12, r.left + r.width / 2 - left));
  tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  tip.style.setProperty('--arrow', arrow + 'px');
  tip.dataset.side = below ? 'below' : 'above';
}

export function showTip(target) {
  const text = target.dataset.tip;
  if (!text) return;
  const tip = tipNode();
  tip.textContent = text;
  tip.hidden = false;
  tip.classList.remove('in');
  placeTip(target);
  requestAnimationFrame(() => tip.classList.add('in'));
  tipFor = target;
  target.setAttribute('aria-describedby', 'tip');
}

export function hideTip() {
  clearTimeout(tipTimer);
  if (tipFor) tipFor.removeAttribute('aria-describedby');
  tipFor = null;
  if (tipEl) {
    tipEl.classList.remove('in');
    tipEl.hidden = true;
  }
}

export function installTooltips() {
  const over = (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t || t === tipFor) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => showTip(t), e.type === 'focusin' ? 0 : 280);
  };
  const out = (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) return;
    if (e.relatedTarget && t.contains(e.relatedTarget)) return;
    hideTip();
  };
  document.addEventListener('pointerover', (e) => e.pointerType !== 'touch' && over(e));
  document.addEventListener('pointerout', (e) => e.pointerType !== 'touch' && out(e));
  document.addEventListener('focusin', (e) => e.target.matches?.(':focus-visible') && over(e));
  document.addEventListener('focusout', out);
  // Dotyk: podržení prstu ukáže tooltip na 2,5 s.
  let press = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const t = e.target.closest('[data-tip]');
    if (!t) return;
    press = setTimeout(() => {
      showTip(t);
      setTimeout(hideTip, 2500);
    }, 450);
  });
  ['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => clearTimeout(press)));
  window.addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hideTip());
}

// ---------- Drawer (boční / spodní panel) ----------
let drawer = null; // { root, panel, opener, onClose, side }

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';

function lockScroll(on) {
  const de = document.documentElement;
  if (on) {
    const sb = window.innerWidth - de.clientWidth;
    de.style.setProperty('--sb', sb + 'px');
    de.classList.add('locked');
  } else {
    de.classList.remove('locked');
    de.style.removeProperty('--sb');
  }
}

/**
 * Otevře drawer. side: 'right' | 'left' | 'bottom'. html: obsah těla. Vrací element těla.
 * Esc, klik na pozadí nebo tlačítko zavřít ho zavřou; fokus zůstává uvnitř a pak se vrátí.
 */
export function openDrawer({ id = 'drawer', side = 'right', title = '', html = '', label, onClose, wide = false } = {}) {
  const opener = drawer?.opener || document.activeElement;
  if (drawer) closeDrawer({ instant: true, keepFocus: true });
  hideTip();
  const root = document.createElement('div');
  root.className = `drawer-root side-${side}${wide ? ' wide' : ''}`;
  root.id = id;
  root.innerHTML = `<div class="drawer-scrim" data-action="drawer-close"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="${id}-title" tabindex="-1">
      ${side === 'bottom' ? '<div class="drawer-grip" aria-hidden="true"><span></span></div>' : ''}
      <header class="drawer-head"><h2 id="${id}-title">${title}</h2>
        <button type="button" class="icon-btn drawer-x" data-action="drawer-close" aria-label="${label || 'Zavřít'}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </header>
      <div class="drawer-body">${html}</div>
    </aside>`;
  document.body.appendChild(root);
  const panel = root.querySelector('.drawer');
  drawer = { root, panel, opener, onClose, side };
  lockScroll(true);
  document.getElementById('app')?.setAttribute('inert', '');
  requestAnimationFrame(() => {
    root.classList.add('open');
    (panel.querySelector('[autofocus]') || panel).focus({ preventScroll: true });
  });
  panel.addEventListener('keydown', trapKeys);
  if (side === 'bottom') enableSwipe(panel);
  return root.querySelector('.drawer-body');
}

function trapKeys(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeDrawer();
    return;
  }
  if (e.key !== 'Tab' || !drawer) return;
  const items = [...drawer.panel.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === drawer.panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// Spodní panel jde stáhnout prstem dolů.
function enableSwipe(panel) {
  let startY = null;
  let dy = 0;
  const head = panel.querySelector('.drawer-grip');
  const down = (e) => {
    startY = e.clientY;
    dy = 0;
    panel.style.transition = 'none';
    head.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  };
  const up = () => {
    if (startY == null) return;
    startY = null;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 90) closeDrawer();
  };
  head.addEventListener('pointerdown', down);
  head.addEventListener('pointermove', move);
  head.addEventListener('pointerup', up);
  head.addEventListener('pointercancel', up);
}

export function closeDrawer({ instant = false, keepFocus = false } = {}) {
  if (!drawer) return;
  const { root, opener, onClose } = drawer;
  drawer = null;
  document.getElementById('app')?.removeAttribute('inert');
  lockScroll(false);
  onClose?.();
  if (instant || reducedMotion()) root.remove();
  else {
    root.classList.remove('open');
    root.classList.add('closing');
    setTimeout(() => root.remove(), 320);
  }
  if (!keepFocus && opener && document.contains(opener)) opener.focus({ preventScroll: true });
}

export const drawerOpen = () => !!drawer;
action('drawer-close', () => closeDrawer());

// ---------- Akordeon ----------
// <details class="acc" data-acc-group="x"><summary data-action="acc">…</summary><div class="acc-body">…</div></details>
// Plynulé otevření/zavření výšky; ve skupině je otevřená vždy jen jedna položka.
export function toggleAccordion(details, open = !details.open) {
  const body = details.querySelector(':scope > .acc-body');
  const group = details.dataset.accGroup;
  if (open && group) {
    details.closest('.acc-list, body').querySelectorAll(`details.acc[data-acc-group="${group}"][open]`).forEach((d) => d !== details && toggleAccordion(d, false));
  }
  if (!body || reducedMotion()) {
    details.open = open;
    if (open) details.dispatchEvent(new CustomEvent('acc-open', { bubbles: true }));
    return;
  }
  body.getAnimations().forEach((a) => a.cancel());
  if (open) {
    details.open = true;
    const h = body.scrollHeight;
    body.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
    details.dispatchEvent(new CustomEvent('acc-open', { bubbles: true }));
  } else {
    const h = body.scrollHeight;
    const anim = body.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 200, easing: 'ease-in' });
    anim.onfinish = () => (details.open = false);
  }
}
action('acc', (el) => toggleAccordion(el.closest('details')));

// Šablona akordeonu
export const accordion = ({ title, body, open = false, group = '', id = '', sub = '' }) =>
  `<details class="acc"${open ? ' open' : ''}${group ? ` data-acc-group="${group}"` : ''}${id ? ` id="${id}"` : ''}>
    <summary data-action="acc"><span class="acc-title">${title}${sub ? `<small>${sub}</small>` : ''}</span><svg class="acc-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary>
    <div class="acc-body"><div class="acc-inner">${body}</div></div>
  </details>`;

// ---------- Skeleton ----------
export const skeleton = (lines = 6) =>
  `<div class="skel" aria-hidden="true"><div class="skel-hero"></div>${Array.from({ length: lines }, (_, i) => `<div class="skel-line" style="width:${90 - ((i * 13) % 40)}%"></div>`).join('')}</div><p class="sr-only">Načítám…</p>`;
