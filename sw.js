(function() {
  var scripts = self.location.pathname.split('/');
  var scopeScript = scripts[scripts.length - 2] || '';
  var base = (scopeScript === 'zanhua') ? '/zanhua' : '';
  var API_HOST = 'https://154.201.81.86';
  var LATIN_FONT = API_HOST + base + '/res/fonts/ZanhuaSans-Latin-Regular.woff2';
  var FONT_URLS = [
    'https://emoji-fonts-1342939114.cos.ap-nanjing.myqcloud.com/ZanhuaSans-SC-Regular-Decrease.woff2',
    'https://emoji-fonts-1342939114.cos.ap-nanjing.myqcloud.com/emoji.ttf',
    LATIN_FONT
  ];
  var CACHE_NAME = 'zanhua-fonts-v1';

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
        return fetchWithCacheMode(LATIN_FONT).then(function(r) {
          if (r && (r.ok || (r.status === 0 && r.type === 'opaque'))) {
            try { cache.put(LATIN_FONT, r.clone()); } catch(e) {}
          }
          return r;
        }).catch(function() {});
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
