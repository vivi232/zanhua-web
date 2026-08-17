(function() {
  var LATIN_FONT = 'https://154.201.81.86/zanhua/res/fonts/ZanhuaSans-Latin-Regular.woff2';
  var FA_BASE = 'https://154.201.81.86/zanhua/static/fontawesome/webfonts/';
  var FONT_URLS = [
    'https://emoji-fonts-1342939114.cos.ap-nanjing.myqcloud.com/ZanhuaSans-SC-Regular-Decrease.woff2',
    'https://emoji-fonts-1342939114.cos.ap-nanjing.myqcloud.com/emoji.ttf',
    LATIN_FONT,
    FA_BASE + 'fa-solid-900.woff2',
    FA_BASE + 'fa-regular-400.woff2',
    FA_BASE + 'fa-brands-400.woff2',
    FA_BASE + 'fa-v4compatibility.woff2'
  ];
  var CACHE_NAME = 'zanhua-fonts-v2';

  function fetchWithCacheMode(url) {
    try {
      var isRemote = (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) && url.indexOf(self.location.origin) !== 0;
      if (isRemote) {
        return fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
      }
      return fetch(url, { credentials: 'same-origin', cache: 'force-cache' });
    } catch(e) {
      return fetch(url);
    }
  }

  self.addEventListener('install', function(event) {
    event.waitUntil(
      caches.open(CACHE_NAME).then(function(cache) {
        return Promise.all(FONT_URLS.map(function(url) {
          return fetchWithCacheMode(url).then(function(r) {
            if (r && (r.ok || (r.status === 0 && r.type === 'opaque'))) {
              try { cache.put(url, r.clone()); } catch(e) {}
            }
            return r;
          }).catch(function() {});
        }));
      }).catch(function() {})
    );
    self.skipWaiting();
  });

  self.addEventListener('activate', function(event) {
    event.waitUntil(
      caches.keys().then(function(keys) {
        return Promise.all(
          keys.filter(function(k) { return k !== CACHE_NAME; }).map(function(k) { return caches.delete(k); })
        );
      })
    );
    self.clients.claim();
  });

  self.addEventListener('fetch', function(event) {
    var url = event.request.url;
    var isFont = FONT_URLS.some(function(fu) { return url === fu || url.indexOf(fu) !== -1; });
    if (!isFont) return;
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response && (response.ok || (response.status === 0 && response.type === 'opaque'))) {
              try { cache.put(event.request, response.clone()); } catch(e) {}
            }
            return response;
          }).catch(function(err) {
            return cache.match(event.request).then(function(c) {
              return c || new Response('', { status: 404 });
            });
          });
        });
      })
    );
  });
})();
