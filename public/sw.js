// Minimal service worker: cacher kun app-skallen, så den kan starte offline.
// Live togdata (/api/*) caches ALDRIG — den skal altid være frisk.
const CACHE = 'naestetog-v1';
const SHELL = [
    '/', '/index.html',
    '/manifest.json',
    '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (url.pathname.startsWith('/api/')) return;            // lad togdata gå direkte til nettet

    if (e.request.mode === 'navigate') {                     // siden: netværk først, skal-fallback offline
        e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
        return;
    }
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
