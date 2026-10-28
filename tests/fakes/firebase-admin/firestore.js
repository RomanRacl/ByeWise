import { STORE } from './store.js';
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
let auto = 0;
class DocRef {
  constructor(path) { this.path = path; this.id = path.split('/').pop(); }
  async get() { const d = STORE.get(this.path); return { exists: d !== undefined, id: this.id, data: () => clone(d) }; }
  async set(data, opt = {}) { const prev = STORE.get(this.path); STORE.set(this.path, opt.merge && prev ? { ...prev, ...clone(data) } : clone(data)); }
  async delete() { STORE.delete(this.path); }
}
class Query {
  constructor(name, filters = [], order = null, lim = null) { this.name = name; this.filters = filters; this.order = order; this.lim = lim; }
  where(f, op, v) { return new Query(this.name, [...this.filters, [f, op, v]], this.order, this.lim); }
  orderBy(f, dir = 'asc') { return new Query(this.name, this.filters, [f, dir], this.lim); }
  limit(n) { return new Query(this.name, this.filters, this.order, n); }
  async get() {
    let docs = [...STORE.entries()].filter(([p]) => p.startsWith(this.name + '/') && p.split('/').length === 2)
      .map(([p, d]) => ({ id: p.split('/')[1], d }));
    for (const [f, op, v] of this.filters) docs = docs.filter((x) => op === '==' && get(x.d, f) === v);
    if (this.order) docs.sort((a, b) => (get(a.d, this.order[0]) < get(b.d, this.order[0]) ? -1 : 1) * (this.order[1] === 'desc' ? -1 : 1));
    if (this.lim) docs = docs.slice(0, this.lim);
    return { docs: docs.map((x) => ({ id: x.id, data: () => clone(x.d) })) };
  }
}
class Coll extends Query {
  doc(id) { return new DocRef(`${this.name}/${id}`); }
  async add(data) { const id = 'auto' + ++auto; STORE.set(`${this.name}/${id}`, clone(data)); return { id }; }
}
const db = {
  collection: (n) => new Coll(n),
  doc: (p) => new DocRef(p),
  batch: () => { const ops = []; return { set: (ref, d) => ops.push([ref, d]), commit: async () => { for (const [r, d] of ops) await r.set(d); } }; },
};
export const getFirestore = () => db;
