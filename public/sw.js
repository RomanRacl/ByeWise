// Service worker: offline režim (aplikace + poslední stažená data) a push notifikace hlídačů.
const VERSION = 'pm-v12';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png',
  '/lib/analytics.js', '/lib/categories.js', '/lib/seed.js', '/lib/dataops.js',
  '/js/core.js', '/js/i18n.js', '/js/en.js', '/js/chart.js', '/js/user.js', '/js/admin-api.js', '/js/ui.js', '/js/photos.js', '/js/share.js', '/js/tour.js',
  '/js/views/home.js', '/js/views/category.js', '/js/views/product.js', '/js/views/compare.js',
  '/js/views/favorites.js', '/js/views/portfolio.js', '/js/views/status.js', '/js/views/admin.js',
  '/js/views/wishlist.js', '/js/views/calendar.js', '/js/views/deals.js', '/js/views/budget.js', '/js/views/search.js', '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== PHOTOS).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

const PHOTOS = 'pm-photos-v1';
async function trimPhotos(max = 60) {
  const c = await caches.open(PHOTOS);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await c.delete(k);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fotky na pozadí: nejdřív z mezipaměti (fungují i offline), max. 60 kusů.
  if (url.hostname === 'upload.wikimedia.org') {
    e.respondWith(
      caches.open(PHOTOS).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          c.put(req, res.clone());
          trimPhotos();
        }
        return res;
      })
    );
    return;
  }
  if (url.origin !== location.origin) return;
  // Data: nejdřív síť, při výpadku poslední uložená verze.
  if (url.pathname.startsWith('/api/data')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  // Stránky aplikace (/produkt/…, /kategorie/…): síť, offline index.html.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  // Statické soubory: rychle z mezipaměti, na pozadí aktualizovat.
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});

self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: 'BuyWise', body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'BuyWise', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
