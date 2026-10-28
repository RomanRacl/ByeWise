// Překlady: klíčem je český text, angličtina je ve slovníku EN. Chybějící překlad zobrazí češtinu.
import { EN } from './en.js';

let LANG = 'cs';
try {
  LANG = localStorage.getItem('pm-lang')?.replace(/"/g, '') || ((navigator.language || '').startsWith('cs') || (navigator.language || '').startsWith('sk') ? 'cs' : 'en');
} catch {}
if (LANG !== 'en') LANG = 'cs';

export const lang = () => LANG;
export const locale = () => (LANG === 'en' ? 'en-GB' : 'cs-CZ');

export function setLang(l) {
  LANG = l === 'en' ? 'en' : 'cs';
  try {
    localStorage.setItem('pm-lang', JSON.stringify(LANG));
  } catch {}
  document.documentElement.lang = LANG;
}

const fmtParam = (v) =>
  typeof v === 'number' ? new Intl.NumberFormat(locale(), { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1, minimumFractionDigits: Math.abs(v) >= 100 || Number.isInteger(v) ? 0 : 1 }).format(v) : v;

export function t(key, params) {
  let s = LANG === 'en' ? EN[key] ?? key : key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : fmtParam(params[k])));
  return s;
}

// Text z analytiky ve tvaru { key, params }.
export const tk = (o) => (o ? t(o.key, o.params) : '');

// Počet produktů se správným tvarem: 1 produkt, 2–4 produkty, 5 produktů / 1 product, 2 products.
export function nProducts(n) {
  if (LANG === 'en') return `${n} ${n === 1 ? 'product' : 'products'}`;
  return `${n} ${n === 1 ? 'produkt' : n >= 2 && n <= 4 ? 'produkty' : 'produktů'}`;
}
