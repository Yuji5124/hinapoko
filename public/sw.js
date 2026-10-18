const CACHE = 'hinapoko-v4';
const ROOT = new URL('./', self.location.href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const page = await fetch(ROOT);
    await cache.put(ROOT, page.clone());
    const html = await page.text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => new URL(match[1], ROOT).href);
    await cache.addAll([new URL('manifest.webmanifest', ROOT), new URL('icon.svg', ROOT), new URL('apple-touch-icon.png', ROOT), ...assets]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return await cache.match(event.request) || await cache.match(ROOT);
      }
    }
    const cached = await cache.match(event.request, { ignoreVary: true }) || await cache.match(new URL(event.request.url).pathname, { ignoreSearch: true, ignoreVary: true });
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch {
      return await cache.match(ROOT) || Response.error();
    }
  })());
});
