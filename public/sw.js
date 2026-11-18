// YemenEdu Progressive Web App Service Worker (Optimized for Weak / Slow Networks)
const CACHE_NAME = 'yemenedu-cache-v3';
const NAVIGATION_TIMEOUT_MS = 2500;

const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
];

// Install: precache app shell and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(APP_SHELL_ASSETS).catch((err) => {
          console.warn('[SW] Some assets failed to precache:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up older caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: Fast-fallback navigation on weak networks + Cache-first with background refresh for assets & fonts
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Bypass non-GET requests and Firebase data/auth endpoints
  if (request.method !== 'GET') return;
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('firebaseinstallations.googleapis.com')
  ) {
    return;
  }

  // Navigation requests (HTML): Race network with 2.5s timeout -> serve cached shell immediately on weak 2G/3G
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedShell =
          (await cache.match(request)) ||
          (await cache.match('/index.html')) ||
          (await cache.match('/'));

        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone()).catch(() => {});
              cache.put('/index.html', response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => null);

        if (cachedShell) {
          const timeoutPromise = new Promise((resolve) =>
            setTimeout(() => resolve(cachedShell), NAVIGATION_TIMEOUT_MS)
          );
          const raceResult = await Promise.race([
            networkFetch.then((res) => res || cachedShell),
            timeoutPromise,
          ]);
          return raceResult;
        }

        const netRes = await networkFetch;
        return netRes || Response.error();
      })()
    );
    return;
  }

  // Static Assets & Fonts (JS, CSS, Images, Fonts, Google Fonts): Cache-first with background revalidation
  const isGoogleFonts =
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (
    isGoogleFonts ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              cache.put(request, networkResponse.clone()).catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default: Network with Cache Fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
