// Úvodní prohlídka: zvýrazní prvek (spotlight) a vedle něj ukáže bublinu s vysvětlením.
// Ovládání: Další / Zpět / Přeskočit, šipky, Esc. Po dokončení se uloží, že ji uživatel viděl.
import { store, esc } from './core.js';
import { reducedMotion, hideTip, action } from './ui.js';
import { t } from './i18n.js';

let active = null;

export const tourDone = () => !!store.get('tour-done', false);

export function startTour(steps, { key = 'tour-done', onEnd } = {}) {
  if (active) endTour(false);
  hideTip();
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `<div class="tour-spot" aria-hidden="true"></div>
    <div class="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tour-h" aria-describedby="tour-p" tabindex="-1">
      <p class="tour-step" id="tour-n"></p>
      <h2 id="tour-h"></h2>
      <p id="tour-p"></p>
      <div class="tour-dots" aria-hidden="true">${steps.map(() => '<i></i>').join('')}</div>
      <div class="tour-btns">
        <button type="button" class="btn link" data-action="tour-skip">${t('Přeskočit')}</button>
        <span><button type="button" class="btn alt" data-action="tour-prev">${t('Zpět')}</button><button type="button" class="btn" data-action="tour-next">${t('Další')}</button></span>
      </div>
    </div>`;
  document.body.appendChild(root);
  document.getElementById('app')?.setAttribute('inert', '');
  const spot = root.querySelector('.tour-spot');
  const bubble = root.querySelector('.tour-bubble');
  let i = 0;

  const place = () => {
    const st = steps[i];
    const el = st.target ? document.querySelector(st.target) : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    root.classList.toggle('center', !el);
    if (!el) {
      spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
      bubble.style.cssText = '';
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = st.pad ?? 8;
    spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border-radius:${st.radius ?? 14}px`;
    const bw = Math.min(360, vw - 24);
    const bh = bubble.offsetHeight || 200;
    let top = r.bottom + pad + 14;
    let side = 'below';
    if (top + bh > vh - 12) {
      top = r.top - pad - 14 - bh;
      side = 'above';
    }
    if (top < 12) top = Math.max(12, Math.min(vh - bh - 12, r.top));
    const left = Math.max(12, Math.min(vw - bw - 12, r.left + r.width / 2 - bw / 2));
    bubble.style.cssText = `left:${left}px;top:${top}px;width:${bw}px`;
    bubble.dataset.side = side;
  };

  const show = (n) => {
    i = Math.max(0, Math.min(steps.length - 1, n));
    const st = steps[i];
    const el = st.target ? document.querySelector(st.target) : null;
    root.querySelector('#tour-n').textContent = t('{a} z {b}', { a: i + 1, b: steps.length });
    root.querySelector('#tour-h').textContent = st.title;
    root.querySelector('#tour-p').innerHTML = esc(st.text);
    root.querySelectorAll('.tour-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    root.querySelector('[data-action="tour-prev"]').hidden = i === 0;
    root.querySelector('[data-action="tour-next"]').textContent = i === steps.length - 1 ? t('Hotovo') : t('Další');
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    place();
    requestAnimationFrame(place);
    if (!reducedMotion()) bubble.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
    root.querySelector('[data-action="tour-next"]').focus({ preventScroll: true });
  };

  const end = (done) => {
    store.set(key, true);
    endTour(done);
    onEnd?.(done);
  };
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') end(false);
    else if (e.key === 'ArrowRight') i < steps.length - 1 ? show(i + 1) : end(true);
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === 'Tab') {
      const items = [...bubble.querySelectorAll('button:not([hidden])')];
      const k = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(k + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  });
  const onResize = () => place();
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, { passive: true });
  const next = () => (i === steps.length - 1 ? end(true) : show(i + 1));
  active = { root, onResize, next, prev: () => show(i - 1), skip: () => end(false) };
  requestAnimationFrame(() => {
    root.classList.add('open');
    show(0);
  });
}

export function endTour() {
  if (!active) return;
  const { root, onResize } = active;
  active = null;
  window.removeEventListener('resize', onResize);
  window.removeEventListener('scroll', onResize);
  document.getElementById('app')?.removeAttribute('inert');
  root.classList.remove('open');
  setTimeout(() => root.remove(), reducedMotion() ? 0 : 250);
}

// Tlačítka prohlídky jdou přes jediný click handler aplikace (bublina leží mimo #app, který je neaktivní).
action('tour-next', () => active?.next());
action('tour-prev', () => active?.prev());
action('tour-skip', () => active?.skip());

// Kroky prohlídky na přehledu.
export const homeSteps = () => [
  { title: t('Vítej v BuyWise'), text: t('Kupuj chytře. Ukážeme ti, co Česko nejvíc kupuje, kam míří ceny a kdy se vyplatí koupit – za minutu víš všechno podstatné.') },
  { target: '.top .tabs', title: t('Žebříčky a nástroje'), text: t('Deset nejžádanějších produktů ve 20 odvětvích. Vlevo jsou nástroje: seznam přání, nákupní kalendář, falešné slevy a rozpočet.'), pad: 4 },
  { target: '.buy-now .score', title: t('Skóre Kup teď / Počkej'), text: t('Číslo 0–100 u každého produktu. Nad 60 je dobrá chvíle koupit, pod 40 se vyplatí počkat. Najetím myši uvidíš proč.'), radius: 99 },
  { target: '.top .search', title: t('Hledej cokoli'), text: t('Produkt, destinaci, akcii… Klávesa / skočí rovnou do hledání.'), radius: 999 },
  { target: '.top .tools a[href$="prani"]', title: t('Seznam přání'), text: t('Srdíčkem si ulož, co chceš koupit, a nastav cílovou cenu. Dáme vědět, až nastane ta správná chvíle.') },
  { target: '[data-action="open-settings"]', title: t('Nastavení'), text: t('Jazyk, měna, světlý či tmavý vzhled, přihlášení a tahle prohlídka znovu.') },
];
