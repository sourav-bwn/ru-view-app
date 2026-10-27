const CACHE = 'ruview-v2';
// Relative paths: the app is also hosted under a sub-path (GitHub Pages
// project site), where '/index.html' would cache the domain root instead.
const ASSETS = [
    './',
    'index.html',
    'css/style.css',
    'js/app.js',
    'manifest.json'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE).map(k => caches.delete(k))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request).catch(() => new Response('Offline', { status: 503 })))
    );
});
