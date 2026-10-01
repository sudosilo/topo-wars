// Topo Wars service worker. It delivers turn notifications from the battle server and keeps
// the game and every map area you have viewed available when there is no signal.
const CACHE = 'game-v1';
const SHELL = ['./', './index.html'];
// The map library the game needs to draw anything. Saved during install so the very first visit
// is enough to play offline. If it cannot be reached right then, it is saved on the next visit instead.
const LIBS = ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).then(() => c.addAll(LIBS).catch(() => {}))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Only keep copies of good answers. Map tiles from another site come back sealed ("opaque"),
// which is fine to keep even though their status cannot be read.
const keepable = r => r && (r.ok || r.type === 'opaque');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // The page itself: try the internet first so a new deploy shows up, fall back to the saved copy.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(fresh => {
        if (fresh.ok) { const copy = fresh.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
        return fresh;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else, map tiles included: use the saved copy when there is one, otherwise download and save it.
  e.respondWith(
    caches.match(req).then(saved => {
      if (saved) return saved;
      return fetch(req).then(fresh => {
        if (keepable(fresh)) { const copy = fresh.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return fresh;
      });
    })
  );
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Topo Wars', {
    body: d.body || 'Your friend finished their turn.',
    tag: 'topo-wars-' + (d.id || 'battle'),
    renotify: true,
    data: { url: d.url || '/', id: d.id || '' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const { url, id } = e.notification.data || {};
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ('focus' in c) {
        c.postMessage({ type: 'topo-wars-open', id });
        return c.focus();
      }
    }
    return self.clients.openWindow(url || '/');
  }));
});
