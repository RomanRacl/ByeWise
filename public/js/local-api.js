// Administrace pro samostatnou HTML verzi: data žijí v S.data a v localStorage prohlížeče.
// Tento soubor se použije jen při sestavení buywise.html místo admin-api.js.

// Načte uložená data (nebo ukázková).
export function loadLocalData() {
  const saved = store.get('data', null);
  const settings = store.get('settings', {});
  const demo = demoProducts();
  if (saved && saved.v === 2 && Array.isArray(saved.ids)) {
    const edited = new Map((saved.edited || []).map((p) => [p.id, p]));
    const demoMap = new Map(demo.map((p) => [p.id, p]));
    const products = saved.ids.map((id) => edited.get(id) || demoMap.get(id)).filter(Boolean);
    return { products, edited: true, settings };
  }
  return { products: demo, edited: false, settings };
}
import { S, store } from './core.js';
import { categoryById } from '../lib/categories.js';
import { demoProducts, seedProducts } from '../lib/seed.js';
import { merge, parseCsv, applyImport, applyPriceSheet } from '../lib/dataops.js';

export const adminAuth = { session: true, useGoogle: false };
export const adminLogin = async () => {};
export const adminLogout = async () => {};
export const adminLocal = true;

function persistLocal(note) {
  S.sum.clear();
  S.data.edited = true;
  const audit = store.get('audit', []);
  if (note) audit.unshift({ at: new Date().toISOString(), who: 'tento prohlížeč', action: note[0], target: note[1] || '', summary: note[2] || '' });
  store.set('audit', audit.slice(0, 100));
  // Ukládá jen upravené produkty + seznam ID; ukázková data se při načtení vygenerují znovu (šetří místo).
  const payload = { v: 2, ids: S.data.products.map((p) => p.id), edited: S.data.products.filter((p) => !p.sample) };
  if (!store.set('data', payload)) throw new Error('Prohlížeč nedovolil data uložit (plné nebo zakázané úložiště). Změny platí jen do zavření stránky.');
}

export async function adminApi(action, payload = {}) {
  const all = S.data.products;
  switch (action) {
    case 'status':
      return { ok: true, count: all.length, meta: null, pending: 0, who: 'tento prohlížeč' };
    case 'list':
      return { ok: true, products: all.filter((p) => p.category === payload.category).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) };
    case 'save': {
      const input = payload.product || {};
      if (!input.name || !categoryById(input.category)) throw new Error('Chybí název nebo odvětví');
      const prev = input.id ? all.find((p) => p.id === input.id) : null;
      const p = merge(prev, input);
      S.data.products = all.filter((x) => x.id !== p.id).concat(p);
      persistLocal([prev ? 'úprava' : 'nový produkt', p.id, p.name]);
      return { ok: true, product: p };
    }
    case 'bulkSave': {
      const out = [];
      for (const input of payload.items || []) {
        const prev = all.find((p) => p.id === input.id);
        if (prev) out.push(merge(prev, { ...input, category: prev.category }));
      }
      const ids = new Set(out.map((p) => p.id));
      S.data.products = all.filter((p) => !ids.has(p.id)).concat(out);
      persistLocal(['hromadná úprava', payload.category, `${out.length} produktů`]);
      return { ok: true, saved: out.length };
    }
    case 'delete':
      S.data.products = all.filter((p) => p.id !== payload.id);
      persistLocal(['smazání', payload.id]);
      return { ok: true };
    case 'import':
    case 'importRows': {
      const cat = categoryById(payload.category);
      const rows = action === 'import' ? parseCsv(payload.csv || '') : payload.rows || [];
      if (!cat || !rows.length) throw new Error('Nejsou tu žádné řádky s pořadím a názvem');
      const out = applyImport(all.filter((p) => p.category === cat.id), cat.id, rows);
      const ids = new Set(out.map((p) => p.id));
      S.data.products = all.filter((p) => !ids.has(p.id)).concat(out);
      persistLocal(['import', cat.id, `${rows.length} řádků (${payload.source || 'CSV'})`]);
      return { ok: true, imported: rows.length };
    }
    case 'listAll':
      return { ok: true, products: all };
    case 'importPrices': {
      const { updated, unknown } = applyPriceSheet(all, payload.rows || []);
      const ids = new Set(updated.map((p) => p.id));
      S.data.products = all.filter((p) => !ids.has(p.id)).concat(updated);
      persistLocal(['měsíční souhrn cen', '', `${updated.length} cen`]);
      return { ok: true, updated: updated.length, unknown };
    }
    case 'seed':
      S.data.products = demoProducts();
      S.data.edited = false;
      S.sum.clear();
      store.set('data', null);
      return { ok: true, added: S.data.products.length };
    case 'clearSamples': {
      // Vymaže ukázkovou historii a nechá jen výchozí produkty s dnešní cenou.
      S.data.products = seedProducts();
      persistLocal(['výchozí data bez historie', '', '']);
      return { ok: true, added: S.data.products.length };
    }
    case 'getSettings':
      return { ok: true, settings: { inflation: null, affiliates: [], sponsor: null, requireApproval: false, feeds: [], ...store.get('settings', {}) } };
    case 'setSettings':
      store.set('settings', payload.settings || {});
      S.data.settings = { ...(S.data.settings || {}), ...(payload.settings || {}) };
      return { ok: true, settings: payload.settings };
    case 'audit':
      return { ok: true, entries: store.get('audit', []) };
    case 'pending':
      return { ok: true, pending: null };
    case 'approve':
    case 'reject':
      return { ok: true, applied: 0 };
    case 'backup':
      return { ok: true, backup: { version: 2, exported: new Date().toISOString(), settings: store.get('settings', {}), products: S.data.products } };
    case 'restore': {
      const list = payload.products || [];
      if (!list.length || !list.every((p) => p && p.id && p.category && p.name)) throw new Error('Soubor není záloha aplikace BuyWise');
      S.data.products = list;
      if (payload.settings) store.set('settings', payload.settings);
      persistLocal(['obnova ze zálohy', '', `${list.length} produktů`]);
      return { ok: true, restored: list.length };
    }
    default:
      throw new Error('Tahle akce funguje jen ve verzi nasazené na Vercelu (živá data, feedy, e-maily).');
  }
}
